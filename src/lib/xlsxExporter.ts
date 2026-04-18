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

    // Data table - support unlimited trials
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

    // Calculate total trials width needed
    const totalLLTrials = llTrials.length;
    const totalPLTrials = plTrials.length;
    const trialsPerRow = 5; // Trials per row to keep columns reasonable
    const llRowsNeeded = Math.ceil(totalLLTrials / trialsPerRow);
    const plRowsNeeded = Math.ceil(totalPLTrials / trialsPerRow);

    let currentDataRow = dataStartRow;

    // Add LL trials section header if there are trials
    if (totalLLTrials > 0) {
      ws.mergeCells(`B${currentDataRow}:K${currentDataRow}`);
      const headerCell = ws.getCell(`B${currentDataRow}`);
      headerCell.value = "LIQUID LIMIT TEST";
      headerCell.font = { ...headerFont, size: 11, color: { argb: "FF2962A3" } };
      headerCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCE6F5" } };
      headerCell.border = allThin;
      currentDataRow += 1;
    }

    // Add LL trials
    for (let llRowIdx = 0; llRowIdx < llRowsNeeded; llRowIdx++) {
      const startTrialIdx = llRowIdx * trialsPerRow;
      const endTrialIdx = Math.min(startTrialIdx + trialsPerRow, totalLLTrials);

      // Determine how many PL trials can fit in remaining columns (only for first LL batch)
      let plTrialsToShow: PlasticLimitTrial[] = [];
      if (llRowIdx === 0 && totalPLTrials > 0) {
        const firstLLCount = endTrialIdx - startTrialIdx;
        const nextAvailableCol = 5 + firstLLCount; // Next column after LL trials
        const remainingColumns = 12 - nextAvailableCol; // Up to column 11 (K), or beyond if needed
        plTrialsToShow = plTrials.slice(0, Math.max(1, remainingColumns)); // Show at least 1 if space available
      }

      // Add trial number header row
      ws.mergeCells(`B${currentDataRow}:D${currentDataRow}`);
      setCell(ws, currentDataRow, 2, "", dataFont, allThin);
      for (let t = startTrialIdx; t < endTrialIdx; t++) {
        const col = 5 + (t - startTrialIdx);
        const trial = llTrials[t];
        const headerCell = ws.getCell(currentDataRow, col);
        headerCell.value = `Trial ${t + 1}${trial.containerNo ? ` (${trial.containerNo})` : ""}`;
        headerCell.font = { ...dataBoldFont, size: 10 };
        headerCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F4FF" } };
        headerCell.border = allThin;
        headerCell.alignment = { horizontal: "center" };
      }

      // Add PL trial headers if showing any
      for (let p = 0; p < plTrialsToShow.length; p++) {
        const col = 5 + (endTrialIdx - startTrialIdx) + p;
        const trial = plTrialsToShow[p];
        const headerCell = ws.getCell(currentDataRow, col);
        headerCell.value = `PL Trial ${p + 1}${trial.containerNo ? ` (${trial.containerNo})` : ""}`;
        headerCell.font = { ...dataBoldFont, size: 10 };
        headerCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFEB99" } }; // Light yellow for PL
        headerCell.border = allThin;
        headerCell.alignment = { horizontal: "center" };
      }

      // Fill remaining columns with borders
      for (let col = 5 + (endTrialIdx - startTrialIdx) + plTrialsToShow.length; col <= 11; col++) {
        const headerCell = ws.getCell(currentDataRow, col);
        headerCell.border = allThin;
      }
      currentDataRow += 1;

      for (let i = 0; i < dataLabels.length; i++) {
        const row = currentDataRow + i;

        // Label column
        if (llRowIdx === 0) {
          ws.mergeCells(row, 2, row, 4);
          setCell(ws, row, 2, dataLabels[i], dataBoldFont, allThin);
        } else {
          // On subsequent rows, add trial number indicator
          ws.mergeCells(row, 2, row, 4);
          setCell(ws, row, 2, `${dataLabels[i]} (cont.)`, dataBoldFont, allThin);
        }

        // Trial data columns - LL trials
        for (let t = startTrialIdx; t < endTrialIdx; t++) {
          const col = 5 + (t - startTrialIdx);
          const trial = llTrials[t];
          const wet = num(trial.containerWetMass);
          const dry = num(trial.containerDryMass);
          const cont = num(trial.containerMass);
          const mc = getTrialMoisture(trial);
          const mcNum = mc ? Number(mc) : null;

          // Compute derived values, back-calculating where possible
          const drySoilMass = dry !== null && cont !== null ? round2(dry - cont) : null;
          let waterMass = wet !== null && dry !== null ? round2(wet - dry) : null;
          let wetCalc = wet;

          // Back-calculate if moisture% and dry soil mass are known but wet mass isn't
          if (waterMass === null && drySoilMass !== null && drySoilMass > 0 && mcNum !== null) {
            waterMass = round2((drySoilMass * mcNum) / 100);
          }
          if (wetCalc === null && dry !== null && waterMass !== null) {
            wetCalc = round2(dry + waterMass);
          }

          switch (i) {
            case 0: // Container No
              setCell(ws, row, col, trial.containerNo || "", dataFont, allThin);
              break;
            case 1: // Penetration
              setCell(ws, row, col, num(trial.penetration), dataBoldFont, allThin);
              break;
            case 2: // Cont + Wet
              setCell(ws, row, col, wetCalc ?? (wet !== null ? wet : "-"), dataFont, allThin);
              break;
            case 3: // Cont + Dry
              setCell(ws, row, col, dry, dataFont, allThin);
              break;
            case 4: // Container
              setCell(ws, row, col, cont, dataFont, allThin);
              break;
            case 5: // Wt Moisture (calculated)
              setCell(ws, row, col, waterMass !== null ? waterMass : "-", dataFont, allThin);
              break;
            case 6: // Wt Dry Soil (calculated)
              setCell(ws, row, col, drySoilMass !== null ? drySoilMass : "-", dataFont, allThin);
              break;
            case 7: // Moisture %
              setCell(ws, row, col, mcNum !== null ? mcNum : "-", dataBoldFont, allThin);
              break;
          }
        }

        // Trial data columns - PL trials shown in LL table
        for (let p = 0; p < plTrialsToShow.length; p++) {
          const col = 5 + (endTrialIdx - startTrialIdx) + p;
          const trial = plTrialsToShow[p];
          const wet = num(trial.containerWetMass);
          const dry = num(trial.containerDryMass);
          const cont = num(trial.containerMass);
          const mc = getTrialMoisture(trial);
          const mcNum = mc ? Number(mc) : null;

          // Compute derived values with back-calculation
          const drySoilMass = dry !== null && cont !== null ? round2(dry - cont) : null;
          let waterMass = wet !== null && dry !== null ? round2(wet - dry) : null;
          let wetCalc = wet;

          if (waterMass === null && drySoilMass !== null && drySoilMass > 0 && mcNum !== null) {
            waterMass = round2((drySoilMass * mcNum) / 100);
          }
          if (wetCalc === null && dry !== null && waterMass !== null) {
            wetCalc = round2(dry + waterMass);
          }

          const plFill = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFFFEB99" } };

          switch (i) {
            case 0: // Container No
              {
                const cell = setCell(ws, row, col, trial.containerNo || "", dataFont, allThin);
                cell.fill = plFill;
              }
              break;
            case 1: // Penetration (not applicable for PL)
              {
                const cell = setCell(ws, row, col, "-", dataFont, allThin);
                cell.fill = plFill;
              }
              break;
            case 2: // Cont + Wet
              {
                const cell = setCell(ws, row, col, wetCalc ?? (wet !== null ? wet : "-"), dataFont, allThin);
                cell.fill = plFill;
              }
              break;
            case 3: // Cont + Dry
              {
                const cell = setCell(ws, row, col, dry, dataFont, allThin);
                cell.fill = plFill;
              }
              break;
            case 4: // Container
              {
                const cell = setCell(ws, row, col, cont, dataFont, allThin);
                cell.fill = plFill;
              }
              break;
            case 5: // Wt Moisture (calculated)
              {
                const cell = setCell(ws, row, col, waterMass !== null ? waterMass : "-", dataFont, allThin);
                cell.fill = plFill;
              }
              break;
            case 6: // Wt Dry Soil (calculated)
              {
                const cell = setCell(ws, row, col, drySoilMass !== null ? drySoilMass : "-", dataFont, allThin);
                cell.fill = plFill;
              }
              break;
            case 7: // Moisture %
              {
                const cell = setCell(ws, row, col, mcNum !== null ? mcNum : "-", dataBoldFont, allThin);
                cell.fill = plFill;
              }
              break;
          }
        }

        // Fill remaining columns with "-"
        for (let col = 5 + (endTrialIdx - startTrialIdx) + plTrialsToShow.length; col <= 11; col++) {
          setCell(ws, row, col, "-", dataFont, allThin);
        }
      }

      currentDataRow += dataLabels.length + 1;
    }

    // Determine how many PL trials were already shown in LL table
    let plTrialsAlreadyShown = 0;
    if (llRowsNeeded > 0) {
      const firstLLBatchSize = Math.min(llTrials.length, trialsPerRow);
      const remainingColumns = 11 - (5 + firstLLBatchSize) + 1;
      plTrialsAlreadyShown = Math.min(plTrials.length, Math.floor(remainingColumns / 1));
    }

    // Add PL trials section header only if there are more PL trials beyond those shown in LL table
    if (totalPLTrials > plTrialsAlreadyShown) {
      ws.mergeCells(`B${currentDataRow}:K${currentDataRow}`);
      const headerCell = ws.getCell(`B${currentDataRow}`);
      headerCell.value = "PLASTIC LIMIT TEST (Continued)";
      headerCell.font = { ...headerFont, size: 11, color: { argb: "FF2962A3" } };
      headerCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCE6F5" } };
      headerCell.border = allThin;
      currentDataRow += 1;
    }

    // Add remaining PL trials (those not shown in LL table)
    const remainingPLTrials = totalPLTrials - plTrialsAlreadyShown;
    const remainingPLRowsNeeded = remainingPLTrials > 0 ? Math.ceil(remainingPLTrials / trialsPerRow) : 0;

    for (let plRowIdx = 0; plRowIdx < remainingPLRowsNeeded; plRowIdx++) {
      const startTrialIdx = plTrialsAlreadyShown + plRowIdx * trialsPerRow;
      const endTrialIdx = Math.min(startTrialIdx + trialsPerRow, totalPLTrials);

      // Add trial number header row
      ws.mergeCells(`B${currentDataRow}:D${currentDataRow}`);
      setCell(ws, currentDataRow, 2, "", dataFont, allThin);
      for (let t = startTrialIdx; t < endTrialIdx; t++) {
        const col = 5 + (t - startTrialIdx);
        const trial = plTrials[t];
        const headerCell = ws.getCell(currentDataRow, col);
        headerCell.value = `Trial ${t + 1}${trial.containerNo ? ` (${trial.containerNo})` : ""}`;
        headerCell.font = { ...dataBoldFont, size: 10 };
        headerCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F4FF" } };
        headerCell.border = allThin;
        headerCell.alignment = { horizontal: "center" };
      }
      for (let col = 5 + (endTrialIdx - startTrialIdx); col <= 11; col++) {
        const headerCell = ws.getCell(currentDataRow, col);
        headerCell.border = allThin;
      }
      currentDataRow += 1;

      for (let i = 0; i < dataLabels.length; i++) {
        const row = currentDataRow + i;

        // Label column
        if (plRowIdx === 0) {
          ws.mergeCells(row, 2, row, 4);
          setCell(ws, row, 2, `${dataLabels[i]} (PL)`, dataBoldFont, allThin);
        } else {
          ws.mergeCells(row, 2, row, 4);
          setCell(ws, row, 2, `${dataLabels[i]} (PL cont.)`, dataBoldFont, allThin);
        }

        // Trial data columns
        for (let t = startTrialIdx; t < endTrialIdx; t++) {
          const col = 5 + (t - startTrialIdx);
          const trial = plTrials[t];
          const wet = num(trial.containerWetMass);
          const dry = num(trial.containerDryMass);
          const cont = num(trial.containerMass);
          const mc = getTrialMoisture(trial);
          const mcNum = mc ? Number(mc) : null;

          // Compute derived values with back-calculation
          const drySoilMass = dry !== null && cont !== null ? round2(dry - cont) : null;
          let waterMass = wet !== null && dry !== null ? round2(wet - dry) : null;
          let wetCalc = wet;

          if (waterMass === null && drySoilMass !== null && drySoilMass > 0 && mcNum !== null) {
            waterMass = round2((drySoilMass * mcNum) / 100);
          }
          if (wetCalc === null && dry !== null && waterMass !== null) {
            wetCalc = round2(dry + waterMass);
          }

          switch (i) {
            case 0:
              setCell(ws, row, col, trial.containerNo || "", dataFont, allThin);
              break;
            case 1:
              setCell(ws, row, col, "-", dataFont, allThin);
              break;
            case 2:
              setCell(ws, row, col, wetCalc ?? (wet !== null ? wet : "-"), dataFont, allThin);
              break;
            case 3:
              setCell(ws, row, col, dry, dataFont, allThin);
              break;
            case 4:
              setCell(ws, row, col, cont, dataFont, allThin);
              break;
            case 5:
              setCell(ws, row, col, waterMass !== null ? waterMass : "-", dataFont, allThin);
              break;
            case 6:
              setCell(ws, row, col, drySoilMass !== null ? drySoilMass : "-", dataFont, allThin);
              break;
            case 7:
              setCell(ws, row, col, mcNum !== null ? mcNum : "-", dataBoldFont, allThin);
              break;
          }
        }

        // Fill remaining columns
        for (let col = 5 + (endTrialIdx - startTrialIdx); col <= 11; col++) {
          setCell(ws, row, col, "-", dataFont, allThin);
        }
      }

      currentDataRow += dataLabels.length + 1;
    }

    // Back-calculation is done inline in the data table above — no separate section needed

    // Row for Plastic Limit result - recalculate if needed
    currentDataRow += 1;
    ws.mergeCells(`B${currentDataRow}:F${currentDataRow}`);
    setCell(ws, currentDataRow, 2, "", dataFont, allThin);
    setCell(ws, currentDataRow, 8, "PLASTIC LIMIT", dataBoldFont, allThin);
    ws.mergeCells(`J${currentDataRow}:K${currentDataRow}`);
    const plValue = record.results.plasticLimit ?? calculatePlasticLimit(plTrials);
    setCell(ws, currentDataRow, 10, plValue !== undefined ? plValue : "-", dataBoldFont, allThin);

    // Position for the Liquid Limit chart and summary side by side
    let chartSectionStartRow = currentDataRow + 2;

    // Summary results - recalculate if not provided in record.results
    const liquidLimit = record.results.liquidLimit ?? calculateLiquidLimit(llTrials);
    const plasticLimit = record.results.plasticLimit ?? calculatePlasticLimit(plTrials);
    const linearShrinkage = record.results.linearShrinkage ?? calculateLinearShrinkage(slTrials);
    const plasticityIndex = record.results.plasticityIndex ?? calculatePlasticityIndex(liquidLimit, plasticLimit);
    const passing425um = num(record.passing425um);
    const modulusOfPlasticity = record.results.modulusOfPlasticity ?? calculateModulusOfPlasticity(plasticityIndex, record.passing425um);

    // Add Liquid Limit chart on the LEFT (columns B-F) and summary on the RIGHT (columns G-K)
    if (options.chartImages && options.chartImages[`${record.id}-liquidLimit`]) {
      try {
        const llChartImageData = options.chartImages[`${record.id}-liquidLimit`];
        const llBase64String = extractBase64FromDataUrl(llChartImageData);
        const llChartImageId = wb.addImage({
          base64: llBase64String,
          extension: "png",
        });

        // Add chart header
        chartSectionStartRow += 1;
        ws.mergeCells(`B${chartSectionStartRow}:F${chartSectionStartRow}`);
        const chartHeaderCell = ws.getCell(`B${chartSectionStartRow}`);
        chartHeaderCell.value = "LIQUID LIMIT GRAPH";
        chartHeaderCell.font = { ...dataBoldFont, size: 11 };
        chartHeaderCell.border = allThin;
        chartHeaderCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F4FF" } };

        // Set row heights for chart area
        for (let i = 0; i < 12; i++) {
          ws.getRow(chartSectionStartRow + 1 + i).height = 20;
        }

        // Add the chart image on left side (columns B-F)
        ws.addImage(llChartImageId, {
          tl: { col: 1, row: chartSectionStartRow },
          ext: { width: 420, height: 360 },
        });

        console.log("Liquid limit chart added successfully to record:", record.id);
      } catch (error) {
        console.error("Failed to add liquid limit chart:", error instanceof Error ? error.message : error);
      }
    }

    // Summary section on the RIGHT side, aligned with chart
    const summaryStartRow = chartSectionStartRow + 1;

    const summaryLabels: [string, string | number | undefined][] = [
      ["LIQUID LIMIT (%)", liquidLimit],
      ["PLASTIC LIMIT (%)", plasticLimit],
      ["PLASTICITY INDEX (%)", plasticityIndex],
      ["Passing 425 µm (%)", passing425um],
      ["MODULUS OF PLASTICITY", modulusOfPlasticity],
      ["LINEAR SHRINKAGE (%)", linearShrinkage],
    ];

    // Summary header
    ws.mergeCells(`G${summaryStartRow}:K${summaryStartRow}`);
    const summaryHeaderCell = ws.getCell(`G${summaryStartRow}`);
    summaryHeaderCell.value = "RESULTS SUMMARY";
    summaryHeaderCell.font = { ...dataBoldFont, size: 11, color: { argb: "FF2962A3" } };
    summaryHeaderCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCE6F5" } };
    summaryHeaderCell.border = allThin;

    for (let i = 0; i < summaryLabels.length; i++) {
      const row = summaryStartRow + 1 + i;
      ws.mergeCells(row, 7, row, 9);
      setCell(ws, row, 7, summaryLabels[i][0], dataBoldFont, allThin);
      ws.mergeCells(row, 10, row, 11);
      setCell(ws, row, 10, summaryLabels[i][1] ?? "-", dataBoldFont, allThin);
    }

    // Linear Shrinkage detail below summary
    const lsDetailRow = summaryStartRow + summaryLabels.length + 2;
    ws.mergeCells(`G${lsDetailRow}:K${lsDetailRow}`);
    setCell(ws, lsDetailRow, 7, "LINEAR SHRINKAGE", dataBoldFont, null);

    const slTrial = slTrials[0];
    const lsRow1 = lsDetailRow + 1;
    ws.mergeCells(`G${lsRow1}:I${lsRow1}`);
    setCell(ws, lsRow1, 7, "Initial length (mm)", dataBoldFont, allThin);
    ws.mergeCells(`J${lsRow1}:K${lsRow1}`);
    setCell(ws, lsRow1, 10, slTrial ? num(slTrial.initialLength) ?? 140 : 140, dataFont, allThin);

    const lsRow2 = lsDetailRow + 2;
    ws.mergeCells(`G${lsRow2}:I${lsRow2}`);
    setCell(ws, lsRow2, 7, "Final length (mm)", dataBoldFont, allThin);
    ws.mergeCells(`J${lsRow2}:K${lsRow2}`);
    setCell(ws, lsRow2, 10, slTrial ? num(slTrial.finalLength) : "-", dataFont, allThin);

    const lsRow3 = lsDetailRow + 3;
    ws.mergeCells(`G${lsRow3}:I${lsRow3}`);
    setCell(ws, lsRow3, 7, "Shrinkage (%)", dataBoldFont, allThin);
    ws.mergeCells(`J${lsRow3}:K${lsRow3}`);
    const shrinkageValue = record.results.linearShrinkage ?? calculateLinearShrinkage(slTrials);
    setCell(ws, lsRow3, 10, shrinkageValue ?? "-", dataFont, allThin);

    // Move currentDataRow past both chart and summary
    currentDataRow = Math.max(chartSectionStartRow + 13, lsRow3 + 2);

    // Soil Classification (below summary on the right)
    let classRow = currentDataRow + 1;
    ws.mergeCells(`G${classRow}:K${classRow}`);
    setCell(ws, classRow, 7, "SOIL CLASSIFICATION", dataFont, null);

    classRow += 1;
    ws.mergeCells(`G${classRow}:G${classRow}`);
    setCell(ws, classRow, 7, "USCS", dataBoldFont, null);
    ws.mergeCells(`H${classRow}:K${classRow}`);
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
    setCell(ws, classRow, 8, uscsDesc, dataBoldFont, null);
    setCell(ws, classRow, 11, uscsCode, dataBoldFont, null);

    classRow += 1;
    setCell(ws, classRow, 7, "AASHTO", dataBoldFont, null);
    // Compute AASHTO classification
    let aashtoCode = "";
    if (liquidLimit !== null && plasticityIndex !== null && plasticityIndex !== undefined) {
      const pi = plasticityIndex;
      const ll = liquidLimit;
      if (ll <= 40 && pi <= 10) {
        aashtoCode = "A-4";
      } else if (ll <= 40 && pi > 10) {
        aashtoCode = "A-6";
      } else if (ll > 40 && pi <= 10) {
        aashtoCode = "A-5";
      } else if (ll > 40 && pi > 10) {
        aashtoCode = pi <= ll - 30 ? "A-7-5" : "A-7-6";
      }
    }
    setCell(ws, classRow, 8, aashtoCode, dataBoldFont, null);

    // Footer
    const footerRow = classRow + 4;
    setCell(ws, footerRow, 2, "Tested by:", dataBoldFont, null);
    ws.mergeCells(`C${footerRow}:D${footerRow}`);
    setCell(ws, footerRow, 3, record.testedBy || "", dataFont, null);
    ws.mergeCells(`E${footerRow}:F${footerRow}`);
    setCell(ws, footerRow, 5, "Date reported", dataBoldFont, null);
    ws.mergeCells(`G${footerRow}:H${footerRow}`);
    setCell(ws, footerRow, 7, projectState.dateReported || "", valueFont, null);
    setCell(ws, footerRow, 9, "Checked by:", dataBoldFont, null);
    setCell(ws, footerRow, 10, projectState.checkedBy || "____________", dataBoldFont, null);

    // Add stamp image near "Checked by" in footer
    if (stampBase64 && stampBase64.length > 0) {
      try {
        const stampId = wb.addImage({
          base64: stampBase64,
          extension: stampExtension,
        });
        ws.addImage(stampId, {
          tl: { col: 8, row: footerRow - 2 },
          ext: { width: 270, height: 113 },
        });
        console.debug("[XLSX] Stamp image added near footer");
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
