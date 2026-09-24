import { describe, expect, it } from "vitest";
import { calculateGrading, calculateMoisture } from "@/lib/gradingCalculations";

describe("grading calculations", () => {
  it("calculates retained and cumulative passing percentages", () => {
    const result = calculateGrading([
      { sieveSize: "10", weightRetained: "25" },
      { sieveSize: "5", weightRetained: "25" },
      { sieveSize: "2", weightRetained: "50" },
      { sieveSize: "Pan", weightRetained: "0" },
    ]);

    expect(result.totalWeight).toBe(100);
    expect(result.percentageRetained).toEqual([25, 25, 50, 0]);
    expect(result.cumulativePassing).toEqual([75, 50, 0, null]);
  });

  it("interpolates D values on a logarithmic particle-size scale", () => {
    const result = calculateGrading([
      { sieveSize: "1", weightRetained: "0" },
      { sieveSize: "0.1", weightRetained: "50" },
      { sieveSize: "0.01", weightRetained: "50" },
    ]);

    expect(result.d10).toBeCloseTo(0.0158489, 6);
    expect(result.d30).toBeCloseTo(0.0398107, 6);
    expect(result.d60).toBeCloseTo(0.1584893, 6);
    expect(result.cu).toBeCloseTo(10, 6);
    expect(result.cc).toBeCloseTo(0.630957, 5);
  });

  it("calculates moisture content from wet and dry masses", () => {
    expect(calculateMoisture("109", "85.5")).toEqual({ waterWeight: 23.5, moistureContent: (23.5 / 85.5) * 100 });
    expect(calculateMoisture("", "85.5")).toEqual({ waterWeight: null, moistureContent: null });
  });
});
