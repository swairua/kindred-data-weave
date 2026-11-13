import { describe, expect, it } from "vitest";
import {
  REQUIRED_READINGS,
  averageRebound,
  calculateAverageRebound,
  calculateSchmidtRows,
  evaluateSchmidtRow,
  estimateStrengthFromRebound,
  getValidReadings,
  parseReboundReading,
  rowsConform,
  type SchmidtCalibration,
} from "@/lib/schmidtCalculations";

const row = (readings: string[], location = "P1") => ({ location, readings: [...readings, ...Array.from({ length: REQUIRED_READINGS }, () => "")].slice(0, REQUIRED_READINGS) });

describe("schmidt/rebound number calculations", () => {
  it("keeps only finite strictly positive readings", () => {
    expect(parseReboundReading("42")).toBe(42);
    expect(parseReboundReading("0")).toBeNull();
    expect(parseReboundReading("-3")).toBeNull();
    expect(parseReboundReading("")).toBeNull();
    expect(parseReboundReading("abc")).toBeNull();
    expect(getValidReadings(row(["42", "0", "43", "-1", ""]))).toEqual([42, 43]);
  });

  it("averages all identical readings", () => {
    expect(calculateAverageRebound(row(Array.from({ length: 10 }, () => "42")))).toBeCloseTo(42, 8);
    expect(calculateAverageRebound(row(Array.from({ length: 10 }, () => "42")))).toBe(42);
  });

  it("discards a single reading deviating by more than 12%", () => {
    // Nine 30s and one 50: 50 deviates far more than 12% from the mean.
    const evaluated = evaluateSchmidtRow(row([...Array.from({ length: 9 }, () => "30"), "50"]));
    expect(evaluated?.readings).toEqual(Array.from({ length: 9 }, () => 30));
    expect(evaluated?.discarded).toEqual([50]);
    expect(evaluated?.avgRebound).toBeCloseTo(30, 8);
    expect(evaluated?.discardedIndexes).toEqual([9]);
    expect(evaluated?.conformity.valid).toBe(true);
    expect(evaluated?.conformity.validReadingCount).toBe(10);
    expect(evaluated?.conformity.retainedCount).toBe(9);
    expect(evaluated?.conformity.discardedCount).toBe(1);
  });

  it("invalidates the area when more than 2 readings must be discarded", () => {
    // Seven 20s and three 26s: each 26 deviates more than 12% from the mean of the group.
    const evaluated = evaluateSchmidtRow(row([...Array.from({ length: 7 }, () => "20"), "26", "26", "26"]));
    expect(evaluated?.conformity.retainedCount).toBe(7);
    expect(evaluated?.conformity.discardedCount).toBe(3);
    expect(evaluated?.conformity.valid).toBe(false);
  });

  it("requires at least 10 valid readings per area", () => {
    const onlyEight = evaluateSchmidtRow(row(Array.from({ length: 8 }, () => "42")));
    expect(onlyEight?.conformity.validReadingCount).toBe(8);
    expect(onlyEight?.conformity.valid).toBe(false);
    const allTen = evaluateSchmidtRow(row(Array.from({ length: 10 }, () => "42")));
    expect(allTen?.conformity.valid).toBe(true);
  });

  it("retains readings that sit exactly at the 12% deviation boundary", () => {
    // x = 22.70 against nine 20s: mean = 20.27, deviation = 2.43 = 12.0% of the mean (inclusive).
    const evaluated = evaluateSchmidtRow(row(["20", "20", "20", "20", "20", "20", "20", "20", "20", "22.7"]));
    expect(evaluated?.conformity.retainedCount).toBe(10);
    expect(evaluated?.discarded).toEqual([]);
  });

  it("estimates strength only with a configured site-specific correlation", () => {
    expect(estimateStrengthFromRebound(42)).toBeNull();
    expect(estimateStrengthFromRebound(42, null)).toBeNull();
    const calibration: SchmidtCalibration = { slope: 1.2, intercept: -13.5 };
    expect(estimateStrengthFromRebound(42, calibration)).toBeCloseTo(36.9, 8);
  });

  it("returns null average for an empty row", () => {
    expect(calculateAverageRebound(row([]))).toBeNull();
  });

  it("recomputes per-row estimates from retained readings only", () => {
    const rows = [
      { location: "A", readings: [...Array.from({ length: 9 }, () => "42"), "50"] },
      { location: "B", readings: [...Array.from({ length: 9 }, () => "45"), "42"] },
    ];
    const calculations = calculateSchmidtRows(rows, { slope: 1, intercept: 0 });
    expect(calculations).toHaveLength(2);
    expect(calculations[0].avgRebound).toBeCloseTo(42, 8);
    expect(calculations[0].estimatedStrength).toBeCloseTo(42, 8);
    expect(calculations[0].conformity.valid).toBe(true);
    expect(averageRebound(calculations)).toBeCloseTo(43.35, 8);
  });

  it("invalidates whole-row conformance when any single row fails", () => {
    const rows = [
      { location: "A", readings: [...Array.from({ length: 9 }, () => "42"), "50"] },
      { location: "B", readings: ["30", "100", "100", "100", "30", "30", "30", "30", "30", "30"] },
    ];
    expect(rowsConform(rows)).toBe(false);
    expect(rowsConform([rows[0]])).toBe(true);
  });

  it("tracks the discarded cell positions within the raw row", () => {
    const evaluated = evaluateSchmidtRow(row(["42", "42", "42", "42", "42", "42", "42", "42", "42", "90"]));
    expect(evaluated?.discardedIndexes).toEqual([9]);
    expect(evaluated?.avgRebound).toBe(42);
  });
});
