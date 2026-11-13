import { describe, expect, it } from "vitest";
import {
  L_D_MAX,
  L_D_MIN,
  MIN_SPECIMENS,
  STRESS_RATE_MAX,
  STRESS_RATE_MIN,
  assessConformity,
  calculateSpecimen,
  sampleStandardDeviation,
  type UCSSpecimenRow,
} from "@/lib/ucsCalculations";

const row = (overrides: Partial<UCSSpecimenRow> = {}): UCSSpecimenRow => ({
  sampleId: "S1",
  diameter: "50",
  length: "125",
  load: "100",
  ...overrides,
});

describe("UCS specimen calculations", () => {
  it("computes strength as 4F / (pi d^2)", () => {
    const specimen = calculateSpecimen(row());
    expect(specimen).not.toBeNull();
    expect(specimen!.area).toBeCloseTo((Math.PI / 4) * 50 * 50, 4);
    // F = 100 kN -> 100000 N; A = pi/4 * 2500 = 1963.50 mm^2 -> qu = 50.93 MPa
    expect(specimen!.strength).toBeCloseTo(100000 / ((Math.PI / 4) * 2500), 4);
    expect(specimen!.ldRatio).toBeCloseTo(2.5, 6);
  });

  it("rejects rows with non-positive readings", () => {
    expect(calculateSpecimen(row({ load: "" }))).toBeNull();
    expect(calculateSpecimen(row({ load: "-10" }))).toBeNull();
    expect(calculateSpecimen(row({ diameter: "0" }))).toBeNull();
    expect(calculateSpecimen(row({ length: "-1" }))).toBeNull();
  });

  it("returns samples' coefficient of variation with two-decimal-format consistency", () => {
    expect(sampleStandardDeviation([10, 10, 10])).toBe(0);
    expect(sampleStandardDeviation([10, 20])).toBeCloseTo(7.071, 3);
  });

  it("requires at least MIN_SPECIMENS valid specimens for a conforming test", () => {
    const rows = [row({ sampleId: "A" }), row({ sampleId: "B" })];
    const result = assessConformity(rows, { orientationToBedding: "parallel", stressRate: "0.75", failureMode: "Through midsection", flatEnds: "pass" });
    expect(result.stats?.count).toBe(2);
    expect(result.conformityValid).toBe(false);
    expect(result.warnings.join(" ")).toContain("at least");
  });

  it("produces stats when at least 3 specimens are valid", () => {
    const rows = [row({ sampleId: "A" }), row({ sampleId: "B" }), row({ sampleId: "C" })];
    const result = assessConformity(rows, { orientationToBedding: "parallel", stressRate: "0.75", failureMode: "Through midsection", flatEnds: "pass" });
    expect(result.stats?.count).toBe(3);
    expect(result.stats?.mean).toBeCloseTo(100000 / ((Math.PI / 4) * 2500), 4);
    expect(result.stats?.standardDeviation).toBe(0);
    expect(result.stats?.coefficientOfVariation).toBe(0);
    expect(result.conformityValid).toBe(true);
  });

  it("warns on L/D outside the ISRM range", () => {
    const rows = [row({ sampleId: "short", length: "50" }), row({ sampleId: "B" }), row({ sampleId: "C" })];
    const result = assessConformity(rows, { orientationToBedding: "parallel", stressRate: "0.75", failureMode: "Through midsection", flatEnds: "pass" });
    expect(result.warnings.some((w) => w.includes("L/D"))).toBe(true);
    expect(result.conformityValid).toBe(false);
  });

  it("warns when the stress rate is outside the ISRM envelope", () => {
    const rows = [row({ sampleId: "A" }), row({ sampleId: "B" }), row({ sampleId: "C" })];
    const result = assessConformity(rows, { orientationToBedding: "parallel", stressRate: "2.0", failureMode: "Through midsection", flatEnds: "pass" });
    expect(result.warnings.some((w) => w.includes("Stress rate"))).toBe(true);
    expect(result.conformityValid).toBe(false);
  });

  it("asks for re-testing when specimens fail through their ends", () => {
    const rows = [row({ sampleId: "A" }), row({ sampleId: "B" }), row({ sampleId: "C" })];
    const result = assessConformity(rows, { orientationToBedding: "parallel", stressRate: "0.75", failureMode: "Through ends (ESTIMATED failure mode)", flatEnds: "pass" });
    expect(result.warnings.some((w) => w.includes("through the ends"))).toBe(true);
    expect(result.conformityValid).toBe(false);
  });

  it("asks for end-flat confirmation as a conformity condition", () => {
    const rows = [row({ sampleId: "A" }), row({ sampleId: "B" }), row({ sampleId: "C" })];
    const result = assessConformity(rows, { orientationToBedding: "parallel", stressRate: "0.75", failureMode: "Through midsection", flatEnds: "not recorded yet" });
    expect(result.warnings.some((w) => w.includes("flatness"))).toBe(true);
    expect(result.conformityValid).toBe(false);
  });
});
