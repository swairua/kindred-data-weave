import { jsPDF } from "jspdf";
import {
  calculateMoisture,
  type GradingCalculations,
  type GradingRow,
  type HydrometerCalculations,
  type HydrometerInputs,
} from "./gradingCalculations";
import { fetchAdminImagesAsBase64, type AdminImages } from "./imageUtils";
import {
  PSD_DECADE_LINES,
  PSD_DECADE_TICKS,
  PSD_FRACTIONS,
  PSD_LAYOUT,
  PSD_MINOR_TICKS,
  PSD_PLOT_BOTTOM,
  PSD_SUB_LABELS,
  psdCurveSamples,
  psdX,
  psdY,
  type PsdPoint,
} from "./psdChartGeometry";

/**
 * Particle size distribution report laid out like the BS 1377-2:1990
 * 9.2/9.3/9.4 and 9.5 sheet issued by the testing laboratory.
 *
 * The sheet is US Letter with a ruled frame: identification block, sample
 * preparation panels, a two-row soil classification, side-by-side sieve and
 * hydrometer tables, the grading graph, and a footer row carrying the stamp.
 *
 * The grading curve prefers the html2canvas capture of the on-screen chart so
 * the printed graph is pixel-identical to the screen, and falls back to a
 * natively drawn vector curve built from the same `psdChartGeometry` helpers
 * when that capture is unavailable.
 */

// US Letter sheet. The reference frame sits at ~21.2/20.2 mm side margins.
const MARGIN = 21.2;
const CONTENT_W = 174.5;
const ROW_H = 2.84;
const SPACER_H = 2.86;
const SIEVE_CAP_H = 2.9;
const SIEVE_HEAD_H = 5.4;
const HYDRO_CAP_H = 8.3;
const HYDRO_PARAM_H = 3.14;
const HYDRO_HEAD_H = 8.7;
const FOOTER_H = 5.5;
const BOTTOM_MARGIN = 12; // whitespace under the footer
const REPORT_FOOTER_GAP = 12; // whitespace between the report and the footer
const GRAPH_GAP = 2.5;
const GRAPH_INSET = 10;
const MIN_ROW_H = 2.55;
// Enough for the fixed label strip plus a usable plot; the strip itself never
// compresses, only the plot is allowed to shrink.
const MIN_BLOCK_H = 52;
const MAX_BLOCK_H = 104.4;
const SIEVE_W = 69.5;

const COLORS = {
  dark: [0, 0, 0] as [number, number, number],
  labelBg: [214, 214, 214] as [number, number, number],
  footerBg: [191, 191, 191] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  plotBg: [242, 220, 219] as [number, number, number],
  curve: [192, 0, 0] as [number, number, number],
  red: [255, 0, 0] as [number, number, number],
  blue: [0, 0, 204] as [number, number, number],
};

const BLANK = "__________";
const DASH = "-";

interface Cell {
  /** Width in millimetres. */
  w: number;
  text: string;
  align?: "left" | "center" | "right";
  bold?: boolean;
  size?: number;
  /** Lower bound for the automatic shrink, for cells holding long captions. */
  minSize?: number;
  label?: boolean;
  /** Explicit fill, otherwise the label grey or white. */
  fill?: [number, number, number];
  color?: [number, number, number];
  /** Extra text right-aligned inside the same cell (unit suffixes). */
  right?: string;
  /** Right inset for `right`, in millimetres. */
  rightPad?: number;
  /** Left inset for left-aligned text, in millimetres. */
  pad?: number;
  /** Taller rect for this cell only (rowspans). */
  h?: number;
  /** Advances x without drawing, leaving the rowspan gap. */
  gap?: boolean;
  /** Custom drawing after the fill and text, for glyphs the fonts lack. */
  postDraw?: (d: jsPDF, cx: number, cy: number, cw: number, ch: number) => void;
}

export interface PsdRecordView {
  label: string;
  sampleNumber: string;
  sampleDepthFrom: string;
  sampleDepthTo: string;
  sampledSubmittedBy: string;
  testedBy: string;
  dateSubmitted: string;
  dateTested: string;
  samplePreparation: { initialDryMass: string; washedOvenDryMass: string };
  moisture: { wetMass: string; dryMass: string };
  sieveRows: GradingRow[];
  hydrometerRows: { time: string; actualHydrometer: string }[];
}

export interface ParticleSizeDistributionPdfOptions {
  projectName?: string;
  clientName?: string;
  date?: string;
  dateTested?: string;
  dateReported?: string;
  testedBy?: string;
  checkedBy?: string;
  labOrganization?: string;
  record: PsdRecordView;
  grading: GradingCalculations;
  hydrometer: HydrometerCalculations;
  hydrometerInputs: HydrometerInputs;
  /** Merged sieve + hydrometer grading series in millimetres and per cent passing. */
  series: PsdPoint[];
  /** html2canvas capture of the on-screen chart, when one was produced. */
  chartImage: string | null;
  gravelPercentage: number | null;
  sandPercentage: number | null;
  finesPercentage: number | null;
  uscsSymbol: string;
  uscsDescription: string | null;
  aashtoGroup: string;
  groupIndex: number | null;
  skipDownload?: boolean;
}

const text = (value: string | number | null | undefined, fallback = BLANK): string => {
  if (value === null || value === undefined) return fallback;
  const trimmed = String(value).trim();
  return trimmed === "" || trimmed === "auto" ? fallback : trimmed;
};

const num = (value: number | null | undefined, digits = 1, fallback = BLANK): string =>
  value === null || value === undefined || !Number.isFinite(value) ? fallback : value.toFixed(digits);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** ISO dates print as dd-Mmm-yy on the sheet ("2026-06-09" -> "09-Jun-26"). */
const refDate = (value: string | number | null | undefined): string => {
  const raw = text(value, "");
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (!match) return raw === "" ? BLANK : raw;
  const month = Number.parseInt(match[2], 10);
  if (month < 1 || month > 12) return raw;
  return `${match[3]}-${MONTHS[month - 1]}-${match[1].slice(2)}`;
};

/** Hydrometer times print plain when integral, else to two decimals. */
const timeText = (value: number | null | undefined): string => {
  if (value === null || value === undefined || !Number.isFinite(value)) return DASH;
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
};

/** Shrink a string until it fits its cell rather than letting it spill over the rule. */
const fitText = (d: jsPDF, value: string, maxWidth: number, startSize: number, minSize = 2.8): number => {
  let size = startSize;
  try {
    // getTextWidth measures at the live font size, so the size must be
    // applied on every step or the loop collapses to minSize.
    d.setFontSize(size);
    while (size > minSize && d.getTextWidth(value) > Math.max(maxWidth, 1)) {
      size -= 0.25;
      d.setFontSize(size);
    }
  } catch { /* jsPDF text metrics are unavailable in some environments */ }
  return size;
};

const imageParts = (dataUrl: string): { base64: string; format: "PNG" | "JPEG" } => {
  const match = /^(data:image\/(\w+);base64,)(.+)$/.exec(dataUrl);
  if (!match) return { base64: dataUrl, format: "PNG" };
  const mime = match[2].toLowerCase();
  return { base64: match[3], format: mime === "jpeg" || mime === "jpg" ? "JPEG" : "PNG" };
};

/** Draw one row of ruled cells and return the y below it. Supports "\n" multi-line captions. */
const drawCells = (d: jsPDF, x: number, y: number, h: number, cells: Cell[]): number => {
  let cx = x;
  d.setDrawColor(...COLORS.dark);
  d.setLineWidth(0.2);
  for (const cell of cells) {
    const cw = cell.w;
    if (cell.gap) {
      cx += cw;
      continue;
    }
    const ch = cell.h ?? h;
    const shade = cell.fill ?? (cell.label ? COLORS.labelBg : COLORS.white);
    d.setFillColor(shade[0], shade[1], shade[2]);
    d.rect(cx, y, cw, ch, "FD");
    const value = (cell.text ?? "").trim();
    if (value) {
      const lines = value.split("\n").map((line) => line.trim()).filter(Boolean);
      const longest = lines.reduce((a, b) => (a.length >= b.length ? a : b), "");
      const pad = cell.pad ?? 0.8;
      d.setFont("helvetica", cell.bold ? "bold" : "normal");
      d.setFontSize(cell.size ?? 6.6);
      let budget = cw - pad - 0.8;
      if (cell.right) {
        const unitWidth = d.getTextWidth(cell.right);
        budget -= (cell.rightPad ?? 0.8) + unitWidth + 0.8;
      }
      const size = fitText(d, longest, budget, cell.size ?? 6.6, cell.minSize ?? 2.8);
      d.setFontSize(size);
      d.setFont("helvetica", cell.bold ? "bold" : "normal");
      d.setTextColor(...(cell.color ?? COLORS.dark));
      const align = cell.align ?? "left";
      const tx = align === "left" ? cx + pad : align === "right" ? cx + cw - 0.8 : cx + cw / 2;
      const lineH = size * 0.38;
      const blockTop = lines.length > 1 ? y + ch / 2 - lineH / 2 : y + ch / 2;
      lines.forEach((line, index) => {
        d.text(line, tx, blockTop + index * lineH, { align, baseline: "middle" });
      });
      if (cell.right) {
        d.setFontSize(size);
        d.text(cell.right, cx + cw - (cell.rightPad ?? 0.8), y + ch / 2, { align: "right", baseline: "middle" });
      }
    }
    cell.postDraw?.(d, cx, y, cw, ch);
    cx += cw;
  }
  return y + h;
};

/** A blank ruled row spanning the content width, separating the sections. */
const drawSpacer = (d: jsPDF, x: number, y: number): number =>
  drawCells(d, x, y, SPACER_H, [{ w: CONTENT_W, text: "" }]);

/** Client / project / sample identification block. Values are centred, client red, project blue. */
const drawHeader = (d: jsPDF, x: number, y: number, o: ParticleSizeDistributionPdfOptions, rowH: number): number => {
  const { record } = o;
  const depth = [record.sampleDepthFrom, record.sampleDepthTo].filter(Boolean).join(" - ");
  const valueW = CONTENT_W - 19.9 - 34.6 - 15;
  let cy = y;
  cy = drawCells(d, x, cy, rowH, [
    { w: 19.9, text: "Client:", label: true, bold: true },
    { w: valueW, text: text(o.clientName), align: "center", color: COLORS.red },
    { w: 34.6, text: "Date submitted:", label: true, bold: true },
    { w: 15, text: refDate(record.dateSubmitted || o.date), align: "center" },
  ]);
  cy = drawCells(d, x, cy, rowH, [
    { w: 19.9, text: "Project/Site Name:", label: true, bold: true },
    { w: valueW, text: text(o.projectName), align: "center", color: COLORS.blue },
    { w: 34.6, text: "Date tested:", label: true, bold: true },
    { w: 15, text: refDate(record.dateTested || o.dateTested), align: "center" },
  ]);
  const tailW = CONTENT_W - 19.9 - 14.4 - 24.5 - 29.4 - 21.9 - 14.8 - 34.6;
  cy = drawCells(d, x, cy, rowH, [
    { w: 19.9, text: "Sample ID:", label: true, bold: true },
    { w: 14.4, text: text(record.label), align: "center" },
    { w: 24.5, text: "Sample No.:", label: true, bold: true },
    { w: 29.4, text: text(record.sampleNumber), align: "center" },
    { w: 21.9, text: "Sample depth (M):", label: true, bold: true },
    { w: 14.8, text: text(depth), align: "center" },
    { w: 34.6, text: "Sampled and Submitted by:", label: true, bold: true },
    { w: tailW, text: text(record.sampledSubmittedBy), align: "center" },
  ]);
  return cy;
};

const parse = (value: string) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/** Sample preparation on the left, moisture content at preparation on the right. */
const drawPreparation = (d: jsPDF, x: number, y: number, o: ParticleSizeDistributionPdfOptions, rowH: number): number => {
  const leftW = 58.8;
  const gapW = 51.1;
  const rightW = CONTENT_W - leftW - gapW;
  const initial = parse(o.record.samplePreparation.initialDryMass);
  const washed = parse(o.record.samplePreparation.washedOvenDryMass);
  const fineMass = initial !== null && washed !== null ? Math.max(initial - washed, 0) : null;
  const finesPercent = initial && fineMass !== null ? (fineMass / initial) * 100 : null;
  const moisture = calculateMoisture(o.record.moisture.wetMass, o.record.moisture.dryMass);

  const pair = (panelW: number, labelW: number, unit: string, labelText: string, value: string): Cell[] => [
    { w: labelW, text: labelText, right: unit, rightPad: 5.4, bold: true, size: 6 },
    { w: panelW - labelW, text: value, align: "center" },
  ];

  let left = drawCells(d, x, y, rowH, [{ w: leftW, text: "Sample preparation details", bold: true, label: true }]);
  left = drawCells(d, x, left, rowH, pair(leftW, 46.5, "(gm)", "Initial quartered and air dried mass", text(initial)));
  left = drawCells(d, x, left, rowH, pair(leftW, 46.5, "(gm)", "Washed and oven dried mass", text(washed)));
  left = drawCells(d, x, left, rowH, pair(leftW, 46.5, "(gm)", "Fine mass", num(fineMass)));
  drawCells(d, x, left, rowH, pair(leftW, 46.5, "(%)", "Fines percent", num(finesPercent)));

  const rx = x + leftW + gapW;
  let right = drawCells(d, rx, y, rowH, [{ w: rightW, text: "Moisture content at sample preparations", bold: true, label: true }]);
  const rightPair = (unit: string, labelText: string, value: string): Cell[] => pair(rightW, 49.4, unit, labelText, value);
  right = drawCells(d, rx, right, rowH, rightPair("(gm)", "Wet weight of sample", text(o.record.moisture.wetMass)));
  right = drawCells(d, rx, right, rowH, rightPair("(gm)", "Dry weight of sample", text(o.record.moisture.dryMass)));
  right = drawCells(d, rx, right, rowH, rightPair("(gm)", "Wet weight of water", num(moisture.waterWeight)));
  drawCells(d, rx, right, rowH, rightPair("(%)", "Moisture content", num(moisture.moistureContent)));

  return y + rowH * 5;
};

const drawClassification = (d: jsPDF, x: number, y: number, o: ParticleSizeDistributionPdfOptions, rowH: number): number => {
  const uscs = o.uscsDescription && o.uscsSymbol && o.uscsSymbol !== "auto"
    ? `${o.uscsDescription}(${o.uscsSymbol})`.toUpperCase()
    : text(o.uscsDescription || o.uscsSymbol);
  const midLabelW = 24.5;
  const midValueW = 18.2;
  const tailLabelW = 21.9;
  const valueW = CONTENT_W - 19.9 - 14.4 - midLabelW - midValueW - tailLabelW;
  let cy = drawCells(d, x, y, rowH, [{ w: CONTENT_W, text: "Soil Classification", bold: true, pad: 19.6, label: true }]);
  cy = drawCells(d, x, cy, rowH, [
    { w: 19.9, text: "GRAVEL     (%):", label: true, bold: true },
    { w: 14.4, text: num(o.gravelPercentage), align: "center" },
    { w: midLabelW, text: "CLAY/SILT (%):", align: "right", label: true, bold: true, h: rowH * 2 },
    { w: midValueW, text: num(o.finesPercentage), align: "center", h: rowH * 2 },
    { w: tailLabelW, text: "USCS", align: "center", label: true, bold: true },
    { w: valueW, text: uscs, align: "center" },
  ]);
  cy = drawCells(d, x, cy, rowH, [
    { w: 19.9, text: "SAND          (%):", label: true, bold: true },
    { w: 14.4, text: num(o.sandPercentage), align: "center" },
    { w: midLabelW + midValueW, text: "", gap: true },
    { w: tailLabelW, text: "AASHTO", align: "center", label: true, bold: true },
    { w: valueW, text: text(o.aashtoGroup), align: "center" },
  ]);
  return cy;
};

const drawSieveTable = (d: jsPDF, x: number, y: number, w: number, o: ParticleSizeDistributionPdfOptions, rowH: number, targetBottom?: number): number => {
  const colW = [19.8, 14.4, 12.2];
  const lastW = w - colW[0] - colW[1] - colW[2];
  const widths = [...colW, lastW];
  const headers = [
    "Sieve size\n(mm)",
    "Retained mass\n(gm)",
    "% Retained\n(%)",
    "Cumulative passing\npercentage (%)",
  ];
  let cy = drawCells(d, x, y, SIEVE_CAP_H, [{
    w,
    text: "Wet & Dry Sieve Analysis to BS 1377 2:1990: 9.2/9.3/9.4",
    align: "center",
    bold: true,
    label: true,
    minSize: 4,
  }]);
  cy = drawCells(d, x, cy, SIEVE_HEAD_H, headers.map((caption, index) => ({
    w: widths[index],
    text: caption,
    label: true,
    bold: true,
    size: 6,
    minSize: 4,
    align: "center" as const,
  })));
  o.record.sieveRows.forEach((row, index) => {
    const passing = o.grading.cumulativePassing[index];
    cy = drawCells(d, x, cy, rowH, [
      { w: widths[0], text: row.sieveSize, align: "center", bold: true },
      { w: widths[1], text: text(row.weightRetained, DASH), align: "center" },
      { w: widths[2], text: num(o.grading.percentageRetained[index], 1, DASH), align: "center" },
      { w: widths[3], text: passing === null ? DASH : num(passing, 1, DASH), align: "center" },
    ]);
  });
  return drawCells(d, x, cy, rowH, [
    { w: widths[0], text: "TOTAL", align: "center", bold: true },
    { w: widths[1], text: num(o.grading.totalWeight), align: "center", bold: true },
    { w: widths[2], text: DASH, align: "center" },
    { w: widths[3], text: DASH, align: "center" },
  ]);
  if (targetBottom !== undefined && cy < targetBottom) {
    const fillerCells = [
      { w: widths[0], text: "", align: "center" },
      { w: widths[1], text: "", align: "center" },
      { w: widths[2], text: "", align: "center" },
      { w: widths[3], text: "", align: "center" },
    ];
    while (cy + rowH <= targetBottom) {
      cy = drawCells(d, x, cy, rowH, fillerCells);
    }
  }
  return cy;
};

/**
 * The built-in PDF fonts have no radical sign, so the "K√(L/T)" line of the
 * diameter header is drawn by hand: "K", a stroked √, then "(L/T)".
 */
const drawDiameterHeader = (d: jsPDF, cx: number, cy: number, cw: number, ch: number): void => {
  d.setFont("helvetica", "bold");
  d.setFontSize(6);
  const size = fitText(d, "Diameter;", cw - 1.2, 6, 3);
  d.setFontSize(size);
  d.setFont("helvetica", "bold");
  d.setTextColor(...COLORS.dark);
  const lineH = size * 0.38;
  const mid = cy + ch / 2;
  d.text("Diameter;", cx + cw / 2, mid - lineH, { align: "center", baseline: "middle" });
  d.text("D", cx + cw / 2, mid, { align: "center", baseline: "middle" });

  const first = "K";
  const last = "(L/T)";
  const firstW = d.getTextWidth(first);
  const lastW = d.getTextWidth(last);
  const glyphH = size * 0.352778 * 0.72;
  const radicalW = glyphH;
  const total = firstW + radicalW * 1.2 + lastW;
  const y3 = mid + lineH;
  const sx = cx + cw / 2 - total / 2;
  d.text(first, sx, y3, { align: "left", baseline: "middle" });
  const rx = sx + firstW + radicalW * 0.1;
  d.setDrawColor(...COLORS.dark);
  d.setLineWidth(0.18);
  d.line(rx, y3 - glyphH * 0.12, rx + radicalW * 0.32, y3 + glyphH * 0.45);
  d.line(rx + radicalW * 0.32, y3 + glyphH * 0.45, rx + radicalW, y3 - glyphH * 0.5);
  d.text(last, rx + radicalW * 1.1, y3, { align: "left", baseline: "middle" });
};

const HYDROMETER_COLUMNS = [
  "Time,\nmin",
  "Actual\nrh",
  "Adjusted\nHR(Rh)",
  "Composite\ncorrection",
  "Corrected\nHR",
  "Effective\ndepth\n(cm)",
  "",
  "% Fines in\nSuspension",
  "% Fines based\non whole sample",
];

const drawHydrometerTable = (d: jsPDF, x: number, y: number, w: number, o: ParticleSizeDistributionPdfOptions, rowH: number, targetBottom?: number): number => {
  const inputs = o.hydrometerInputs;
  let cy = drawCells(d, x, y, HYDRO_CAP_H, [{
    w,
    text: "Hydrometer Analysis to BS 1377-2:1990:9.5",
    align: "center",
    bold: true,
    label: true,
  }]);
  const paramRow = (
    leftLabel: string, leftUnit: string, leftValue: string,
    rightLabel: string, rightUnit: string, rightValue: string,
  ): Cell[] => [
    { w: 40.5, text: leftLabel, right: leftUnit, rightPad: 5.4, label: true, bold: true, size: 6, minSize: 3 },
    { w: 14.8, text: leftValue, align: "center" },
    { w: 34.6, text: rightLabel, right: rightUnit, rightPad: 5.4, label: true, bold: true, size: 6, minSize: 3 },
    { w: 15.1, text: rightValue, align: "center" },
  ];
  cy = drawCells(d, x, cy, HYDRO_PARAM_H, paramRow(
    "Dry Weight", "(g)", text(inputs.dryWeight),
    "Hydrometer Type", "", text(inputs.hydrometerType),
  ));
  cy = drawCells(d, x, cy, HYDRO_PARAM_H, paramRow(
    "S.G (Mg/m³)", "", num(o.hydrometer.specificGravity, 2),
    "Zero Correction factor", "", text(inputs.zeroCorrection),
  ));
  cy = drawCells(d, x, cy, HYDRO_PARAM_H, paramRow(
    "Temperature (°C)", "", text(inputs.temperature),
    "Meniscus correction (g/L)", "", text(inputs.meniscusCorrection),
  ));
  cy = drawCells(d, x, cy, HYDRO_PARAM_H, paramRow(
    "K Factor", "", num(o.hydrometer.stokesConstant, 3),
    "Temperature Correction Factor", "", text(inputs.temperatureCorrection),
  ));

  const headW = [7.41, 11.18, 10.58, 11.31, 17.85, 13.25, 11.91, 12.38];
  const lastW = w - headW.reduce((a, b) => a + b, 0);
  const widths = [...headW, lastW];
  cy = drawCells(d, x, cy, HYDRO_HEAD_H, HYDROMETER_COLUMNS.map((caption, index) => ({
    w: widths[index],
    text: caption,
    label: true,
    bold: true,
    size: 6,
    minSize: 3,
    align: "center" as const,
    ...(index === 6 ? { postDraw: drawDiameterHeader } : {}),
  })));

  o.hydrometer.results.forEach((result) => {
    const actual = o.record.hydrometerRows.find((row) => row.time === String(result.time))?.actualHydrometer;
    cy = drawCells(d, x, cy, rowH, [
      timeText(result.time),
      text(actual, DASH),
      num(result.adjustedReading, 1, DASH),
      num(result.compositeCorrection, 2, DASH),
      num(result.correctedReading, 1, DASH),
      num(result.effectiveDepth, 2, DASH),
      num(result.particleDiameter, 4, DASH),
      num(result.finesInSuspension, 1, DASH),
      num(result.finesByHydrometer, 1, DASH),
    ].map((value, index) => ({ w: widths[index], text: value, align: "center" as const })));
  });
  if (targetBottom !== undefined && cy < targetBottom) {
    const fillerCells = widths.map((w) => ({ w, text: "", align: "center" as const }));
    while (cy + rowH <= targetBottom) {
      cy = drawCells(d, x, cy, rowH, fillerCells);
    }
  }
  return cy;
};

/** Percentage axis values: 0 to 100 in steps of 10. */
const PASSING_VALUES = Array.from({ length: 11 }, (_, step) => step * 10);

/**
 * The chart block is authored in the same 384.28-unit space as the on-screen
 * SVG, so one unit is 0.352778 mm and geometry, line weights and type sizes
 * all scale together.
 */
const REF_UNIT_MM = 0.352778;
const REF_BLOCK_UNITS = PSD_LAYOUT.viewW;
const REF_BLOCK_H_UNITS = PSD_LAYOUT.viewH;
/** Plot rectangle inside the chart block, in the same units as the on-screen SVG. */
const PLOT_UNITS = PSD_LAYOUT.plot;
/** Fraction band rows below the plot, matching the reference sheet. */
const BAND_TOP_UNITS = PSD_LAYOUT.bandTopY;
const BAND_BOTTOM_UNITS = PSD_LAYOUT.bandBottomY;

/**
 * Native vector grading curve, used whenever the html2canvas capture of the
 * on-screen chart is missing. It reads the same `psdChartGeometry` helpers the
 * SVG uses, so the printed graph matches the screen even when only vectors
 * reach the PDF.
 */
const drawPsdGraphVector = (d: jsPDF, x: number, y: number, w: number, o: ParticleSizeDistributionPdfOptions, forcedHeight?: number): number => {
  // One unit of the authoring space is one point of the source sheet, so geometry
  // scales by millimetres per unit, while type scales by the same ratio expressed
  // as a plain multiplier on a point size.
  const scale = w / REF_BLOCK_UNITS;
  const type = scale / REF_UNIT_MM;
  const naturalH = REF_BLOCK_H_UNITS * scale;
  const refH = forcedHeight ?? naturalH;
  const blockBottom = y + refH;
  // The axis strip keeps its printed height however far the plot is squeezed,
  // so a dense record can never fold the ticks onto their rules.
  const stripH = (REF_BLOCK_H_UNITS - PSD_PLOT_BOTTOM) * scale;
  const px = (units: number) => x + units * scale;
  /** Top-anchored geometry: title, frame top and the top of the plot. */
  const ty = (units: number) => y + units * scale;
  /** Bottom-anchored label rows: unaffected by the plot's compression. */
  const by = (units: number) => blockBottom - (REF_BLOCK_H_UNITS - units) * scale;
  const plotY = ty(PLOT_UNITS.y);
  const plot = {
    x: px(PLOT_UNITS.x),
    y: plotY,
    w: PLOT_UNITS.w * scale,
    h: Math.max(0, blockBottom - stripH - plotY),
  };
  const plotBottom = plot.y + plot.h;
  /** Places text at an absolute position in millimetres. */
  const text = (
    value: string,
    atX: number,
    atY: number,
    align: "left" | "center" | "right",
    size: number,
    bold = false,
    angle = 0,
  ) => {
    d.setFontSize(Math.max(size * type, 3.5));
    d.setFont("helvetica", bold ? "bold" : "normal");
    d.setTextColor(...COLORS.dark);
    d.text(value, atX, atY, { align, baseline: "middle", angle });
  };
  /** Places text at a position given in chart-block units. */
  const label = (
    value: string,
    atX: number,
    atY: number,
    align: "left" | "center" | "right",
    size: number,
    bold = false,
    angle = 0,
    anchor: "top" | "bottom" = "bottom",
  ) => text(value, px(atX), (anchor === "top" ? ty : by)(atY), align, size, bold, angle);

  d.setFillColor(255, 255, 255);
  d.setDrawColor(...COLORS.dark);
  d.setLineWidth(0.2 * type);
  d.rect(x, ty(PSD_LAYOUT.frame.y), w, refH - PSD_LAYOUT.frame.y * scale, "FD");

  d.setFillColor(...COLORS.plotBg);
  d.rect(plot.x, plot.y, plot.w, plot.h, "F");

  d.setLineWidth(0.14 * type);
  [...PSD_MINOR_TICKS, ...PSD_DECADE_LINES].forEach((size) => {
    const gx = px(PLOT_UNITS.x + psdX(size, PLOT_UNITS.w));
    d.line(gx, plot.y, gx, plotBottom);
  });
  PASSING_VALUES.forEach((value) => {
    const gy = plot.y + psdY(value, plot.h);
    d.line(plot.x, gy, plot.x + plot.w, gy);
  });

  d.setLineWidth(1.24 * type);
  d.line(plot.x, plot.y, plot.x, plotBottom);
  d.line(plot.x, plotBottom, plot.x + plot.w, plotBottom);

  const samples = psdCurveSamples(o.series, plot.w, plot.h);
  if (samples.length > 1) {
    d.setDrawColor(...COLORS.curve);
    d.setLineWidth(0.74 * type);
    for (let index = 1; index < samples.length; index += 1) {
      d.line(plot.x + samples[index - 1].x, plot.y + samples[index - 1].y, plot.x + samples[index].x, plot.y + samples[index].y);
    }
  }

  PASSING_VALUES.forEach((value) => text(value.toFixed(1), px(PLOT_UNITS.x - 2), plot.y + psdY(value, plot.h), "right", 6));
  text("Passing (%)", px(20), plot.y + plot.h / 2, "center", 7.5, true, 90);
  PSD_DECADE_TICKS.forEach((size) => label(size.toFixed(3), PLOT_UNITS.x + psdX(size, PLOT_UNITS.w), PSD_LAYOUT.decadeLabelY, "center", 5.4));
  d.setDrawColor(...COLORS.dark);
  d.setLineWidth(0.14 * type);
  d.line(px(PSD_LAYOUT.decadeRuleLeft), by(PSD_LAYOUT.decadeRuleY), px(PSD_LAYOUT.decadeRuleRight), by(PSD_LAYOUT.decadeRuleY));
  // Decade rules continue through the sub-label row down to the fraction band.
  PSD_DECADE_LINES.forEach((size) => {
    const gx = px(PLOT_UNITS.x + psdX(size, PLOT_UNITS.w));
    d.line(gx, plotBottom, gx, by(BAND_TOP_UNITS));
  });
  PSD_SUB_LABELS.forEach((band) => label(band.label, PLOT_UNITS.x + psdX(band.from, PLOT_UNITS.w), PSD_LAYOUT.subLabelY, "center", 4.4));
  // Fraction band: a top rule from silt start to gravel end, dividers at the
  // 0.063 / 2 / 63 mm boundaries, and a wider bottom rule.
  d.line(px(PLOT_UNITS.x + psdX(0.002, PLOT_UNITS.w)), by(BAND_TOP_UNITS), px(PLOT_UNITS.x + psdX(63, PLOT_UNITS.w)), by(BAND_TOP_UNITS));
  [0.063, 2, 63].forEach((size) => {
    const gx = px(PLOT_UNITS.x + psdX(size, PLOT_UNITS.w));
    d.line(gx, by(BAND_TOP_UNITS), gx, by(BAND_BOTTOM_UNITS));
  });
  d.setLineWidth(0.37 * type);
  d.line(px(PSD_LAYOUT.bandRuleLeft), by(BAND_BOTTOM_UNITS), px(PSD_LAYOUT.bandRuleRight), by(BAND_BOTTOM_UNITS));
  PSD_FRACTIONS.slice(1, 4).forEach((band) => {
    const at = PLOT_UNITS.x + psdX(Math.sqrt(band.from * band.to), PLOT_UNITS.w);
    label(band.label, at, PSD_LAYOUT.fractionRowY, "center", 5.2);
  });

  d.setDrawColor(...COLORS.dark);
  label("Particle size (mm)", PLOT_UNITS.x + PLOT_UNITS.w / 2, PSD_LAYOUT.axisTitleY, "center", 7, true);
  label("PARTICLE SIZE DISTRIBUTION GRAPH", PLOT_UNITS.x + PLOT_UNITS.w / 2, PSD_LAYOUT.titleY, "center", 7.5, true, 0, "top");

  return y + refH;
};

const drawPsdGraph = (d: jsPDF, x: number, y: number, w: number, o: ParticleSizeDistributionPdfOptions, forcedHeight?: number): number => {
  const h = forcedHeight ?? (REF_BLOCK_H_UNITS * w) / REF_BLOCK_UNITS;
  if (o.chartImage) {
    try {
      const { base64, format } = imageParts(o.chartImage);
      d.addImage(base64, format, x, y, w, h, undefined, "FAST");
      return y + h;
    } catch (error) {
      console.warn("[PSD PDF] Chart capture could not be embedded, drawing the vector curve instead:", error);
    }
  }
  return drawPsdGraphVector(d, x, y, w, o, h);
};

const drawTitleBlock = (
  d: jsPDF,
  x: number,
  y: number,
  w: number,
  o: ParticleSizeDistributionPdfOptions,
  images: AdminImages,
): number => {
  void o;
  const imgW = 62;
  const imgH = 20;
  let cy = y;
  if (images.logo) {
    try {
      const { base64, format } = imageParts(images.logo);
      d.addImage(base64, format, x, cy, imgW, imgH, undefined, "FAST");
    } catch { /* the logo is optional */ }
  }
  if (images.contacts) {
    try {
      const { base64, format } = imageParts(images.contacts);
      d.addImage(base64, format, x + w - imgW, cy, imgW, imgH, undefined, "FAST");
    } catch { /* the contacts image is optional */ }
  }

  cy += imgH + 1;
  d.setDrawColor(...COLORS.dark);
  d.setLineWidth(0.5);
  d.line(x, cy, x + w, cy);

  const line1 = "PARTICLE SIZE DISTRIBUTION";
  const line2 = "BS 1377 2:1990: 9.2/9.3/9.4 & 9.5";
  d.setFont("helvetica", "bold");
  d.setFontSize(8);
  const size1 = fitText(d, line1, 33.5, 8, 5);
  d.setFontSize(size1);
  cy += 5.7;
  d.setTextColor(...COLORS.dark);
  d.text(line1, x + w / 2, cy, { align: "center" });
  const w1 = d.getTextWidth(line1);
  d.setLineWidth(0.4);
  d.line(x + w / 2 - w1 / 2, cy + 0.7, x + w / 2 + w1 / 2, cy + 0.7);

  const size2 = fitText(d, line2, 38.4, 8, 5);
  d.setFontSize(size2);
  cy += 3.1;
  d.text(line2, x + w / 2, cy, { align: "center" });
  const w2 = d.getTextWidth(line2);
  d.line(x + w / 2 - w2 / 2, cy + 0.6, x + w / 2 + w2 / 2, cy + 0.6);
  return cy + 3.5;
};

const drawFooter = (d: jsPDF, o: ParticleSizeDistributionPdfOptions, images: AdminImages, top: number): void => {
  const checked = text(o.checkedBy, "_______________");
  drawCells(d, MARGIN, top, FOOTER_H, [
    { w: 34.3, text: "Tested by:", label: true, bold: true, fill: COLORS.footerBg },
    { w: 42.6, text: text(o.testedBy || o.record.testedBy), align: "center", fill: COLORS.footerBg },
    { w: 21.7, text: "Date reported:", label: true, bold: true, align: "right", fill: COLORS.footerBg },
    { w: 26.0, text: refDate(o.dateReported), align: "center" },
    { w: CONTENT_W - 34.3 - 42.6 - 21.7 - 26.0, text: `Checked by: ${checked}`, align: "center" },
  ]);

  if (images.stamp) {
    try {
      // The stamp straddles the footer row, like the laboratory's own stamp.
      const s = 15.7;
      const { base64, format } = imageParts(images.stamp);
      d.addImage(base64, format, MARGIN + CONTENT_W - s - 1.8, top - 6.8, s, s, undefined, "FAST");
    } catch { /* the stamp is optional */ }
  }
};

export const generateParticleSizeDistributionPDF = async (options: ParticleSizeDistributionPdfOptions) => {
  // Images are optional: a missing logo or stamp must never stop a report being produced.
  let images: AdminImages = {};
  try {
    images = await fetchAdminImagesAsBase64();
  } catch (error) {
    console.warn("[PSD PDF] Could not load header/footer images, exporting without them:", error);
  }

  const doc = new jsPDF({ unit: "mm", format: "letter" });
  const pageHeight = doc.internal.pageSize.getHeight();
  const x = MARGIN;
  const topY = 10;
  // The report closes above the footer; the footer itself sits in the
  // whitespace below the report box, clear of the side rails. The stamp
  // straddles the footer and still stays inside the page's bottom margin.
  const footerTop = pageHeight - BOTTOM_MARGIN - FOOTER_H;
  const reportBottom = footerTop - REPORT_FOOTER_GAP;
  const contentBottom = reportBottom;

  const y = drawTitleBlock(doc, x, topY, CONTENT_W, options, images);
  const titleBottom = y;

  const sieveCount = options.record.sieveRows.length;
  const hydroCount = options.hydrometer.results.length;
  const graphW = CONTENT_W - GRAPH_INSET * 2;
  const graphNatural = Math.min((REF_BLOCK_H_UNITS * graphW) / REF_BLOCK_UNITS, MAX_BLOCK_H);
  const hydroBlock = HYDRO_CAP_H + 4 * HYDRO_PARAM_H + HYDRO_HEAD_H;
  const sieveCapHead = SIEVE_CAP_H + SIEVE_HEAD_H;
  // Fixed overhead above the side-by-side tables: title block + 3 spacers +
  // header/preparation/classification rows + the graph gap.
  const tableBottomFor = (rowH: number): number =>
    titleBottom + 3 * SPACER_H + 11 * rowH
    + Math.max(sieveCapHead + (sieveCount + 1) * rowH, hydroBlock + hydroCount * rowH);

  // Single-pass fit: shrink rows first, then the graph (never below
  // MIN_BLOCK_H, the chart is mandatory). One page only — no addPage here.
  let rowH = ROW_H;
  let graphH = graphNatural;
  while (tableBottomFor(rowH) + GRAPH_GAP + graphH > contentBottom && rowH > MIN_ROW_H + 1e-9) {
    rowH = Math.round((rowH - 0.01) * 100) / 100;
  }
  if (tableBottomFor(rowH) + GRAPH_GAP + graphH > contentBottom) {
    // Dense data: rows at floor, graph takes the rest.
    rowH = MIN_ROW_H;
    graphH = Math.max(MIN_BLOCK_H, contentBottom - tableBottomFor(MIN_ROW_H) - GRAPH_GAP);
  }

  let cursor = drawHeader(doc, x, y, options, rowH);
  cursor = drawSpacer(doc, x, cursor);
  cursor = drawPreparation(doc, x, cursor, options, rowH);
  cursor = drawSpacer(doc, x, cursor);
  cursor = drawClassification(doc, x, cursor, options, rowH);
  cursor = drawSpacer(doc, x, cursor);

  const sieveHeight = SIEVE_CAP_H + SIEVE_HEAD_H + (sieveCount + 1) * rowH;
  const hydroHeight = HYDRO_CAP_H + 4 * HYDRO_PARAM_H + HYDRO_HEAD_H + hydroCount * rowH;
  const tableBottom = cursor + Math.max(sieveHeight, hydroHeight);

  drawSieveTable(doc, x, cursor, SIEVE_W, options, rowH, tableBottom);
  drawHydrometerTable(doc, x + SIEVE_W, cursor, CONTENT_W - SIEVE_W, options, rowH, tableBottom);

  // Side rails close at the foot of the report, above the footer, and a bottom
  // rule seals the report box so the footer reads as separate from it.
  doc.setDrawColor(...COLORS.dark);
  doc.setLineWidth(0.2);
  doc.line(x, tableBottom, x, reportBottom);
  doc.line(x + CONTENT_W, tableBottom, x + CONTENT_W, reportBottom);
  doc.line(x, reportBottom, x + CONTENT_W, reportBottom);

  const graphTop = tableBottom + GRAPH_GAP;
  graphH = Math.min(graphH, Math.max(0, contentBottom - graphTop));
  drawPsdGraph(doc, x + GRAPH_INSET, graphTop, graphW, options, graphH);

  // Footer outside the report box, in the whitespace below it.
  drawFooter(doc, options, images, footerTop);

  if (!options.skipDownload) {
    const stem = (options.projectName || "Particle Size Distribution").replace(/[^\w-]+/g, "_");
    doc.save(`${stem}_PSD.pdf`);
  }
  return doc;
};
