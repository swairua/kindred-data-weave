import { jsPDF } from "jspdf";
import { fetchAdminImagesAsBase64, type AdminImages } from "./imageUtils";
import {
  formatDensityTick,
  formatMoistureTick,
  mcCurveSamples,
  mcMeasuredPath,
  mcScales,
  mcVoidSamples,
  toMcPlotPoints,
  voidLineCaption,
  type McPoint,
  type McVoidLine,
} from "./mcChartGeometry";
import { calculateProctorPoint, type ProctorRow, type ProctorSummary } from "./proctorRecords";

/**
 * Density/moisture content relationship report laid out like the sheet issued
 * by the testing laboratory (pages 47-48 of the reference report).
 *
 * The graph prefers the html2canvas capture of the on-screen chart so the
 * printed curve is identical to the screen, and falls back to a natively drawn
 * vector graph built from the same `mcChartGeometry` helpers when that capture
 * is unavailable.
 */

const MARGIN = 12;
const CONTENT_W = 186;
const ROW_H = 5.2;
const HEADER_H = 7;

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

export interface McRecordView {
  label: string;
  sampleNumber: string;
  sampleDepthFrom: string;
  sampleDepthTo: string;
  sampledSubmittedBy: string;
  dateSubmitted: string;
  dateTested: string;
  mouldVolume: string;
  specificGravity: string;
  rows: ProctorRow[];
}

export interface MoistureDensityPdfOptions {
  projectName?: string;
  clientName?: string;
  date?: string;
  dateTested?: string;
  dateReported?: string;
  testedBy?: string;
  checkedBy?: string;
  labOrganization?: string;
  /** "standard" or "modified": which of the two compaction methods this sheet reports. */
  method: "standard" | "modified";
  record: McRecordView;
  summary: ProctorSummary;
  /** Measured moisture content / dry density pairs. */
  points: McPoint[];
  /** Points of the fitted compaction curve. */
  fitted: McPoint[];
  /** Dashed constant-air-voids lines. */
  voidLines: McVoidLine[];
  /** html2canvas capture of the on-screen chart, when one was produced. */
  chartImage: string | null;
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
const fitText = (d: jsPDF, value: string, maxWidth: number, startSize: number, minSize = 4): number => {
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

/** Draw one row of ruled cells and return the y below it. */
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
      d.setFontSize(fitText(d, value, cell.w - 1.2, cell.size ?? 6.2, cell.minSize));
      d.setFont("helvetica", cell.bold ? "bold" : "normal");
      d.setTextColor(...COLORS.dark);
      const align = cell.align ?? "left";
      const tx = align === "left" ? cx + 0.8 : align === "right" ? cx + cell.w - 0.8 : cx + cell.w / 2;
      d.text(value, tx, y + h / 2, { align, baseline: "middle" });
    }
    cx += cell.w;
  }
  return y + h;
};

/** Client / project / sample identification block, as printed above the tables. */
const drawHeader = (d: jsPDF, x: number, y: number, o: MoistureDensityPdfOptions): number => {
  const { record } = o;
  const depth = [record.sampleDepthFrom, record.sampleDepthTo].filter(Boolean).join(" - ");
  let cy = y;
  cy = drawCells(d, x, cy, ROW_H, [
    { w: 28, text: "Client name:", label: true, bold: true },
    { w: 112, text: text(o.clientName) },
    { w: 26, text: "Date submitted:", label: true, bold: true },
    { w: 20, text: text(record.dateSubmitted || o.date) },
  ]);
  cy = drawCells(d, x, cy, ROW_H, [
    { w: 28, text: "Project/Site Name:", label: true, bold: true },
    { w: 112, text: text(o.projectName) },
    { w: 26, text: "Date tested:", label: true, bold: true },
    { w: 20, text: text(record.dateTested || o.dateTested) },
  ]);
  cy = drawCells(d, x, cy, ROW_H, [
    { w: 22, text: "Sample ID:", label: true, bold: true },
    { w: 20, text: text(record.label) },
    { w: 24, text: "Sample depth (M):", label: true, bold: true },
    { w: 24, text: text(depth) },
    { w: 36, text: "Sampled and Submitted by:", label: true, bold: true },
    { w: 60, text: text(record.sampledSubmittedBy) },
  ]);
  return cy;
};
const POINT_LABELS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];

/**
 * Column widths shared by the bulk density and moisture content tables. The
 * caption column is fixed and the point columns share what is left, so a record
 * with fewer or more points still fills the content width.
 */
const tableColumns = (rowCount: number): { caption: number; point: number } => {
  const caption = 46;
  const point = Math.max((CONTENT_W - caption) / Math.max(rowCount, 1), 8);
  return { caption, point };
};

/** A table row: bold caption cell followed by one centred cell per point. */
const dataRow = (d: jsPDF, x: number, y: number, cells: { caption: number; point: number }, captionText: string, values: string[]): number =>
  drawCells(d, x, y, ROW_H, [
    { w: cells.caption, text: captionText, bold: true, size: 5.8 },
    ...values.map((value) => ({ w: cells.point, text: value, align: "center" as const })),
  ]);

/**
 * Upper table: the mould weighings and the bulk density they give, in the row
 * order of the printed sheet.
 */
const drawBulkTable = (d: jsPDF, x: number, y: number, o: MoistureDensityPdfOptions): number => {
  const rows = o.record.rows;
  const columns = tableColumns(rows.length);
  const perRow = <T,>(getValue: (index: number) => T): T[] => rows.map((_, index) => getValue(index));
  const bulk = perRow((index) => calculateProctorPoint(rows[index], o.record.mouldVolume).bulkDensity);
  const wet = perRow((index) => calculateProctorPoint(rows[index], o.record.mouldVolume).wetMaterialMass);

  let cy = drawCells(d, x, y, HEADER_H, [
    { w: columns.caption, text: "Moisture addition", label: true, bold: true },
    ...perRow((index) => POINT_LABELS[index] || String(index + 1)).map((caption) => ({
      w: columns.point, text: caption, label: true, bold: true, align: "center" as const,
    })),
  ]);
  cy = dataRow(d, x, cy, columns, "Moisture addition (cc)", perRow((index) => text(rows[index]?.moistureAdded)));
  cy = dataRow(d, x, cy, columns, "Wt of mould + wet material (g)", perRow((index) => text(rows[index]?.mouldWetMass)));
  cy = dataRow(d, x, cy, columns, "Wt of mould + Base (g)", perRow((index) => text(rows[index]?.mouldTare)));
  cy = dataRow(d, x, cy, columns, "Wt wet material (g)", wet.map((value) => num(value, 0)));
  cy = dataRow(d, x, cy, columns, "Volume of mould (cm³)", rows.map(() => num(Number.parseFloat(o.record.mouldVolume), 0)));
  return dataRow(d, x, cy, columns, "Bulk density (kg/m³)", bulk.map((value) => num(value, 0)));
};

/**
 * Lower table: the moisture content determination and the dry density derived
 * from it, again in the printed row order.
 */
const drawMoistureTable = (d: jsPDF, x: number, y: number, o: MoistureDensityPdfOptions): number => {
  const rows = o.record.rows;
  const columns = tableColumns(rows.length);
  const perRow = <T,>(getValue: (index: number) => T): T[] => rows.map((_, index) => getValue(index));
  const calculated = perRow((index) => calculateProctorPoint(rows[index], o.record.mouldVolume));

  let cy = drawCells(d, x, y, HEADER_H, [
    { w: columns.caption, text: "Container No", label: true, bold: true },
    ...perRow((index) => POINT_LABELS[index] || String(index + 1)).map((caption) => ({
      w: columns.point, text: caption, label: true, bold: true, align: "center" as const,
    })),
  ]);
  cy = dataRow(d, x, cy, columns, "Wt of container + wet material (g)", perRow((index) => text(rows[index]?.containerWetMass)));
  cy = dataRow(d, x, cy, columns, "Wt dry material (g)", perRow((index) => text(rows[index]?.containerDryMass)));
  cy = dataRow(d, x, cy, columns, "Wt of moisture (g)", calculated.map((point) => num(point.waterMass, 2)));
  cy = dataRow(d, x, cy, columns, "Wt of container (g)", perRow((index) => text(rows[index]?.containerTare)));
  cy = dataRow(d, x, cy, columns, "Moisture content (%)", calculated.map((point) => num(point.moistureContent, 1)));
  return dataRow(d, x, cy, columns, "Dry density (kg/m³)", calculated.map((point) => num(point.dryDensity, 0)));
};

/**
 * Height the results block will occupy, so the page-break decision can account for
 * it as well as the graph.
 */
const resultsBlockHeight = (o: MoistureDensityPdfOptions): number => {
  const rows = 2 + (o.summary.rSquared !== null ? 1 : 0) + o.summary.warnings.length;
  return rows * ROW_H;
};

/** Maximum dry density, bulk density and optimum moisture content, as printed below the graph. */
const drawResults = (d: jsPDF, x: number, y: number, o: MoistureDensityPdfOptions): number => {
  const { summary } = o;
  let cy = drawCells(d, x, y, ROW_H, [
    { w: 40, text: "Maximum Dry Density (kg/m³):", label: true, bold: true, size: 5.8 },
    { w: 26, text: num(summary.mdd, 0), align: "center", bold: true },
    { w: 60, text: "Optimum Moisture Content (%):", label: true, bold: true, size: 5.8, align: "right" },
    { w: 60, text: num(summary.omc, 1), align: "center", bold: true },
  ]);
  cy = drawCells(d, x, cy, ROW_H, [
    { w: 40, text: "Bulk Density (kg/m³):", label: true, bold: true, size: 5.8 },
    { w: 26, text: num(summary.bulkDensity, 0), align: "center", bold: true },
    { w: 60, text: "Determined from:", label: true, bold: true, size: 5.8, align: "right" },
    {
      w: 60,
      text: summary.optimumSource === "curve"
        ? "Fitted compaction curve"
        : summary.optimumSource === "peak-point" ? "Highest measured point" : BLANK,
      align: "center",
    },
  ]);

  const extra: Cell[] = [];
  if (summary.rSquared !== null) {
    extra.push({ w: 40, text: "Curve R²:", label: true, bold: true, size: 5.8 });
    extra.push({ w: 26, text: summary.rSquared.toFixed(4), align: "center" });
    extra.push({ w: 60, text: "Particle density (Gs):", label: true, bold: true, size: 5.8, align: "right" });
    extra.push({ w: 60, text: num(Number.parseFloat(o.record.specificGravity), 2), align: "center" });
  }
  summary.warnings.forEach((warning) => {
    extra.push({ w: 46, text: "Warning:", label: true, bold: true, size: 5.8 });
    extra.push({ w: 140, text: warning, size: 5.6 });
  });
  return extra.length === 0 ? cy : drawCells(d, x, cy, ROW_H, extra);
};
/**
 * The graph block is authored in the same 384.28-unit space as the on-screen
 * SVG. That space came off an A4 page in points, so one unit is 0.352778 mm and
 * geometry, line weights and type sizes all scale together.
 */
const REF_UNIT_MM = 0.352778;
const REF_BLOCK_UNITS = 384.28;
const REF_BLOCK_H_UNITS = 214;
/** Plot rectangle inside the chart block, in the same units as the on-screen SVG. */
const PLOT_UNITS = { x: 44, y: 20, w: 316, h: 150 };

/** jsPDF has no dashed-line mode, so a dashed rule is drawn as alternating segments. */
const dashedLine = (d: jsPDF, fromX: number, fromY: number, toX: number, toY: number, dash: number, gap: number): void => {
  const length = Math.hypot(toX - fromX, toY - fromY);
  if (length === 0) return;
  const ux = (toX - fromX) / length;
  const uy = (toY - fromY) / length;
  for (let offset = 0; offset < length; offset += dash + gap) {
    const end = Math.min(offset + dash, length);
    d.line(fromX + ux * offset, fromY + uy * offset, fromX + ux * end, fromY + uy * end);
  }
};

/**
 * Native vector graph, used whenever the html2canvas capture of the on-screen
 * chart is missing. It reads the same `mcChartGeometry` helpers the SVG uses, so
 * the printed graph matches the screen even when only vectors reach the PDF.
 */
const drawMcGraphVector = (d: jsPDF, x: number, y: number, w: number, o: MoistureDensityPdfOptions): number => {
  const scale = w / REF_BLOCK_UNITS;
  const type = scale / REF_UNIT_MM;
  const px = (units: number) => x + units * scale;
  const py = (units: number) => y + units * scale;
  const plot = { x: px(PLOT_UNITS.x), y: py(PLOT_UNITS.y), w: PLOT_UNITS.w * scale, h: PLOT_UNITS.h * scale };
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

  const scales = mcScales(o.points, [o.fitted, ...o.voidLines.map((line) => line.points)]);
  const blockX = (value: number) => PLOT_UNITS.x + ((value - scales.x.min) / (scales.x.max - scales.x.min)) * PLOT_UNITS.w;
  const blockY = (value: number) => PLOT_UNITS.y + PLOT_UNITS.h - ((value - scales.y.min) / (scales.y.max - scales.y.min)) * PLOT_UNITS.h;

  d.setFillColor(255, 255, 255);
  d.setDrawColor(...COLORS.curve);
  d.setLineWidth(1.6 * type);
  d.rect(x, py(8), w, 198 * scale, "FD");

  d.setFillColor(...COLORS.plotBg);
  d.rect(plot.x, plot.y, plot.w, plot.h, "F");

  d.setDrawColor(...COLORS.dark);
  d.setLineWidth(0.14 * type);
  scales.y.ticks.forEach((value) => {
    const gy = py(blockY(value));
    d.line(plot.x, gy, plot.x + plot.w, gy);
  });
  scales.x.ticks.forEach((value) => {
    const gx = px(blockX(value));
    d.line(gx, plot.y, gx, plotBottom);
  });

  d.setLineWidth(1.24 * type);
  d.line(plot.x, plot.y, plot.x, plotBottom);
  d.line(plot.x, plotBottom, plot.x + plot.w, plotBottom);

  // Air voids lines first, so the compaction curve and its points sit on top.
  o.voidLines.forEach((line) => {
    const samples = mcVoidSamples(line.points, PLOT_UNITS.w, PLOT_UNITS.h, scales.x, scales.y);
    if (samples.length < 2) return;
    d.setDrawColor(...COLORS.dark);
    d.setLineWidth(0.6 * type);
    for (let index = 1; index < samples.length; index += 1) {
      dashedLine(
        d,
        plot.x + samples[index - 1].x, plot.y + samples[index - 1].y,
        plot.x + samples[index].x, plot.y + samples[index].y,
        2.4 * scale, 1.6 * scale,
      );
    }
    const captionAt = samples[Math.round((samples.length - 1) * 0.12)];
    label(voidLineCaption(line.percent), PLOT_UNITS.x + captionAt.x, PLOT_UNITS.y + captionAt.y + 7, "center", 5.4, true);
  });
const measured = toMcPlotPoints(o.points, PLOT_UNITS.w, PLOT_UNITS.h, scales.x, scales.y);
  const curve = mcCurveSamples(toMcPlotPoints(o.fitted, PLOT_UNITS.w, PLOT_UNITS.h, scales.x, scales.y));

  d.setDrawColor(...COLORS.curve);
  d.setLineWidth(0.9 * type);
  for (let index = 1; index < measured.length; index += 1) {
    d.line(
      plot.x + measured[index - 1].x, plot.y + measured[index - 1].y,
      plot.x + measured[index].x, plot.y + measured[index].y,
    );
  }
  d.setFillColor(...COLORS.curve);
  measured.forEach((point) => {
    d.rect(plot.x + point.x - 1.1 * scale, plot.y + point.y - 1.1 * scale, 2.2 * scale, 2.2 * scale, "F");
  });

  if (curve.length > 1) {
    d.setDrawColor(...COLORS.curve);
    d.setLineWidth(0.74 * type);
    for (let index = 1; index < curve.length; index += 1) {
      d.line(
        plot.x + curve[index - 1].x, plot.y + curve[index - 1].y,
        plot.x + curve[index].x, plot.y + curve[index].y,
      );
    }
  }

  // Reset the draw colour: jsPDF keeps the last one for whatever is drawn next,
  // which would otherwise leave the rules under the results block red.
  d.setDrawColor(...COLORS.dark);
  scales.y.ticks.forEach((value) => label(formatDensityTick(value), PLOT_UNITS.x - 3, blockY(value), "right", 5.4));
  label("Dry Density (kg/m³)", PLOT_UNITS.x - 30, PLOT_UNITS.y + PLOT_UNITS.h / 2, "center", 7, true, 90);
  scales.x.ticks.forEach((value) => label(formatMoistureTick(value), blockX(value), 180, "center", 5.4));
  label("Moisture Content (%)", PLOT_UNITS.x + PLOT_UNITS.w / 2, 190, "center", 7, true);
  label("DRY DENSITY / MOISTURE CONTENT RELATIONSHIP", REF_BLOCK_UNITS / 2, 7, "center", 7.5, true);

  return y + REF_BLOCK_H_UNITS * scale;
};

const drawMcGraph = (d: jsPDF, x: number, y: number, w: number, o: MoistureDensityPdfOptions): number => {
  const h = (REF_BLOCK_H_UNITS * w) / REF_BLOCK_UNITS;
  if (o.chartImage) {
    try {
      const { base64, format } = imageParts(o.chartImage);
      d.addImage(base64, format, x, y, w, h, undefined, "FAST");
      return y + h;
    } catch (error) {
      console.warn("[Density/Moisture PDF] Chart capture could not be embedded, drawing the vector graph instead:", error);
    }
  }
  return drawMcGraphVector(d, x, y, w, o);
};

const drawTitleBlock = (
  d: jsPDF,
  x: number,
  y: number,
  w: number,
  o: MoistureDensityPdfOptions,
  images: AdminImages,
): number => {
  let cy = y;
  if (images.logo) {
    try {
      const { base64, format } = imageParts(images.logo);
      d.addImage(base64, format, x, cy - 2, 22, 12, undefined, "FAST");
    } catch { /* the logo is optional */ }
  }
  if (o.labOrganization) {
    d.setFontSize(8);
    d.setFont("helvetica", "bold");
    d.setTextColor(...COLORS.dark);
    d.text(o.labOrganization, x + w, cy, { align: "right" });
  }

  cy += 14;
  d.setFontSize(12);
  d.setFont("helvetica", "bold");
  d.setTextColor(...COLORS.dark);
  d.text("DENSITY/MOISTURE CONTENT RELATIONSHIP", x + w / 2, cy, { align: "center" });
  cy += 5;
  d.setFontSize(9);
  d.setFont("helvetica", "normal");
  d.text(`BS 1377 PART- 4, ${o.method === "standard" ? "3.3" : "3.5"} : 1990`, x + w / 2, cy, { align: "center" });
  cy += 1.5;
  d.setDrawColor(...COLORS.dark);
  d.setLineWidth(0.3);
  d.line(x, cy, x + w, cy);
  return cy + 2;
};

const drawFooter = (d: jsPDF, o: MoistureDensityPdfOptions, images: AdminImages, y: number): void => {
  d.setDrawColor(...COLORS.dark);
  d.setLineWidth(0.4);
  d.line(MARGIN, y, MARGIN + CONTENT_W, y);
  const signatureY = y + 5;
  const usable = images.stamp ? CONTENT_W - 22 : CONTENT_W;
  const column = usable / 3;
  d.setFontSize(7.5);
  d.setFont("helvetica", "bold");
  d.setTextColor(...COLORS.dark);
  d.text(`Tested by: ${text(o.testedBy || o.record.sampledSubmittedBy)}`, MARGIN, signatureY);
  d.text(`Date reported: ${text(o.dateReported)}`, MARGIN + column, signatureY);
  d.text(`Checked by: ${text(o.checkedBy)}`, MARGIN + column * 2, signatureY);

  if (images.stamp) {
    try {
      const { base64, format } = imageParts(images.stamp);
      d.addImage(base64, format, MARGIN + CONTENT_W - 20, y + 1, 20, 20, undefined, "FAST");
    } catch { /* the stamp is optional */ }
  }
};

export const generateMoistureDensityPDF = async (options: MoistureDensityPdfOptions) => {
  // Images are optional: a missing logo or stamp must never stop a report being produced.
  let images: AdminImages = {};
  try {
    images = await fetchAdminImagesAsBase64();
  } catch (error) {
    console.warn("[Density/Moisture PDF] Could not load header/footer images, exporting without them:", error);
  }

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageHeight = doc.internal.pageSize.getHeight();
  const x = MARGIN;

  let y = drawTitleBlock(doc, x, 14, CONTENT_W, options, images);
  y = drawHeader(doc, x, y, options) + 2;
  y = drawBulkTable(doc, x, y, options) + 2;
  y = drawMoistureTable(doc, x, y, options) + 3;

  const footerY = pageHeight - 14;
  drawFooter(doc, options, images, footerY);

  // The graph and the results block have to fit together beneath the tables. When
  // they do not, the results stay with the tables they describe and the graph moves
  // to its own page, rather than either block being printed over the other.
  const graphHeight = (CONTENT_W * REF_BLOCK_H_UNITS) / REF_BLOCK_UNITS;
  const resultsHeight = resultsBlockHeight(options);
  const fitsUnderneath = y + graphHeight + resultsHeight <= footerY - 4;

  if (fitsUnderneath) {
    drawMcGraph(doc, x, y, CONTENT_W, options);
    drawResults(doc, x, y + graphHeight + 3, options);
  } else {
    drawResults(doc, x, y, options);
    doc.addPage();
    drawMcGraph(doc, x, 14, CONTENT_W, options);
    drawFooter(doc, options, images, footerY);
  }

  if (!options.skipDownload) {
    const stem = (options.projectName || "Density Moisture Content").replace(/[^\w-]+/g, "_");
    doc.save(`${stem}_Compaction.pdf`);
  }
  return doc;
};