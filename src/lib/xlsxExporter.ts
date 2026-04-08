import ExcelJS from "exceljs";
import type {
  AtterbergProjectState,
  AtterbergRecord,
  LiquidLimitTrial,
  PlasticLimitTrial,
  ShrinkageLimitTrial,
} from "@/context/TestDataContext";
import { calculateMoistureFromMass, getTrialMoisture } from "./atterbergCalculations";
import { fetchAdminImagesAsBase64 } from "./imageUtils";

interface ExportOptions {
  projectName?: string;
  clientName?: string;
  date?: string;
  projectState: AtterbergProjectState;
  records: AtterbergRecord[];
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

export const generateAtterbergXLSX = async (options: ExportOptions) => {
  const { projectName, clientName, projectState, records } = options;

  const wb = new ExcelJS.Workbook();
  wb.creator = "Lab Data Craft";
  wb.created = new Date();

  // Fetch admin images once for all records
  const images = await fetchAdminImagesAsBase64();

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
        const logoId = wb.addImage({
          base64: images.logo,
          extension: "png",
        });
        ws.addImage(logoId, {
          tl: { col: 0, row: 0 }, // Top-left at A1
          ext: { width: 80, height: 24 },
        });
      } catch {
        // Skip if image fails to load
      }
    }

    if (images.contacts) {
      try {
        const contactsId = wb.addImage({
          base64: images.contacts,
          extension: "png",
        });
        ws.addImage(contactsId, {
          tl: { col: 3, row: 0 }, // Top-right at D1
          ext: { width: 80, height: 24 },
        });
      } catch {
        // Skip if image fails to load
      }
    }

    // Add stamp image below logo
    if (images.stamp) {
      try {
        const stampId = wb.addImage({
          base64: images.stamp,
          extension: "png",
        });
        ws.addImage(stampId, {
          tl: { col: 0, row: 6 }, // A7
          ext: { width: 50, height: 24 },
        });
      } catch {
        // Skip if image fails to load
      }
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

    // Find LL, PL, SL tests
    const llTest = record.tests.find((t) => t.type === "liquidLimit");
    const plTest = record.tests.find((t) => t.type === "plasticLimit");
    const slTest = record.tests.find((t) => t.type === "shrinkageLimit");

    const llTrials = (llTest?.type === "liquidLimit" ? llTest.trials : []) as LiquidLimitTrial[];
    const plTrials = (plTest?.type === "plasticLimit" ? plTest.trials : []) as PlasticLimitTrial[];
    const slTrials = (slTest?.type === "shrinkageLimit" ? slTest.trials : []) as ShrinkageLimitTrial[];

    // Data table rows 18-25 (LL data, up to 7 columns E-K)
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

    for (let i = 0; i < dataLabels.length; i++) {
      const row = 18 + i;
      ws.mergeCells(row, 2, row, 4);
      setCell(ws, row, 2, dataLabels[i], dataBoldFont, allThin);

      // Fill LL trial data in columns E(5) through K(11)
      const maxTrials = Math.min(llTrials.length, 5); // 5 LL trials max in cols E-I
      for (let t = 0; t < maxTrials; t++) {
        const col = 5 + t;
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
            if (wet !== null && dry !== null) {
              setCell(ws, row, col, round2(wet - dry), dataFont, allThin);
            } else {
              setCell(ws, row, col, "-", dataFont, allThin);
            }
            break;
          case 6: // Wt Dry Soil (calculated)
            if (dry !== null && cont !== null) {
              setCell(ws, row, col, round2(dry - cont), dataFont, allThin);
            } else {
              setCell(ws, row, col, "-", dataFont, allThin);
            }
            break;
          case 7: // Moisture %
          {
            const mc = calculateMoistureFromMass(trial.containerWetMass, trial.containerDryMass, trial.containerMass);
            setCell(ws, row, col, mc ? Number(mc) : "-", dataBoldFont, allThin);
            break;
          }
        }
      }

      // PL trials in cols J(10) and K(11)
      const maxPl = Math.min(plTrials.length, 2);
      for (let t = 0; t < maxPl; t++) {
        const col = 10 + t;
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
            if (wet !== null && dry !== null) {
              setCell(ws, row, col, round2(wet - dry), dataFont, allThin);
            } else {
              setCell(ws, row, col, "-", dataFont, allThin);
            }
            break;
          case 6:
            if (dry !== null && cont !== null) {
              setCell(ws, row, col, round2(dry - cont), dataFont, allThin);
            } else {
              setCell(ws, row, col, "-", dataFont, allThin);
            }
            break;
          case 7: {
            const mc = calculateMoistureFromMass(trial.containerWetMass, trial.containerDryMass, trial.containerMass);
            setCell(ws, row, col, mc ? Number(mc) : "-", dataBoldFont, allThin);
            break;
          }
        }
      }

      // Fill empty cells for unused columns
      for (let col = 5; col <= 11; col++) {
        const cell = ws.getCell(18 + i, col);
        if (cell.value === undefined || cell.value === null) {
          setCell(ws, 18 + i, col, "-", dataFont, allThin);
        }
      }
    }

    // Row 26: Plastic Limit label + value
    ws.mergeCells("B26:F26");
    setCell(ws, 26, 2, "", dataFont, allThin);
    setCell(ws, 26, 8, "PLASTIC LIMIT", dataBoldFont, allThin);
    ws.mergeCells("J26:K26");
    const plValue = record.results.plasticLimit;
    setCell(ws, 26, 10, plValue !== undefined ? plValue : "-", dataBoldFont, allThin);

    // Linear Shrinkage section (rows 32-35)
    ws.mergeCells("G32:K32");
    setCell(ws, 32, 7, "LINEAR SHRINKAGE", dataBoldFont, null);

    ws.mergeCells("G33:I33");
    setCell(ws, 33, 7, "Initial length (mm)", dataBoldFont, allThin);
    ws.mergeCells("J33:K33");
    const slTrial = slTrials[0];
    setCell(ws, 33, 10, slTrial ? num(slTrial.initialLength) ?? 140 : 140, dataFont, allThin);

    ws.mergeCells("G34:I34");
    setCell(ws, 34, 7, "Final length (mm)", dataBoldFont, allThin);
    ws.mergeCells("J34:K34");
    setCell(ws, 34, 10, slTrial ? num(slTrial.finalLength) : "-", dataFont, allThin);

    ws.mergeCells("G35:I35");
    setCell(ws, 35, 7, "Shrinkage (%)", dataBoldFont, allThin);
    ws.mergeCells("J35:K35");
    setCell(ws, 35, 10, record.results.linearShrinkage ?? "-", dataFont, allThin);

    // Summary results (rows 40-45)
    const summaryLabels: [string, string | number | undefined][] = [
      ["LIQUID LIMIT (%)", record.results.liquidLimit],
      ["PLASTIC LIMIT (%)", record.results.plasticLimit],
      ["PLASTICITY INDEX (%)", record.results.plasticityIndex],
      ["Passing 425 µm (%)", num(record.passing425um)],
      ["MODULAS OF PLASTICITY", record.results.modulusOfPlasticity],
      ["LINEAR SHRINKAGE (%)", record.results.linearShrinkage],
    ];

    for (let i = 0; i < summaryLabels.length; i++) {
      const row = 40 + i;
      ws.mergeCells(row, 7, row, 9);
      setCell(ws, row, 7, summaryLabels[i][0], dataBoldFont, allThin);
      ws.mergeCells(row, 10, row, 11);
      setCell(ws, row, 10, summaryLabels[i][1] ?? "-", dataBoldFont, allThin);
    }

    // Soil Classification (rows 47-49)
    ws.mergeCells("G47:K47");
    setCell(ws, 47, 7, "SOIL CLASSIFICATION", dataFont, null);

    ws.mergeCells("G48:G48");
    setCell(ws, 48, 7, "USCS", dataBoldFont, null);
    ws.mergeCells("H48:K48");
    // Derive USCS from results
    const ll = record.results.liquidLimit;
    const pl = record.results.plasticLimit;
    let uscsCode = "";
    let uscsDesc = "";
    if (pl !== undefined && ll !== undefined) {
      const pi = record.results.plasticityIndex ?? 0;
      if (pi < 4) {
        uscsCode = ll < 50 ? "ML" : "MH";
        uscsDesc = ll < 50 ? "SILT OF LOW OF PLASTICITY" : "SILT OF HIGH OF PLASTICITY";
      } else if (pi >= 4 && pi < 7) {
        uscsCode = "CL-ML";
        uscsDesc = "SILTY CLAY OF LOW OF PLASTICITY";
      } else {
        uscsCode = ll < 50 ? "CL" : "CH";
        uscsDesc = ll < 50 ? "CLAY OF LOW OF PLASTICITY" : "CLAY OF HIGH OF PLASTICITY";
      }
    }
    setCell(ws, 48, 8, uscsDesc, dataBoldFont, null);
    setCell(ws, 48, 11, uscsCode, dataBoldFont, null);

    setCell(ws, 49, 7, "AASHTO", dataBoldFont, null);

    // Footer (row 53)
    setCell(ws, 53, 2, "Tested by:", dataBoldFont, null);
    ws.mergeCells("C53:D53");
    setCell(ws, 53, 3, record.testedBy || "", dataFont, null);
    ws.mergeCells("E53:F53");
    setCell(ws, 53, 5, "Date reported", dataBoldFont, null);
    ws.mergeCells("G53:H53");
    setCell(ws, 53, 7, projectState.dateReported || "", valueFont, null);
    ws.mergeCells("I53:K53");
    setCell(ws, 53, 9, `Checked by: ${projectState.checkedBy || "____________"}`, dataBoldFont, null);

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
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Atterberg_Limits_${(projectName || "export").replace(/\s+/g, "_")}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
};
