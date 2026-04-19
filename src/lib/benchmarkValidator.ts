import ExcelJS from "exceljs";
import type {
  LiquidLimitTrial,
  PlasticLimitTrial,
  ShrinkageLimitTrial,
  AtterbergTest,
} from "@/context/TestDataContext";
import {
  calculateLiquidLimit,
  calculatePlasticLimit,
  calculateLinearShrinkage,
  calculatePlasticityIndex,
  calculateModulusOfPlasticity,
  calculateMoistureFromMass,
  getTrialMoisture,
  isLiquidLimitTrialValid,
  isPlasticLimitTrialValid,
  isShrinkageLimitTrialValid,
  getLiquidLimitFitQuality,
} from "./atterbergCalculations";

export interface BenchmarkResult {
  testType: "liquidLimit" | "plasticLimit" | "shrinkageLimit";
  extractedTrials: any[];
  excelExpectedValue: number | null;
  calculatedValue: number | null;
  match: boolean;
  discrepancy: number | null;
  discrepancyPercent: number | null;
  validTrialsCount: number;
  notes: string[];
}

export interface BenchmarkReport {
  fileName: string;
  timestamp: string;
  results: BenchmarkResult[];
  overallMatch: boolean;
  summary: {
    totalTests: number;
    passedTests: number;
    failedTests: number;
    totalDiscrepancies: BenchmarkResult[];
  };
}

const parseNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const parseString = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  return String(value).trim();
};

const round = (value: number) => Number(value.toFixed(2));

/**
 * Extract Liquid Limit trials and expected result from Excel
 */
const extractLiquidLimitBenchmark = (
  ws: ExcelJS.Worksheet
): {
  trials: LiquidLimitTrial[];
  expectedValue: number | null;
  notes: string[];
} => {
  const notes: string[] = [];
  const trials: LiquidLimitTrial[] = [];
  let expectedValue: number | null = null;
  let trialNo = 1;

  // Scan for LL trial data (typically rows 18-25 in template)
  // Look for rows with penetration values in typical range (5-35mm)
  for (let row = 18; row <= 30; row++) {
    const penetrationCell = ws.getCell(row, 3); // Column C
    const penetration = parseNumber(penetrationCell.value);

    // Valid penetration range for LL tests
    if (penetration !== null && penetration > 0 && penetration < 50) {
      const containerNo = parseString(ws.getCell(row, 2).value);
      const containerWetMass = parseString(ws.getCell(row, 5).value);
      const containerDryMass = parseString(ws.getCell(row, 6).value);
      const containerMass = parseString(ws.getCell(row, 7).value);
      const moistureCell = ws.getCell(row, 10);
      const moisture = parseString(moistureCell.value);

      // Only add if we have required data
      if (
        (containerWetMass && containerDryMass && containerMass) ||
        (moisture && penetration)
      ) {
        trials.push({
          id: `trial-${trialNo}`,
          trialNo: String(trialNo),
          penetration: penetration.toFixed(1),
          containerNo: containerNo || undefined,
          containerWetMass: containerWetMass || undefined,
          containerDryMass: containerDryMass || undefined,
          containerMass: containerMass || undefined,
          moisture: moisture || "",
        });
        trialNo++;
      }
    }
  }

  // Look for calculated Liquid Limit result (typically row 40-45)
  for (let row = 40; row <= 50; row++) {
    const labelCell = ws.getCell(row, 7);
    const label = parseString(labelCell.value).toUpperCase();

    if (label.includes("LIQUID LIMIT")) {
      const valueCell = ws.getCell(row, 10);
      expectedValue = parseNumber(valueCell.value);
      notes.push(`Found Liquid Limit value in Excel row ${row}: ${expectedValue}`);
      break;
    }
  }

  if (trials.length > 0) {
    notes.push(`Extracted ${trials.length} Liquid Limit trial(s)`);
  }

  return { trials, expectedValue, notes };
};

/**
 * Extract Plastic Limit trials and expected result from Excel
 */
const extractPlasticLimitBenchmark = (
  ws: ExcelJS.Worksheet
): {
  trials: PlasticLimitTrial[];
  expectedValue: number | null;
  notes: string[];
} => {
  const notes: string[] = [];
  const trials: PlasticLimitTrial[] = [];
  let expectedValue: number | null = null;
  let trialNo = 1;

  // Scan for PL trial data (typically columns J-K, rows 18-25)
  for (let row = 18; row <= 25; row++) {
    for (let col = 10; col <= 11; col++) {
      const containerNo = parseString(ws.getCell(row, 2).value);
      const containerWetMass = parseString(ws.getCell(row, col + 2).value);
      const containerDryMass = parseString(ws.getCell(row, col + 3).value);
      const containerMass = parseString(ws.getCell(row, col + 4).value);
      const moistureCell = ws.getCell(row, col + 7);
      const moisture = parseString(moistureCell.value);

      if (
        (containerWetMass && containerDryMass && containerMass) ||
        (moisture && parseNumber(moisture) !== null)
      ) {
        trials.push({
          id: `trial-${trialNo}`,
          trialNo: String(trialNo),
          containerNo: containerNo || undefined,
          containerWetMass: containerWetMass || undefined,
          containerDryMass: containerDryMass || undefined,
          containerMass: containerMass || undefined,
          moisture: moisture || "",
        });
        trialNo++;
      }
    }
  }

  // Look for Plastic Limit result
  for (let row = 26; row <= 30; row++) {
    const labelCell = ws.getCell(row, 8);
    const label = parseString(labelCell.value).toUpperCase();

    if (label.includes("PLASTIC LIMIT")) {
      const valueCell = ws.getCell(row, 10);
      expectedValue = parseNumber(valueCell.value);
      notes.push(`Found Plastic Limit value in Excel row ${row}: ${expectedValue}`);
      break;
    }
  }

  if (trials.length > 0) {
    notes.push(`Extracted ${trials.length} Plastic Limit trial(s)`);
  }

  return { trials, expectedValue, notes };
};

/**
 * Extract Shrinkage Limit trials and expected result from Excel
 */
const extractShrinkageLimitBenchmark = (
  ws: ExcelJS.Worksheet
): {
  trials: ShrinkageLimitTrial[];
  expectedValue: number | null;
  notes: string[];
} => {
  const notes: string[] = [];
  const trials: ShrinkageLimitTrial[] = [];
  let expectedValue: number | null = null;
  let trialNo = 1;

  // Look for initial and final length values (rows 32-35)
  for (let row = 32; row <= 40; row++) {
    const label = parseString(ws.getCell(row, 7).value).toUpperCase();

    if (label.includes("INITIAL LENGTH")) {
      const initialLength = parseString(ws.getCell(row, 10).value);
      const finalLength = parseString(ws.getCell(row + 1, 10).value);

      if (parseNumber(initialLength) !== null && parseNumber(finalLength) !== null) {
        trials.push({
          id: `trial-${trialNo}`,
          trialNo: String(trialNo),
          initialLength: initialLength,
          finalLength: finalLength,
        });
        trialNo++;
        notes.push(`Found Shrinkage Limit trial: initial=${initialLength}mm, final=${finalLength}mm`);
      }
    }
  }

  // Look for Linear Shrinkage result
  for (let row = 40; row <= 50; row++) {
    const labelCell = ws.getCell(row, 7);
    const label = parseString(labelCell.value).toUpperCase();

    if (label.includes("LINEAR SHRINKAGE")) {
      const valueCell = ws.getCell(row, 10);
      expectedValue = parseNumber(valueCell.value);
      notes.push(`Found Linear Shrinkage value in Excel row ${row}: ${expectedValue}`);
      break;
    }
  }

  return { trials, expectedValue, notes };
};

/**
 * Validate calculations against Excel benchmarks
 */
export const validateAgainstExcel = async (file: File | Buffer): Promise<BenchmarkReport> => {
  const results: BenchmarkResult[] = [];

  try {
    // Parse Excel file
    const workbook = new ExcelJS.Workbook();

    try {
      if (Buffer.isBuffer(file)) {
        // Handle Node.js Buffer - use the buffer directly with xlsx
        await workbook.xlsx.load(new Uint8Array(file).buffer as ArrayBuffer);
      } else {
        // Handle File object
        const arrayBuffer = await file.arrayBuffer();
        await workbook.xlsx.load(arrayBuffer);
      }
    } catch (loadError) {
      // If normal load fails, try with error handling enabled
      throw new Error(
        `Failed to load Excel file: ${loadError instanceof Error ? loadError.message : String(loadError)}`
      );
    }

    const ws = workbook.worksheets[0];
    if (!ws) {
      throw new Error("No worksheets found in Excel file");
    }

    // Initialize worksheet properties to avoid undefined access errors
    try {
      if (!ws.pageSetup) {
        ws.pageSetup = {};
      }
      if (!(ws as any).margins) {
        (ws as any).margins = {};
      }
      if (!(ws as any).printArea) {
        (ws as any).printArea = null;
      }
    } catch (e) {
      // Some worksheets might not allow property initialization
      console.warn("Warning: Could not initialize worksheet properties:", e);
    }

    // Extract Liquid Limit
    let llBenchmark = { trials: [], expectedValue: null, notes: ["Error extracting liquid limit"] };
    try {
      llBenchmark = extractLiquidLimitBenchmark(ws);
    } catch (e) {
      console.warn("Error extracting liquid limit:", e);
    }

    if (llBenchmark.trials.length > 0) {
      const test: AtterbergTest = {
        id: "ll-test",
        type: "liquidLimit",
        title: "Liquid Limit",
        trials: llBenchmark.trials,
        isExpanded: true,
        result: {},
      };
      const calculated = calculateLiquidLimit(llBenchmark.trials);
      const validTrials = llBenchmark.trials.filter(isLiquidLimitTrialValid);
      const fitQuality = getLiquidLimitFitQuality(llBenchmark.trials);

      const llResult: BenchmarkResult = {
        testType: "liquidLimit",
        extractedTrials: llBenchmark.trials,
        excelExpectedValue: llBenchmark.expectedValue,
        calculatedValue: calculated,
        match:
          llBenchmark.expectedValue !== null &&
          calculated !== null &&
          Math.abs(llBenchmark.expectedValue - calculated) < 0.5,
        discrepancy:
          llBenchmark.expectedValue !== null && calculated !== null
            ? round(Math.abs(llBenchmark.expectedValue - calculated))
            : null,
        discrepancyPercent:
          llBenchmark.expectedValue !== null && calculated !== null && llBenchmark.expectedValue !== 0
            ? round((Math.abs(llBenchmark.expectedValue - calculated) / llBenchmark.expectedValue) * 100)
            : null,
        validTrialsCount: validTrials.length,
        notes: [
          ...llBenchmark.notes,
          `Valid trials: ${validTrials.length}`,
          fitQuality ? `R² (fit quality): ${fitQuality.rSquared}` : "No fit quality data",
        ],
      };

      results.push(llResult);
    }

    // Extract Plastic Limit
    let plBenchmark = { trials: [], expectedValue: null, notes: ["Error extracting plastic limit"] };
    try {
      plBenchmark = extractPlasticLimitBenchmark(ws);
    } catch (e) {
      console.warn("Error extracting plastic limit:", e);
    }

    if (plBenchmark.trials.length > 0) {
      const calculated = calculatePlasticLimit(plBenchmark.trials);
      const validTrials = plBenchmark.trials.filter(isPlasticLimitTrialValid);

      const plResult: BenchmarkResult = {
        testType: "plasticLimit",
        extractedTrials: plBenchmark.trials,
        excelExpectedValue: plBenchmark.expectedValue,
        calculatedValue: calculated,
        match:
          plBenchmark.expectedValue !== null &&
          calculated !== null &&
          Math.abs(plBenchmark.expectedValue - calculated) < 0.5,
        discrepancy:
          plBenchmark.expectedValue !== null && calculated !== null
            ? round(Math.abs(plBenchmark.expectedValue - calculated))
            : null,
        discrepancyPercent:
          plBenchmark.expectedValue !== null && calculated !== null && plBenchmark.expectedValue !== 0
            ? round((Math.abs(plBenchmark.expectedValue - calculated) / plBenchmark.expectedValue) * 100)
            : null,
        validTrialsCount: validTrials.length,
        notes: [...plBenchmark.notes, `Valid trials: ${validTrials.length}`],
      };

      results.push(plResult);
    }

    // Extract Shrinkage Limit
    let slBenchmark = { trials: [], expectedValue: null, notes: ["Error extracting shrinkage limit"] };
    try {
      slBenchmark = extractShrinkageLimitBenchmark(ws);
    } catch (e) {
      console.warn("Error extracting shrinkage limit:", e);
    }

    if (slBenchmark.trials.length > 0) {
      const calculated = calculateLinearShrinkage(slBenchmark.trials);
      const validTrials = slBenchmark.trials.filter(isShrinkageLimitTrialValid);

      const slResult: BenchmarkResult = {
        testType: "shrinkageLimit",
        extractedTrials: slBenchmark.trials,
        excelExpectedValue: slBenchmark.expectedValue,
        calculatedValue: calculated,
        match:
          slBenchmark.expectedValue !== null &&
          calculated !== null &&
          Math.abs(slBenchmark.expectedValue - calculated) < 0.5,
        discrepancy:
          slBenchmark.expectedValue !== null && calculated !== null
            ? round(Math.abs(slBenchmark.expectedValue - calculated))
            : null,
        discrepancyPercent:
          slBenchmark.expectedValue !== null && calculated !== null && slBenchmark.expectedValue !== 0
            ? round((Math.abs(slBenchmark.expectedValue - calculated) / slBenchmark.expectedValue) * 100)
            : null,
        validTrialsCount: validTrials.length,
        notes: [...slBenchmark.notes, `Valid trials: ${validTrials.length}`],
      };

      results.push(slResult);
    }

    // Build report
    const passedTests = results.filter((r) => r.match).length;
    const failedTests = results.filter((r) => !r.match).length;

    const report: BenchmarkReport = {
      fileName: (file as File).name || "unknown",
      timestamp: new Date().toISOString(),
      results,
      overallMatch: failedTests === 0 && results.length > 0,
      summary: {
        totalTests: results.length,
        passedTests,
        failedTests,
        totalDiscrepancies: results.filter((r) => !r.match && r.discrepancy !== null),
      },
    };

    return report;
  } catch (error) {
    throw new Error(
      `Benchmark validation failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

/**
 * Format benchmark report for console output
 */
export const formatBenchmarkReport = (report: BenchmarkReport): string => {
  const lines: string[] = [];

  lines.push("=".repeat(80));
  lines.push(`BENCHMARK VALIDATION REPORT: ${report.fileName}`);
  lines.push(`Generated: ${new Date(report.timestamp).toLocaleString()}`);
  lines.push("=".repeat(80));
  lines.push("");

  lines.push(`Summary: ${report.summary.passedTests}/${report.summary.totalTests} tests passed`);
  lines.push(
    `Overall Status: ${report.overallMatch ? "✅ ALL CALCULATIONS MATCH" : "❌ DISCREPANCIES FOUND"}`
  );
  lines.push("");

  report.results.forEach((result) => {
    lines.push(`\n${result.testType.toUpperCase()}`);
    lines.push("-".repeat(50));
    lines.push(`  Excel Expected:  ${result.excelExpectedValue ?? "N/A"}`);
    lines.push(`  Calculated:      ${result.calculatedValue ?? "N/A"}`);
    lines.push(`  Match:           ${result.match ? "✅ YES" : "❌ NO"}`);

    if (result.discrepancy !== null) {
      lines.push(`  Discrepancy:     ${result.discrepancy} (${result.discrepancyPercent}%)`);
    }

    lines.push(`  Valid Trials:    ${result.validTrialsCount}`);
    result.notes.forEach((note) => lines.push(`  • ${note}`));
  });

  lines.push("");
  lines.push("=".repeat(80));

  return lines.join("\n");
};
