import ExcelJS from "exceljs";
import { cubeStrengthFromClass, strengthOf, type CompressiveCubeInput } from "./compressiveCalculations";
import {
  CUBE_SHEET_COLUMNS,
  cubeSheetValues,
  formatReportDate,
  type CompressiveRecordView,
} from "./compressivePdfGenerator";
import { fetchAdminImagesAsBase64 } from "./imageUtils";

/**
 * The cube results as a spreadsheet, laid out like the printed sheet so the two
 * exports show the same columns in the same order.
 *
 * The headings and the per-cube values come from the PDF generator, which keeps
 * the workbook and the report from drifting apart.
 */

export interface CompressiveExcelOptions {
  projectName?: string;
  clientName?: string;
  dateReported?: string;
  testedBy?: string;
  checkedBy?: string;
  labOrganization?: string;
  record: CompressiveRecordView;
  rows: CompressiveCubeInput[];
  skipDownload?: boolean;
}

const thin: Partial<ExcelJS.Border> = { style: "thin" };
const allThin: Partial<ExcelJS.Borders> = { top: thin, bottom: thin, left: thin, right: thin };
const dataFont: Partial<ExcelJS.Font> = { size: 10, name: "Arial" };
const labelFont: Partial<ExcelJS.Font> = { bold: true, size: 10, name: "Arial" };
const headingFill: Partial<ExcelJS.Fill> = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFD9D9D9" },
};
const labelFill: Partial<ExcelJS.Fill> = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFE8E8E8" },
};

/** The terms printed under every cube sheet. */
const TERMS = [
  "Results herein is a true representation of the cubes submitted to our lab to the best of our knowledge.",
  "Any correction or addition to these test results will make this report invalid.",
  "Once report is transmitted or released it is final and no corrections pertaining to incorrect information submitted by the client will be accepted or considered.",
  "This report should not be reproduced or published in full or part without prior written approval from our lab.",
  "All photocopies of test reports produced and not signed by our Technical Director should be considered invalid.",
  "All the results released to the client from our lab are treated as strictly confidential and would only be released to other parties with written instruction from the client.",
  "A legal contract between the client and the lab will deem to have constituted upon receipt of the test results by the client sent via any electronic transmission media or collected by client's representative.",
];

const base64FromDataUrl = (dataUrl: string): string => {
  const match = dataUrl?.match(/^data:image\/\w+;base64,(.+)$/);
  return match ? match[1] : dataUrl;
};

/** Write a value across a run of merged cells and apply the box. */
const put = (
  ws: ExcelJS.Worksheet,
  row: number,
  col: number,
  span: number,
  value: string,
  font: Partial<ExcelJS.Font>,
  fill?: Partial<ExcelJS.Fill>,
) => {
  if (span > 1) ws.mergeCells(row, col, row, col + span - 1);
  const cell = ws.getCell(row, col);
  cell.value = value;
  cell.font = font;
  cell.border = allThin;
  cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  if (fill) cell.fill = fill as ExcelJS.Fill;
  return cell;
};

/** One label/value pair of the identification block. */
const putField = (
  ws: ExcelJS.Worksheet,
  row: number,
  labelCol: number,
  valueCol: number,
  span: number,
  label: string,
  value: string,
) => {
  put(ws, row, labelCol, 1, label, labelFont, labelFill);
  put(ws, row, valueCol, span, value, dataFont);
};
export const generateCompressiveStrengthExcel = async (options: CompressiveExcelOptions) => {
  const o = options;
  // Images are optional; a missing logo or stamp must not stop the export.
  let images: Awaited<ReturnType<typeof fetchAdminImagesAsBase64>> = {};
  try {
    images = await fetchAdminImagesAsBase64();
  } catch (error) {
    console.warn("[Compressive Excel] Could not load header images, exporting without them:", error);
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = "Lab Data Craft";
  wb.created = new Date();
  const ws = wb.addWorksheet("Cube Results");

  const cols = CUBE_SHEET_COLUMNS;
  const lastCol = 1 + cols.length;
  ws.getColumn(1).width = 3;
  cols.forEach((col, index) => { ws.getColumn(2 + index).width = col.w * 1.6; });

  let row = 1;
  if (images.logo) {
    try {
      const logoId = wb.addImage({ base64: base64FromDataUrl(images.logo), extension: "png" });
      ws.addImage(logoId, { tl: { col: 1, row: 0 }, ext: { width: 120, height: 40 } });
    } catch (error) {
      console.warn("[Compressive Excel] Logo could not be embedded:", error);
    }
    row = 3;
  }
  if (o.labOrganization) {
    const cell = ws.getCell(row, lastCol);
    cell.value = o.labOrganization;
    cell.font = labelFont;
    cell.alignment = { horizontal: "right" };
    row += 2;
  }

  const title = put(ws, row, 2, cols.length, "COMPRESSIVE STRENGTH OF CONCRETE CUBES",
    { bold: true, size: 14, name: "Arial" });
  title.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(row).height = 22;
  row += 1;
  put(ws, row, 2, cols.length, "BS EN 12390 - 3 : 2002", { size: 10, name: "Arial" });
  row += 2;

  // Identification block: two label/value pairs per row, as on the sheet.
  const half = Math.ceil(cols.length / 2);
  const pairs: [string, string, string, string][] = [
    ["PROJECT", o.projectName || "", "CLIENT", o.clientName || ""],
    ["CONTRACTOR", o.record.contractor || "", "COUNTY", o.record.county || ""],
    ["CONCRETE CLASS", o.record.concreteClass || "", "SECTION", o.record.section || ""],
    ["MADE BY", o.record.madeBy || "", "SLUMP", o.record.slump || ""],
    ["CLIENT REF", o.record.clientRef || "", "LAB REF", o.record.labRef || ""],
    ["DATE CASTED", formatReportDate(o.record.dateCasted), "DATE REPORTED", formatReportDate(o.dateReported ?? "")],
  ];
  for (const [leftLabel, leftValue, rightLabel, rightValue] of pairs) {
    putField(ws, row, 2, 3, half - 1, leftLabel, leftValue);
    putField(ws, row, 2 + half, 3 + half, cols.length - half, rightLabel, rightValue);
    row += 1;
  }
  row += 1;

  // Headings. Grouped columns get their merged heading on the first line and
  // their own letter on the second, exactly like the printed sheet.
  cols.forEach((col, index) => {
    put(ws, row, 2 + index, 1, col.group ?? col.label, { ...labelFont, size: 9 }, headingFill);
  });
  row += 1;
  cols.forEach((col, index) => {
    put(ws, row, 2 + index, 1, col.group ? col.label : "", { ...labelFont, size: 9 }, headingFill);
  });
  row += 1;

  // Only cubes that can produce a strength are listed.
  const printable = o.rows.filter((cube) => strengthOf(cube) !== null);
  const classTarget = cubeStrengthFromClass(o.record.concreteClass);
  for (const cube of printable) {
    cubeSheetValues(cube, classTarget).forEach((value, index) => {
      // The printed sheet's trailing spacer column is not useful in a spreadsheet.
      if (index >= cols.length) return;
      put(ws, row, 2 + index, 1, value, index === 10 ? { ...dataFont, bold: true } : dataFont);
    });
    row += 1;
  }
  row += 1;

  ws.getCell(row, 2).value = "Terms and Conditions";
  ws.getCell(row, 2).font = labelFont;
  row += 1;
  TERMS.forEach((term, index) => {
    const cell = ws.getCell(row, 2);
    cell.value = `${index + 1}.  ${term}`;
    cell.font = { size: 9, name: "Arial" };
    cell.alignment = { wrapText: true, vertical: "top" };
    ws.mergeCells(row, 2, row, lastCol);
    row += 1;
  });
  row += 2;

  const third = Math.floor(cols.length / 3);
  put(ws, row, 2, third, `TESTED BY:  ${o.testedBy || ""}`, labelFont);
  put(ws, row, 2 + third, third, `REPORTED ON:  ${formatReportDate(o.dateReported ?? "")}`, labelFont);
  put(ws, row, 2 + third * 2, cols.length - third * 2, `CHECKED BY:  ${o.checkedBy || ""}`, labelFont);
  row += 2;

  if (images.stamp) {
    try {
      const stampId = wb.addImage({ base64: base64FromDataUrl(images.stamp), extension: "png" });
      ws.addImage(stampId, { tl: { col: lastCol - 4, row: row - 2 }, ext: { width: 80, height: 80 } });
    } catch (error) {
      console.warn("[Compressive Excel] Stamp could not be embedded:", error);
    }
  }

  // Landscape, so the wide table prints the same way the PDF sheet does.
  ws.pageSetup = {
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    paperSize: 9,
  };

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  if (o.skipDownload) return blob;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(o.projectName || "Compressive_Strength").replace(/[^\w-]+/g, "_")}_Cubes.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
  return blob;
};