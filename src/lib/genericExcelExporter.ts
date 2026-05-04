import ExcelJS from "exceljs";
import { fetchAdminImagesAsBase64, type AdminImages } from "./imageUtils";

interface PDFData {
  title: string;
  projectName?: string;
  clientName?: string;
  date?: string;
  labOrganization?: string;
  dateReported?: string;
  checkedBy?: string;
  fields?: { label: string; value: string }[];
  tables?: {
    title?: string;
    headers: string[];
    rows: string[][];
  }[];
}

interface GenericExcelExportOptions {
  data: PDFData & { chartImages?: { [key: string]: string } };
  projectName?: string;
  clientName?: string;
  date?: string;
  labOrganization?: string;
  dateReported?: string;
  checkedBy?: string;
  skipDownload?: boolean;
}

const thin: Partial<ExcelJS.Border> = { style: "thin" };
const allThin: Partial<ExcelJS.Borders> = { top: thin, bottom: thin, left: thin, right: thin };
const labelFont: Partial<ExcelJS.Font> = { bold: true, size: 10, name: "Arial" };
const headerFont: Partial<ExcelJS.Font> = { bold: true, size: 12, name: "Arial" };
const dataFont: Partial<ExcelJS.Font> = { size: 10, name: "Arial" };
const titleFont: Partial<ExcelJS.Font> = { bold: true, size: 14, name: "Arial" };

// Helper to extract base64 string from data URL
const extractBase64FromDataUrl = (dataUrl: string): string => {
  if (!dataUrl) {
    console.warn("Empty dataUrl passed to extractBase64FromDataUrl");
    return "";
  }
  const match = dataUrl.match(/^data:image\/\w+;base64,(.+)$/);
  const result = match ? match[1] : dataUrl;
  return result;
};

const setCell = (
  ws: ExcelJS.Worksheet,
  row: number,
  col: number,
  value: string | number | null | undefined,
  font: Partial<ExcelJS.Font> = dataFont,
  border: Partial<ExcelJS.Borders> | null = allThin,
) => {
  const cell = ws.getCell(row, col);
  if (value !== null && value !== undefined) cell.value = value;
  if (font) cell.font = font;
  if (border) cell.border = border;
  return cell;
};

export const generateTestExcel = async (
  options: GenericExcelExportOptions
): Promise<Blob | void> => {
  const { data, skipDownload } = options;

  const wb = new ExcelJS.Workbook();
  wb.creator = "Lab Data Craft";
  wb.created = new Date();

  // Fetch admin images for header/footer
  let images: Partial<Awaited<ReturnType<typeof fetchAdminImagesAsBase64>>> = {};
  try {
    images = await fetchAdminImagesAsBase64();
  } catch (error) {
    console.warn("Failed to fetch admin images for export, continuing without them:", error instanceof Error ? error.message : error);
    // Continue with empty images object - images are optional
  }

  const ws = wb.addWorksheet("Test Report");

  // Set column widths
  ws.getColumn(1).width = 2;
  for (let i = 2; i <= 12; i++) {
    ws.getColumn(i).width = 12;
  }

  let currentRow = 1;
  const pageWidth = 12; // Column count
  const margin = 1; // Column margin

  // ── Header Section with Logo & Contacts ──
  ws.getRow(currentRow).height = 24;

  if (images.logo) {
    try {
      const base64String = extractBase64FromDataUrl(images.logo);
      const logoId = wb.addImage({
        base64: base64String,
        extension: "png",
      });
      ws.addImage(logoId, {
        tl: { col: 1, row: currentRow - 1 },
        ext: { width: 90, height: 24 },
      });
    } catch (error) {
      console.error("Failed to add logo image:", error);
    }
  }

  if (images.contacts) {
    try {
      const base64String = extractBase64FromDataUrl(images.contacts);
      const contactsId = wb.addImage({
        base64: base64String,
        extension: "png",
      });
      ws.addImage(contactsId, {
        tl: { col: 7, row: currentRow - 1 },
        ext: { width: 90, height: 24 },
      });
    } catch (error) {
      console.error("Failed to add contacts image:", error);
    }
  }

  currentRow += 2;

  // ── Title Section ──
  ws.mergeCells(currentRow, 2, currentRow, 11);
  const titleCell = ws.getCell(currentRow, 2);
  titleCell.value = data.title || "Test Report";
  titleCell.font = titleFont;
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2962A3" } };
  titleCell.font = { ...titleFont, color: { argb: "FFFFFFFF" } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  currentRow += 1;

  // ── Metadata Section ──
  const metadataFields = [
    { label: "Project Name", value: data.projectName || "-" },
    { label: "Client Name", value: data.clientName || "-" },
    { label: "Lab Organization", value: data.labOrganization || "-" },
    { label: "Date Tested", value: data.date || "-" },
    { label: "Date Reported", value: data.dateReported || "-" },
    { label: "Checked By", value: data.checkedBy || "-" },
  ];

  currentRow += 1;
  for (const field of metadataFields) {
    ws.mergeCells(currentRow, 2, currentRow, 3);
    setCell(ws, currentRow, 2, field.label, labelFont, allThin);
    ws.mergeCells(currentRow, 4, currentRow, 11);
    setCell(ws, currentRow, 4, field.value, dataFont, allThin);
    currentRow += 1;
  }

  // ── Results Summary Fields ──
  if (data.fields && data.fields.length > 0) {
    currentRow += 1;
    ws.mergeCells(currentRow, 2, currentRow, 11);
    const summaryHeader = ws.getCell(currentRow, 2);
    summaryHeader.value = "Test Results Summary";
    summaryHeader.font = { ...labelFont, size: 12 };
    summaryHeader.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCE6F5" } };
    currentRow += 1;

    let col = 2;
    let fieldRow = currentRow;
    for (let i = 0; i < data.fields.length; i++) {
      const field = data.fields[i];
      if (col > 11) {
        col = 2;
        fieldRow += 3;
      }

      ws.mergeCells(fieldRow, col, fieldRow, col + 2);
      setCell(ws, fieldRow, col, field.label, labelFont, allThin);
      ws.mergeCells(fieldRow + 1, col, fieldRow + 1, col + 2);
      setCell(ws, fieldRow + 1, col, field.value || "-", dataFont, allThin);
      col += 3;
    }
    currentRow = fieldRow + 3;
  }

  // ── Data Tables ──
  if (data.tables && data.tables.length > 0) {
    currentRow += 2;
    for (const table of data.tables) {
      if (table.title) {
        ws.mergeCells(currentRow, 2, currentRow, 11);
        const tableHeader = ws.getCell(currentRow, 2);
        tableHeader.value = table.title;
        tableHeader.font = { ...labelFont, size: 11 };
        tableHeader.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCE6F5" } };
        currentRow += 1;
      }

      // Table headers
      ws.getRow(currentRow).height = 20;
      for (let i = 0; i < table.headers.length; i++) {
        const cell = ws.getCell(currentRow, 2 + i);
        cell.value = table.headers[i];
        cell.font = { ...labelFont, size: 9 };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2962A3" } };
        cell.font = { ...labelFont, size: 9, color: { argb: "FFFFFFFF" } };
        cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
        cell.border = allThin;
      }
      currentRow += 1;

      // Table rows
      let alternateRow = false;
      for (const row of table.rows) {
        for (let i = 0; i < row.length; i++) {
          const cell = ws.getCell(currentRow, 2 + i);
          cell.value = row[i] || "-";
          cell.font = dataFont;
          if (alternateRow) {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F7FA" } };
          }
          cell.border = allThin;
          cell.alignment = { horizontal: "center" };
        }
        alternateRow = !alternateRow;
        currentRow += 1;
      }

      currentRow += 1;
    }
  }

  // ── Chart Images ──
  if (data.chartImages && Object.keys(data.chartImages).length > 0) {
    currentRow += 2;
    ws.mergeCells(currentRow, 2, currentRow, 11);
    const chartHeader = ws.getCell(currentRow, 2);
    chartHeader.value = "Charts & Graphs";
    chartHeader.font = { ...labelFont, size: 12 };
    chartHeader.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCE6F5" } };
    currentRow += 2;

    for (const [chartName, chartBase64] of Object.entries(data.chartImages)) {
      if (chartBase64) {
        try {
          const base64String = extractBase64FromDataUrl(chartBase64);
          const chartImageId = wb.addImage({
            base64: base64String,
            extension: "png",
          });
          ws.addImage(chartImageId, {
            tl: { col: 2, row: currentRow - 1 },
            ext: { width: 200, height: 120 },
          });
          currentRow += 7;
        } catch (error) {
          console.error(`Failed to add chart image (${chartName}):`, error);
        }
      }
    }
  }

  // ── Footer with Stamp ──
  currentRow += 3;
  if (images.stamp) {
    try {
      const base64String = extractBase64FromDataUrl(images.stamp);
      const stampId = wb.addImage({
        base64: base64String,
        extension: "png",
      });
      ws.addImage(stampId, {
        tl: { col: 9, row: currentRow - 1 },
        ext: { width: 60, height: 60 },
      });
    } catch (error) {
      console.error("Failed to add stamp image:", error);
    }
  }

  // Print setup
  ws.pageSetup = {
    orientation: "portrait",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    paperSize: 9, // A4
  };

  // Generate file
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  if (skipDownload) {
    return blob;
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(data.title || "Test_Report").replace(/\s+/g, "_")}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
};
