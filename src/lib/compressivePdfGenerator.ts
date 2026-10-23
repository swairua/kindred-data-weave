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
  expectedPercentAtAge,
  formatReportAge,
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
/** Height of the two-line table heading (~9mm band on the reference). */
const HEADER_H = 9.5;
/** Room reserved at the foot of the page for the terms and the signature line. */
const FOOTER_RESERVE = 20;
/** Bottom edge of the full-page blue frame: clears the page-number baseline with ~2.5 mm to spare. */
const FRAME_BOTTOM = 207;

const COLORS = {
  dark: [0, 0, 0] as [number, number, number],
  /** Hairline table rules are black on the reference sheet. */
  grid: [0, 0, 0] as [number, number, number],
  /** Brand blue used for the table's outer frame. */
  blue: [0, 0, 255] as [number, number, number],
  /** Peach label cells, matching the reference identification block. */
  labelBg: [252, 228, 214] as [number, number, number],
  /** The reference heading band is white; only its rules are inked. */
  headerBg: [255, 255, 255] as [number, number, number],
  /** Light-grey separators around the title/blank rows. */
  ruleLight: [211, 211, 211] as [number, number, number],
} as const;

/**
 * jsPDF records the fill colour in the content stream the moment a filled rect
 * is written, and `text()` also writes (and caches) a fill colour of its own.
 * A `setFillColor` issued before an intervening `text()` is therefore NOT
 * re-emitted for a later rect, which silently painted the L/W/H and Remarks
 * header cells black. Every filled rect must set its colour immediately before
 * the rect it paints, so these two helpers wrap that pattern.
 */
export const fillRect = (
  d: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: [number, number, number],
) => {
  d.setFillColor(...fill);
  d.rect(x, y, w, h, "F");
};

export const fillStrokeRect = (
  d: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: [number, number, number],
  stroke: [number, number, number] = COLORS.grid,
  lineWidth = 0.2,
) => {
  d.setFillColor(...fill);
  d.setDrawColor(...stroke);
  d.setLineWidth(lineWidth);
  d.rect(x, y, w, h, "FD");
};

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
 * comment share one merged "Remarks/Comments" heading, which fills the sheet
 * to the right-hand edge.
 */
const COLS: Col[] = [
  { label: "CUBE MARK", w: 20.47 },
  { label: "DATE OF\nCAST", w: 20.70 },
  { label: "DATE OF\nTEST", w: 18.92 },
  { label: "AGE\n(DAYS)", w: 19.41 },
  { label: "L", w: 16.80, group: "CUBE DIMM\n(mm)" },
  { label: "W", w: 16.80, group: "CUBE DIMM\n(mm)" },
  { label: "H", w: 16.80, group: "CUBE DIMM\n(mm)" },
  { label: "MASS OF\nCUBE(g)", w: 16.76 },
  { label: "DENSITY\n(Kg/m3)", w: 19.45 },
  { label: "MAX LOAD\nAT\nFAILURE (KN)", w: 23.08 },
  { label: "COMPRESSIVE\nSTRENGTH\n(N/mm2)", w: 27.02 },
  { label: "", w: 16.80, group: "Remarks/Comments" },
  { label: "", w: 29.69, group: "Remarks/Comments" },
];

/** Index of the column printed in bold, matching the reference's emphasised result. */
const BOLD_COLUMN = 10;

/** Identification block for the compressive test. Mode/comment predate the latest sheet revision. */
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
  /** Laboratory report number, printed in the identification block when set. */
  reportNo?: string;
  /** Date the laboratory received the cubes, ISO `YYYY-MM-DD`. */
  dateReceived?: string;
  /** Curing regime of the cubes, e.g. "20±2°C water". */
  curing?: string;
  /** Cube failure description, e.g. "Satisfactory". Optional: older saved rows predate the latest sheet. */
  modeOfFailure?: string;
  /** Laboratory comment on the mode of failure. Optional for the same reason. */
  comment?: string;
}

export interface CompressiveStrengthPdfOptions {
  projectName?: string;
  clientName?: string;
  dateReported?: string;
  testedBy?: string;
  checkedBy?: string;
  labOrganization?: string;
  /** Letterhead address lines, printed as text when no header images are configured. */
  labAddressLines?: string[];
  /** Signed on paper after issue; blank when not yet received. */
  receivedBy?: string;
  receivedDate?: string;
  signature?: string;
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

/** Whole-millimetre dimensions print without decimals, as on the reference ("150", never "150.00"). */
const wholeMm = (value: string, fallback: string): string => {
  const trimmed = value.trim();
  if (trimmed === "") return fallback;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && Number.isInteger(parsed) ? String(parsed) : trimmed;
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
 * strength at the age it was broken.
 *
 * A bare comparison against the class figure would condemn every early cube:
 * the reference's own 7-day cube reached 84% of a C30 class and was reported
 * "Satisfactory". Each age is judged against the strength-gain table (1d 16%,
 * 3d 40%, 7d 65%, 14d 90%, 28d 99%), interpolating between the points and
 * holding 99% past 28 days, so a 55-day cube at 78% is below expectation
 * while a 3-day cube at 45% beats its 40% one. Without a known age the
 * long-standing flat 65% line is kept as the fallback.
 */
export const isSatisfactory = (
  strength: number | null,
  classTarget: number | null,
  ageDays: number | null = null,
): boolean => {
  if (strength === null || classTarget === null || classTarget <= 0) return false;
  // The strength-gain table stops at 28 days; older cubes hold the 28-day line.
  const cappedAge = ageDays === null ? null : Math.min(ageDays, 28);
  const expected = cappedAge === null ? 65 : expectedPercentAtAge(cappedAge) ?? 65;
  return strength >= (classTarget * expected) / 100;
};

/** A cube counts as printable only once it can produce a strength. */
const isPopulated = (row: CompressiveCubeInput): boolean => strengthOf(row) !== null;
const TERMS_INTRO =
  "Reports and Certificates by Cransfield Labs are issued subject to the below terms and conditions:";
const TERMS = [
  "Results herein is a true representation of the cubes submitted to our lab to the best of our knowledge.",
  "Any correction or addition to these test results will make this report invalid.",
  "Once report is transmitted or released it is final and no corrections pertaining to incorrect information submitted by the client will be accepted or considered.",
  "This report should not be reproduced or published in full or part without prior written approval from our lab.",
  "All photocopies of test reports produced and not signed by our Technical Director should be considered invalid.",
  "All the results released to the client from our lab are treated as strictly confidential and would only be released to other parties with written instruction from the client.",
  "A legal contract between the client and Cransfield Lab will deem to have constituted upon receipt of the test results by the client sent via any electronic transmission media or collected by client's representative.",
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
  // Labels like "DATE OF\nCAST" and two-line "CM/5552\nCM/5553" lab refs sit on
  // a vertical stack of centred lines; a single line keeps the old placement.
  // Text is anchored with baseline "middle" so short cells (the L/W/H letter
  // band, dense cube rows) cannot push glyphs below the cell rules.
  const lines = value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  d.setFont("times", bold ? "bold" : "normal");
  if (lines.length <= 1) {
    const fitted = fitText(d, value, w - 1.6, size);
    d.setFontSize(fitted);
    d.setTextColor(...COLORS.dark);
    d.text(value, x + w / 2, y + h / 2, { align: "center", baseline: "middle" });
    return;
  }
  const longest = lines.reduce((a, b) => (a.length >= b.length ? a : b), "");
  const fitted = fitText(d, longest, w - 1.6, size);
  d.setFontSize(fitted);
  d.setTextColor(...COLORS.dark);
  const lineH = fitted * 0.42;
  const blockTop = y + h / 2 - ((lines.length - 1) * lineH) / 2;
  lines.forEach((line, index) => {
    d.text(line, x + w / 2, blockTop + index * lineH, { align: "center", baseline: "middle" });
  });
};

  // Mode of failure and comment, printed after the cube table as on the
  // laboratory's own sheet. Returns the new cursor.
  const drawResultsSummary = (d: jsPDF, r: CompressiveRecordView, y: number): number => {
    let cy = y + 2;
    // Optional: older saved rows predate the mode/comment fields.
    const modeOfFailure = r.modeOfFailure ?? "";
    const comment = r.comment ?? "";
    if (modeOfFailure.trim() !== "") {
      d.setFont("times", "bold");
      d.setFontSize(7.5);
      d.setTextColor(...COLORS.dark);
      d.text("MODE OF FAILURE:", TABLE_X, cy);
      d.setFont("times", "normal");
      const lines = d.splitTextToSize(modeOfFailure, TABLE_W - 32) as string[];
      lines.forEach((line, index) => d.text(line, TABLE_X + 32, cy + index * 3.4));
      cy += Math.max(ID_ROW_H, lines.length * 3.4 + 1);
    }
    if (comment.trim() !== "") {
      d.setFont("times", "bold");
      d.setFontSize(7.5);
      d.setTextColor(...COLORS.dark);
      d.text("COMMENT:", TABLE_X, cy);
      d.setFont("times", "normal");
      const lines = d.splitTextToSize(comment, TABLE_W - 22) as string[];
      lines.forEach((line, index) => d.text(line, TABLE_X + 22, cy + index * 3.4));
      cy += Math.max(ID_ROW_H, lines.length * 3.4 + 1);
    }
    return cy;
  };

  /** Build the identification rows shown above the results table. */
const buildIdRows = (o: CompressiveStrengthPdfOptions): IdCell[][] => {
  const r = o.record;
  // Cells in each row share the table width exactly: full width, halves,
  // thirds, or quarters. DATE REPORTED lives in the footer, not the block.
  const half = TABLE_W / 2;
  const third = TABLE_W / 3;
  const quarter = TABLE_W / 4;
  return [
    [{ label: "PROJECT", value: text(o.projectName), w: TABLE_W }],
    [{ label: "CLIENT", value: text(o.clientName), w: TABLE_W }],
    [
      { label: "COUNTY", value: text(r.county), w: third },
      { label: "CONCRETE CLASS", value: text(r.concreteClass), w: third },
      { label: "DATE CASTED", value: formatReportDate(r.dateCasted) || BLANK, w: third },
    ],
    [
      { label: "CONTRACTOR", value: text(r.contractor), w: third },
      // A two-line lab reference ("CM/5552\nCM/5553") stacks inside one cell.
      { label: "LAB REF", value: text(r.labRef), w: third },
      { label: "SECTION", value: text(r.section), w: third },
    ],
    [
      { label: "MADE BY", value: text(r.madeBy), w: third },
      { label: "CLIENT REF", value: text(r.clientRef), w: third },
      { label: "SLUMP", value: text(r.slump), w: third },
    ],
    [
      { label: "REPORT NO.", value: text(r.reportNo), w: third },
      { label: "DATE RECEIVED", value: formatReportDate(r.dateReceived) || BLANK, w: third },
      { label: "CURING", value: text(r.curing), w: third },
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
      // The label tint is re-set immediately before its rect (see fillRect).
      fillRect(d, cx, cy, labelW, ID_ROW_H, COLORS.labelBg);
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
 * Draw the three-band table heading. Ungrouped columns stack their "\n"
 * label lines across the full height; "CUBE DIMM\n(mm)" spans L/W/H with
 * the letters on the bottom band while "Remarks/Comments" merges across
 * its two columns as one centred heading.
 */
const drawTableHeader = (d: jsPDF, y: number): number => {
  const bandH = HEADER_H / 3;
  let x = TABLE_X;
  let i = 0;
  while (i < COLS.length) {
    const col = COLS[i];
    // Only a real group name merges columns: without the guard two plain
    // columns would match as `undefined === undefined` and collapse the header.
    const grouped = col.group !== undefined;
    let span = 1;
    while (i + span < COLS.length && grouped && (COLS[i + span] as { group?: string }).group === col.group) span += 1;
    const width = COLS.slice(i, i + span).reduce((sum, c) => sum + c.w, 0);
    const hasSubLabels = grouped && COLS.slice(i, i + span).some((c) => c.label.trim() !== "");

    // Each cell sets its own colours adjacent to its rect (see fillStrokeRect):
    // the drawCellText calls in between would otherwise leave a stale black.
    if (!grouped) {
      fillStrokeRect(d, x, y, col.w, HEADER_H, COLORS.headerBg);
      drawCellText(d, col.label, x, y, col.w, HEADER_H, 6.5, true);
    } else if (hasSubLabels) {
      // Two-line group name over the top two bands, letters on the bottom band.
      fillStrokeRect(d, x, y, width, bandH * 2, COLORS.headerBg);
      drawCellText(d, col.group as string, x, y, width, bandH * 2, 6.5, true);
      for (let k = 0; k < span; k += 1) {
        const sub = COLS[i + k];
        const sx = x + COLS.slice(i, i + k).reduce((sum, c) => sum + c.w, 0);
        fillStrokeRect(d, sx, y + bandH * 2, sub.w, bandH, COLORS.headerBg);
        drawCellText(d, sub.label, sx, y + bandH * 2, sub.w, bandH, 6.5, true);
      }
    } else {
      // Merged heading with no sub-labels (Remarks/Comments).
      fillStrokeRect(d, x, y, width, HEADER_H, COLORS.headerBg);
      drawCellText(d, col.group as string, x, y, width, HEADER_H, 6.5, true);
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
  // A technician's own remark always wins; otherwise show the age-aware verdict.
  const verdict = strength === null || classTarget === null
    ? ""
    : isSatisfactory(strength, classTarget, age) ? "Satisfactory" : "Unsatisfactory";
  return [
    row.mark.trim() || "None",
    formatReportDate(row.dateOfCast) || BLANK,
    formatReportDate(row.dateOfTest) || BLANK,
    // Past the 28-day tolerance window the sheet prints "Above 28".
    formatReportAge(age) || BLANK,
    wholeMm(row.width, "150"),
    wholeMm(row.height, "150"),
    wholeMm(row.depth, "150"),
    num(parseNumber(row.mass), 1),
    density === null ? BLANK : Math.round(density).toLocaleString("en-US"),
    num(parseNumber(row.load), 1),
    num(strength, 1),
    percentOfClass(strength, classTarget),
    row.remarks.trim() || verdict || BLANK,
  ];
};

const drawRow = (d: jsPDF, values: string[], y: number, rowH: number) => {
  let x = TABLE_X;
  values.forEach((value, index) => {
    const col = COLS[index];
    d.setDrawColor(...COLORS.grid);
    d.setLineWidth(0.2);
    d.rect(x, y, col.w, rowH);
    d.setFont("times", index === BOLD_COLUMN ? "bold" : "normal");
    const size = fitText(d, value, col.w - 1.6, rowH >= 4 ? 7.5 : 6.5, 4);
    d.setFontSize(size);
    d.setTextColor(...COLORS.dark);
    // Baseline "middle" keeps the value inside short rows; the old
    // `size * 0.35` point offset pushed glyphs below the blue frame.
    d.text(value, x + col.w / 2, y + rowH / 2, { align: "center", baseline: "middle" });
    x += col.w;
  });
};

/** Measure the terms block so the row band can be sized around it. */
const measureTerms = (d: jsPDF): number => {
  let h = 0;
  const intro = d.splitTextToSize(TERMS_INTRO, TABLE_W - 8) as string[];
  h += intro.length * 3.4 + 1.2;
  TERMS.forEach((term, index) => {
    const lines = d.splitTextToSize(`${index + 1}.  ${term}`, TABLE_W - 8) as string[];
    h += lines.length * 3.4 + 0.6;
  });
  return h + 2;
};

const drawTerms = (d: jsPDF, y: number): void => {
  let cy = y;
  d.setFont("times", "bold");
  d.setFontSize(6.5);
  d.setTextColor(...COLORS.dark);
  (d.splitTextToSize(TERMS_INTRO, TABLE_W - 8) as string[]).forEach((line) => {
    d.text(line, TABLE_X + 4, cy);
    cy += 3.4;
  });
  cy += 1.2;
  d.setFont("times", "normal");
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
  d.setFont("times", "bold");
  d.setTextColor(...COLORS.dark);
  d.text(`TESTED BY:  ${text(o.testedBy)}`, TABLE_X, y);
  d.text(`REPORTED ON:  ${formatReportDate(o.dateReported ?? "") || BLANK}`, TABLE_X + colW, y);
  d.text(`CHECKED BY:  ${text(o.checkedBy)}`, TABLE_X + colW * 2, y);
  d.text(`RECEIVED BY:  ${text(o.receivedBy)}`, TABLE_X, y + 6);
  d.text(`DATE:  ${formatReportDate(o.receivedDate ?? "") || BLANK}`, TABLE_X + colW, y + 6);
  d.text(`SIGNATURE:  ${text(o.signature)}`, TABLE_X + colW * 2, y + 6);

  if (images.stamp) {
    try {
      // Top edge sits on the content boundary so the stamp never climbs into the terms.
      const { base64, format } = imageParts(images.stamp);
      d.addImage(base64, format, TABLE_X + TABLE_W - 26, y - 6, 22, 22, undefined, "FAST");
    } catch { /* the stamp is optional */ }
  }

  d.setFont("times", "normal");
  d.setFontSize(7);
  d.text(
    "Specialists In: Non-Destructive Testing, Materials Testing and Inspection, Quality Assurance, Failure Investigations,",
    TABLE_X,
    y + 20,
  );
  d.setFontSize(7);
  d.setTextColor(120, 120, 120);
  d.text(`Page ${page} of ${pages}`, MARGIN + CONTENT_W / 2, 204, { align: "center" });
};

/** Title, laboratory identity and the rule beneath, as on the reference. */
const drawTitleBlock = (
  d: jsPDF,
  o: CompressiveStrengthPdfOptions,
  images: AdminImages,
  y: number,
): { ruleY: number; endY: number } => {
  const imgW = 62;
  const imgH = 20;
  d.setFontSize(7.5);
  d.setFont("times", "normal");
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
  let cy = y;
  const hasImages = !!(images.logo || images.contacts);
  if (hasImages) cy += imgH + 3;
  const addressLines = (o.labAddressLines ?? []).filter((line) => line.trim() !== "").slice(0, 3);
  if (!hasImages && addressLines.length > 0) {
    // No letterhead images configured: print the address as text instead of
    // leaving an empty band, so the sheet always carries the lab identity.
    d.setFontSize(7.5);
    d.setFont("times", "normal");
    d.setTextColor(...COLORS.dark);
    for (const line of addressLines) {
      cy += 3.6;
      d.text(line, MARGIN + CONTENT_W / 2, cy, { align: "center" });
    }
    cy += 3;
  } else if (!hasImages) {
    cy += 3;
  }
  // Top edge of the full-page blue frame: the rule under the letterhead.
  const ruleY = cy;
  d.setDrawColor(...COLORS.dark);
  d.setLineWidth(0.5);
  d.line(TABLE_X, cy, TABLE_X + TABLE_W, cy);
  cy += 4;
  const title = "COMPRESSIVE STRENGTH OF CONCRETE CUBES";
  d.setFontSize(13);
  d.setFont("times", "bold");
  d.setTextColor(...COLORS.dark);
  d.text(title, TABLE_X + TABLE_W / 2, cy, { align: "center" });
  const titleW = d.getTextWidth(title);
  d.setLineWidth(0.4);
  d.line(TABLE_X + TABLE_W / 2 - titleW / 2, cy + 1.2, TABLE_X + TABLE_W / 2 + titleW / 2, cy + 1.2);
  cy += 5;
  d.setFontSize(8.5);
  d.setFont("times", "normal");
  d.text("BS EN 12390 - 3 : 2002", TABLE_X + TABLE_W / 2, cy, { align: "center" });
  if (o.labOrganization) {
    cy += 4;
    d.setFontSize(8);
    d.setFont("times", "bold");
    d.text(o.labOrganization, TABLE_X + TABLE_W / 2, cy, { align: "center" });
    return { ruleY, endY: cy + 4 };
  }
  return { ruleY, endY: cy + 3 };
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

  const printPage = (page: CompressiveCubeInput[]): { frameTop: number; bodyEnd: number } => {
    const title = drawTitleBlock(doc, o, images, MARGIN);
    let y = drawIdentification(doc, o, title.endY);
    y = drawTableHeader(doc, y);
    for (const row of page) {
      drawRow(doc, cubeSheetValues(row, classTarget), y, rowH);
      y += rowH;
    }
    // Mode of failure and comment follow the cube table, as on the lab sheet.
    y = drawResultsSummary(doc, o.record, y);
    return { frameTop: title.ruleY, bodyEnd: y };
  };

  // A test with no results still yields a valid sheet rather than a bare header.
  const totalPages = Math.max(1, Math.ceil(printable.length / rowsPerPage));
  let pageNo = 0;
  const footerY = pageHeight - MARGIN - 14;
  const finishPage = (frameTop: number, bottom: number) => {
    pageNo += 1;
    drawTerms(doc, Math.min(bottom + 3, footerY - measureTerms(doc)));
    drawFooter(doc, o, images, footerY, pageNo, totalPages);
    // The laboratory's sheet inks a single blue frame around the whole report
    // — letterhead rule through footer — drawn last so it overlays the black
    // hairlines.
    const FRAME_OFFSET = 2;
    doc.setDrawColor(...COLORS.blue);
    doc.setLineWidth(0.5);
    doc.rect(TABLE_X - FRAME_OFFSET, frameTop - FRAME_OFFSET, TABLE_W + FRAME_OFFSET * 2, FRAME_BOTTOM - frameTop + FRAME_OFFSET * 2);
  };
  let printed = printPage(printable.slice(0, rowsPerPage));
  for (let index = rowsPerPage; index < printable.length; index += rowsPerPage) {
    finishPage(printed.frameTop, printed.bodyEnd);
    doc.addPage();
    printed = printPage(printable.slice(index, index + rowsPerPage));
  }
  finishPage(printed.frameTop, printed.bodyEnd);

  if (!o.skipDownload) {
    const stem = (o.projectName || "Compressive Strength").replace(/[^\w-]+/g, "_");
    doc.save(`${stem}_Cubes.pdf`);
  }
  return doc;
};