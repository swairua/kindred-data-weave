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
  PSD_MINOR_TICKS,
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
 * The grading curve prefers the html2canvas capture of the on-screen chart so
 * the printed graph is pixel-identical to the screen, and falls back to a
 * natively drawn vector curve built from the same `psdChartGeometry` helpers
 * when that capture is unavailable.
 */

const MARGIN = 10;
const CONTENT_W = 190;
const ROW_H = 4.2;
const HEADER_H = 6;
const MIN_ROW_H = 3.4;
const MIN_GRAPH_H = 52;
const MAX_GRAPH_H = 78;

const COLORS = {
  dark: [0, 0, 0] as [number, number, number],
  labelBg: [214, 214, 214] as [number, number, number],
  plotBg: [242, 220, 219] as [number, number, number],
  curve: [192, 0, 0] as [number, number, number],
};

const BLANK = "__________";

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

/** Shrink a string until it fits its cell rather than letting it spill over the rule. */
const fitText = (d: jsPDF, value: string, maxWidth: number, startSize: number, minSize = 2.8): number => {
  let size = startSize;
  try {
    while (size > minSize && d.getTextWidth(value) > Math.max(maxWidth, 1)) size -= 0.25;
  } catch { /* jsPDF text metrics are unavailable in some environments */ }
  return size;
};

const imageParts = (dataUrl: string): { base64: string; format: "PNG" | "JPEG" } => {
  const match = /^(data:image\/(\w+);base64,)(.+)$/.exec(dataUrl);
  if (!match) return { base64: dataUrl, format: "PNG" };
  const mime = match[2].toLowerCase();
  return { base64: match[3], format: mime === "jpeg" || mime === "jpg" ? "JPEG" : "PNG" };
};

/** Draw one row of ruled cells and return the y below it. Supports "\n" two-line captions. */
const drawCells = (d: jsPDF, x: number, y: number, h: number, cells: Cell[]): number => {
  let cx = x;
  d.setDrawColor(...COLORS.dark);
  d.setLineWidth(0.2);
  for (const cell of cells) {
    const shade = cell.label ? COLORS.labelBg : ([255, 255, 255] as [number, number, number]);
    d.setFillColor(shade[0], shade[1], shade[2]);
    d.rect(cx, y, cell.w, h, "FD");
    const value = (cell.text ?? "").trim();
    if (value) {
      const lines = value.split("\n").map((line) => line.trim()).filter(Boolean);
      const longest = lines.reduce((a, b) => (a.length >= b.length ? a : b), "");
      const size = fitText(d, longest, cell.w - 1.2, cell.size ?? 6.2, cell.minSize ?? 2.8);
      d.setFontSize(size);
      d.setFont("helvetica", cell.bold ? "bold" : "normal");
      d.setTextColor(...COLORS.dark);
      const align = cell.align ?? "left";
      const tx = align === "left" ? cx + 0.8 : align === "right" ? cx + cell.w - 0.8 : cx + cell.w / 2;
      const lineH = size * 0.38;
      const startY = lines.length > 1 ? y + h / 2 - lineH / 2 : y + h / 2;
      lines.forEach((line, index) => {
        d.text(line, tx, startY + index * lineH, { align, baseline: "middle" });
      });
    }
    cx += cell.w;
  }
  return y + h;
};

/** A section caption spanning the full content width. */
const drawCaption = (d: jsPDF, x: number, y: number, w: number, caption: string, rowH = ROW_H): number =>
  drawCells(d, x, y, rowH, [{ w, text: caption, align: "center", bold: true, size: 6 }]);
/** Client / project / sample identification block. */
const drawHeader = (d: jsPDF, x: number, y: number, o: ParticleSizeDistributionPdfOptions, rowH = ROW_H): number => {
  const { record } = o;
  const depth = [record.sampleDepthFrom, record.sampleDepthTo].filter(Boolean).join(" - ");
  let cy = y;
  cy = drawCells(d, x, cy, rowH, [
    { w: 28, text: "Client:", label: true, bold: true },
    { w: 116, text: text(o.clientName) },
    { w: 26, text: "Date submitted:", label: true, bold: true },
    { w: 20, text: text(record.dateSubmitted || o.date) },
  ]);
  cy = drawCells(d, x, cy, rowH, [
    { w: 28, text: "Project/Site Name:", label: true, bold: true },
    { w: 116, text: text(o.projectName) },
    { w: 26, text: "Date tested:", label: true, bold: true },
    { w: 20, text: text(record.dateTested || o.dateTested) },
  ]);
  cy = drawCells(d, x, cy, rowH, [
    { w: 22, text: "Sample ID:", label: true, bold: true },
    { w: 18, text: text(record.label) },
    { w: 20, text: "Sample No.:", label: true, bold: true },
    { w: 18, text: text(record.sampleNumber) },
    { w: 24, text: "Sample depth (M):", label: true, bold: true },
    { w: 22, text: text(depth) },
    { w: 36, text: "Sampled and Submitted by:", label: true, bold: true },
    { w: 30, text: text(record.sampledSubmittedBy) },
  ]);
  return cy;
};

const parse = (value: string) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/** Sample preparation on the left, moisture content at preparation on the right. */
const drawPreparation = (d: jsPDF, x: number, y: number, o: ParticleSizeDistributionPdfOptions, rowH = ROW_H): number => {
  const leftW = 94;
  const rightW = CONTENT_W - leftW;
  const initial = parse(o.record.samplePreparation.initialDryMass);
  const washed = parse(o.record.samplePreparation.washedOvenDryMass);
  const fineMass = initial !== null && washed !== null ? Math.max(initial - washed, 0) : null;
  const finesPercent = initial && fineMass !== null ? (fineMass / initial) * 100 : null;
  const moisture = calculateMoisture(o.record.moisture.wetMass, o.record.moisture.dryMass);

  const pair = (caption: string, label: string, value: string): Cell[] => [
    { w: 34, text: label, bold: true, size: 6 },
    { w: 16, text: caption },
    { w: leftW - 50, text: value, align: "right" },
  ];

  let left = drawCells(d, x, y, rowH, [{ w: leftW, text: "Sample preparation details", align: "center", bold: true, size: 6.5 }]);
  left = drawCells(d, x, left, rowH, pair("(gm)", "Initial quartered and air dried mass", text(initial)));
  left = drawCells(d, x, left, rowH, pair("(gm)", "Washed and oven dried mass", text(washed)));
  left = drawCells(d, x, left, rowH, pair("(gm)", "Fine mass", num(fineMass)));
  drawCells(d, x, left, rowH, pair("(%)", "Fines percent", num(finesPercent)));

  let right = drawCells(d, x + leftW, y, rowH, [{ w: rightW, text: "Moisture content at sample preparations", align: "center", bold: true, size: 6.5 }]);
  const rightPair = (caption: string, label: string, value: string): Cell[] => [
    { w: 40, text: label, bold: true, size: 6 },
    { w: 16, text: caption },
    { w: rightW - 56, text: value, align: "right" },
  ];
  right = drawCells(d, x + leftW, right, rowH, rightPair("(gm)", "Wet weight of sample", text(o.record.moisture.wetMass)));
  right = drawCells(d, x + leftW, right, rowH, rightPair("(gm)", "Dry weight of sample", text(o.record.moisture.dryMass)));
  right = drawCells(d, x + leftW, right, rowH, rightPair("(gm)", "Wet weight of water", num(moisture.waterWeight)));
  drawCells(d, x + leftW, right, rowH, rightPair("(%)", "Moisture content", num(moisture.moistureContent)));

  return y + rowH * 5;
};

const drawClassification = (d: jsPDF, x: number, y: number, o: ParticleSizeDistributionPdfOptions, rowH = ROW_H): number => {
  let cy = drawCaption(d, x, y, CONTENT_W, "Soil Classification", rowH);
  const uscs = [o.uscsSymbol, o.uscsDescription].filter(Boolean).join(" - ");
  cy = drawCells(d, x, cy, rowH, [
    { w: 20, text: "GRAVEL (%):", label: true, bold: true },
    { w: 12, text: num(o.gravelPercentage), align: "right" },
    { w: 18, text: "SAND (%):", label: true, bold: true },
    { w: 12, text: num(o.sandPercentage), align: "right" },
    { w: 24, text: "CLAY/SILT (%):", label: true, bold: true },
    { w: 12, text: num(o.finesPercentage), align: "right" },
    { w: 18, text: "USCS", label: true, bold: true },
    { w: 36, text: uscs, align: "center" },
    { w: 18, text: "AASHTO", label: true, bold: true },
    { w: 20, text: o.groupIndex === null ? text(o.aashtoGroup) : `${text(o.aashtoGroup)} (GI ${o.groupIndex})`, align: "center" },
  ]);
  return cy;
};

const SIEVE_COLUMNS: Cell[] = [
  { w: 20, text: "Sieve size\n(mm)", label: true, bold: true, size: 5.6 },
  { w: 14, text: "Retained\nmass (gm)", label: true, bold: true, size: 5.6 },
  { w: 14, text: "% Retained\n(%)", label: true, bold: true, size: 5.6 },
  { w: 14, text: "Cumulative\npassing (%)", label: true, bold: true, size: 5.4, minSize: 2.8 },
];

const drawSieveTable = (d: jsPDF, x: number, y: number, w: number, o: ParticleSizeDistributionPdfOptions, rowH = ROW_H, headerH = HEADER_H): number => {
  const columns = SIEVE_COLUMNS.map((column) => ({ ...column, w: column.w * (w / 62) }));
  let cy = drawCaption(d, x, y, w, "Wet & Dry Sieve Analysis to BS 1377-2:1990: 9.2/9.3/9.4", rowH);
  cy = drawCells(d, x, cy, headerH, columns);
  o.record.sieveRows.forEach((row, index) => {
    const passing = o.grading.cumulativePassing[index];
    cy = drawCells(d, x, cy, rowH, [
      { w: columns[0].w, text: row.sieveSize, align: "center", bold: true },
      { w: columns[1].w, text: row.weightRetained, align: "center" },
      { w: columns[2].w, text: num(o.grading.percentageRetained[index]), align: "center" },
      { w: columns[3].w, text: passing === null ? BLANK : num(passing), align: "center" },
    ]);
  });
  return drawCells(d, x, cy, rowH, [
    { w: columns[0].w, text: "TOTAL", align: "center", bold: true },
    { w: columns[1].w, text: num(o.grading.totalWeight), align: "center", bold: true },
    { w: columns[2].w, text: o.grading.totalWeight > 0 ? "100.0" : BLANK, align: "center", bold: true },
    { w: columns[3].w, text: "", align: "center" },
  ]);
};
const HYDROMETER_COLUMNS = [
  "Time\n(min)",
  "Actual HR\n(Rn′)",
  "Adjusted\n(Rh)",
  "Composite\ncorr.",
  "Corrected\nHR",
  "Eff. depth\n(cm)",
  "Diameter\n(mm)",
  "% Fines\n(susp.)",
  "% Fines\n(sample)",
];

const drawHydrometerTable = (d: jsPDF, x: number, y: number, w: number, o: ParticleSizeDistributionPdfOptions, rowH = ROW_H, headerH = HEADER_H): number => {
  const inputs = o.hydrometerInputs;
  let cy = drawCaption(d, x, y, w, "Hydrometer Analysis to BS 1377-2:1990:9.5", rowH);
  const half = w / 2;
  const paramRow = (leftLabel: string, leftValue: string, rightLabel: string, rightValue: string): Cell[] => [
    { w: 28, text: leftLabel, label: true, bold: true, size: 5.2, minSize: 2.8 },
    { w: half - 28, text: leftValue, align: "right" },
    { w: 28, text: rightLabel, label: true, bold: true, size: 5.2, minSize: 2.8 },
    { w: half - 28, text: rightValue, align: "right" },
  ];
  cy = drawCells(d, x, cy, rowH, paramRow("Dry weight (gm)", text(inputs.dryWeight), "S.G (Mg/m³)", num(o.hydrometer.specificGravity, 2)));
  cy = drawCells(d, x, cy, rowH, paramRow("Hydro. type", text(inputs.hydrometerType), "Susp. vol. (cm³)", num(o.hydrometer.suspensionVolume, 0)));
  cy = drawCells(d, x, cy, rowH, paramRow("Zero corr. (g/L)", text(inputs.zeroCorrection), "Meniscus (g/L)", text(inputs.meniscusCorrection)));
  cy = drawCells(d, x, cy, rowH, paramRow("Temp. (°C)", text(inputs.temperature), "K factor", num(o.hydrometer.stokesConstant, 3)));

  const columnWidth = w / HYDROMETER_COLUMNS.length;
  cy = drawCells(d, x, cy, headerH, HYDROMETER_COLUMNS.map((caption) => ({
    w: columnWidth,
    text: caption,
    label: true,
    bold: true,
    size: 4.6,
    minSize: 2.8,
    align: "center" as const,
  })));

  o.hydrometer.results.forEach((result) => {
    cy = drawCells(d, x, cy, rowH, [
      num(result.time, 2, BLANK),
      text(o.record.hydrometerRows.find((row) => row.time === String(result.time))?.actualHydrometer),
      num(result.adjustedReading),
      num(result.compositeCorrection, 2),
      num(result.correctedReading),
      num(result.effectiveDepth, 2),
      num(result.particleDiameter, 4),
      num(result.finesInSuspension),
      num(result.finesByHydrometer),
    ].map((value) => ({ w: columnWidth, text: value, align: "center" as const })));
  });
  return cy;
};

/** Percentage axis values: 0 to 100 in steps of 10. */
const PASSING_VALUES = Array.from({ length: 11 }, (_, step) => step * 10);

/**
 * The chart block is authored in the same 384.28-unit space as the on-screen
 * SVG. That space came off an A4 page in points, so one unit is 0.352778 mm and
 * everything, line weights and type sizes included, scales together.
 */
const REF_UNIT_MM = 0.352778;
const REF_BLOCK_UNITS = 384.28;
const REF_BLOCK_H_UNITS = 222;
/** Plot rectangle inside the chart block, in the same units as the on-screen SVG. */
const PLOT_UNITS = { x: 37.72, y: 27.81, w: 334.28, h: 160.86 };

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
  const refH = forcedHeight ?? (REF_BLOCK_H_UNITS * w) / REF_BLOCK_UNITS;
  const scale = w / REF_BLOCK_UNITS;
  const type = scale / REF_UNIT_MM;
  // If forcedHeight differs from natural, apply a vertical scale factor to the units.
  const vScale = forcedHeight ? refH / (REF_BLOCK_H_UNITS * scale) : 1;
  const px = (units: number) => x + units * scale;
  const py = (units: number) => y + units * scale * vScale;
  const plot = {
    x: px(PLOT_UNITS.x),
    y: py(PLOT_UNITS.y),
    w: PLOT_UNITS.w * scale,
    h: PLOT_UNITS.h * scale * vScale,
  };
  const plotBottom = plot.y + plot.h;
  /** Places text at a position given in chart-block units. */
  const label = (
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
    d.text(value, px(atX), py(atY), { align, baseline: "middle", angle });
  };

  d.setFillColor(255, 255, 255);
  d.setDrawColor(...COLORS.dark);
  d.setLineWidth(0.2 * type);
  d.rect(x, py(14), w, 200 * scale * vScale, "FD");

  d.setFillColor(...COLORS.plotBg);
  d.rect(plot.x, plot.y, plot.w, plot.h, "F");

  d.setLineWidth(0.14 * type);
  [...PSD_MINOR_TICKS, ...PSD_DECADE_LINES].forEach((size) => {
    const gx = px(PLOT_UNITS.x + psdX(size, PLOT_UNITS.w));
    d.line(gx, plot.y, gx, plotBottom);
  });
  PASSING_VALUES.forEach((value) => {
    const gy = py(PLOT_UNITS.y + psdY(value, PLOT_UNITS.h));
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

  PASSING_VALUES.forEach((value) => label(value.toFixed(1), PLOT_UNITS.x - 2, PLOT_UNITS.y + psdY(value, PLOT_UNITS.h), "right", 6));
  label("Passing (%)", 20, PLOT_UNITS.y + PLOT_UNITS.h / 2, "center", 7.5, true, 90);
  PSD_DECADE_TICKS.forEach((size) => label(size.toFixed(3), PLOT_UNITS.x + psdX(size, PLOT_UNITS.w), 192.4, "center", 6));
  PSD_SUB_LABELS.forEach((band) => label(band.label, PLOT_UNITS.x + psdX(band.from, PLOT_UNITS.w), 198.6, "center", 5.2));
  // Each fraction caption is centred on the geometric mean of its own band. The
  // source sheet anchors them to the band boundary, which collides with the
  // left-hand "FRACTION" caption because the silt band starts almost on the axis.
  PSD_FRACTIONS.forEach((band) => {
    const at = PLOT_UNITS.x + psdX(Math.sqrt(band.from * band.to), PLOT_UNITS.w);
    label(band.label, at, band.label === "CLAY" ? 205.6 : 210.8, "center", 5.2);
  });
  label("FRACTION", PLOT_UNITS.x, 210.8, "left", 5.2);

  d.setDrawColor(...COLORS.dark);
  d.setLineWidth(0.37 * type);
  d.line(plot.x, py(213.6), plot.x + plot.w, py(213.6));
  label("Particle size (mm)", PLOT_UNITS.x + PLOT_UNITS.w / 2, 219.6, "center", 7, true);
  label("PARTICLE SIZE DISTRIBUTION GRAPH", PLOT_UNITS.x + PLOT_UNITS.w / 2, 9, "center", 7.5, true);

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
  cy += 4;
  const title = "PARTICLE SIZE DISTRIBUTION (BS 1377-2:1990: 9.2/9.3/9.4 & 9.5)";
  const titleSize = fitText(d, title, w, 10.5, 7);
  d.setFontSize(titleSize);
  d.setFont("helvetica", "bold");
  d.setTextColor(...COLORS.dark);
  d.text(title, x + w / 2, cy, { align: "center" });
  const titleW = d.getTextWidth(title);
  d.setLineWidth(0.4);
  d.line(x + w / 2 - titleW / 2, cy + 1.2, x + w / 2 + titleW / 2, cy + 1.2);
  return cy + 5;
};

const drawFooter = (d: jsPDF, o: ParticleSizeDistributionPdfOptions, images: AdminImages, y: number): void => {
  d.setDrawColor(...COLORS.dark);
  d.setLineWidth(0.5);
  d.line(MARGIN, y - 4, MARGIN + CONTENT_W, y - 4);
  const usable = images.stamp ? CONTENT_W - 30 : CONTENT_W;
  const column = usable / 3;
  d.setFontSize(8);
  d.setFont("helvetica", "bold");
  d.setTextColor(...COLORS.dark);
  d.text(`Tested by ${text(o.testedBy || o.record.testedBy)}`, MARGIN, y);
  d.text(`Date reported ${text(o.dateReported)}`, MARGIN + column, y);
  d.text(`Checked by: ${text(o.checkedBy)}`, MARGIN + column * 2, y);

  if (images.stamp) {
    try {
      // Top edge sits on the content boundary so the stamp never climbs into the graph.
      const s = 22;
      const { base64, format } = imageParts(images.stamp);
      d.addImage(base64, format, MARGIN + CONTENT_W - s - 4, y - 6, s, s, undefined, "FAST");
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

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageHeight = doc.internal.pageSize.getHeight();
  const pageWidth = doc.internal.pageSize.getWidth();
  const x = MARGIN;
  const topY = 10;
  // Reserve the footer band first so content can never run into it.
  const footerY = pageHeight - 20;
  const contentBottom = footerY - 6;

  const sieveWidth = 62;
  const hydrometerWidth = CONTENT_W - sieveWidth - 2;
  const sieveRows = 2 + options.record.sieveRows.length + 1; // caption + header + rows + total
  const hydroRows = 1 + 4 + 1 + options.hydrometer.results.length; // caption + 4 params + header + readings
  const tableRows = Math.max(sieveRows, hydroRows);
  const graphNaturalH = Math.min((CONTENT_W * REF_BLOCK_H_UNITS) / REF_BLOCK_UNITS, MAX_GRAPH_H);

  // Fixed overhead above the side-by-side tables: title block (~33) + 3 header
  // rows + preparation/classification blocks + gaps. Measured at ROW_H so the
  // row-height scale below stays proportional.
  const fixedH = 33 + 3 * ROW_H + 2 + 5 * ROW_H + 2 + 2 * ROW_H + 3;
  let rowH = ROW_H;
  let graphH = graphNaturalH;
  // Single-pass fit: shrink rows first, then the graph (never below MIN_GRAPH_H,
  // the chart is mandatory). One page only — no addPage in this generator.
  const need = fixedH + tableRows * rowH + 3 + graphH;
  const have = contentBottom - topY;
  if (need > have) {
    // Rows absorb overflow first; the graph keeps its natural height when possible.
    const rowHForNaturalGraph = (have - fixedH - 3 - graphNaturalH) / tableRows;
    if (rowHForNaturalGraph >= MIN_ROW_H) {
      rowH = rowHForNaturalGraph;
    } else {
      // Dense data (e.g. full KIRIAINI stack): rows at floor, graph takes the rest.
      rowH = MIN_ROW_H;
      graphH = Math.max(MIN_GRAPH_H, have - fixedH - 3 - tableRows * MIN_ROW_H);
    }
  }

  const headerH = Math.max(4.5, Math.min(6, rowH * 1.45));
  let y = drawTitleBlock(doc, x, topY, CONTENT_W, options, images);
  y = drawHeader(doc, x, y, options, rowH) + 1.5;
  y = drawPreparation(doc, x, y, options, rowH) + 1.5;
  y = drawClassification(doc, x, y, options, rowH) + 2;

  const sieveBottom = drawSieveTable(doc, x, y, sieveWidth, options, rowH, headerH);
  const hydrometerBottom = drawHydrometerTable(doc, x + sieveWidth + 2, y, hydrometerWidth, options, rowH, headerH);
  const graphTop = Math.max(sieveBottom, hydrometerBottom) + 2;
  const graphBudget = Math.max(contentBottom - graphTop, MIN_GRAPH_H);
  const fittedGraphH = Math.min(graphH, graphBudget);
  drawPsdGraph(doc, x, graphTop, CONTENT_W, options, fittedGraphH);

  // Footer last, on the reserved band — content above can never overlap it.
  drawFooter(doc, options, images, footerY);
  doc.setFontSize(7);
  doc.setTextColor(120, 120, 120);
  doc.setFont("helvetica", "normal");
  doc.text("Page 1 of 1", pageWidth / 2, pageHeight - 6, { align: "center" });
  doc.text(`Generated: ${new Date().toLocaleDateString()}`, MARGIN, pageHeight - 6);

  if (!options.skipDownload) {
    const stem = (options.projectName || "Particle Size Distribution").replace(/[^\w-]+/g, "_");
    doc.save(`${stem}_PSD.pdf`);
  }
  return doc;
};