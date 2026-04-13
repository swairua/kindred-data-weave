import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type {
  AtterbergProjectState,
  AtterbergRecord,
  LiquidLimitTrial,
  PlasticLimitTrial,
  ShrinkageLimitTrial,
} from "@/context/TestDataContext";
import { calculateMoistureFromMass } from "./atterbergCalculations";
import { fetchAdminImagesAsBase64, type AdminImages } from "./imageUtils";

interface AtterbergPDFOptions {
  projectName?: string;
  clientName?: string;
  date?: string;
  projectState: AtterbergProjectState;
  records: AtterbergRecord[];
  skipDownload?: boolean;
}

const COLORS = {
  primary: [41, 98, 163] as [number, number, number],
  dark: [30, 30, 30] as [number, number, number],
  muted: [120, 120, 120] as [number, number, number],
  border: [180, 180, 180] as [number, number, number],
  lightBg: [245, 247, 250] as [number, number, number],
  headerBg: [220, 230, 245] as [number, number, number],
};

const num = (v: string | undefined): number | null => {
  if (!v || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const fmt = (v: number | string | null | undefined): string =>
  v === null || v === undefined ? "-" : typeof v === "number" ? String(round2(v)) : v;

// ── Draw the cone penetration / moisture graph (BS 1377 style) ──
function drawConeGraph(
  doc: jsPDF,
  llTrials: LiquidLimitTrial[],
  liquidLimit: number | undefined,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const margin = { top: 14, bottom: 20, left: 28, right: 8 };
  const plotX = x + margin.left;
  const plotY = y + margin.top;
  const plotW = w - margin.left - margin.right;
  const plotH = h - margin.top - margin.bottom;

  // Title
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLORS.primary);
  doc.text("CONE PENETRATION vs MOISTURE CONTENT", x + w / 2, y + 8, { align: "center" });

  // Axes
  doc.setDrawColor(...COLORS.dark);
  doc.setLineWidth(0.3);
  doc.line(plotX, plotY, plotX, plotY + plotH); // Y axis
  doc.line(plotX, plotY + plotH, plotX + plotW, plotY + plotH); // X axis

  // Gather data points
  const points: Array<{ pen: number; mc: number }> = [];
  for (const trial of llTrials) {
    const pen = num(trial.penetration);
    const mcStr = calculateMoistureFromMass(trial.containerWetMass, trial.containerDryMass, trial.containerMass);
    const mc = mcStr ? Number(mcStr) : num(trial.moisture);
    if (pen !== null && mc !== null) {
      points.push({ pen, mc });
    }
  }

  if (points.length === 0) {
    doc.setFontSize(7);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(...COLORS.muted);
    doc.text("No data", x + w / 2, y + h / 2, { align: "center" });
    return;
  }

  // Determine ranges
  const mcValues = points.map((p) => p.mc);
  const penValues = points.map((p) => p.pen);
  const mcMin = Math.floor(Math.min(...mcValues) - 2);
  const mcMax = Math.ceil(Math.max(...mcValues) + 2);
  const penMin = Math.floor(Math.min(...penValues, 14));
  const penMax = Math.ceil(Math.max(...penValues, 26));

  // Scale functions
  const scaleX = (mc: number) => plotX + ((mc - mcMin) / (mcMax - mcMin)) * plotW;
  const scaleY = (pen: number) => plotY + plotH - ((pen - penMin) / (penMax - penMin)) * plotH;

  // Grid lines and tick marks
  doc.setFontSize(5.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COLORS.muted);
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.15);

  // X-axis ticks (moisture content)
  const mcStep = Math.max(1, Math.round((mcMax - mcMin) / 6));
  for (let mc = Math.ceil(mcMin); mc <= mcMax; mc += mcStep) {
    const px = scaleX(mc);
    doc.line(px, plotY, px, plotY + plotH);
    doc.text(String(mc), px, plotY + plotH + 5, { align: "center" });
  }

  // Y-axis ticks (penetration)
  const penStep = Math.max(1, Math.round((penMax - penMin) / 6));
  for (let pen = Math.ceil(penMin); pen <= penMax; pen += penStep) {
    const py = scaleY(pen);
    doc.line(plotX, py, plotX + plotW, py);
    doc.text(String(pen), plotX - 3, py + 1.5, { align: "right" });
  }

  // 20mm reference line
  doc.setDrawColor(200, 50, 50);
  doc.setLineWidth(0.3);
  doc.setLineDashPattern([2, 2], 0);
  const y20 = scaleY(20);
  doc.line(plotX, y20, plotX + plotW, y20);
  doc.setFontSize(5);
  doc.setTextColor(200, 50, 50);
  doc.text("20mm", plotX + plotW + 1, y20 + 1.5);
  doc.setLineDashPattern([], 0);

  // Sort points by moisture content for line drawing
  const sorted = [...points].sort((a, b) => a.mc - b.mc);

  // Draw data line
  doc.setDrawColor(...COLORS.primary);
  doc.setLineWidth(0.5);
  for (let i = 1; i < sorted.length; i++) {
    doc.line(
      scaleX(sorted[i - 1].mc),
      scaleY(sorted[i - 1].pen),
      scaleX(sorted[i].mc),
      scaleY(sorted[i].pen),
    );
  }

  // Draw data points
  for (const pt of sorted) {
    const cx = scaleX(pt.mc);
    const cy = scaleY(pt.pen);
    doc.setFillColor(...COLORS.primary);
    doc.circle(cx, cy, 1.2, "F");
  }

  // Mark LL at 20mm if available
  if (liquidLimit !== undefined) {
    const llX = scaleX(liquidLimit);
    doc.setDrawColor(200, 50, 50);
    doc.setLineDashPattern([1, 1], 0);
    doc.setLineWidth(0.3);
    doc.line(llX, plotY, llX, plotY + plotH);
    doc.setLineDashPattern([], 0);
    doc.setFontSize(5.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(200, 50, 50);
    doc.text(`LL=${round2(liquidLimit)}%`, llX, plotY - 2, { align: "center" });
  }

  // Axis labels
  doc.setFontSize(6);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLORS.dark);
  doc.text("Moisture Content (%)", x + w / 2, y + h - 2, { align: "center" });

  // Rotated Y label
  doc.saveGraphicsState();
  const yLabelX = x + 4;
  const yLabelY = y + h / 2;
  doc.text("Penetration (mm)", yLabelX, yLabelY, { angle: 90 });
  doc.restoreGraphicsState();
}

// ── Draw the Casagrande Plasticity Chart ──
function drawPlasticityChart(
  doc: jsPDF,
  ll: number | undefined,
  pi: number | undefined,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const margin = { top: 14, bottom: 20, left: 28, right: 8 };
  const plotX = x + margin.left;
  const plotY = y + margin.top;
  const plotW = w - margin.left - margin.right;
  const plotH = h - margin.top - margin.bottom;

  // Title
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLORS.primary);
  doc.text("PLASTICITY CHART (ASTM D2487)", x + w / 2, y + 8, { align: "center" });

  // Axes
  doc.setDrawColor(...COLORS.dark);
  doc.setLineWidth(0.3);
  doc.line(plotX, plotY, plotX, plotY + plotH);
  doc.line(plotX, plotY + plotH, plotX + plotW, plotY + plotH);

  // Range
  const llMax = Math.max(100, (ll ?? 0) + 20);
  const piMax = Math.max(60, (pi ?? 0) + 15);

  const scaleX2 = (v: number) => plotX + (v / llMax) * plotW;
  const scaleY2 = (v: number) => plotY + plotH - (v / piMax) * plotH;

  // Grid
  doc.setFontSize(5.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COLORS.muted);
  doc.setDrawColor(230, 230, 230);
  doc.setLineWidth(0.1);

  for (let v = 0; v <= llMax; v += 20) {
    const px = scaleX2(v);
    doc.line(px, plotY, px, plotY + plotH);
    doc.text(String(v), px, plotY + plotH + 5, { align: "center" });
  }
  for (let v = 0; v <= piMax; v += 10) {
    const py = scaleY2(v);
    doc.line(plotX, py, plotX + plotW, py);
    doc.text(String(v), plotX - 3, py + 1.5, { align: "right" });
  }

  // LL=50 reference line
  doc.setDrawColor(200, 200, 200);
  doc.setLineDashPattern([2, 2], 0);
  doc.setLineWidth(0.3);
  const x50 = scaleX2(50);
  doc.line(x50, plotY, x50, plotY + plotH);
  doc.setLineDashPattern([], 0);

  // A-line: PI = 0.73(LL - 20)
  doc.setDrawColor(139, 92, 246); // purple
  doc.setLineWidth(0.5);
  const aStart = 20;
  const aEnd = llMax;
  const aY1 = 0.73 * (aStart - 20);
  const aY2 = 0.73 * (aEnd - 20);
  doc.line(scaleX2(aStart), scaleY2(aY1), scaleX2(aEnd), scaleY2(Math.min(aY2, piMax)));

  // U-line: PI = 0.9(LL - 8)
  doc.setDrawColor(239, 68, 68); // red
  doc.setLineWidth(0.3);
  doc.setLineDashPattern([2, 2], 0);
  const uStart = 8;
  const uY1 = 0;
  const uY2 = 0.9 * (aEnd - 8);
  doc.line(scaleX2(uStart), scaleY2(uY1), scaleX2(aEnd), scaleY2(Math.min(uY2, piMax)));
  doc.setLineDashPattern([], 0);

  // Zone labels
  doc.setFontSize(5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(100, 100, 100);
  doc.text("CL", scaleX2(30), scaleY2(18));
  doc.text("ML", scaleX2(30), scaleY2(4));
  doc.text("CH", scaleX2(70), scaleY2(35));
  doc.text("MH", scaleX2(70), scaleY2(8));

  // Legend
  doc.setFontSize(4.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(139, 92, 246);
  doc.text("— A-line", plotX + plotW - 20, plotY + 5);
  doc.setTextColor(239, 68, 68);
  doc.text("-- U-line", plotX + plotW - 20, plotY + 9);

  // Plot sample point
  if (ll !== undefined && pi !== undefined) {
    const cx = scaleX2(ll);
    const cy = scaleY2(pi);
    doc.setFillColor(239, 68, 68);
    doc.circle(cx, cy, 1.5, "F");
    doc.setFontSize(5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(239, 68, 68);
    doc.text(`(${round2(ll)}, ${round2(pi)})`, cx + 3, cy - 2);
  }

  // Axis labels
  doc.setFontSize(6);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLORS.dark);
  doc.text("Liquid Limit (%)", x + w / 2, y + h - 2, { align: "center" });
  doc.saveGraphicsState();
  doc.text("Plasticity Index (%)", x + 4, y + h / 2, { angle: 90 });
  doc.restoreGraphicsState();
}

function drawRecordPage(
  doc: jsPDF,
  record: AtterbergRecord,
  options: AtterbergPDFOptions,
  images: AdminImages,
) {
  const { projectName, clientName, projectState } = options;
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentW = pw - margin * 2;

  let y = 10;

  // ── Header images: logo (left) + contacts (right) ──
  const headerH = 24;
  if (images.logo || images.contacts) {
    if (images.logo) {
      try {
        doc.addImage(images.logo, margin, y, contentW * 0.35, headerH);
      } catch { /* skip */ }
    }
    if (images.contacts) {
      try {
        const contactsW = contentW * 0.35;
        doc.addImage(images.contacts, pw - margin - contactsW, y, contactsW, headerH);
      } catch { /* skip */ }
    }
    y += headerH + 3;
  }

  // ── Title bar ──
  doc.setFillColor(...COLORS.primary);
  doc.roundedRect(margin, y, contentW, 12, 2, 2, "F");
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text("ATTERBERG LIMITS (BS 1377 PART 2, 4.3 : 1990)", pw / 2, y + 8, { align: "center" });
  y += 16;

  // ── Metadata section ──
  const metaRows = [
    [{ label: "Client name:", value: clientName || projectState.clientName || "-" }],
    [{ label: "Project/Site name:", value: projectName || projectState.projectName || "-" }],
    [
      { label: "Sampled by:", value: projectState.labOrganization || "-" },
      { label: "Date submitted:", value: record.dateSubmitted || "-" },
      { label: "Date tested:", value: record.dateTested || "-" },
    ],
    [
      { label: "Sample ID:", value: record.label || "-" },
      { label: "Sample depth:", value: (record as any).sampleDepth || "-" },
      { label: "Sample No:", value: record.sampleNumber || "-" },
    ],
  ];

  doc.setFontSize(7.5);
  for (const row of metaRows) {
    const colW = contentW / row.length;
    row.forEach((item, i) => {
      const x = margin + i * colW;
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...COLORS.primary);
      doc.text(item.label, x + 2, y + 4);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...COLORS.dark);
      doc.text(item.value, x + 2, y + 8.5);
      doc.setDrawColor(...COLORS.border);
      doc.rect(x, y, colW, 11);
    });
    y += 11;
  }

  y += 3;

  // ── Record notes (if present) ──
  if (record.note && record.note.trim()) {
    doc.setFillColor(...COLORS.headerBg);
    doc.roundedRect(margin, y, contentW, 8, 1, 1, "F");
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...COLORS.primary);
    doc.text("Notes", margin + 2, y + 5);
    y += 9;

    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...COLORS.dark);
    const splitNote = doc.splitTextToSize(record.note, contentW - 4);
    doc.text(splitNote, margin + 2, y);
    y += Math.max(splitNote.length * 3, 8) + 3;
  }

  // ── Find tests ──
  const llTest = record.tests.find((t) => t.type === "liquidLimit");
  const plTest = record.tests.find((t) => t.type === "plasticLimit");
  const slTest = record.tests.find((t) => t.type === "shrinkageLimit");

  const llTrials = (llTest?.type === "liquidLimit" ? llTest.trials : []) as LiquidLimitTrial[];
  const plTrials = (plTest?.type === "plasticLimit" ? plTest.trials : []) as PlasticLimitTrial[];
  const slTrials = (slTest?.type === "shrinkageLimit" ? slTest.trials : []) as ShrinkageLimitTrial[];

  // ── Data table - handle unlimited trials with pagination ──
  const dataLabels = [
    "Container No",
    "Penetration (mm)",
    "Cont + Wet Soil (g)",
    "Cont + Dry Soil (g)",
    "Container (g)",
    "Wt Moisture (g)",
    "Wt Dry Soil (g)",
    "Moisture Content (%)",
  ];

  const trialsPerTable = 6; // Trials to show per table

  // Create tables for LL trials
  let tableCount = 0;
  for (let startIdx = 0; startIdx < llTrials.length; startIdx += trialsPerTable) {
    const endIdx = Math.min(startIdx + trialsPerTable, llTrials.length);
    const trialsInThisTable = llTrials.slice(startIdx, endIdx);

    // Check if we need a page break
    if (tableCount > 0 && y > ph - 80) {
      doc.addPage();
      y = 20;
    }

    // Table header
    const colHeaders = [""];
    for (let i = 0; i < trialsInThisTable.length; i++) colHeaders.push(`LL ${startIdx + i + 1}`);

    const dataRows: string[][] = dataLabels.map((label, i) => {
      const row = [label];
      for (const trial of trialsInThisTable) {
        const wet = num(trial.containerWetMass);
        const dry = num(trial.containerDryMass);
        const cont = num(trial.containerMass);
        switch (i) {
          case 0: row.push(trial.containerNo || "-"); break;
          case 1: row.push(fmt(num(trial.penetration))); break;
          case 2: row.push(fmt(wet)); break;
          case 3: row.push(fmt(dry)); break;
          case 4: row.push(fmt(cont)); break;
          case 5: row.push(wet !== null && dry !== null ? fmt(round2(wet - dry)) : "-"); break;
          case 6: row.push(dry !== null && cont !== null ? fmt(round2(dry - cont)) : "-"); break;
          case 7: {
            const mc = calculateMoistureFromMass(trial.containerWetMass, trial.containerDryMass, trial.containerMass);
            row.push(mc ? String(round2(Number(mc))) : "-");
            break;
          }
        }
      }
      return row;
    });

    autoTable(doc, {
      startY: y,
      head: [colHeaders],
      body: dataRows,
      theme: "grid",
      headStyles: {
        fillColor: COLORS.headerBg,
        textColor: COLORS.dark,
        fontStyle: "bold",
        fontSize: 6.5,
        cellPadding: 1.5,
        halign: "center",
      },
      bodyStyles: { fontSize: 7, cellPadding: 1.5, halign: "center" },
      columnStyles: {
        0: { cellWidth: 36, halign: "left", fontStyle: "bold", fontSize: 7 },
      },
      alternateRowStyles: { fillColor: COLORS.lightBg },
      margin: { left: margin, right: margin },
      styles: { overflow: "linebreak" as const, lineColor: COLORS.border, lineWidth: 0.3 },
      didParseCell: (data: any) => {
        if (data.section === "body" && data.row.index === 7) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fillColor = [235, 242, 250];
        }
      },
    });

    y = (doc as any).lastAutoTable.finalY + 2;
    tableCount++;
  }

  // Create tables for PL trials
  for (let startIdx = 0; startIdx < plTrials.length; startIdx += trialsPerTable) {
    const endIdx = Math.min(startIdx + trialsPerTable, plTrials.length);
    const trialsInThisTable = plTrials.slice(startIdx, endIdx);

    // Check if we need a page break
    if (y > ph - 80) {
      doc.addPage();
      y = 20;
    }

    // Table header
    const colHeaders = [""];
    for (let i = 0; i < trialsInThisTable.length; i++) colHeaders.push(`PL ${startIdx + i + 1}`);

    const dataRows: string[][] = dataLabels.map((label, i) => {
      const row = [label];
      for (const trial of trialsInThisTable) {
        const wet = num(trial.containerWetMass);
        const dry = num(trial.containerDryMass);
        const cont = num(trial.containerMass);
        switch (i) {
          case 0: row.push(trial.containerNo || "-"); break;
          case 1: row.push("-"); break;
          case 2: row.push(fmt(wet)); break;
          case 3: row.push(fmt(dry)); break;
          case 4: row.push(fmt(cont)); break;
          case 5: row.push(wet !== null && dry !== null ? fmt(round2(wet - dry)) : "-"); break;
          case 6: row.push(dry !== null && cont !== null ? fmt(round2(dry - cont)) : "-"); break;
          case 7: {
            const mc = calculateMoistureFromMass(trial.containerWetMass, trial.containerDryMass, trial.containerMass);
            row.push(mc ? String(round2(Number(mc))) : "-");
            break;
          }
        }
      }
      return row;
    });

    autoTable(doc, {
      startY: y,
      head: [colHeaders],
      body: dataRows,
      theme: "grid",
      headStyles: {
        fillColor: COLORS.headerBg,
        textColor: COLORS.dark,
        fontStyle: "bold",
        fontSize: 6.5,
        cellPadding: 1.5,
        halign: "center",
      },
      bodyStyles: { fontSize: 7, cellPadding: 1.5, halign: "center" },
      columnStyles: {
        0: { cellWidth: 36, halign: "left", fontStyle: "bold", fontSize: 7 },
      },
      alternateRowStyles: { fillColor: COLORS.lightBg },
      margin: { left: margin, right: margin },
      styles: { overflow: "linebreak" as const, lineColor: COLORS.border, lineWidth: 0.3 },
      didParseCell: (data: any) => {
        if (data.section === "body" && data.row.index === 7) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fillColor = [235, 242, 250];
        }
      },
    });

    y = (doc as any).lastAutoTable.finalY + 2;
  }

  // ── Plastic Limit result row ──
  doc.setDrawColor(...COLORS.border);
  doc.setFillColor(...COLORS.headerBg);
  doc.rect(margin, y, contentW, 7, "FD");
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLORS.primary);
  doc.text("PLASTIC LIMIT", margin + contentW * 0.55, y + 5);
  doc.setTextColor(...COLORS.dark);
  doc.text(fmt(record.results.plasticLimit), margin + contentW * 0.85, y + 5);
  y += 9;

  // ── Layout: Left side = charts, Right side = LS + Results + Classification ──
  const leftW = contentW * 0.48;
  const rightW = contentW * 0.5;
  const rightX = margin + contentW * 0.5;
  const sectionStartY = y;

  // ── LEFT: Cone Graph ──
  const chartH = 50;
  drawConeGraph(doc, llTrials, record.results.liquidLimit, margin, y, leftW, chartH);

  // ── LEFT: Plasticity Chart below cone graph ──
  const plasticityChartH = 50;
  drawPlasticityChart(
    doc,
    record.results.liquidLimit,
    record.results.plasticityIndex,
    margin,
    y + chartH + 4,
    leftW,
    plasticityChartH,
  );

  // ── RIGHT: Linear Shrinkage ──
  let ry = sectionStartY;
  const slTrial = slTrials[0];
  const lsData = [
    ["Initial length (mm)", fmt(slTrial ? num(slTrial.initialLength) ?? 140 : 140)],
    ["Final length (mm)", fmt(slTrial ? num(slTrial.finalLength) : null)],
    ["Shrinkage (%)", fmt(record.results.linearShrinkage)],
  ];

  doc.setFillColor(...COLORS.primary);
  doc.roundedRect(rightX, ry, rightW, 7, 1, 1, "F");
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text("LINEAR SHRINKAGE", rightX + rightW / 2, ry + 5, { align: "center" });
  ry += 8;

  doc.setFontSize(7);
  for (const [label, value] of lsData) {
    doc.setDrawColor(...COLORS.border);
    doc.rect(rightX, ry, rightW * 0.7, 6);
    doc.rect(rightX + rightW * 0.7, ry, rightW * 0.3, 6);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...COLORS.dark);
    doc.text(label, rightX + 2, ry + 4.5);
    doc.setFont("helvetica", "normal");
    doc.text(value, rightX + rightW * 0.7 + 2, ry + 4.5);
    ry += 6;
  }
  ry += 4;

  // ── RIGHT: Results Summary ──
  const summaryData: [string, string][] = [
    ["LIQUID LIMIT (%)", fmt(record.results.liquidLimit)],
    ["PLASTIC LIMIT (%)", fmt(record.results.plasticLimit)],
    ["PLASTICITY INDEX (%)", fmt(record.results.plasticityIndex)],
    ["Passing 425 µm (%)", fmt(num(record.passing425um))],
    ["MODULUS OF PLASTICITY", fmt(record.results.modulusOfPlasticity)],
    ["LINEAR SHRINKAGE (%)", fmt(record.results.linearShrinkage)],
  ];

  doc.setFillColor(...COLORS.primary);
  doc.roundedRect(rightX, ry, rightW, 7, 1, 1, "F");
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text("RESULTS SUMMARY", rightX + rightW / 2, ry + 5, { align: "center" });
  ry += 8;

  doc.setFontSize(7);
  for (const [label, value] of summaryData) {
    doc.setDrawColor(...COLORS.border);
    doc.rect(rightX, ry, rightW * 0.7, 6);
    doc.rect(rightX + rightW * 0.7, ry, rightW * 0.3, 6);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...COLORS.dark);
    doc.text(label, rightX + 2, ry + 4.5);
    doc.setFont("helvetica", "normal");
    doc.text(value, rightX + rightW * 0.7 + 2, ry + 4.5);
    ry += 6;
  }
  ry += 4;

  // ── RIGHT: Soil Classification ──
  const ll = record.results.liquidLimit;
  const pi = record.results.plasticityIndex ?? 0;
  let uscsCode = "";
  let uscsDesc = "";
  if (ll !== undefined && record.results.plasticLimit !== undefined) {
    if (pi < 4) {
      uscsCode = ll < 50 ? "ML" : "MH";
      uscsDesc = ll < 50 ? "SILT OF LOW PLASTICITY" : "SILT OF HIGH PLASTICITY";
    } else if (pi < 7) {
      uscsCode = "CL-ML";
      uscsDesc = "SILTY CLAY OF LOW PLASTICITY";
    } else {
      uscsCode = ll < 50 ? "CL" : "CH";
      uscsDesc = ll < 50 ? "CLAY OF LOW PLASTICITY" : "CLAY OF HIGH PLASTICITY";
    }
  }

  doc.setFillColor(...COLORS.headerBg);
  doc.rect(rightX, ry, rightW, 7, "F");
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLORS.primary);
  doc.text("SOIL CLASSIFICATION", rightX + rightW / 2, ry + 5, { align: "center" });
  ry += 8;

  doc.setFontSize(7);
  // USCS row
  doc.setDrawColor(...COLORS.border);
  doc.rect(rightX, ry, rightW * 0.2, 6);
  doc.rect(rightX + rightW * 0.2, ry, rightW * 0.6, 6);
  doc.rect(rightX + rightW * 0.8, ry, rightW * 0.2, 6);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLORS.primary);
  doc.text("USCS", rightX + 2, ry + 4.5);
  doc.setTextColor(...COLORS.dark);
  doc.setFont("helvetica", "normal");
  doc.text(uscsDesc, rightX + rightW * 0.2 + 2, ry + 4.5);
  doc.setFont("helvetica", "bold");
  doc.text(uscsCode, rightX + rightW * 0.8 + 2, ry + 4.5);
  ry += 6;

  // AASHTO row
  doc.rect(rightX, ry, rightW * 0.2, 6);
  doc.rect(rightX + rightW * 0.2, ry, rightW * 0.8, 6);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLORS.primary);
  doc.text("AASHTO", rightX + 2, ry + 4.5);
  ry += 10;

  // ── Footer: Tested by / Date / Checked by ──
  const footerY = Math.max(ry, sectionStartY + chartH + plasticityChartH + 10) + 4;
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLORS.dark);
  doc.text(`Tested by: ${record.testedBy || "____________"}`, margin, footerY);
  doc.text(`Date reported: ${projectState.dateReported || "____________"}`, margin + contentW * 0.35, footerY);
  doc.text(`Checked by: ${projectState.checkedBy || "____________"}`, margin + contentW * 0.7, footerY);

  // ── Stamp image at bottom ──
  if (images.stamp) {
    try {
      const stampW = 35;
      const stampH = 35;
      const stampX = pw - margin - stampW;
      const stampY = ph - margin - stampH - 8;
      doc.addImage(images.stamp, stampX, stampY, stampW, stampH);
    } catch { /* skip */ }
  }
}

export const generateAtterbergPDF = async (
  options: AtterbergPDFOptions
): Promise<Blob | void> => {
  // Fetch images in parallel with PDF setup
  const images = await fetchAdminImagesAsBase64();

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
