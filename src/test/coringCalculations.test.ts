import { describe, expect, it } from "vitest";
import {
  calculateCoreStrength,
  calculateLDRatio,
  lDCorrectionFactor,
  calculateCorrectedStrength,
  calculateCoringRows,
  averageCorrectedStrength,
} from "@/lib/coringCalculations";

describe("coring calculations", () => {
  it("calculates core strength in MPa from load (kN) and diameter (mm)", () => {
    // Ø82 mm, 260 kN -> ~49.2 MPa
    expect(calculateCoreStrength("82", "260")).toBeCloseTo(49.2, 1);
  });

  it("calculates L/D ratio", () => {
    expect(calculateLDRatio("82", "82")).toBeCloseTo(1.0, 2);
    expect(calculateLDRatio("82", "164")).toBeCloseTo(2.0, 2);
  });

  it("applies the L/D correction factor", () => {
    expect(lDCorrectionFactor(2.0)).toBe(1.0);
    expect(lDCorrectionFactor(1.5)).toBeCloseTo(0.9675, 4);
    expect(lDCorrectionFactor(1.0)).toBeCloseTo(0.935, 4);
  });

  it("returns null for calculateCorrectedStrength when inputs are missing", () => {
    expect(calculateCorrectedStrength("", "", "")).toBeNull();
  });

  it("calculates corrected strength for a valid core", () => {
    const result = calculateCorrectedStrength("82", "82", "260");
    expect(result).toBeCloseTo(49.2 * 0.935, 1);
  });

  it("calculates average corrected strength", () => {
    const rows = [
      { coreId: "CR1", diameter: "82", length: "82", load: "260" },
      { coreId: "CR2", diameter: "82", length: "164", load: "260" },
    ];
    const calcs = calculateCoringRows(rows);
    const avg = averageCorrectedStrength(calcs);
    expect(avg).toBeGreaterThan(0);
  });

  it("returns null average for empty input", () => {
    expect(averageCorrectedStrength([])).toBeNull();
  });
});