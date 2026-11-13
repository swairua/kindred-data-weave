import { describe, expect, it } from "vitest";
import {
  MIN_SPECIMENS,
  IS50_CORRECTION_EXPONENT,
  COV_MAX,
  calculatePointLoadIndex,
  calculateSpecimen,
  sampleStandardDeviation,
  assessConformity,
  type PointLoadRow,
} from "@/lib/pointLoadCalculations";

const row = (overrides: Partial<PointLoadRow> = {}): PointLoadRow => ({
  sampleId: "P1",
  specimenType: "diametral core",
  failureLoad: "2.5",
  de: "54",
  ...overrides,
});

describe("Point load calculations", () => {
  it("computes Is from failure load and equivalent diameter, normalising to 50 mm", () => {
    const result = calculatePointLoadIndex("2.5", "54");
    expect(result).not.toBeNull();
    const expectedIs = (2.5 * 1000) / (54 * 54);
    expect(result!.is).toBeCloseTo(expectedIs, 4);
    expect(result!.is50).toBeCloseTo(expectedIs * Math.pow(54 / 50, IS50_CORRECTION_EXPONENT), 4);
  });

  it("computes Is50 = Is for a 50 mm core", () => {
    const result = calculatePointLoadIndex("1.2", "50");
    expect(result!.is50).toBeCloseTo(result!.is, 6);
  });

  it("rejects invalid inputs", () => {
    expect(calculatePointLoadIndex("", "54")).toBeNull();
    expect(calculatePointLoadIndex("-1", "54")).toBeNull();
    expect(calculatePointLoadIndex("2.5", "")).toBeNull();
  });

  it("produces stats only when at least 1 specimen is valid", () => {
    const rows = [row({ sampleId: "A" }), row({ sampleId: "B" }), row({ sampleId: "C" }), row({ sampleId: "D" }), row({ sampleId: "E" }), row({ sampleId: "F" }), row({ sampleId: "G" }), row({ sampleId: "H" }), row({ sampleId: "I" }), row({ sampleId: "J" })];
    const result = assessConformity(rows, { orientationToBedding: "parallel" });
    expect(result.stats?.count).toBe(10);
    expect(result.stats?.mean).toBeCloseTo(rows.reduce((acc, _) => acc + (2.5 * 1000 / (54 * 54)) * Math.pow(54 / 50, IS50_CORRECTION_EXPONENT), 0) / 10, 4);
    expect(result.warnings.length).toBe(0);
    expect(result.conformityValid).toBe(true);
  });

  it("requires orientationToBedding for a passing set", () => {
    const rows = Array.from({ length: MIN_SPECIMENS }, () => row());
    const result = assessConformity(rows, { orientationToBedding: "" });
    expect(result.warnings.some((w) => w.includes("Orientation"))).toBe(true);
    expect(result.conformityValid).toBe(false);
  });

  it("fails conformance when fewer than MIN_SPECIMENS valid tests are provided", () => {
    const rows = [row(), row(), row()];
    const result = assessConformity(rows, { orientationToBedding: "parallel" });
    expect(result.stats?.count).toBe(3);
    expect(result.conformityValid).toBe(false);
    expect(result.warnings.some((w) => w.includes("at least"))).toBe(true);
  });

  it("fails conformance when COV is above the limit", () => {
    const rows = [row({ failureLoad: "1.0" }), row({ failureLoad: "5.0" }), row({ failureLoad: "1.0" }), row({ failureLoad: "5.0" }), row({ failureLoad: "1.0" }), row({ failureLoad: "5.0" }), row({ failureLoad: "1.0" }), row({ failureLoad: "5.0" })];
    // Need at least MIN_SPECIMENS; with a wild spread, COV is huge
    const many = Array.from({ length: MIN_SPECIMENS }, (_, i) => row({ failureLoad: i % 2 === 0 ? "0.5" : "10.0" }));
    const result = assessConformity(many, { orientationToBedding: "parallel" });
    expect(result.stats?.count).toBe(MIN_SPECIMENS);
    expect(result.stats?.coefficientOfVariation).toBeGreaterThan(COV_MAX);
    expect(result.conformityValid).toBe(false);
    expect(result.warnings.some((w) => w.includes("Coefficient of variation"))).toBe(true);
  });

  it("applies the 0.75-power normalisation, not squared", () => {
    const { is50 } = calculateSpecimen(row({ failureLoad: "2.5", de: "54" }))!;
    const { is } = calculateSpecimen(row({ failureLoad: "2.5", de: "54" }))!;
    const expected = is * Math.pow(54 / 50, IS50_CORRECTION_EXPONENT);
    expect(is50).toBeCloseTo(expected, 4);
    expect(is50).not.toBeCloseTo(is * (54 / 50) ** 2, 2);
  });

  it("warns on De outside the preferred range", () => {
    const rows = Array.from({ length: MIN_SPECIMENS }, () => row({ de: "15" }));
    const result = assessConformity(rows, { orientationToBedding: "parallel" });
    expect(result.warnings.some((w) => w.includes("15"))).toBe(true);
    expect(result.conformityValid).toBe(false);
  });
});
