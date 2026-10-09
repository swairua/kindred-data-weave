import { describe, expect, it } from "vitest";
import { classifySoilAASHTO, getAashtoEvidenceWarnings } from "@/lib/soilClassification";

/**
 * AASHTO M 145 granular groups from the laboratory's classification note
 * (AASHTO SOIL CLASSIFICATION SYSTEM — Developer Logic & Classification
 * Rules, reference Table 5.1):
 *
 * - A-1-a: P10 ≤ 50, P40 ≤ 30, P200 ≤ 15, PI ≤ 6
 * - A-1-b: P40 ≤ 50, P200 ≤ 25, PI ≤ 6
 * - A-3: P40 ≥ 51, P200 ≤ 10, non-plastic
 * - A-2-4…A-2-7: P200 ≤ 35 with the LL ≤/> 40 × PI ≤/> 10 splits
 *
 * LL plays no role in the A-1-a / A-1-b / A-3 verdicts.
 */
const granular = (fines: number, liquidLimit = 0, plasticityIndex = 0) => ({
  grainSize: { gravel: 100 - fines, sand: 0, fines },
  atterberg: { liquidLimit, plasticLimit: liquidLimit - plasticityIndex, plasticityIndex },
});

describe("AASHTO granular classification (M 145 note)", () => {
  it("classifies A-1-a when all three sieve caps and the PI cap hold", () => {
    const { grainSize, atterberg } = granular(12, 30, 4);
    expect(classifySoilAASHTO(grainSize, atterberg, { p10: 40, p40: 25 })).toBe("A-1-a");
  });

  it("classifies A-1-a on the boundary values (P10 50, P40 30, P200 15, PI 6)", () => {
    const { grainSize, atterberg } = granular(15, 40, 6);
    expect(classifySoilAASHTO(grainSize, atterberg, { p10: 50, p40: 30 })).toBe("A-1-a");
  });

  it("rejects A-1-a when P200 exceeds 15 and falls through to A-1-b", () => {
    const { grainSize, atterberg } = granular(20, 30, 4);
    expect(classifySoilAASHTO(grainSize, atterberg, { p10: 40, p40: 25 })).toBe("A-1-b");
  });

  it("rejects A-1-a when P40 exceeds 30 and falls through to A-2-4", () => {
    const { grainSize, atterberg } = granular(30, 30, 4);
    expect(classifySoilAASHTO(grainSize, atterberg, { p10: 40, p40: 40 })).toBe("A-2-4");
  });

  it("classifies A-1-b on its boundary values (P40 50, P200 25, PI 6)", () => {
    const { grainSize, atterberg } = granular(25, 35, 6);
    expect(classifySoilAASHTO(grainSize, atterberg, { p10: 80, p40: 50 })).toBe("A-1-b");
  });

  it("ignores liquid limit for the A-1 groups", () => {
    const { grainSize, atterberg } = granular(12, 55, 4);
    expect(classifySoilAASHTO(grainSize, atterberg, { p10: 40, p40: 25 })).toBe("A-1-a");
  });

  it("classifies A-3 fine sand (P40 ≥ 51, P200 ≤ 10, NP)", () => {
    const { grainSize, atterberg } = granular(8, 0, 0);
    expect(classifySoilAASHTO(grainSize, atterberg, { p10: 100, p40: 85 })).toBe("A-3");
  });

  it("classifies A-3 via the explicit non-plastic flag", () => {
    const { grainSize, atterberg } = granular(8, 28, 0);
    expect(
      classifySoilAASHTO(grainSize, atterberg, { p10: 100, p40: 85, nonPlastic: true }),
    ).toBe("A-3");
  });

  it("does not classify plastic fine sand as A-3", () => {
    const { grainSize, atterberg } = granular(8, 30, 12);
    expect(classifySoilAASHTO(grainSize, atterberg, { p10: 100, p40: 85 })).toBe("A-2-6");
  });

  it("routes the A-2 subgroups on LL and PI alone", () => {
    const g4 = granular(30, 30, 8);
    expect(classifySoilAASHTO(g4.grainSize, g4.atterberg, { p10: 90, p40: 80 })).toBe("A-2-4");
    const g5 = granular(30, 45, 8);
    expect(classifySoilAASHTO(g5.grainSize, g5.atterberg, { p10: 90, p40: 80 })).toBe("A-2-5");
    const g6 = granular(30, 30, 12);
    expect(classifySoilAASHTO(g6.grainSize, g6.atterberg, { p10: 90, p40: 80 })).toBe("A-2-6");
    const g7 = granular(30, 45, 12);
    expect(classifySoilAASHTO(g7.grainSize, g7.atterberg, { p10: 90, p40: 80 })).toBe("A-2-7");
  });

  it("keeps the legacy approximation when P40 is missing", () => {
    const low = granular(12, 30, 4);
    expect(classifySoilAASHTO(low.grainSize, low.atterberg)).toBe("A-1-a");
    const high = granular(12, 45, 4);
    expect(classifySoilAASHTO(high.grainSize, high.atterberg)).toBe("A-1-b");
  });

  it("keeps the silt-clay routing untouched", () => {
    const a4 = granular(50, 30, 8);
    expect(classifySoilAASHTO(a4.grainSize, a4.atterberg, { p10: 100, p40: 100 })).toBe("A-4");
    const a76 = granular(60, 50, 25);
    expect(classifySoilAASHTO(a76.grainSize, a76.atterberg, { p10: 100, p40: 100 })).toBe("A-7-6");
    const a75 = granular(60, 50, 15);
    expect(classifySoilAASHTO(a75.grainSize, a75.atterberg, { p10: 100, p40: 100 })).toBe("A-7-5");
  });
});

describe("AASHTO evidence warnings", () => {
  it("flags a missing No. 40 value for granular soils in the A-1/A-3 zone", () => {
    expect(
      getAashtoEvidenceWarnings({ p10: 40, p40: null, p200: 12, plasticityIndex: 4 }),
    ).toEqual([
      "No. 40 sieve (0.425 mm) passing value is missing — A-1-a, A-1-b and A-3 cannot be verified.",
    ]);
  });

  it("flags a missing No. 10 value only when A-1-a is otherwise reachable", () => {
    expect(
      getAashtoEvidenceWarnings({ p10: null, p40: 25, p200: 12, plasticityIndex: 4 }),
    ).toEqual([
      "No. 10 sieve (2.00 mm) passing value is missing — A-1-a cannot be fully verified.",
    ]);
    // P40 above the A-1-a cap: no warning, the soil cannot be A-1-a anyway.
    expect(
      getAashtoEvidenceWarnings({ p10: null, p40: 40, p200: 30, plasticityIndex: 4 }),
    ).toEqual([]);
  });

  it("stays silent for A-2 soils and silt-clay soils", () => {
    expect(
      getAashtoEvidenceWarnings({ p10: null, p40: null, p200: 30, plasticityIndex: 12 }),
    ).toEqual([]);
    expect(
      getAashtoEvidenceWarnings({ p10: null, p40: null, p200: 60, plasticityIndex: 20 }),
    ).toEqual([]);
  });

  it("flags a missing No. 200 value as blocking", () => {
    expect(
      getAashtoEvidenceWarnings({ p10: 40, p40: 25, p200: null, plasticityIndex: 4 }),
    ).toEqual([
      "No. 200 passing value is missing — AASHTO classification cannot be determined.",
    ]);
  });
});
