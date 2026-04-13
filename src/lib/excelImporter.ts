import ExcelJS from "exceljs";
import type { LiquidLimitTrial, PlasticLimitTrial, ShrinkageLimitTrial } from "@/context/TestDataContext";
import {
  isLiquidLimitTrialValid,
  isPlasticLimitTrialValid,
  isShrinkageLimitTrialValid,
} from "./atterbergCalculations";
import {
  generateSampleLiquidLimitTrials,
  generateSamplePlasticLimitTrials,
  generateSampleShrinkageLimitTrials,
  calculateSampleTrialsNeeded,
} from "./sampleTrialData";

const makeId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export interface ImportResult {
  liquidLimitTrials: LiquidLimitTrial[];
  plasticLimitTrials: PlasticLimitTrial[];
  shrinkageLimitTrials: ShrinkageLimitTrial[];
  warnings: string[];
  errors: string[];
  samplesAdded: {
    liquidLimit: number;
    plasticLimit: number;
    shrinkageLimit: number;
  };
}

/**
 * Safe number parsing - handles empty cells, non-numeric values
 */
const parseNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

/**
 * Safe string parsing
 */
const parseString = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  return String(value).trim();
};

/**
 * Extract Liquid Limit trials from Excel worksheet
 * Looks for columns with penetration and moisture data
 */
const extractLiquidLimitTrials = (ws: ExcelJS.Worksheet): LiquidLimitTrial[] => {
  const trials: LiquidLimitTrial[] = [];
  let trialNo = 1;

  // Scan for data rows - typically rows 18-25 in standard template
  // Look for rows that have penetration values
  for (let row = 1; row <= ws.rowCount; row++) {
    const penetrationCell = ws.getCell(row, 2); // Column B
    const penetration = parseNumber(penetrationCell.value);

    // Skip if this looks like a header row or contains text
    if (penetration === null || penetration <= 0 || penetration > 50) {
      continue;
    }

    // Found a potential trial - try to extract all columns
    // Standard template: B=Container No (text), C=Penetration, E-K are different LL trials
    // For simplicity, we'll look across columns for numeric moisture values

    const containerNo = parseString(ws.getCell(row, 1).value);
    const moistureCell = ws.getCell(row, 3);
    const moisture = parseNumber(moistureCell.value);

    // If we have penetration and moisture, add as trial
    if (penetration !== null && moisture !== null && moisture >= 0) {
      trials.push({
        id: makeId("trial"),
        trialNo: String(trialNo),
        penetration: penetration.toFixed(1),
        moisture: moisture.toFixed(1),
        containerNo: containerNo || undefined,
      });
      trialNo++;
    }
  }

  return trials;
};

/**
 * Extract Plastic Limit trials from Excel worksheet
 * Plastic limit trials contain moisture content values
 */
const extractPlasticLimitTrials = (ws: ExcelJS.Worksheet): PlasticLimitTrial[] => {
  const trials: PlasticLimitTrial[] = [];
  let trialNo = 1;

  // Plastic limit trials typically have moisture content in 10-25% range
  // Look for rows with moisture values (without penetration)
  const processedRows = new Set<number>();

  for (let row = 1; row <= ws.rowCount; row++) {
    // Skip rows we've already processed as LL trials
    if (processedRows.has(row)) continue;

    for (let col = 2; col <= 11; col++) {
      const cell = ws.getCell(row, col);
      const value = parseNumber(cell.value);

      // PL trials typically have moisture 10-25%
      if (value !== null && value >= 8 && value <= 30) {
        // Check if this is likely a PL trial (not a penetration depth)
        // PL rows typically don't have penetration in column C
        const penetrationCheck = parseNumber(ws.getCell(row, 3).value);

        if (penetrationCheck === null || penetrationCheck <= 0 || penetrationCheck > 50) {
          // This looks like PL data
          const containerNo = parseString(ws.getCell(row, 1).value);

          // Avoid duplicates
          if (!trials.some((t) => t.moisture === value.toFixed(1) && t.containerNo === containerNo)) {
            trials.push({
              id: makeId("trial"),
              trialNo: String(trialNo),
              moisture: value.toFixed(1),
              containerNo: containerNo || undefined,
            });
            trialNo++;
            processedRows.add(row);
            break; // Move to next row
          }
        }
      }
    }
  }

  return trials;
};

/**
 * Extract Shrinkage Limit trials from Excel worksheet
 * Shrinkage limit trials have initial and final lengths
 */
const extractShrinkageLimitTrials = (ws: ExcelJS.Worksheet): ShrinkageLimitTrial[] => {
  const trials: ShrinkageLimitTrial[] = [];
  let trialNo = 1;

  // Look for rows with length values (typically 100-150mm range)
  for (let row = 1; row <= ws.rowCount; row++) {
    for (let col = 2; col <= 11; col++) {
      const cell = ws.getCell(row, col);
      const value = parseNumber(cell.value);

      // Initial length is typically 140mm (standard), final is 100-140mm
      if (value !== null && value >= 100 && value <= 150) {
        // Check adjacent cells for final length
        const nextCell = ws.getCell(row + 1, col);
        const nextValue = parseNumber(nextCell.value);

        if (nextValue !== null && nextValue >= 100 && nextValue < value) {
          // Found initial and final length pair
          trials.push({
            id: makeId("trial"),
            trialNo: String(trialNo),
            initialLength: value.toFixed(1),
            finalLength: nextValue.toFixed(1),
          });
          trialNo++;
          row++; // Skip the final length row
        }
      }
    }
  }

  return trials;
};

/**
 * Parse Excel file and extract Atterberg trial data
 * Automatically adds sample data if needed to reach 5-point precision
 */
export const importFromExcel = async (file: File): Promise<ImportResult> => {
  const warnings: string[] = [];
  const errors: string[] = [];
  const samplesAdded = {
    liquidLimit: 0,
    plasticLimit: 0,
    shrinkageLimit: 0,
  };

  try {
    // Read Excel file
    const workbook = new ExcelJS.Workbook();
    const arrayBuffer = await file.arrayBuffer();
    await workbook.xlsx.load(arrayBuffer);

    // Process first worksheet
    const ws = workbook.worksheets[0];
    if (!ws) {
      errors.push("No worksheets found in Excel file");
      return {
        liquidLimitTrials: [],
        plasticLimitTrials: [],
        shrinkageLimitTrials: [],
        warnings,
        errors,
        samplesAdded,
      };
    }

    // Extract trials from each sheet
    let liquidLimitTrials = extractLiquidLimitTrials(ws);
    let plasticLimitTrials = extractPlasticLimitTrials(ws);
    let shrinkageLimitTrials = extractShrinkageLimitTrials(ws);

    // Validate extracted trials
    const validLLTrials = liquidLimitTrials.filter(isLiquidLimitTrialValid);
    const validPLTrials = plasticLimitTrials.filter(isPlasticLimitTrialValid);
    const validSLTrials = shrinkageLimitTrials.filter(isShrinkageLimitTrialValid);

    // Check if we have any data
    if (validLLTrials.length === 0 && validPLTrials.length === 0 && validSLTrials.length === 0) {
      warnings.push(
        "No valid trial data extracted from Excel. Please check file format and ensure data is in expected columns."
      );
    }

    // Report what was extracted
    if (validLLTrials.length > 0) {
      warnings.push(`Extracted ${validLLTrials.length} Liquid Limit trial(s)`);
    }
    if (validPLTrials.length > 0) {
      warnings.push(`Extracted ${validPLTrials.length} Plastic Limit trial(s)`);
    }
    if (validSLTrials.length > 0) {
      warnings.push(`Extracted ${validSLTrials.length} Shrinkage Limit trial(s)`);
    }

    // Add sample data to reach 5-point precision
    const llSamplesNeeded = calculateSampleTrialsNeeded(validLLTrials.length, 5);
    const plSamplesNeeded = calculateSampleTrialsNeeded(validPLTrials.length, 5);
    const slSamplesNeeded = calculateSampleTrialsNeeded(validSLTrials.length, 5);

    if (llSamplesNeeded > 0) {
      const samples = generateSampleLiquidLimitTrials(llSamplesNeeded, validLLTrials.length);
      liquidLimitTrials = [...liquidLimitTrials, ...samples];
      samplesAdded.liquidLimit = llSamplesNeeded;
      warnings.push(`Added ${llSamplesNeeded} sample Liquid Limit trial(s) for graph precision`);
    }

    if (plSamplesNeeded > 0) {
      const samples = generateSamplePlasticLimitTrials(plSamplesNeeded, validPLTrials.length);
      plasticLimitTrials = [...plasticLimitTrials, ...samples];
      samplesAdded.plasticLimit = plSamplesNeeded;
      warnings.push(`Added ${plSamplesNeeded} sample Plastic Limit trial(s) for graph precision`);
    }

    if (slSamplesNeeded > 0) {
      const samples = generateSampleShrinkageLimitTrials(slSamplesNeeded, validSLTrials.length);
      shrinkageLimitTrials = [...shrinkageLimitTrials, ...samples];
      samplesAdded.shrinkageLimit = slSamplesNeeded;
      warnings.push(`Added ${slSamplesNeeded} sample Shrinkage Limit trial(s) for graph precision`);
    }

    return {
      liquidLimitTrials,
      plasticLimitTrials,
      shrinkageLimitTrials,
      warnings,
      errors,
      samplesAdded,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(`Failed to parse Excel file: ${message}`);

    return {
      liquidLimitTrials: [],
      plasticLimitTrials: [],
      shrinkageLimitTrials: [],
      warnings,
      errors,
      samplesAdded,
    };
  }
};

/**
 * Validate import result and provide user-friendly messages
 */
export const validateImportResult = (result: ImportResult): { isValid: boolean; message: string } => {
  if (result.errors.length > 0) {
    return {
      isValid: false,
      message: `Import failed: ${result.errors[0]}`,
    };
  }

  const totalTrials =
    result.liquidLimitTrials.length + result.plasticLimitTrials.length + result.shrinkageLimitTrials.length;

  if (totalTrials === 0) {
    return {
      isValid: false,
      message: "No trial data could be extracted from the file",
    };
  }

  return {
    isValid: true,
    message: `Successfully imported ${totalTrials} trials (${result.samplesAdded.liquidLimit + result.samplesAdded.plasticLimit + result.samplesAdded.shrinkageLimit} samples added for precision)`,
  };
};
