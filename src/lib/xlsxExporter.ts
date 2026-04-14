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
    console.warn("Empty dataUrl passed to extractBase64FromDataUrl");
    return "";
  }
  const match = dataUrl.match(/^data:image\/\w+;base64,(.+)$/);
  const result = match ? match[1] : dataUrl;
  console.log("Extracted base64:", {
    dataUrlLength: dataUrl.length,
    isDataUrl: dataUrl.startsWith("data:"),
    resultLength: result.length,
    extracted: match ? "yes" : "no (using as-is)"
  });
  return result;
};

export const generateAtterbergXLSX = async (
  options: ExportOptions
): Promise<Blob | void> => {
  const { projectName, clientName, projectState, records, skipDownload } =
    options;

  const wb = new ExcelJS.Workbook();
  wb.creator = "Lab Data Craft";
  wb.created = new Date();

  // Fetch admin images once for all records
  let images = { logo: undefined, contacts: undefined, stamp: undefined };
  try {
    images = await fetchAdminImagesAsBase64();
    console.log("Fetched admin images for export:", {
      hasLogo: !!images.logo,
      hasContacts: !!images.contacts,
      hasStamp: !!images.stamp,
      logoLength: images.logo?.length || 0,
      contactsLength: images.contacts?.length || 0,
      stampLength: images.stamp?.length || 0,
    });
  } catch (error) {
    console.warn("Failed to fetch admin images, continuing without them:", error instanceof Error ? error.message : error);
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

    // Set row heights for image placement
    ws.getRow(1).height = 24;
    ws.getRow(7).height = 24;

    // Add images: logo (top left) and contacts (top right)
    let imageStartRow = 1;
    if (images.logo) {
      try {
        console.log("Adding logo image to worksheet");
        const base64String = extractBase64FromDataUrl(images.logo);
        const logoId = wb.addImage({
          base64: base64String,
          extension: "png",
        });
        ws.addImage(logoId, {
          tl: { col: 0, row: 0 }, // Top-left at A1
          ext: { width: 80, height: 24 },
        });
        console.log("Logo image added successfully");
      } catch (error) {
        console.error("Failed to add logo image:", error instanceof Error ? error.message : error);
      }
    } else {
      console.warn("No logo image found to add");
    }

    if (images.contacts) {
      try {
        console.log("Adding contacts image to worksheet");
        const base64String = extractBase64FromDataUrl(images.contacts);
        const contactsId = wb.addImage({
          base64: base64String,
          extension: "png",
        });
        ws.addImage(contactsId, {
          tl: { col: 3, row: 0 }, // Top-right at D1
          ext: { width: 80, height: 24 },
        });
        console.log("Contacts image added successfully");
      } catch (error) {
        console.error("Failed to add contacts image:", error instanceof Error ? error.message : error);
      }
    } else {
      console.warn("No contacts image found to add");
    }

    // Add stamp image below logo
    if (images.stamp) {
      try {
        console.log("Adding stamp image to worksheet");
        const base64String = extractBase64FromDataUrl(images.stamp);
        const stampId = wb.addImage({
          base64: base64String,
          extension: "png",
        });
        ws.addImage(stampId, {
          tl: { col: 0, row: 6 }, // A7
          ext: { width: 50, height: 24 },
        });
        console.log("Stamp image added successfully");
      } catch (error) {
        console.error("Failed to add stamp image:", error instanceof Error ? error.message : error);
      }
    } else {
      console.warn("No stamp image found to add");
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
      for (let col = 5 + (endTrialIdx - startTrialIdx); col <= 11; col++) {
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

        // Trial data columns
        for (let t = startTrialIdx; t < endTrialIdx; t++) {
          const col = 5 + (t - startTrialIdx);
          const trial = llTrials[t];
          const wet = num(trial.containerWetMass);
          const dry = num(trial.containerDryMass);
          const cont = num(trial.containerMass);

          switch (i) {
            case 0: // Container No
              setCell(ws, row, col, trial.containerNo || "", dataFont, allThin);
              break;
            case 1: // Penetration
              setCell(ws, row, col, num(trial.penetration), dataBoldFont, allThin);
              break;
            case 2: // Cont + Wet
              setCell(ws, row, col, wet, dataFont, allThin);
              break;
            case 3: // Cont + Dry
              setCell(ws, row, col, dry, dataFont, allThin);
              break;
            case 4: // Container
              setCell(ws, row, col, cont, dataFont, allThin);
              break;
            case 5: // Wt Moisture (calculated)
              {
                const wm = wet !== null && dry !== null ? round2(wet - dry) : null;
                setCell(ws, row, col, wm !== null ? wm : "-", dataFont, allThin);
              }
              break;
            case 6: // Wt Dry Soil (calculated)
              {
                const ds = dry !== null && cont !== null ? round2(dry - cont) : null;
                setCell(ws, row, col, ds !== null ? ds : "-", dataFont, allThin);
              }
              break;
            case 7: // Moisture %
            {
              const mc = getTrialMoisture(trial);
              setCell(ws, row, col, mc ? Number(mc) : "-", dataBoldFont, allThin);
              break;
            }
          }
        }

        // Fill remaining columns
        for (let col = 5 + (endTrialIdx - startTrialIdx); col <= 11; col++) {
          setCell(ws, row, col, "-", dataFont, allThin);
        }
      }

      currentDataRow += dataLabels.length + 1;
    }

    // Add PL trials section header if there are trials
    if (totalPLTrials > 0) {
      ws.mergeCells(`B${currentDataRow}:K${currentDataRow}`);
      const headerCell = ws.getCell(`B${currentDataRow}`);
      headerCell.value = "PLASTIC LIMIT TEST";
      headerCell.font = { ...headerFont, size: 11, color: { argb: "FF2962A3" } };
      headerCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCE6F5" } };
      headerCell.border = allThin;
      currentDataRow += 1;
    }

    // Add PL trials
    for (let plRowIdx = 0; plRowIdx < plRowsNeeded; plRowIdx++) {
      const startTrialIdx = plRowIdx * trialsPerRow;
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

          switch (i) {
            case 0:
              setCell(ws, row, col, trial.containerNo || "", dataFont, allThin);
              break;
            case 1:
              setCell(ws, row, col, "-", dataFont, allThin);
              break;
            case 2:
              setCell(ws, row, col, wet, dataFont, allThin);
              break;
            case 3:
              setCell(ws, row, col, dry, dataFont, allThin);
              break;
            case 4:
              setCell(ws, row, col, cont, dataFont, allThin);
              break;
            case 5:
              {
                const wm = wet !== null && dry !== null ? round2(wet - dry) : null;
                setCell(ws, row, col, wm !== null ? wm : "-", dataFont, allThin);
              }
              break;
            case 6:
              {
                const ds = dry !== null && cont !== null ? round2(dry - cont) : null;
                setCell(ws, row, col, ds !== null ? ds : "-", dataFont, allThin);
              }
              break;
            case 7: {
              const mc = getTrialMoisture(trial);
              setCell(ws, row, col, mc ? Number(mc) : "-", dataBoldFont, allThin);
              break;
            }
          }
        }

        // Fill remaining columns
        for (let col = 5 + (endTrialIdx - startTrialIdx); col <= 11; col++) {
          setCell(ws, row, col, "-", dataFont, allThin);
        }
      }

      currentDataRow += dataLabels.length + 1;
    }

    // Row for Plastic Limit result - recalculate if needed
    currentDataRow += 1;
    ws.mergeCells(`B${currentDataRow}:F${currentDataRow}`);
    setCell(ws, currentDataRow, 2, "", dataFont, allThin);
    setCell(ws, currentDataRow, 8, "PLASTIC LIMIT", dataBoldFont, allThin);
    ws.mergeCells(`J${currentDataRow}:K${currentDataRow}`);
    const plValue = record.results.plasticLimit ?? calculatePlasticLimit(plTrials);
    setCell(ws, currentDataRow, 10, plValue !== undefined ? plValue : "-", dataBoldFont, allThin);

    // Linear Shrinkage section
    let lsRow = currentDataRow + 3;
    ws.mergeCells(`G${lsRow}:K${lsRow}`);
    setCell(ws, lsRow, 7, "LINEAR SHRINKAGE", dataBoldFont, null);

    const slTrial = slTrials[0];
    lsRow += 1;
    ws.mergeCells(`G${lsRow}:I${lsRow}`);
    setCell(ws, lsRow, 7, "Initial length (mm)", dataBoldFont, allThin);
    ws.mergeCells(`J${lsRow}:K${lsRow}`);
    setCell(ws, lsRow, 10, slTrial ? num(slTrial.initialLength) ?? 140 : 140, dataFont, allThin);

    lsRow += 1;
    ws.mergeCells(`G${lsRow}:I${lsRow}`);
    setCell(ws, lsRow, 7, "Final length (mm)", dataBoldFont, allThin);
    ws.mergeCells(`J${lsRow}:K${lsRow}`);
    setCell(ws, lsRow, 10, slTrial ? num(slTrial.finalLength) : "-", dataFont, allThin);

    lsRow += 1;
    ws.mergeCells(`G${lsRow}:I${lsRow}`);
    setCell(ws, lsRow, 7, "Shrinkage (%)", dataBoldFont, allThin);
    ws.mergeCells(`J${lsRow}:K${lsRow}`);
    const shrinkageValue = record.results.linearShrinkage ?? calculateLinearShrinkage(slTrials);
    setCell(ws, lsRow, 10, shrinkageValue ?? "-", dataFont, allThin);

    // Summary results - recalculate if not provided in record.results
    const liquidLimit = record.results.liquidLimit ?? calculateLiquidLimit(llTrials);
    const plasticLimit = record.results.plasticLimit ?? calculatePlasticLimit(plTrials);
    const linearShrinkage = record.results.linearShrinkage ?? calculateLinearShrinkage(slTrials);
    const plasticityIndex = record.results.plasticityIndex ?? calculatePlasticityIndex(liquidLimit, plasticLimit);
    const passing425um = num(record.passing425um);
    const modulusOfPlasticity = record.results.modulusOfPlasticity ?? calculateModulusOfPlasticity(plasticityIndex, record.passing425um);

    const summaryLabels: [string, string | number | undefined][] = [
      ["LIQUID LIMIT (%)", liquidLimit],
      ["PLASTIC LIMIT (%)", plasticLimit],
      ["PLASTICITY INDEX (%)", plasticityIndex],
      ["Passing 425 µm (%)", passing425um],
      ["MODULUS OF PLASTICITY", modulusOfPlasticity],
      ["LINEAR SHRINKAGE (%)", linearShrinkage],
    ];

    let summaryRow = lsRow + 3;
    for (let i = 0; i < summaryLabels.length; i++) {
      const row = summaryRow + i;
      ws.mergeCells(row, 7, row, 9);
      setCell(ws, row, 7, summaryLabels[i][0], dataBoldFont, allThin);
      ws.mergeCells(row, 10, row, 11);
      setCell(ws, row, 10, summaryLabels[i][1] ?? "-", dataBoldFont, allThin);
    }

    // Soil Classification
    let classRow = summaryRow + summaryLabels.length + 2;
    ws.mergeCells(`G${classRow}:K${classRow}`);
    setCell(ws, classRow, 7, "SOIL CLASSIFICATION", dataFont, null);

    classRow += 1;
    ws.mergeCells(`G${classRow}:G${classRow}`);
    setCell(ws, classRow, 7, "USCS", dataBoldFont, null);
    ws.mergeCells(`H${classRow}:K${classRow}`);
    // Derive USCS from recalculated results
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

    // Footer
    const footerRow = classRow + 4;
    setCell(ws, footerRow, 2, "Tested by:", dataBoldFont, null);
    ws.mergeCells(`C${footerRow}:D${footerRow}`);
    setCell(ws, footerRow, 3, record.testedBy || "", dataFont, null);
    ws.mergeCells(`E${footerRow}:F${footerRow}`);
    setCell(ws, footerRow, 5, "Date reported", dataBoldFont, null);
    ws.mergeCells(`G${footerRow}:H${footerRow}`);
    setCell(ws, footerRow, 7, projectState.dateReported || "", valueFont, null);
    ws.mergeCells(`I${footerRow}:K${footerRow}`);
    setCell(ws, footerRow, 9, `Checked by: ${projectState.checkedBy || "____________"}`, dataBoldFont, null);

    // Add liquid limit chart if available
    let chartRowOffset = 0;
    if (options.chartImages && options.chartImages[`${record.id}-liquidLimit`]) {
      try {
        const llChartImageData = options.chartImages[`${record.id}-liquidLimit`];
        const llBase64String = extractBase64FromDataUrl(llChartImageData);
        const llChartImageId = wb.addImage({
          base64: llBase64String,
          extension: "png",
        });

        // Add liquid limit chart on a new section, below the footer
        const llChartRow = footerRow + 3;
        ws.mergeCells(`B${llChartRow}:K${llChartRow}`);
        const llChartTitleCell = ws.getCell(`B${llChartRow}`);
        llChartTitleCell.value = "LIQUID LIMIT - MOISTURE VS PENETRATION GRAPH";
        llChartTitleCell.font = { ...dataBoldFont, size: 11 };
        llChartTitleCell.border = allThin;

        // Add the chart image below the title
        ws.addImage(llChartImageId, {
          tl: { col: 1, row: llChartRow + 1 }, // Column B, one row below title
          ext: { width: 320, height: 240 },
        });
        console.log("Liquid limit chart added successfully to record:", record.id);
        chartRowOffset = 15; // Offset for the next chart
      } catch (error) {
        console.error("Failed to add liquid limit chart:", error instanceof Error ? error.message : error);
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

  // Download
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
  a.download = `Atterberg_Limits_${(projectName || "export").replace(/\s+/g, "_")}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
};
