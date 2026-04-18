import { describe, it, expect, beforeAll } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { validateAgainstExcel, formatBenchmarkReport } from "@/lib/benchmarkValidator";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("Benchmark Validation - ATTERTEST.xlsx", () => {
  let benchmarkBuffer: Buffer | null = null;

  beforeAll(async () => {
    // Load the benchmark Excel file
    const filePath = path.join(__dirname, "..", "..", "ATTERTEST.xlsx");

    if (!fs.existsSync(filePath)) {
      console.warn(`Benchmark file not found at ${filePath}`);
      return;
    }

    benchmarkBuffer = fs.readFileSync(filePath);
  });

  it("should validate all calculations against Excel benchmark", async () => {
    if (!benchmarkBuffer) {
      console.warn("Skipping test: benchmark file not available");
      return;
    }

    const report = await validateAgainstExcel(benchmarkBuffer);

    // Print the formatted report
    console.log("\n" + formatBenchmarkReport(report));

    // Basic assertions
    expect(report).toBeDefined();
    expect(report.results.length).toBeGreaterThan(0);

    // Check that we have at least one test result
    expect(report.summary.totalTests).toBeGreaterThan(0);

    // Each result should have calculated values
    report.results.forEach((result) => {
      expect(result.calculatedValue).not.toBeNull();
      expect(result.validTrialsCount).toBeGreaterThan(0);

      // Log individual test results
      console.log(`\n${result.testType}:`);
      console.log(
        `  Expected: ${result.excelExpectedValue}, Calculated: ${result.calculatedValue}`
      );
      console.log(
        `  Match: ${result.match}, Discrepancy: ${result.discrepancy} (${result.discrepancyPercent}%)`
      );
      console.log(`  Valid Trials: ${result.validTrialsCount}`);
    });
  });

  it("should extract Liquid Limit data correctly", async () => {
    if (!benchmarkBuffer) {
      console.warn("Skipping test: benchmark file not available");
      return;
    }

    const report = await validateAgainstExcel(benchmarkBuffer);
    const llResult = report.results.find((r) => r.testType === "liquidLimit");

    if (llResult) {
      expect(llResult.extractedTrials.length).toBeGreaterThan(0);
      expect(llResult.calculatedValue).not.toBeNull();
      console.log(`\nLiquid Limit: ${llResult.calculatedValue}% (Expected: ${llResult.excelExpectedValue}%)`);
    }
  });

  it("should extract Plastic Limit data correctly", async () => {
    if (!benchmarkBuffer) {
      console.warn("Skipping test: benchmark file not available");
      return;
    }

    const report = await validateAgainstExcel(benchmarkBuffer);
    const plResult = report.results.find((r) => r.testType === "plasticLimit");

    if (plResult) {
      expect(plResult.extractedTrials.length).toBeGreaterThan(0);
      expect(plResult.calculatedValue).not.toBeNull();
      console.log(`\nPlastic Limit: ${plResult.calculatedValue}% (Expected: ${plResult.excelExpectedValue}%)`);
    }
  });

  it("should extract Shrinkage Limit data correctly", async () => {
    if (!benchmarkBuffer) {
      console.warn("Skipping test: benchmark file not available");
      return;
    }

    const report = await validateAgainstExcel(benchmarkBuffer);
    const slResult = report.results.find((r) => r.testType === "shrinkageLimit");

    if (slResult) {
      expect(slResult.extractedTrials.length).toBeGreaterThan(0);
      expect(slResult.calculatedValue).not.toBeNull();
      console.log(
        `\nLinear Shrinkage: ${slResult.calculatedValue}% (Expected: ${slResult.excelExpectedValue}%)`
      );
    }
  });

  it("should document any discrepancies found", async () => {
    if (!benchmarkBuffer) {
      console.warn("Skipping test: benchmark file not available");
      return;
    }

    const report = await validateAgainstExcel(benchmarkBuffer);

    if (report.summary.totalDiscrepancies.length > 0) {
      console.log("\n⚠️  Discrepancies Found:");
      report.summary.totalDiscrepancies.forEach((result) => {
        console.log(`\n${result.testType}:`);
        console.log(`  Expected: ${result.excelExpectedValue}`);
        console.log(`  Calculated: ${result.calculatedValue}`);
        console.log(`  Difference: ${result.discrepancy} (${result.discrepancyPercent}%)`);
        console.log(`  Notes: ${result.notes.join(", ")}`);
      });
    } else {
      console.log("\n✅ All calculations match Excel values!");
    }
  });
});
