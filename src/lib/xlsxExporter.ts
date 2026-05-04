import ExcelJS from "exceljs";
import type {
  AtterbergProjectState,
  AtterbergRecord,
  LiquidLimitTrial,
  PlasticLimitTrial,
  ShrinkageLimitTrial,
} from "@/context/TestDataContext";
import {
  calculateMoistureFromMass,
  getTrialMoisture,
  calculateLiquidLimit,
  calculatePlasticLimit,
  calculateLinearShrinkage,
  calculatePlasticityIndex,
  calculateModulusOfPlasticity,
} from "./atterbergCalculations";
import { fetchAdminImagesAsBase64 } from "./imageUtils";

interface ExportOptions {
  projectName?: string;
  clientName?: string;
  date?: string;
  projectState: AtterbergProjectState;
  records: AtterbergRecord[];
  skipDownload?: boolean;
  chartImages?: { [key: string]: string }; // recordId -> base64 image data URL
}

const thin: Partial<ExcelJS.Border> = { style: "thin" };
const allThin: Partial<ExcelJS.Borders> = { top: thin, bottom: thin, left: thin, right: thin };
const labelFont: Partial<ExcelJS.Font> = { bold: true, size: 10, name: "Arial" };
const valueFont: Partial<ExcelJS.Font> = { size: 10, name: "Arial" };
const headerFont: Partial<ExcelJS.Font> = { bold: true, size: 12, name: "Arial" };
const dataFont: Partial<ExcelJS.Font> = { size: 11, name: "Arial" };
const dataBoldFont: Partial<ExcelJS.Font> = { bold: true, size: 11, name: "Arial" };

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
  cell.font = font;
  if (border) cell.border = border;
  return cell;
};

const num = (v: string | undefined): number | null => {
  if (!v || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

// Helper to extract base64 string from data URL
const extractBase64FromDataUrl = (dataUrl: string): string => {
  if (!dataUrl) {
    console.debug("Empty dataUrl passed to extractBase64FromDataUrl");
    return "";
  }
  const match = dataUrl.match(/^data:image\/[^;]+;base64,(.+)$/);
  const result = match ? match[1] : dataUrl;
  return result;
};

// Detect image extension from data URL
const getImageExtension = (dataUrl: string): "png" | "jpeg" => {
  const m = dataUrl.match(/^data:image\/([\w+]+);/);
  if (!m) return "png";
  const type = m[1].toLowerCase();
  return type === "jpeg" || type === "jpg" ? "jpeg" : "png";
};

export const generateAtterbergXLSX = async (
  options: ExportOptions
): Promise<Blob | void> => {
  const { projectName, clientName, projectState, records, skipDownload } =
    options;

  const wb = new ExcelJS.Workbook();
  wb.creator = "Lab Data Craft";
  wb.created = new Date();

  // Fetch admin images once for all records (with retry logic)
  let images: Partial<Awaited<ReturnType<typeof fetchAdminImagesAsBase64>>> = {};
  try {
    console.log("[XLSX] Fetching admin images for export...");
    images = await fetchAdminImagesAsBase64();
    console.log("[XLSX] Admin images fetch result:", {
      hasLogo: !!images.logo,
      hasContacts: !!images.contacts,
      hasStamp: !!images.stamp,
      logoSize: images.logo ? images.logo.length : 0,
      contactsSize: images.contacts ? images.contacts.length : 0,
      stampSize: images.stamp ? images.stamp.length : 0,
    });

    if (!images.logo && !images.contacts && !images.stamp) {
      console.warn("[XLSX] ⚠️ No images found in database. To add images:");
      console.warn("     1. Go to Admin > Media Library");
      console.warn("     2. Upload Logo, Contacts, and Stamp images");
      console.warn("     3. Export again to include them");
    }
  } catch (error) {
    // Silently fail - images are optional
    console.debug("[XLSX] Error fetching admin images:", error instanceof Error ? error.message : error);
    // Continue with empty images object - images are optional
  }

  for (const record of records) {
    const sheetName = (record.label || record.title || "Record").substring(0, 31);
    const ws = wb.addWorksheet(sheetName);

    // Column widths (approximate match to template)
    ws.getColumn(2).width = 15;
    ws.getColumn(3).width = 6;
    ws.getColumn(4).width = 6;
    ws.getColumn(5).width = 12;
    ws.getColumn(6).width = 12;
    ws.getColumn(7).width = 12;
    ws.getColumn(8).width = 12;
    ws.getColumn(9).width = 12;
    ws.getColumn(10).width = 12;
    ws.getColumn(11).width = 12;

    // Set row heights for image placement (compact header)
    ws.getRow(1).height = 20;
    ws.getRow(2).height = 20;
    ws.getRow(3).height = 20;
    ws.getRow(4).height = 20;

    // Add images: logo (top left, anchored to col B) and contacts (top right, anchored to col K)
    let imagesAddedCount = 0;

    if (images.logo) {
      try {
        console.debug(`[XLSX] Adding logo image to worksheet for record: ${sheetName}`);
        const base64String = extractBase64FromDataUrl(images.logo);
        if (base64String && base64String.length > 0) {
          const logoId = wb.addImage({
            base64: base64String,
            extension: getImageExtension(images.logo),
          });
          // Anchor logo at column B (left content margin)
          ws.addImage(logoId, {
            tl: { col: 1, row: 0 },
            ext: { width: 260, height: 80 },
          });
          console.debug("[XLSX] Logo image added");
          imagesAddedCount++;
        } else {
          console.debug("[XLSX] Logo not available, skipping");
        }
      } catch (error) {
        console.debug("[XLSX] Could not add logo image:", error instanceof Error ? error.message : error);
      }
    }

    if (images.contacts) {
      try {
        console.debug(`[XLSX] Adding contacts image to worksheet for record: ${sheetName}`);
        const base64String = extractBase64FromDataUrl(images.contacts);
        if (base64String && base64String.length > 0) {
          const contactsId = wb.addImage({
            base64: base64String,
            extension: getImageExtension(images.contacts),
          });
          // Anchor contacts so its right edge sits at column K (right content margin)
          ws.addImage(contactsId, {
            tl: { col: 8.4, row: 0 },
            ext: { width: 260, height: 80 },
          });
          console.debug("[XLSX] Contacts image added");
          imagesAddedCount++;
        } else {
          console.debug("[XLSX] Contacts image not available, skipping");
        }
      } catch (error) {
        console.debug("[XLSX] Could not add contacts image:", error instanceof Error ? error.message : error);
      }
    }

    // Stamp image will be added near the footer "Checked by" section later
    const stampBase64 = images.stamp ? extractBase64FromDataUrl(images.stamp) : null;
    const stampExtension = images.stamp ? getImageExtension(images.stamp) : "png";

    if (imagesAddedCount > 0) {
      console.debug(`[XLSX] Sheet images complete: ${imagesAddedCount}/3 images added to ${sheetName}`);
    }

    // Row 10: Title (moved down to accommodate images)
    ws.mergeCells("B10:K10");
    setCell(ws, 10, 2, "ATTERBERG LIMITS (BS 1377 PART 2, 4.3 : 1990)", headerFont, allThin);

    // Row 13: Client name
    ws.mergeCells("B13:D13");
    ws.mergeCells("E13:K13");
    setCell(ws, 13, 2, "Client name:", labelFont, allThin);
    setCell(ws, 13, 5, clientName || projectState.clientName || "", { ...valueFont, bold: true, size: 11 }, allThin);

    // Row 14: Project/Site name
    ws.mergeCells("B14:D14");
    ws.mergeCells("E14:K14");
    setCell(ws, 14, 2, "Project/Site name:", labelFont, allThin);
    setCell(ws, 14, 5, projectName || projectState.projectName || "", { ...valueFont, bold: true, size: 11 }, allThin);

    // Row 15: Sampled by, dates
    ws.mergeCells("B15:D15");
    setCell(ws, 15, 2, "Sampled and submitted by:", labelFont, allThin);
    setCell(ws, 15, 5, projectState.labOrganization || "", valueFont, allThin);
    ws.mergeCells("F15:G15");
    setCell(ws, 15, 6, "Date submitted:", labelFont, allThin);
    setCell(ws, 15, 8, record.dateSubmitted || "", valueFont, allThin);
    setCell(ws, 15, 9, "Date tested:", labelFont, allThin);
    ws.mergeCells("J15:K15");
    setCell(ws, 15, 10, record.dateTested || "", valueFont, allThin);

    // Row 16: Sample ID, depth, sample no
    ws.mergeCells("B16:D16");
    setCell(ws, 16, 2, "Sample ID:", labelFont, allThin);
    setCell(ws, 16, 5, record.label || "", valueFont, allThin);
    ws.mergeCells("F16:G16");
    setCell(ws, 16, 6, "Sample depth (M):", labelFont, allThin);
    setCell(ws, 16, 8, "", valueFont, allThin);
    setCell(ws, 16, 9, "Sample No:", labelFont, allThin);
    ws.mergeCells("J16:K16");
    setCell(ws, 16, 10, record.sampleNumber || "-", valueFont, allThin);

    // Row 17: spacer with border
    ws.mergeCells("B17:K17");
    for (let c = 2; c <= 11; c++) setCell(ws, 17, c, null, dataFont, allThin);

    // Row 18: Record notes (if present)
    let dataStartRow = 18;
    if (record.note && record.note.trim()) {
      ws.mergeCells("B18:K18");
      setCell(ws, 18, 2, "Notes:", labelFont, allThin);
      ws.mergeCells("B19:K21");
      const noteCell = ws.getCell("B19");
      noteCell.value = record.note;
      noteCell.font = valueFont;
      noteCell.border = allThin;
      noteCell.alignment = { vertical: "top", horizontal: "left", wrapText: true };
      ws.getRow(19).height = 20;
      dataStartRow = 22;
    }

    // Find LL, PL, SL tests
    const llTest = record.tests.find((t) => t.type === "liquidLimit");
    const plTest = record.tests.find((t) => t.type === "plasticLimit");
    const slTest = record.tests.find((t) => t.type === "shrinkageLimit");

    const llTrials = (llTest?.type === "liquidLimit" ? llTest.trials : []) as LiquidLimitTrial[];
    const plTrials = (plTest?.type === "plasticLimit" ? plTest.trials : []) as PlasticLimitTrial[];
    const slTrials = (slTest?.type === "shrinkageLimit" ? slTest.trials : []) as ShrinkageLimitTrial[];

    const dataLabels = [
      "Container No",
      "Penetration (mm)",
      "Wt of Container + Wet Soil (g)",
      "Wt of Container + Dry Soil (g)",
      "Wt of Container (g)",
      "Wt of Moisture (g)",
      "Wt of Dry Soil (g)",
      "Moisture Content (%)",
    ];

    const plFill = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFFFEB99" } };
    const llHeaderFill = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFF0F4FF" } };
    const moistureFill = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFDCE6F5" } };

    // Limit columns to fit within B:K (cols 2-11 = 10 cols total; label uses B:D = 3 cols, leaves 7 trial cols E:K)
    const MAX_TRIAL_COLS = 7;
    const llCount = Math.min(llTrials.length, MAX_TRIAL_COLS);
    const plCount = Math.min(plTrials.length, MAX_TRIAL_COLS - llCount);

    // ── Combined trials table header row ──
    const tableHeaderRow = dataStartRow;
    ws.mergeCells(tableHeaderRow, 2, tableHeaderRow, 4);
    setCell(ws, tableHeaderRow, 2, "Test Type →", dataBoldFont, allThin);

    for (let t = 0; t < llCount; t++) {
      const col = 5 + t;
      const cell = setCell(ws, tableHeaderRow, col, `LL Trial ${t + 1}`, dataBoldFont, allThin);
      cell.fill = llHeaderFill;
      cell.alignment = { horizontal: "center" };
    }
    for (let p = 0; p < plCount; p++) {
      const col = 5 + llCount + p;
      const cell = setCell(ws, tableHeaderRow, col, `PL Trial ${p + 1}`, dataBoldFont, allThin);
      cell.fill = plFill;
      cell.alignment = { horizontal: "center" };
    }
    // Fill any unused cols with borders
    for (let col = 5 + llCount + plCount; col <= 11; col++) {
      setCell(ws, tableHeaderRow, col, "", dataFont, allThin);
    }

    // ── Data rows ──
    for (let i = 0; i < dataLabels.length; i++) {
      const row = tableHeaderRow + 1 + i;
      ws.mergeCells(row, 2, row, 4);
      setCell(ws, row, 2, dataLabels[i], dataBoldFont, allThin);

      const isMoistureRow = i === 7;

      // LL trials
      for (let t = 0; t < llCount; t++) {
        const col = 5 + t;
        const trial = llTrials[t];
        const wet = num(trial.containerWetMass);
        const dry = num(trial.containerDryMass);
        const cont = num(trial.containerMass);
        const mc = getTrialMoisture(trial);
        const mcNum = mc ? Number(mc) : null;
        const drySoilMass = dry !== null && cont !== null ? round2(dry - cont) : null;
        let waterMass = wet !== null && dry !== null ? round2(wet - dry) : null;
        let wetCalc = wet;
        if (waterMass === null && drySoilMass !== null && drySoilMass > 0 && mcNum !== null) {
          waterMass = round2((drySoilMass * mcNum) / 100);
        }
        if (wetCalc === null && dry !== null && waterMass !== null) {
          wetCalc = round2(dry + waterMass);
        }

        let value: string | number | null = "-";
        switch (i) {
          case 0: value = trial.containerNo || ""; break;
          case 1: value = num(trial.penetration); break;
          case 2: value = wetCalc ?? (wet !== null ? wet : "-"); break;
          case 3: value = dry; break;
          case 4: value = cont; break;
          case 5: value = waterMass !== null ? waterMass : "-"; break;
          case 6: value = drySoilMass !== null ? drySoilMass : "-"; break;
          case 7: value = mcNum !== null ? mcNum : "-"; break;
        }
        const cell = setCell(ws, row, col, value, isMoistureRow ? dataBoldFont : dataFont, allThin);
        if (isMoistureRow) cell.fill = moistureFill;
        cell.alignment = { horizontal: "center" };
      }

      // PL trials
      for (let p = 0; p < plCount; p++) {
        const col = 5 + llCount + p;
        const trial = plTrials[p];
        const wet = num(trial.containerWetMass);
        const dry = num(trial.containerDryMass);
        const cont = num(trial.containerMass);
        const mc = getTrialMoisture(trial);
        const mcNum = mc ? Number(mc) : null;
        const drySoilMass = dry !== null && cont !== null ? round2(dry - cont) : null;
        let waterMass = wet !== null && dry !== null ? round2(wet - dry) : null;
        let wetCalc = wet;
        if (waterMass === null && drySoilMass !== null && drySoilMass > 0 && mcNum !== null) {
          waterMass = round2((drySoilMass * mcNum) / 100);
        }
        if (wetCalc === null && dry !== null && waterMass !== null) {
          wetCalc = round2(dry + waterMass);
        }

        let value: string | number | null = "-";
        switch (i) {
          case 0: value = trial.containerNo || ""; break;
          case 1: value = "-"; break;
          case 2: value = wetCalc ?? (wet !== null ? wet : "-"); break;
          case 3: value = dry; break;
          case 4: value = cont; break;
          case 5: value = waterMass !== null ? waterMass : "-"; break;
          case 6: value = drySoilMass !== null ? drySoilMass : "-"; break;
          case 7: value = mcNum !== null ? mcNum : "-"; break;
        }
        const cell = setCell(ws, row, col, value, isMoistureRow ? dataBoldFont : dataFont, allThin);
        cell.fill = isMoistureRow ? moistureFill : plFill;
        cell.alignment = { horizontal: "center" };
      }

      // Fill unused cols
      for (let col = 5 + llCount + plCount; col <= 11; col++) {
        const cell = setCell(ws, row, col, "", dataFont, allThin);
        if (isMoistureRow) cell.fill = moistureFill;
      }
    }

    let currentDataRow = tableHeaderRow + 1 + dataLabels.length;

    // Recalculate results
    const liquidLimit = record.results.liquidLimit ?? calculateLiquidLimit(llTrials);
    const plasticLimit = record.results.plasticLimit ?? calculatePlasticLimit(plTrials);
    const linearShrinkage = record.results.linearShrinkage ?? calculateLinearShrinkage(slTrials);
    const plasticityIndex = record.results.plasticityIndex ?? calculatePlasticityIndex(liquidLimit, plasticLimit);
    const passing425um = num(record.passing425um);
    const modulusOfPlasticity = record.results.modulusOfPlasticity ?? calculateModulusOfPlasticity(plasticityIndex, record.passing425um);

    // ── Plastic Limit result row (full width, light blue) ──
    currentDataRow += 1;
    ws.mergeCells(`B${currentDataRow}:G${currentDataRow}`);
    const plLabelCell = setCell(ws, currentDataRow, 2, "PLASTIC LIMIT", dataBoldFont, allThin);
    plLabelCell.fill = moistureFill;
    plLabelCell.alignment = { horizontal: "left", indent: 1 };
    ws.mergeCells(`H${currentDataRow}:K${currentDataRow}`);
    const plValueCell = setCell(ws, currentDataRow, 8, plasticLimit ?? "-", dataBoldFont, allThin);
    plValueCell.fill = moistureFill;
    plValueCell.alignment = { horizontal: "center" };

    // ── Two-column section: LEFT chart (B:F) | RIGHT stack (G:K) ──
    currentDataRow += 2;
    const sectionStartRow = currentDataRow;

    // LEFT: Liquid Limit chart header + image area
    ws.mergeCells(`B${sectionStartRow}:F${sectionStartRow}`);
    const chartHeaderCell = ws.getCell(`B${sectionStartRow}`);
    chartHeaderCell.value = "LIQUID LIMIT GRAPH";
    chartHeaderCell.font = { ...dataBoldFont, size: 11, color: { argb: "FFFFFFFF" } };
    chartHeaderCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2962A3" } };
    chartHeaderCell.alignment = { horizontal: "center" };
    chartHeaderCell.border = allThin;

    // Reserve 14 rows for chart image (each ~20px = ~280 height)
    const chartImageStartRow = sectionStartRow + 1;
    const chartImageRows = 14;
    for (let i = 0; i < chartImageRows; i++) {
      ws.getRow(chartImageStartRow + i).height = 20;
      // Add borders around chart area on cols B:F
      for (let col = 2; col <= 6; col++) {
        const cell = ws.getCell(chartImageStartRow + i, col);
        cell.border = allThin;
      }
    }

    if (options.chartImages && options.chartImages[`${record.id}-liquidLimit`]) {
      try {
        const llChartImageData = options.chartImages[`${record.id}-liquidLimit`];
        const llBase64String = extractBase64FromDataUrl(llChartImageData);
        const llChartImageId = wb.addImage({
          base64: llBase64String,
          extension: "png",
        });
        // Anchor within columns B:F (col indices 1..5, 0-indexed) — fits within 5 columns wide
        ws.addImage(llChartImageId, {
          tl: { col: 1, row: chartImageStartRow - 1 },
          ext: { width: 360, height: 280 },
        });
      } catch (error) {
        console.error("Failed to add liquid limit chart:", error instanceof Error ? error.message : error);
      }
    }

    // RIGHT stack: Linear Shrinkage box → Results Summary box → Soil Classification box
    let ry = sectionStartRow;

    // Linear Shrinkage box
    ws.mergeCells(`G${ry}:K${ry}`);
    const lsHeader = ws.getCell(`G${ry}`);
    lsHeader.value = "LINEAR SHRINKAGE";
    lsHeader.font = { ...dataBoldFont, size: 10, color: { argb: "FFFFFFFF" } };
    lsHeader.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2962A3" } };
    lsHeader.alignment = { horizontal: "center" };
    lsHeader.border = allThin;
    ry += 1;

    const slTrial = slTrials[0];
    const lsRows: [string, string | number | null][] = [
      ["Initial length (mm)", slTrial ? num(slTrial.initialLength) ?? 140 : 140],
      ["Final length (mm)", slTrial ? num(slTrial.finalLength) : "-"],
      ["Shrinkage (%)", linearShrinkage ?? "-"],
    ];
    for (const [label, value] of lsRows) {
      ws.mergeCells(`G${ry}:I${ry}`);
      setCell(ws, ry, 7, label, dataBoldFont, allThin);
      ws.mergeCells(`J${ry}:K${ry}`);
      setCell(ws, ry, 10, value, dataFont, allThin);
      ry += 1;
    }
    ry += 1;

    // Results Summary box
    ws.mergeCells(`G${ry}:K${ry}`);
    const summaryHeader = ws.getCell(`G${ry}`);
    summaryHeader.value = "RESULTS SUMMARY";
    summaryHeader.font = { ...dataBoldFont, size: 10, color: { argb: "FFFFFFFF" } };
    summaryHeader.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2962A3" } };
    summaryHeader.alignment = { horizontal: "center" };
    summaryHeader.border = allThin;
    ry += 1;

    const summaryLabels: [string, string | number | null | undefined][] = [
      ["LIQUID LIMIT (%)", liquidLimit],
      ["PLASTIC LIMIT (%)", plasticLimit],
      ["PLASTICITY INDEX (%)", plasticityIndex],
      ["Passing 425 µm (%)", passing425um],
      ["MODULUS OF PLASTICITY", modulusOfPlasticity],
      ["LINEAR SHRINKAGE (%)", linearShrinkage],
    ];
    for (const [label, value] of summaryLabels) {
      ws.mergeCells(`G${ry}:I${ry}`);
      setCell(ws, ry, 7, label, dataBoldFont, allThin);
      ws.mergeCells(`J${ry}:K${ry}`);
      setCell(ws, ry, 10, value ?? "-", dataBoldFont, allThin);
      ry += 1;
    }
    ry += 1;

    // Soil Classification box
    ws.mergeCells(`G${ry}:K${ry}`);
    const classHeader = ws.getCell(`G${ry}`);
    classHeader.value = "SOIL CLASSIFICATION";
    classHeader.font = { ...dataBoldFont, size: 10, color: { argb: "FFFFFFFF" } };
    classHeader.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2962A3" } };
    classHeader.alignment = { horizontal: "center" };
    classHeader.border = allThin;
    ry += 1;

    let uscsCode = "";
    let uscsDesc = "";
    if (plasticLimit !== null && liquidLimit !== null) {
      const pi = plasticityIndex ?? 0;
      if (pi < 4) {
        uscsCode = liquidLimit < 50 ? "ML" : "MH";
        uscsDesc = liquidLimit < 50 ? "SILT OF LOW PLASTICITY" : "SILT OF HIGH PLASTICITY";
      } else if (pi >= 4 && pi < 7) {
        uscsCode = "CL-ML";
        uscsDesc = "SILTY CLAY OF LOW PLASTICITY";
      } else {
        uscsCode = liquidLimit < 50 ? "CL" : "CH";
        uscsDesc = liquidLimit < 50 ? "CLAY OF LOW PLASTICITY" : "CLAY OF HIGH PLASTICITY";
      }
    }
    let aashtoCode = "";
    if (liquidLimit !== null && plasticityIndex !== null && plasticityIndex !== undefined) {
      const pi = plasticityIndex;
      const ll = liquidLimit;
      if (ll <= 40 && pi <= 10) aashtoCode = "A-4";
      else if (ll <= 40 && pi > 10) aashtoCode = "A-6";
      else if (ll > 40 && pi <= 10) aashtoCode = "A-5";
      else if (ll > 40 && pi > 10) aashtoCode = pi <= ll - 30 ? "A-7-5" : "A-7-6";
    }

    setCell(ws, ry, 7, "USCS", dataBoldFont, allThin);
    ws.mergeCells(`H${ry}:J${ry}`);
    setCell(ws, ry, 8, uscsDesc, dataFont, allThin);
    setCell(ws, ry, 11, uscsCode, dataBoldFont, allThin);
    ry += 1;
    setCell(ws, ry, 7, "AASHTO", dataBoldFont, allThin);
    ws.mergeCells(`H${ry}:K${ry}`);
    setCell(ws, ry, 8, aashtoCode, dataBoldFont, allThin);
    ry += 1;

    // Move past chart and right stack
    const chartEndRow = chartImageStartRow + chartImageRows;
    currentDataRow = Math.max(chartEndRow, ry) + 2;

    // ── Footer: Tested by / Date reported / Checked by + stamp ──
    const footerRow = currentDataRow;
    ws.getRow(footerRow).height = 30;
    setCell(ws, footerRow, 2, "Tested by:", dataBoldFont, null);
    ws.mergeCells(`C${footerRow}:D${footerRow}`);
    setCell(ws, footerRow, 3, record.testedBy || "____________", dataFont, null);
    setCell(ws, footerRow, 5, "Date reported:", dataBoldFont, null);
    ws.mergeCells(`F${footerRow}:G${footerRow}`);
    setCell(ws, footerRow, 6, projectState.dateReported || "____________", dataFont, null);
    setCell(ws, footerRow, 8, "Checked by:", dataBoldFont, null);
    ws.mergeCells(`I${footerRow}:K${footerRow}`);
    setCell(ws, footerRow, 9, projectState.checkedBy || "____________", dataBoldFont, null);

    // Stamp image positioned over Checked by area
    if (stampBase64 && stampBase64.length > 0) {
      try {
        const stampId = wb.addImage({
          base64: stampBase64,
          extension: stampExtension,
        });
        ws.addImage(stampId, {
          tl: { col: 8, row: footerRow - 2 },
          ext: { width: 180, height: 80 },
        });
        imagesAddedCount++;
      } catch (error) {
        console.debug("[XLSX] Could not add stamp image:", error instanceof Error ? error.message : error);
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
  }

  // Write and download Excel file
  console.log("[XLSX] Writing Excel workbook to buffer...");
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  console.log("[XLSX] ════════════════════════════════════════");
  console.log(`[XLSX] ✓ Excel export complete!`);
  console.log("[XLSX] File summary:", {
    worksheetCount: wb.worksheets.length,
    fileSizeBytes: blob.size,
    fileSizeMB: (blob.size / 1024 / 1024).toFixed(2),
  });
  console.log("[XLSX] ════════════════════════════════════════");

  if (skipDownload) {
    console.log("[XLSX] Returning blob without automatic download");
    return blob;
  }

  const filename = `Atterberg_Limits_${(projectName || "export").replace(/\s+/g, "_")}.xlsx`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  console.log(`[XLSX] Initiating download: ${filename}`);
  a.click();
  URL.revokeObjectURL(url);
  console.log("[XLSX] Download initiated successfully");
};
