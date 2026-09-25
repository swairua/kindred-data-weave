import { describe, expect, it } from "vitest";
import { calculateGrading, calculateHydrometer, calculateMoisture, type HydrometerInputs } from "@/lib/gradingCalculations";

/** BS 1377-2:1990 defaults: 152H body, 20 °C, 0.1 meniscus, 1000 cm³ suspension. */
const BASE_INPUTS: HydrometerInputs = {
  dryWeight: "50",
  suspensionVolume: "1000",
  sG: "2.65",
  temperature: "20",
  hydrometerType: "152H",
  zeroCorrection: "0",
  meniscusCorrection: "0.1",
  temperatureCorrection: "",
  kFactor: "",
};

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

describe("hydrometer analysis", () => {
  it("applies the composite correction to the reading", () => {
    const result = calculateHydrometer([{ time: "2", actualHydrometer: "10" }], BASE_INPUTS, "50");
    // Meniscus 0.1 + interpolated 20 °C temperature correction of -0.05
    expect(result.compositeCorrection).toBeCloseTo(0.05, 6);
    expect(result.results[0].adjustedReading).toBeCloseTo(10, 6);
    expect(result.results[0].correctedReading).toBeCloseTo(10.05, 6);
    // H = 15.2 + 0.4444 × 10.05
    expect(result.results[0].effectiveDepth).toBeCloseTo(19.66622, 4);
  });

  it("derives Stokes' constant from the water viscosity at the test temperature", () => {
    const at15 = calculateHydrometer([], { ...BASE_INPUTS, temperature: "15" }, "50");
    const at20 = calculateHydrometer([], { ...BASE_INPUTS, temperature: "20" }, "50");
    const at30 = calculateHydrometer([], { ...BASE_INPUTS, temperature: "30" }, "50");
    expect(at20.stokesConstant).toBeCloseTo(1.3582, 4);
    // D ∝ √ν, so colder (more viscous) water reports larger equivalent diameters
    expect(at15.stokesConstant).toBeGreaterThan(at20.stokesConstant);
    expect(at30.stokesConstant).toBeLessThan(at20.stokesConstant);
  });

  it("computes the equivalent particle diameter by Stokes' law", () => {
    const result = calculateHydrometer([{ time: "2", actualHydrometer: "10" }], BASE_INPUTS, "50");
    // D = K·√(H(m) / ((sG − 1)·t(s))) with H = 0.1967 m, t = 120 s
    expect(result.results[0].particleDiameter).toBeCloseTo(0.0428, 4);
  });

  it("reduces the equivalent diameter as settling time increases", () => {
    const result = calculateHydrometer([
      { time: "1", actualHydrometer: "10" },
      { time: "2", actualHydrometer: "10" },
      { time: "4", actualHydrometer: "10" },
    ], BASE_INPUTS, "50");
    const [, twoMinute, fourMinute] = result.results;
    expect(twoMinute.particleDiameter).toBeLessThan(result.results[0].particleDiameter as number);
    expect(fourMinute.particleDiameter).toBeLessThan(twoMinute.particleDiameter as number);
    // D ∝ 1/√t, so doubling the settling time from 2 to 4 min scales the diameter by √2
    expect(fourMinute.particleDiameter).toBeCloseTo((twoMinute.particleDiameter as number) / Math.SQRT2, 6);
    // A fourfold increase from 1 to 4 min halves the diameter
    expect(fourMinute.particleDiameter).toBeCloseTo((result.results[0].particleDiameter as number) / 2, 6);
  });

  it("computes percentage finer on the hydrometer and whole-sample bases", () => {
    const result = calculateHydrometer([{ time: "2", actualHydrometer: "10" }], BASE_INPUTS, "100");
    // (R × sG × V) / (M × 1000) × 100 — 50 g hydrometer sample, 100 g total sample
    expect(result.results[0].finesInSuspension).toBeCloseTo(53.265, 3);
    expect(result.results[0].finesByHydrometer).toBeCloseTo(26.6325, 3);
  });

  it("honours a manual temperature correction over the tabulated value", () => {
    const result = calculateHydrometer(
      [{ time: "2", actualHydrometer: "10" }],
      { ...BASE_INPUTS, temperatureCorrection: "0.4" },
      "50",
    );
    expect(result.temperatureCorrection).toBeCloseTo(0.4, 6);
    expect(result.compositeCorrection).toBeCloseTo(0.5, 6);
  });

  it("adds the zero correction to the actual reading", () => {
    const result = calculateHydrometer(
      [{ time: "2", actualHydrometer: "10" }],
      { ...BASE_INPUTS, zeroCorrection: "0.5" },
      "50",
    );
    expect(result.results[0].adjustedReading).toBeCloseTo(10.5, 6);
  });

  it("uses a deeper calibration intercept for a 151E body", () => {
    const body152H = calculateHydrometer([{ time: "2", actualHydrometer: "10" }], { ...BASE_INPUTS, hydrometerType: "152H" }, "50");
    const body151E = calculateHydrometer([{ time: "2", actualHydrometer: "10" }], { ...BASE_INPUTS, hydrometerType: "151E" }, "50");
    expect(body151E.results[0].effectiveDepth).toBeCloseTo((body152H.results[0].effectiveDepth as number) + 1.3, 4);
  });

  it("returns nulls rather than fabricated values when a reading is absent", () => {
    const result = calculateHydrometer([{ time: "2", actualHydrometer: "" }], BASE_INPUTS, "50");
    expect(result.results[0].time).toBe(2);
    expect(result.results[0].adjustedReading).toBeNull();
    expect(result.results[0].correctedReading).toBeNull();
    expect(result.results[0].particleDiameter).toBeNull();
    expect(result.results[0].finesByHydrometer).toBeNull();
  });

  it("returns nulls for percentage finer when no sample mass is recorded", () => {
    const result = calculateHydrometer(
      [{ time: "2", actualHydrometer: "10" }],
      { ...BASE_INPUTS, dryWeight: "" },
      "",
    );
    expect(result.results[0].finesInSuspension).toBeNull();
    expect(result.results[0].finesByHydrometer).toBeNull();
    // Diameter does not depend on the sample mass
    expect(result.results[0].particleDiameter).toBeCloseTo(0.0428, 4);
  });
});
});
