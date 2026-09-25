import { jsPDF } from "jspdf";
import type {
  AtterbergProjectState,
  AtterbergRecord,
  LiquidLimitTrial,
  PlasticLimitTrial,
  ShrinkageLimitTrial,
} from "@/context/TestDataContext";
import { calculateLogLinearRegression, calculateMoistureFromMass, getTrialMoisture, classifyAtterberg } from "./atterbergCalculations";
import { fetchAdminImagesAsBase64, type AdminImages } from "./imageUtils";
import { classifySoilUSCS, type GrainSizeDistribution } from "./soilClassification";

// Helper to extract base64 string from data URL
const extractBase64FromDataUrl = (dataUrl: string): string => {
  if (!dataUrl) {
    console.warn("Empty dataUrl passed to extractBase64FromDataUrl");
    return "";
  }
  const match = dataUrl.match(/^data:image\/\w+;base64,(.+)$/);
  const result = match ? match[1] : dataUrl;
  console.log("Extracted base64 for PDF:", {
    dataUrlLength: dataUrl.length,
    isDataUrl: dataUrl.startsWith("data:"),
    resultLength: result.length,
    extracted: match ? "yes" : "no (using as-is)"
  });
  return result;
};

interface AtterbergPDFOptions {
  projectName?: string;
  clientName?: string;
  date?: string;
  projectState: AtterbergProjectState;
  records: AtterbergRecord[];
  skipDownload?: boolean;
  chartImages?: { [key: string]: string }; // recordId -> base64 image data URL
}

const COLORS = {
  primary: [41, 98, 163] as [number, number, number], // #2962A3
  dark: [30, 30, 30] as [number, number, number],
  muted: [120, 120, 120] as [number, number, number],
  border: [136, 136, 136] as [number, number, number], // #888 matching print sheet
  lightBg: [245, 247, 250] as [number, number, number],
  headerBg: [220, 230, 245] as [number, number, number], // #DCE6F5 (light blue from Excel)
  plHighlight: [255, 235, 153] as [number, number, number], // #FFEB99 (light yellow from Excel)
  chartBg: [255, 248, 236] as [number, number, number], // #fff8ec matching .aps-chart-box
  labelBg: [244, 246, 250] as [number, number, number], // #f4f6fa matching .aps-meta td.lbl
};

const num = (v: string | undefined): number | null => {
  if (!v || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const fmt = (v: number | string | null | undefined): string =>
  v === null || v === undefined ? "-" : typeof v === "number" ? String(round2(v)) : v;

// Desired-export style helpers (white tables, black borders, auto-fit text)
const fitText = (d: jsPDF, text: string, maxWidth: number, startSize: number, minSize = 5.5): number => {
  let s = startSize;
  const t = text ?? "";
  try {
    while (s > minSize && d.getTextWidth(t) > Math.max(maxWidth, 1)) s -= 0.5;
  } catch { /* ignore */ }
  return s;
};
const cellText = (
  d: jsPDF,
  text: string,
  cx: number,
  cy: number,
  colW: number,
  o: { align?: "left" | "center" | "right"; bold?: boolean; size?: number; red?: boolean } = {},
) => {
  const t = text ?? "-";
  d.setFontSize(fitText(d, t, Math.max(colW - 1.6, 3), o.size ?? 7.5));
  d.setFont("helvetica", o.bold ? "bold" : "normal");
  if (o.red) d.setTextColor(178, 0, 0);
  else d.setTextColor(...COLORS.dark);
  d.text(t, cx, cy, { align: o.align ?? "center", baseline: "middle" });
};
interface TrialRowDef { label: string; values: string[]; bold?: boolean }
function drawTrialsTableDesired(d: jsPDF, x: number, y: number, w: number, headers: string[], rows: TrialRowDef[], footer: { label: string; value: string } | null): number {
  const n = Math.max(headers.length, 1);
  const labelW = 50;
  const tw = (w - labelW) / n;
  const rh = 5.4;
  let cy = y;
  d.setDrawColor(0, 0, 0); d.setLineWidth(0.35);
  let cx = x;
  d.setFillColor(255, 255, 255); d.rect(cx, cy, labelW, rh, "FD");
  cx += labelW;
  headers.forEach((h) => { d.setFillColor(255, 255, 255); d.rect(cx, cy, tw, rh, "FD"); cellText(d, h, cx + tw / 2, cy + rh / 2, tw, { bold: true, size: 8 }); cx += tw; });
  cy += rh;
  for (const r of rows) {
    cx = x;
    d.setFillColor(255, 255, 255); d.rect(cx, cy, labelW, rh, "FD");
    cellText(d, r.label, cx + 1.2, cy + rh / 2, labelW, { align: "left", bold: true, size: 7 });
    cx += labelW;
    r.values.forEach((v) => { d.setFillColor(255, 255, 255); d.rect(cx, cy, tw, rh, "FD"); cellText(d, v, cx + tw / 2, cy + rh / 2, tw, { bold: r.bold ?? false, size: 7.5 }); cx += tw; });
    cy += rh;
  }
  if (footer) {
    d.setFillColor(255, 255, 255); d.rect(x, cy, w, rh, "FD");
    cellText(d, footer.label, x + w / 2, cy + rh / 2, w - tw - 4, { bold: true, size: 8 });
    cellText(d, footer.value, x + w - tw / 2, cy + rh / 2, tw, { bold: true, size: 8 });
    cy += rh;
  }
  return cy;
}
function drawSidePanelDesired(d: jsPDF, x: number, y: number, w: number, title: string, rows: { cells: string[]; frac: number[] }[], rowH = 5): number {
  const hh = 5.6;
  let cy = y;
  d.setDrawColor(0, 0, 0); d.setLineWidth(0.35);
  d.setFillColor(255, 255, 255); d.rect(x, cy, w, hh, "FD");
  cellText(d, title, x + w / 2, cy + hh / 2, w, { bold: true, size: 8 });
  cy += hh;
  const tot = (r: { frac: number[] }) => r.frac.reduce((a, b) => a + b, 0);
  for (const r of rows) {
    let cx = x;
    const t = tot(r);
    r.cells.forEach((txt, i) => {
      const cw = (w * r.frac[i]) / t;
      d.setFillColor(255, 255, 255); d.rect(cx, cy, cw, rowH, "FD");
      const left = i === 0 && r.cells.length === 2;
      cellText(d, txt, left ? cx + 1.2 : cx + cw / 2, cy + rowH / 2, cw, { align: left ? "left" : "center", bold: i === 0, size: 7 });
      cx += cw;
    });
    cy += rowH;
  }
  return cy;
}

// ── Native vector flow-curve: always-available fallback when html2canvas capture fails ──
// Renders the same semi-log LL curve (pink plot bg, grid, red trial dots,
// green best-fit line, LL dashed marker) directly with jsPDF primitives.
function drawFlowCurveNative(
  d: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  trials: LiquidLimitTrial[],
): void {
  // Tight inner padding: plot hugs the box on all sides (esp. bottom).
  const padL = 12;
  const padR = 3;
  const padT = 3.5;
  const padB = 8.5;
  const px = x + padL;
  const py = y + padT;
  const pw2 = Math.max(w - padL - padR, 10);
  const ph2 = Math.max(h - padT - padB, 10);

  const pts = trials
    .map((t) => {
      const mc = getTrialMoisture(t);
      return { pen: Number(t.penetration), mc: mc ? Number(mc) : NaN };
    })
    .filter((p) => Number.isFinite(p.pen) && p.pen > 0 && Number.isFinite(p.mc));
  if (pts.length === 0) {
    cellText(d, "No cone data", x + w / 2, y + h / 2, w - 6, { size: 8 });
    return;
  }
  const reg = calculateLogLinearRegression(pts.map((p) => ({ x: p.pen, y: p.mc })));
  const pens = pts.map((p) => p.pen);
  const mcs = pts.map((p) => p.mc);
  const x0 = Math.min(Math.min(...pens) * 0.95, 14);
  const x1 = Math.max(Math.max(...pens) * 1.08, 26);
  let y0 = Math.min(...mcs);
  let y1 = Math.max(...mcs);
  if (reg) {
    [x0, x1].forEach((xx) => {
      const yy = reg.slope * Math.log10(xx) + reg.intercept;
      y0 = Math.min(y0, yy);
      y1 = Math.max(y1, yy);
    });
  }
  const span = Math.max(y1 - y0, 1);
  y0 -= span * 0.06;
  y1 += span * 0.10;
  const lx0 = Math.log10(x0);
  const lx1 = Math.log10(x1);
  const X = (pen: number) => px + ((Math.log10(pen) - lx0) / Math.max(lx1 - lx0, 1e-6)) * pw2;
  const Y = (mc: number) => py + (1 - (mc - y0) / Math.max(y1 - y0, 1e-6)) * ph2;

  // plot background + border
  d.setFillColor(253, 242, 240);
  d.setDrawColor(0, 0, 0);
  d.setLineWidth(0.35);
  d.rect(px, py, pw2, ph2, "FD");

  // gridlines (log ticks + linear ticks)
  d.setDrawColor(225, 225, 225);
  d.setLineWidth(0.2);
  [10, 12, 15, 18, 20, 22, 25, 30, 40].filter((t) => t >= x0 && t <= x1).forEach((t) => {
    const gx = X(t);
    d.line(gx, py, gx, py + ph2);
  });
  for (let i = 0; i <= 4; i++) {
    const gy = py + (ph2 * i) / 4;
    d.line(px, gy, px + pw2, gy);
  }

  // axes labels + ticks
  d.setFontSize(5.5);
  d.setFont("helvetica", "normal");
  d.setTextColor(60, 60, 60);
  [10, 12, 15, 18, 20, 22, 25, 30, 40].filter((t) => t >= x0 && t <= x1).forEach((t) => {
    d.text(String(t), X(t), py + ph2 + 3.4, { align: "center" });
  });
  for (let i = 0; i <= 4; i++) {
    const v = y1 - ((y1 - y0) * i) / 4;
    d.text(String(Math.round(v * 10) / 10), px - 1.2, py + (ph2 * i) / 4 + 1, { align: "right" });
  }
  d.setFontSize(6);
  d.setFont("helvetica", "bold");
  d.setTextColor(...COLORS.dark);
  d.text("Penetration (mm)", px + pw2 / 2, y + h - 1.6, { align: "center" });
  d.text("Moisture Content (%)", x + 3.2, py + ph2 / 2, { align: "center", angle: 90 });

  // best-fit line (green like desired print)
  if (reg) {
    d.setDrawColor(22, 101, 52);
    d.setLineWidth(0.7);
    const steps = 24;
    let prevX = X(x0);
    let prevY = Y(reg.slope * Math.log10(x0) + reg.intercept);
    for (let i = 1; i <= steps; i++) {
      const pen = x0 + ((x1 - x0) * i) / steps;
      const cx2 = X(pen);
      const cy2 = Y(reg.slope * Math.log10(pen) + reg.intercept);
      d.line(prevX, prevY, cx2, cy2);
      prevX = cx2;
      prevY = cy2;
    }
    // R² top-right INSIDE the plot (green, like the preview chart).
    // Derived identically to the preview: log-linear regression of moisture
    // on log10(penetration): y = m·log10(x) + b, R² = 1 − SSres/SStot
    // (see calculateLogLinearRegression in atterbergCalculations.ts).
    d.setFontSize(6);
    d.setFont("helvetica", "bold");
    d.setTextColor(22, 101, 52);
    d.text(`R² = ${reg.rSquared.toFixed(3)}`, px + pw2 - 1.5, py + 4, { align: "right" });
    d.setTextColor(...COLORS.dark);
  }

  // LL marker at 20mm penetration — full cross like desiredexport:
  // vertical dashed line at x=20 + horizontal dashed line at y=LL + green LL label.
  if (reg && 20 >= x0 && 20 <= x1) {
    const ll = reg.slope * Math.log10(20) + reg.intercept;
    const lx = X(20);
    const ly = Y(ll);
    d.setDrawColor(22, 101, 52);
    d.setLineWidth(0.35);
    d.setLineDashPattern([1.4, 1.4], 0);
    d.line(lx, ly, lx, py + ph2); // vertical down to x-axis
    d.line(px, ly, lx, ly); // horizontal from y-axis
    d.setLineDashPattern([], 0);
    d.setFontSize(6);
    d.setFont("helvetica", "bold");
    d.setTextColor(22, 101, 52);
    d.text(`LL ${String(Math.round(ll * 10) / 10)}%`, px + 1.5, ly - 1.8);
    d.setTextColor(...COLORS.dark);
  }

  // trial dots (red)
  d.setFillColor(185, 28, 28);
  pts.forEach((p) => {
    d.circle(X(p.pen), Y(p.mc), 1.1, "F");
  });
}

// (legacy drawTable removed — replaced by drawTrialsTableDesired / drawSidePanelDesired above)

function drawRecordPage(
  doc: jsPDF,
  record: AtterbergRecord,
  options: AtterbergPDFOptions,
  images: AdminImages,
) {
  const { projectName, clientName, projectState, chartImages } = options;
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const margin = 10;
  const contentW = pw - margin * 2;

  // Report label top-left like desired ("Atterberg Limits Report")
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COLORS.dark);
  doc.text("Atterberg Limits Report", margin, 9);

  let y = 13;

  // ── Header: logo left / contacts right, no boxes ──
  const headerH = 20;
  if (images.logo || images.contacts) {
    const imgW = 62;
    if (images.logo) {
      try {
        doc.addImage(extractBase64FromDataUrl(images.logo), "PNG", margin, y, imgW, headerH, undefined, "FAST");
      } catch { /* optional */ }
    }
    if (images.contacts) {
      try {
        doc.addImage(extractBase64FromDataUrl(images.contacts), "PNG", pw - margin - imgW, y, imgW, headerH, undefined, "FAST");
      } catch { /* optional */ }
    }
    y += headerH + 2;
  }

  // thin rule under header
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.5);
  doc.line(margin, y, margin + contentW, y);
  y += 3;

  // ── Centered underlined title (desired style) ──
  const title = "ATTERBERG LIMITS (BS 1377 PART 2, 4.3 : 1990)";
  doc.setFontSize(10.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLORS.dark);
  doc.text(title, pw / 2, y + 3, { align: "center" });
  const twTitle = doc.getTextWidth(title);
  doc.setLineWidth(0.4);
  doc.line(pw / 2 - twTitle / 2, y + 4.2, pw / 2 + twTitle / 2, y + 4.2);
  y += 8;

  // ── Metadata: white table, black borders, red values ──
  const metaH = 5.6;
  const proj = projectState as unknown as Record<string, string | undefined>;
  const sampledBy = proj.labOrganization || (record as unknown as Record<string, string | undefined>).sampledBy || "-";
  const dateSubmitted = (record as unknown as Record<string, string | undefined>).dateSubmitted || proj.dateSubmitted || "-";
  const dateTested = record.dateTested || "-";
  const sampleDepth = (record as unknown as Record<string, string | undefined>).sampleDepth
    || record.sampleNumber || "-";
  const sampleNo = record.sampleNumber || "-";
  const drawMetaRow = (cells: { label: string; value: string; labelW: number; valueW: number; valueRed?: boolean }[]) => {
    let cx = margin;
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.35);
    cells.forEach((c) => {
      doc.setFillColor(255, 255, 255);
      doc.rect(cx, y, c.labelW, metaH, "FD");
      cellText(doc, c.label, cx + 1.2, y + metaH / 2, c.labelW, { align: "left", bold: true, size: 7.5 });
      cx += c.labelW;
      doc.setFillColor(255, 255, 255);
      doc.rect(cx, y, c.valueW, metaH, "FD");
      cellText(doc, c.value, cx + c.valueW / 2, y + metaH / 2, c.valueW, { bold: true, size: 8, red: c.valueRed ?? true });
      cx += c.valueW;
    });
    y += metaH;
  };
  const fullLabelW = 52;
  drawMetaRow([{ label: "Client name:", value: clientName || projectState.clientName || "-", labelW: fullLabelW, valueW: contentW - fullLabelW }]);
  drawMetaRow([{ label: "Project/Site name:", value: projectName || projectState.projectName || "-", labelW: fullLabelW, valueW: contentW - fullLabelW }]);
  const metaPairs: { label: string; value: string; labelW: number; valueW: number }[] = [
      { label: "Sampled and submitted by:", value: sampledBy, labelW: 42, valueW: contentW * 0.175 },
      { label: "Date submitted:", value: dateSubmitted, labelW: 27, valueW: contentW * 0.15 },
      { label: "Date tested:", value: dateTested, labelW: 22, valueW: contentW - (42 + contentW * 0.175 + 27 + contentW * 0.15 + 22) },
    ];
    drawMetaRow(metaPairs.map((p) => ({ ...p, valueRed: false })));
  drawMetaRow([
    { label: "Sample ID:", value: record.label || "-", labelW: 38, valueW: contentW * 0.185, valueRed: false },
    { label: "Sample depth (M):", value: sampleDepth, labelW: 30, valueW: contentW * 0.155, valueRed: false },
    { label: "Sample No:", value: sampleNo, labelW: 22, valueW: contentW - (38 + contentW * 0.185 + 30 + contentW * 0.155 + 22), valueRed: false },
  ]);

  y += 1;

  // ── Record notes (if present) ──
  if (record.note && record.note.trim() && y < ph - 120) { // Only show notes if space available
    doc.setFillColor(...COLORS.headerBg);
    doc.roundedRect(margin, y, contentW, 6.5, 0.75, 0.75, "F");
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...COLORS.primary);
    doc.text("Notes", margin + 1.5, y + 4);
    y += 7.5;

    doc.setFontSize(6.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...COLORS.dark);
    const splitNote = doc.splitTextToSize(record.note, contentW - 4);
    doc.text(splitNote, margin + 1.5, y);
    y += Math.max(splitNote.length * 2.5, 6) + 2;
  }

  // ── Find tests ──
  const llTest = record.tests.find((t) => t.type === "liquidLimit");
  const plTest = record.tests.find((t) => t.type === "plasticLimit");
  const slTest = record.tests.find((t) => t.type === "shrinkageLimit");

  const llTrials = (llTest?.type === "liquidLimit" ? llTest.trials : []) as LiquidLimitTrial[];
  const plTrials = (plTest?.type === "plasticLimit" ? plTest.trials : []) as PlasticLimitTrial[];
  const slTrials = (slTest?.type === "shrinkageLimit" ? slTest.trials : []) as ShrinkageLimitTrial[];

  // Desired-export data table: ONE unified table, C1..C7 columns.
  // LL trials first, then PL trials mapped into the same row structure
  // (penetration blank for PL, exactly like desiredexport's "—" cells).
  const allTrials: { kind: "LL" | "PL"; ll?: LiquidLimitTrial; pl?: PlasticLimitTrial }[] = [
    ...llTrials.map((t) => ({ kind: "LL" as const, ll: t })),
    ...plTrials.map((t) => ({ kind: "PL" as const, pl: t })),
  ];
  const totalCols = Math.max(allTrials.length, 1);
  const headers = allTrials.map((_, i) => `C${i + 1}`);
  const colOf = (fn: (t: { kind: "LL" | "PL"; ll?: LiquidLimitTrial; pl?: PlasticLimitTrial }) => string): string[] =>
    allTrials.map(fn);
  const containers = colOf((t) => t.ll?.containerNo || t.pl?.containerNo || "-");
  const pens = colOf((t) => (t.kind === "LL" ? fmt(num(t.ll?.penetration)) : "—"));
  const wetMasses = colOf((t) => {
    const tr = (t.ll ?? t.pl)!;
    const wet = num(tr.containerWetMass);
    const dry = num(tr.containerDryMass);
    const cont = num(tr.containerMass);
    const mc = getTrialMoisture(tr as LiquidLimitTrial);
    const mcNum = mc ? Number(mc) : null;
    const drySoil = dry !== null && cont !== null ? round2(dry - cont) : null;
    let water = wet !== null && dry !== null ? round2(wet - dry) : null;
    let wcalc = wet;
    if (water === null && drySoil !== null && drySoil > 0 && mcNum !== null) water = round2((drySoil * mcNum) / 100);
    if (wcalc === null && dry !== null && water !== null) wcalc = round2(dry + water);
    return fmt(wcalc ?? wet);
  });
  const dryMasses = colOf((t) => fmt(num((t.ll ?? t.pl)?.containerDryMass)));
  const contMasses = colOf((t) => fmt(num((t.ll ?? t.pl)?.containerMass)));
  const waterMass = colOf((t) => {
    const tr = (t.ll ?? t.pl)!;
    const wet = num(tr.containerWetMass);
    const dry = num(tr.containerDryMass);
    const cont = num(tr.containerMass);
    const mc = getTrialMoisture(tr as LiquidLimitTrial);
    const mcNum = mc ? Number(mc) : null;
    const drySoil = dry !== null && cont !== null ? round2(dry - cont) : null;
    let water = wet !== null && dry !== null ? round2(wet - dry) : null;
    if (water === null && drySoil !== null && drySoil > 0 && mcNum !== null) water = round2((drySoil * mcNum) / 100);
    return water !== null ? fmt(water) : "-";
  });
  const drySoilMass = colOf((t) => {
    const tr = (t.ll ?? t.pl)!;
    const dry = num(tr.containerDryMass);
    const cont = num(tr.containerMass);
    return dry !== null && cont !== null ? fmt(round2(dry - cont)) : "-";
  });
  const moistures = colOf((t) => {
    const mc = getTrialMoisture((t.ll ?? t.pl) as LiquidLimitTrial);
    return mc ? String(round2(Number(mc))) : "-";
  });
  void totalCols;
  const rowDefs: TrialRowDef[] = [
    { label: "Container No", values: containers },
    { label: "Penetration (mm)", values: pens.map((v) => (v === "-" ? "—" : v)), bold: true },
    { label: "Wt of Container + Wet Soil (g)", values: wetMasses },
    { label: "Wt of Container + Dry Soil (g)", values: dryMasses },
    { label: "Wt of Container (g)", values: contMasses },
    { label: "Wt of Moisture (g)", values: waterMass },
    { label: "Wt of Dry Soil (g)", values: drySoilMass },
    { label: "Moisture Content (%)", values: moistures, bold: true },
  ];
  y = drawTrialsTableDesired(doc, margin, y, contentW, headers, rowDefs, {
    label: "PLASTIC LIMIT",
    value: fmt(record.results.plasticLimit),
  });
  y += 2;

  // Desired layout: chart left (60%) + side panels right (40%)
  // Chart height fills the page: footer sits near the bottom, no big whitespace.
  const gap = 3;
  const leftW = (contentW - gap) * 0.60;
  const rightX = margin + leftW + gap;
  const rightW = contentW - leftW - gap;
  const sectionStartY2 = y;
  const footerTargetY = ph - 20;
  const chartH = Math.max(92, Math.min(175, footerTargetY - 12 - sectionStartY2));
  const chartKey = `${record.id}-liquidLimit`;
  const chartDataUrl = chartImages?.[chartKey];
  const pad = 1.5;
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.35);
  doc.setFillColor(255, 255, 255);
  doc.rect(margin, y, leftW, chartH, "FD");

  let chartEmbedded = false;
  if (chartDataUrl && chartDataUrl.length > 100) {
    try {
      const imgFmt = chartDataUrl.startsWith("data:image/jpeg") ? "JPEG" : "PNG";
      doc.addImage(extractBase64FromDataUrl(chartDataUrl), imgFmt, margin + pad, sectionStartY2 + pad, leftW - pad * 2, chartH - pad * 2, undefined, "FAST");
      chartEmbedded = true;
    } catch (err) {
      console.warn("[PDF] captured chart failed to embed, drawing native curve:", err instanceof Error ? err.message : err);
    }
  } else {
    console.warn("[PDF] no captured chart for record", record.id, "- drawing native flow curve");
  }
  if (!chartEmbedded) {
    drawFlowCurveNative(doc, margin + pad, sectionStartY2 + pad, leftW - pad * 2, chartH - pad * 2, llTrials);
  }

  // ── RIGHT stack (white panels, black borders) ──
  // Spread the 3 panels across the full chart height: gaps grow as the chart elongates.
  const chartBottom = sectionStartY2 + chartH;
  const PANEL_GAP_BASE = 3;
  const stackNatural =
    (5.6 + 3 * 5) + PANEL_GAP_BASE + (5.6 + 6 * 5) + PANEL_GAP_BASE + (5.6 + 3 * 5);
  const extraGap = Math.max(0, (chartBottom - sectionStartY2 - stackNatural) / 4);
  const panelGap = PANEL_GAP_BASE + extraGap;
  let ry = sectionStartY2;
  const slTrial = slTrials[0];
  ry = drawSidePanelDesired(doc, rightX, ry, rightW, "LINEAR SHRINKAGE", [
    { cells: ["Initial length", "(mm)", fmt(slTrial ? num(slTrial.initialLength) ?? 140 : 140)], frac: [3, 1.4, 1.6] },
    { cells: ["Final length", "(mm)", fmt(slTrial ? num(slTrial.finalLength) : null)], frac: [3, 1.4, 1.6] },
    { cells: ["Shrinkage", "(%)", fmt(record.results.linearShrinkage)], frac: [3, 1.4, 1.6] },
  ]);
  ry += panelGap;
  ry = drawSidePanelDesired(doc, rightX, ry, rightW, "RESULTS SUMMARY", [
    { cells: ["LIQUID LIMIT", "(%)", fmt(record.results.liquidLimit)], frac: [3, 1.2, 1.6] },
    { cells: ["PLASTIC LIMIT", "(%)", fmt(record.results.plasticLimit)], frac: [3, 1.2, 1.6] },
    { cells: ["PLASTICITY INDEX", "(%)", fmt(record.results.plasticityIndex)], frac: [3, 1.2, 1.6] },
    { cells: ["Passing 425 um", "(%)", fmt(num(record.passing425um))], frac: [3, 1.2, 1.6] },
    { cells: ["MODULUS OF PLASTICITY", "", fmt(record.results.modulusOfPlasticity)], frac: [3, 1.2, 1.6] },
    { cells: ["LINEAR SHRINKAGE", "(%)", fmt(record.results.linearShrinkage)], frac: [3, 1.2, 1.6] },
  ]);

  ry += panelGap;
  const recordGrainSize = (record as unknown as { grainSize?: { gravel?: string | number; sand?: string | number; fines?: string | number } }).grainSize;
  const grainSize: GrainSizeDistribution = {
    gravel: Number(recordGrainSize?.gravel ?? 0) || 0,
    sand: Number(recordGrainSize?.sand ?? 0) || 0,
    fines: Number(recordGrainSize?.fines ?? 100) || 100,
  };
  const classification = classifySoilUSCS(grainSize, record.results);
  const atterbergClass = classifyAtterberg(record.results.liquidLimit, record.results.plasticLimit);
  const finesNote = "The fines in the soil are..";
  const uscsText = `${classification.uscsSymbol} ${classification.uscsDescription}`.trim().slice(0, 60) || "-";
  const bsText = atterbergClass.BS_classification
    ? `${atterbergClass.BS_classification} — ${atterbergClass.plasticity_description ?? ""}`.trim().slice(0, 60)
    : "-";
  ry = drawSidePanelDesired(doc, rightX, ry, rightW, "SOIL CLASSIFICATION", [
    { cells: [finesNote], frac: [1] },
    { cells: [uscsText], frac: [1] },
    { cells: ["BS 1377", bsText], frac: [1.2, 3] },
  ]);

  const contentBottom = Math.max(ry, sectionStartY2 + chartH);
  const footerY = Math.max(contentBottom + 6, ph - 20);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.5);
  doc.line(margin, footerY - 4, margin + contentW, footerY - 4);

  if (images.stamp) {
    try {
      const s = 26;
      const base64String = extractBase64FromDataUrl(images.stamp);
      doc.addImage(base64String, "PNG", margin + contentW - s - 4, footerY - 18, s, s, undefined, "FAST");
    } catch {
      /* optional */
    }
  }

  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLORS.dark);
  const col3 = contentW / 3;
  doc.text(`Tested by ${record.testedBy || "___________"}`, margin, footerY);
  doc.text(`Date reported ${projectState.dateReported || "___________"}`, margin + col3, footerY);
  doc.text("Checked by:", margin + col3 * 2, footerY);
}

export const generateAtterbergPDF = async (
  options: AtterbergPDFOptions
): Promise<Blob | void> => {
  // Fetch images in parallel with PDF setup
  let images: Partial<Awaited<ReturnType<typeof fetchAdminImagesAsBase64>>> = {};
  try {
    console.log("[PDF] Fetching admin images for export...");
    images = await fetchAdminImagesAsBase64();
    console.log("[PDF] Admin images fetch result:", {
      hasLogo: !!images.logo,
      hasContacts: !!images.contacts,
      hasStamp: !!images.stamp,
      logoSize: images.logo ? images.logo.length : 0,
      contactsSize: images.contacts ? images.contacts.length : 0,
      stampSize: images.stamp ? images.stamp.length : 0,
    });
  } catch (error) {
    console.warn("[PDF] Failed to fetch admin images for PDF, continuing without them:", error instanceof Error ? error.message : error);
    // Continue with empty images object - images are optional
  }

  const doc = new jsPDF();

  for (let i = 0; i < options.records.length; i++) {
    if (i > 0) doc.addPage();
    drawRecordPage(doc, options.records[i], options, images);
  }

  // Page numbers
  const pageCount = doc.getNumberOfPages();
  const pageHeight = doc.internal.pageSize.getHeight();
  const pw = doc.internal.pageSize.getWidth();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.muted);
    doc.setFont("helvetica", "normal");
    doc.text(`Page ${i} of ${pageCount}`, pw / 2, pageHeight - 6, { align: "center" });
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, pageHeight - 6);
  }

  const fileName = `Atterberg_Limits_${(options.projectName || "export").replace(/\s+/g, "_")}.pdf`;

  if (options.skipDownload) {
    return doc.output("blob");
  }

  doc.save(fileName);
};
