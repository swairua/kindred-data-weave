/**
 * Concrete cube compressive strength sheet, laid out like the landscape A4
 * "COMPRESSIVE STRENGTH OF CONCRETE CUBES" report issued by the testing lab
 * (BS EN 12390 - 3 : 2002).
 *
 * Every value on the sheet is derived from `compressiveCalculations` — the
 * generator deliberately owns no arithmetic of its own, so the PDF can never
 * disagree with the numbers shown on screen.
 *
 * The reference sheet happens to carry two cubes. The row band is therefore
 * sized from the cube count rather than hard-coded: rows shrink toward a
 * readable floor and, past that, the sheet paginates and repeats its header.
 */

import { jsPDF } from "jspdf";
import {
  ageOf,
  cubeStrengthFromClass,
  densityOf,
  parseNumber,
  strengthOf,
  type CompressiveCubeInput,
} from "./compressiveCalculations";
import { fetchAdminImagesAsBase64, type AdminImages } from "./imageUtils";

/** Page margins. A4 landscape is 297 x 210 mm. */
const MARGIN = 10;
/** Width available to the page furniture (the table is inset, like the reference). */
const CONTENT_W = 277;
/** The reference table spans 71.8pt..816.5pt of an 841.92pt-wide page. */
const TABLE_X = 25.3;
const TABLE_W = 262.7;

/** Row height the reference uses for a cube row (~12pt). */
const REF_ROW_H = 4.23;
/** Below this a cube row is unreadable, so we paginate instead of squashing. */
const MIN_ROW_H = 3.1;
/** Height of the five identification rows above the table. */
const ID_ROW_H = 6;
/** Height of the two-line table heading. */
const HEADER_H = 11;
/** Room reserved at the foot of the page for the terms and the signature line. */
const FOOTER_RESERVE = 20;

const COLORS = {
  dark: [0, 0, 0] as [number, number, number],
  grid: [120, 120, 120] as [number, number, number],
  labelBg: [232, 232, 232] as [number, number, number],
  headerBg: [217, 217, 217] as [number, number, number],
} as const;

const BLANK = "__________";

/** A results-table column. `group` marks the columns sharing a merged heading. */
interface Col {
  label: string;
  w: number;
  group?: string;
}

/**
 * The columns of the results table, in millimetres, summing to TABLE_W.
 *
 * The widths are the reference sheet's own column edges converted to mm, so the
 * printed rules line up with the laboratory's original. The percentage and the
 * comment share one merged "Remarks/Comments" heading; the final column is the
 * reference's narrow trailing spacer.
 */
const COLS: Col[] = [
  { label: "Cube Mark", w: 24.0 },
  { label: "Date of Cast", w: 18.0 },
  { label: "Date of Test", w: 19.7 },
  { label: "Age (Days)", w: 16.3 },
  { label: "L", w: 16.2, group: "Cube Dimensions (mm)" },
  { label: "W", w: 15.9, group: "Cube Dimensions (mm)" },
  { label: "H", w: 16.2, group: "Cube Dimensions (mm)" },
  { label: "Mass of Cube (g)", w: 16.2 },
  { label: "Density (Kg/m3)", w: 16.3 },
  { label: "Max Load at Failure (KN)", w: 22.2 },
  { label: "Compressive Strength (N/mm2)", w: 23.3 },
  { label: "%", w: 15.8, group: "Remarks/Comments" },
  { label: "", w: 25.4, group: "Remarks/Comments" },
  { label: "", w: 17.1 },
];

/** Index of the column printed in bold, matching the reference's emphasised result. */
const BOLD_COLUMN = 10;

export interface CompressiveRecordView {
  contractor: string;
  county: string;
  concreteClass: string;
  section: string;
  madeBy: string;
  slump: string;
  clientRef: string;
  labRef: string;
  /** Date the cubes were cast, ISO `YYYY-MM-DD`. */
  dateCasted: string;
}

export interface CompressiveStrengthPdfOptions {
  projectName?: string;
  clientName?: string;
  dateReported?: string;
  testedBy?: string;
  checkedBy?: string;
  labOrganization?: string;
  record: CompressiveRecordView;
  /** Every cube row. Blank rows are dropped so empty grid lines are not printed. */
  rows: CompressiveCubeInput[];
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
  const format = match[2].toUpperCase() === "JPG" ? "JPEG" : match[2].toUpperCase();
  return { base64: match[3], format: format as "PNG" | "JPEG" };
};

/** `YYYY-MM-DD` -> `19-Sep-26`, matching the reference sheet's date style. */
export const formatReportDate = (value: string): string => {
  if (!value) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return value.trim();
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthIndex = Number(match[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) return value.trim();
  return `${Number(match[3])}-${months[monthIndex]}-${match[1].slice(2)}`;
};

/**
 * Percentage of the class characteristic cube strength, rounded to a whole
 * number. The reference prints 25.1 MPa as 84% and 21.5 MPa as 72% for a C30
 * mix, so the divisor is the class target — not the mean of the cubes.
 */
export const percentOfClass = (strength: number | null, classTarget: number | null): string => {
  if (strength === null || classTarget === null || classTarget <= 0) return "";
  return `${Math.round((strength / classTarget) * 100)}%`;
};

/**
 * Whether a cube is acceptable, as a fraction of the class characteristic
 * strength.
 *
 * A bare comparison against the class figure would condemn every early cube:
 * the reference's own 7-day cube reached 84% of a C30 class and was reported
 * "Satisfactory". BS EN 206 treats roughly two thirds of the characteristic
 * strength as the expected 7-day proportion, so that is the line used here.
 */
export const isSatisfactory = (strength: number | null, classTarget: number | null): boolean =>
  strength !== null && classTarget !== null && classTarget > 0 && strength >= classTarget * 0.65;

/** A cube counts as printable only once it can produce a strength. */
const isPopulated = (row: CompressiveCubeInput): boolean => strengthOf(row) !== null;
const TERMS = [
  "Results herein is a true representation of the cubes submitted to our lab to the best of our knowledge.",
  "Any correction or addition to these test results will make this report invalid.",
  "Once report is transmitted or released it is final and no corrections pertaining to incorrect information submitted by the client will be accepted or considered.",
  "This report should not be reproduced or published in full or part without prior written approval from our lab.",
  "All photocopies of test reports produced and not signed by our Technical Director should be considered invalid.",
  "All the results released to the client from our lab are treated as strictly confidential and would only be released to other parties with written instruction from the client.",
  "A legal contract between the client and the lab will deem to have constituted upon receipt of the test results by the client sent via any electronic transmission media or collected by client's representative.",
];

/** One cell of the identification block: a label box plus a value. */
interface IdCell {
  label: string;
  value: string;
  /** Total width of the pair, label box included. */
  w: number;
}

const drawCellText = (
  d: jsPDF,
  value: string,
  x: number,
  y: number,
  w: number,
  h: number,
  size: number,
  bold = false,
) => {
  const fitted = fitText(d, value, w - 1.6, size);
  d.setFontSize(fitted);
  d.setFont("helvetica", bold ? "bold" : "normal");
  d.setTextColor(...COLORS.dark);
  // jsPDF anchors on the text baseline, so offset by a third of the cap height
  // to sit the text on the vertical centre of the cell.
  d.text(value, x + w / 2, y + h / 2 + fitted * 0.35, { align: "center" });
};

/** Build the identification rows shown above the results table. */
const buildIdRows = (o: CompressiveStrengthPdfOptions): IdCell[][] => {
  const r = o.record;
  // Cells in each row share the table width exactly: halves, thirds, or quarters.
  const half = TABLE_W / 2;
  const third = TABLE_W / 3;
  const quarter = TABLE_W / 4;
  return [
    [
      { label: "PROJECT", value: text(o.projectName), w: half },
      { label: "CLIENT", value: text(o.clientName), w: half },
    ],
    [
      { label: "CONTRACTOR", value: text(r.contractor), w: third },
      { label: "COUNTY", value: text(r.county), w: third },
      { label: "CONCRETE CLASS", value: text(r.concreteClass), w: third },
    ],
    [
      { label: "SECTION", value: text(r.section), w: quarter },
      { label: "MADE BY", value: text(r.madeBy), w: quarter },
      { label: "SLUMP", value: text(r.slump), w: quarter },
      { label: "LAB REF", value: text(r.labRef), w: quarter },
    ],
    [
      { label: "CLIENT REF", value: text(r.clientRef), w: third },
      { label: "DATE CASTED", value: formatReportDate(r.dateCasted) || BLANK, w: third },
      { label: "DATE REPORTED", value: formatReportDate(o.dateReported ?? "") || BLANK, w: third },
    ],
  ];
};

/**
 * Draw the identification block. Each label sits in a tinted box on the left of
 * its cell and the value fills the remainder, as on the reference sheet.
 */
const drawIdentification = (d: jsPDF, o: CompressiveStrengthPdfOptions, y: number): number => {
  let cy = y;
  for (const row of buildIdRows(o)) {
    let cx = TABLE_X;
    for (const cell of row) {
      const labelW = Math.min(cell.w * 0.34, 34);
      const valueW = cell.w - labelW;
      d.setFillColor(...COLORS.labelBg);
      d.rect(cx, cy, labelW, ID_ROW_H, "F");
      d.setDrawColor(...COLORS.grid);
      d.setLineWidth(0.2);
      d.rect(cx, cy, cell.w, ID_ROW_H);
      drawCellText(d, cell.label, cx, cy, labelW, ID_ROW_H, 6.5, true);
      drawCellText(d, cell.value, cx + labelW, cy, valueW, ID_ROW_H, 7.5);
      cx += cell.w;
    }
    cy += ID_ROW_H;
  }
  return cy;
};

/**
 * Draw the two-line table heading. "Cube Dimensions (mm)" spans the three
 * L/W/H columns, so those cells carry their letter on the second line.
 */
const drawTableHeader = (d: jsPDF, y: number): number => {
  const halfH = HEADER_H / 2;
  let x = TABLE_X;
  let i = 0;
  while (i < COLS.length) {
    const col = COLS[i];
    // A grouped heading consumes every following column that shares its group.
    let span = 1;
    while (i + span < COLS.length && (COLS[i + span] as { group?: string }).group === col.group) span += 1;
    const width = COLS.slice(i, i + span).reduce((sum, c) => sum + c.w, 0);
    const isGroup = Boolean((col as { group?: string }).group);
    const topH = isGroup ? halfH : HEADER_H;

    d.setFillColor(...COLORS.headerBg);
    d.rect(x, y, width, topH, "F");
    d.setDrawColor(...COLORS.grid);
    d.setLineWidth(0.2);
    d.rect(x, y, width, topH);
    const heading = col.group ?? col.label;
    d.setFontSize(fitText(d, heading, width - 2, 6.5, 4));
    d.setFont("helvetica", "bold");
    d.setTextColor(...COLORS.dark);
    d.text(heading, x + width / 2, y + topH / 2 + 2, { align: "center" });

    // Second line: only the grouped dimension columns have a sub-label.
    if (isGroup) {
      for (let k = 0; k < span; k += 1) {
        const sub = COLS[i + k];
        const sx = x + COLS.slice(i, i + k).reduce((sum, c) => sum + c.w, 0);
        d.setFillColor(...COLORS.headerBg);
        d.rect(sx, y + halfH, sub.w, halfH, "F");
        d.setDrawColor(...COLORS.grid);
        d.rect(sx, y + halfH, sub.w, halfH);
        drawCellText(d, sub.label, sx, y + halfH, sub.w, halfH, 6.5, true);
      }
    }
    x += width;
    i += span;
  }
  return y + HEADER_H;
};

/** Values for one cube, in column order, already formatted for print. */
const cubeSheetValues = (row: CompressiveCubeInput, classTarget: number | null): string[] => {
  const strength = strengthOf(row);
  const density = densityOf(row);
  const age = ageOf(row.dateOfCast, row.dateOfTest);
  // A technician's own remark always wins; otherwise show the verdict.
  const verdict = strength === null || classTarget === null
    ? ""
    : isSatisfactory(strength, classTarget) ? "Satisfactory" : "Below target";
  return [
    row.mark.trim() || "None",
    formatReportDate(row.dateOfCast) || BLANK,
    formatReportDate(row.dateOfTest) || BLANK,
    age === null ? BLANK : String(age),
    text(row.width, "150"),
    text(row.height, "150"),
    text(row.depth, "150"),
    num(parseNumber(row.mass), 1),
    density === null ? BLANK : Math.round(density).toLocaleString("en-US"),
    num(parseNumber(row.load), 1),
    num(strength, 1),
    percentOfClass(strength, classTarget),
    row.remarks.trim() || verdict || BLANK,
    // Trailing spacer column, present on the reference sheet.
    "",
  ];
};

const drawRow = (d: jsPDF, values: string[], y: number, rowH: number) => {
  let x = TABLE_X;
  values.forEach((value, index) => {
    const col = COLS[index];
    d.setDrawColor(...COLORS.grid);
    d.setLineWidth(0.2);
    d.rect(x, y, col.w, rowH);
    const size = fitText(d, value, col.w - 1.6, rowH >= 4 ? 7.5 : 6.5, 4);
    d.setFontSize(size);
    d.setFont("helvetica", index === BOLD_COLUMN ? "bold" : "normal");
    d.setTextColor(...COLORS.dark);
    d.text(value, x + col.w / 2, y + rowH / 2 + size * 0.35, { align: "center" });
    x += col.w;
  });
};

/** Measure the terms block so the row band can be sized around it. */
const measureTerms = (d: jsPDF): number => {
  let h = 0;
  TERMS.forEach((term, index) => {
    const lines = d.splitTextToSize(`${index + 1}.  ${term}`, TABLE_W - 8) as string[];
    h += lines.length * 3.4 + 0.6;
  });
  return h + 2;
};

const drawTerms = (d: jsPDF, y: number): void => {
  let cy = y;
  d.setFont("helvetica", "normal");
  d.setFontSize(6.5);
  d.setTextColor(...COLORS.dark);
  TERMS.forEach((term, index) => {
    const lines = d.splitTextToSize(`${index + 1}.  ${term}`, TABLE_W - 8) as string[];
    lines.forEach((line) => {
      d.text(line, TABLE_X + 4, cy);
      cy += 3.4;
    });
    cy += 0.6;
  });
};

const drawFooter = (d: jsPDF, o: CompressiveStrengthPdfOptions, images: AdminImages, y: number, page: number, pages: number) => {
  d.setDrawColor(...COLORS.dark);
  d.setLineWidth(0.5);
  d.line(TABLE_X, y - 4, TABLE_X + TABLE_W, y - 4);
  const stampSpace = images.stamp ? 30 : 0;
  const colW = (TABLE_W - stampSpace) / 3;
  d.setFontSize(7.5);
  d.setFont("helvetica", "bold");
  d.setTextColor(...COLORS.dark);
  d.text(`TESTED BY:  ${text(o.testedBy)}`, TABLE_X, y);
  d.text(`REPORTED ON:  ${formatReportDate(o.dateReported ?? "") || BLANK}`, TABLE_X + colW, y);
  d.text(`CHECKED BY:  ${text(o.checkedBy)}`, TABLE_X + colW * 2, y);

  if (images.stamp) {
    try {
      // Top edge sits on the content boundary so the stamp never climbs into the terms.
      const { base64, format } = imageParts(images.stamp);
      d.addImage(base64, format, TABLE_X + TABLE_W - 26, y - 6, 22, 22, undefined, "FAST");
    } catch { /* the stamp is optional */ }
  }

  d.setFont("helvetica", "normal");
  d.setFontSize(7);
  d.text(
    "Specialists In: Non-Destructive Testing, Materials Testing and Inspection, Quality Assurance, Failure Investigations,",
    TABLE_X,
    y + 20,
  );
  d.setFontSize(7);
  d.setTextColor(120, 120, 120);
  d.text(`Page ${page} of ${pages}`, MARGIN + CONTENT_W / 2, 204, { align: "center" });
  d.text(`Generated: ${new Date().toLocaleDateString()}`, MARGIN, 204);
};

/** Title, laboratory identity and the rule beneath, as on the reference. */
const drawTitleBlock = (d: jsPDF, o: CompressiveStrengthPdfOptions, images: AdminImages, y: number): number => {
  const imgW = 62;
  const imgH = 20;
  d.setFontSize(7.5);
  d.setFont("helvetica", "normal");
  d.setTextColor(...COLORS.dark);
  d.text("Compressive Strength of Concrete Cubes Report", MARGIN, y);
  if (images.logo) {
    try {
      const { base64, format } = imageParts(images.logo);
      d.addImage(base64, format, MARGIN, y + 1, imgW, imgH, undefined, "FAST");
    } catch { /* the logo is optional */ }
  }
  if (images.contacts) {
    try {
      const { base64, format } = imageParts(images.contacts);
      d.addImage(base64, format, MARGIN + CONTENT_W - imgW, y + 1, imgW, imgH, undefined, "FAST");
    } catch { /* the contacts block is optional */ }
  }
  let cy = y + imgH + 3;
  d.setDrawColor(...COLORS.dark);
  d.setLineWidth(0.5);
  d.line(MARGIN, cy, MARGIN + CONTENT_W, cy);
  cy += 4;
  const title = "COMPRESSIVE STRENGTH OF CONCRETE CUBES";
  d.setFontSize(13);
  d.setFont("helvetica", "bold");
  d.setTextColor(...COLORS.dark);
  d.text(title, TABLE_X + TABLE_W / 2, cy, { align: "center" });
  const titleW = d.getTextWidth(title);
  d.setLineWidth(0.4);
  d.line(TABLE_X + TABLE_W / 2 - titleW / 2, cy + 1.2, TABLE_X + TABLE_W / 2 + titleW / 2, cy + 1.2);
  cy += 5;
  d.setFontSize(8.5);
  d.setFont("helvetica", "normal");
  d.text("BS EN 12390 - 3 : 2002", TABLE_X + TABLE_W / 2, cy, { align: "center" });
  if (o.labOrganization) {
    cy += 4;
    d.setFontSize(8);
    d.setFont("helvetica", "bold");
    d.text(o.labOrganization, TABLE_X + TABLE_W / 2, cy, { align: "center" });
    return cy + 4;
  }
  return cy + 3;
};

/** Height of everything on a page that is not a cube row. Title block is ~38mm with images. */
const furnitureHeight = (d: jsPDF): number =>
  MARGIN + 38 + 4 * ID_ROW_H + HEADER_H + measureTerms(d) + FOOTER_RESERVE;

export const generateCompressiveStrengthPDF = async (options: CompressiveStrengthPdfOptions) => {
  // Images are optional: a missing logo or stamp must never stop a report being produced.
  let images: AdminImages = {};
  try {
    images = await fetchAdminImagesAsBase64();
  } catch (error) {
    console.warn("[Compressive PDF] Could not load header images, exporting without them:", error);
  }

  const o = options;
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  const pageHeight = doc.internal.pageSize.getHeight();

  // Only cubes that can produce a strength are printed; a blank grid line would
  // otherwise read as a cube that failed to break.
  const printable = o.rows.filter(isPopulated);
  const classTarget = cubeStrengthFromClass(o.record.concreteClass);

  const usable = pageHeight - furnitureHeight(doc);

  // Rows keep the reference height until the sheet gets crowded, then shrink
  // toward the readable floor; past that the sheet paginates.
  const rowH = printable.length === 0
    ? REF_ROW_H
    : Math.max(MIN_ROW_H, Math.min(REF_ROW_H, usable / printable.length));
  const rowsPerPage = Math.max(1, Math.floor(usable / rowH));

  const printPage = (page: CompressiveCubeInput[]): number => {
    let y = drawTitleBlock(doc, o, images, MARGIN);
    y = drawIdentification(doc, o, y);
    y = drawTableHeader(doc, y);
    for (const row of page) {
      drawRow(doc, cubeSheetValues(row, classTarget), y, rowH);
      y += rowH;
    }
    return y;
  };

  // A test with no results still yields a valid sheet rather than a bare header.
  const totalPages = Math.max(1, Math.ceil(printable.length / rowsPerPage));
  let pageNo = 0;
  const footerY = pageHeight - MARGIN - 14;
  const finishPage = (bottom: number) => {
    pageNo += 1;
    drawTerms(doc, Math.min(bottom + 3, footerY - measureTerms(doc)));
    drawFooter(doc, o, images, footerY, pageNo, totalPages);
  };
  let y = printPage(printable.slice(0, rowsPerPage));
  for (let index = rowsPerPage; index < printable.length; index += rowsPerPage) {
    finishPage(y);
    doc.addPage();
    y = printPage(printable.slice(index, index + rowsPerPage));
  }
  finishPage(y);

  if (!o.skipDownload) {
    const stem = (o.projectName || "Compressive Strength").replace(/[^\w-]+/g, "_");
    doc.save(`${stem}_Cubes.pdf`);
  }
  return doc;
};