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

  it("reports no percentage passing the pan row while still counting its mass", () => {
    // "<0.063" is the bottom of the stack: its mass is part of the sample, but nothing passes it.
    const result = calculateGrading([
      { sieveSize: "0.6", weightRetained: "15" },
      { sieveSize: "0.075", weightRetained: "25" },
      { sieveSize: "<0.063", weightRetained: "60" },
    ]);

    expect(result.totalWeight).toBe(100);
    expect(result.cumulativePassing).toEqual([85, 60, null]);
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
  it("adds the meniscus correction to the observed reading", () => {
    const result = calculateHydrometer([{ time: "2", actualHydrometer: "10" }], BASE_INPUTS, "50");
    // BS 1377-2:1990 9.5.7.2.1: Rh = Rn' + Cm, with no temperature term in the 1990 edition
    expect(result.compositeCorrection).toBeCloseTo(0.1, 6);
    expect(result.temperatureCorrection).toBe(0);
    expect(result.results[0].adjustedReading).toBeCloseTo(10, 6);
    expect(result.results[0].correctedReading).toBeCloseTo(10.1, 6);
    // H = 16.294964 - 0.164 x 10.1 on the 152H scale
    expect(result.results[0].effectiveDepth).toBeCloseTo(14.638564, 5);
  });

  it("applies no automatic temperature correction at any test temperature", () => {
    // The 1990 edition holds the suspension at the bath temperature and re-reads the
    // dispersant blank instead of correcting each reading, so only Cm reaches the reading.
    for (const temperature of ["15", "20", "25", "30"]) {
      const result = calculateHydrometer([{ time: "2", actualHydrometer: "10" }], { ...BASE_INPUTS, temperature }, "50");
      expect(result.temperatureCorrection).toBe(0);
      expect(result.compositeCorrection).toBeCloseTo(0.1, 6);
      expect(result.results[0].correctedReading).toBeCloseTo(10.1, 6);
    }
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
    // D = K·√(H(m) / ((sG − 1)·t(s))) with H = 0.14638564 m, t = 120 s
    expect(result.results[0].particleDiameter).toBeCloseTo(0.0369297, 6);
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
    // BS 1377-2:1990 9.5.7.2.5: K = 100 x sG x Rd / (m x (sG - 1)) with Rd = 10.1 g/L,
    // for a 50 g hydrometer sample and a 100 g whole sample
    expect(result.results[0].finesInSuspension).toBeCloseTo(32.4424242, 6);
    expect(result.results[0].finesByHydrometer).toBeCloseTo(16.2212121, 6);
  });

  it("reproduces K from the soil concentration the reading implies", () => {
    // Independent route: a reading of Rd g/L is the density excess of the suspension, so the
    // soil concentration is Rd x sG/(sG - 1) g/L and the 1 L cylinder holds that many grams.
    const reading = 10.1;
    const concentration = reading * 2.65 / (2.65 - 1);
    expect(concentration).toBeCloseTo(16.221212, 6);
    const result = calculateHydrometer([{ time: "2", actualHydrometer: "10" }], BASE_INPUTS, "50");
    expect(result.results[0].correctedReading).toBeCloseTo(reading, 6);
    expect(result.results[0].finesInSuspension).toBeCloseTo((concentration / 50) * 100, 9);
  });

  it("scales K with the sG/(sG - 1) specific-gravity correction", () => {
    const at265 = calculateHydrometer([{ time: "2", actualHydrometer: "10" }], BASE_INPUTS, "50");
    const at270 = calculateHydrometer([{ time: "2", actualHydrometer: "10" }], { ...BASE_INPUTS, sG: "2.70" }, "50");
    const factor = (2.7 / 1.7) / (2.65 / 1.65);
    expect(factor).toBeCloseTo(0.9889012, 6);
    expect(at270.results[0].finesInSuspension).toBeCloseTo((at265.results[0].finesInSuspension as number) * factor, 9);
  });

  it("withholds percentage finer when the specific gravity cannot be corrected", () => {
    // The (sG - 1) divisor collapses at sG = 1, so no percentage can be reported there.
    for (const sG of ["1", "0.9"]) {
      const result = calculateHydrometer([{ time: "2", actualHydrometer: "10" }], { ...BASE_INPUTS, sG }, "50");
      expect(result.results[0].finesInSuspension).toBeNull();
      expect(result.results[0].finesByHydrometer).toBeNull();
      expect(result.results[0].particleDiameter).toBeNull();
    }
    // A blank specific gravity falls back to the 2.65 default rather than to a blank result
    const blank = calculateHydrometer([{ time: "2", actualHydrometer: "10" }], { ...BASE_INPUTS, sG: "" }, "50");
    const assumed = calculateHydrometer([{ time: "2", actualHydrometer: "10" }], BASE_INPUTS, "50");
    expect(blank.specificGravity).toBe(2.65);
    expect(blank.results[0].finesInSuspension).toBeCloseTo(assumed.results[0].finesInSuspension as number, 9);
  });

  it("honours a manually entered temperature correction", () => {
    const result = calculateHydrometer(
      [{ time: "2", actualHydrometer: "10" }],
      { ...BASE_INPUTS, temperatureCorrection: "0.4" },
      "50",
    );
    expect(result.temperatureCorrection).toBeCloseTo(0.4, 6);
    expect(result.compositeCorrection).toBeCloseTo(0.5, 6);
    expect(result.results[0].correctedReading).toBeCloseTo(10.5, 6);
  });

  it("adds the zero correction to the actual reading", () => {
    const result = calculateHydrometer(
      [{ time: "2", actualHydrometer: "10" }],
      { ...BASE_INPUTS, zeroCorrection: "0.5" },
      "50",
    );
    expect(result.results[0].adjustedReading).toBeCloseTo(10.5, 6);
  });

  it("follows the published scale calibration of the recorded hydrometer body", () => {
    const row = [{ time: "2", actualHydrometer: "10" }];
    const body152H = calculateHydrometer(row, { ...BASE_INPUTS, hydrometerType: "152H" }, "50");
    const body151H = calculateHydrometer(row, { ...BASE_INPUTS, hydrometerType: "151H" }, "50");
    const unknown = calculateHydrometer(row, { ...BASE_INPUTS, hydrometerType: "not a body" }, "50");
    // 16.294964 - 0.164R on the 152H scale, 16.294964 - 0.2645R on the 151H scale
    expect(body152H.results[0].effectiveDepth).toBeCloseTo(14.638564, 5);
    expect(body151H.results[0].effectiveDepth).toBeCloseTo(13.623514, 5);
    // An unrecognised body falls back to the default rather than to a guessed curve
    expect(unknown.results[0].effectiveDepth).toBeCloseTo(body152H.results[0].effectiveDepth as number, 9);
  });

  it("reads the hydrometer shallower as the reading rises", () => {
    // A larger reading is a denser suspension, so the hydrometer floats higher and the
    // effective depth below the surface must shrink rather than grow.
    const result = calculateHydrometer([
      { time: "1", actualHydrometer: "5" },
      { time: "1", actualHydrometer: "20" },
      { time: "1", actualHydrometer: "40" },
    ], BASE_INPUTS, "50");
    const [low, mid, high] = result.results;
    expect(mid.effectiveDepth).toBeLessThan(low.effectiveDepth as number);
    expect(high.effectiveDepth).toBeLessThan(mid.effectiveDepth as number);
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
    expect(result.results[0].particleDiameter).toBeCloseTo(0.0369297, 6);
  });
});
});
