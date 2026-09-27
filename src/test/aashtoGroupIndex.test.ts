import { describe, expect, it } from "vitest";
import { calculateAashtoGroupIndex } from "@/lib/soilClassification";

/**
 * AASHTO M 145 (2008) 6.4 group index:
 *
 *   GI = (F - 35)[0.2 + 0.005(LL - 40)] + 0.01(F - 15)(PI - 10)
 *
 * F is the percentage passing the 75 µm (No. 200) sieve. The figures worked below are the
 * standard's own examples, so the values are pinned to the published text rather than to a
 * re-typed copy of the expression.
 */
describe("AASHTO group index (M 145)", () => {
  it("adds both terms for the silt-clay groups", () => {
    // M 145 figure 1 example: 82% passing, LL 38, PI 21 → 8.9 for the LL term and 7.4 for
    // the PI term, 16.3 in total, reported as the whole number 16.
    expect(calculateAashtoGroupIndex({ passingNo200: 82, liquidLimit: 38, plasticityIndex: 21, aashtoGroup: "A-7-6" })).toBe(16);
  });

  it("uses the plasticity term alone for the A-2-6 and A-2-7 subgroups", () => {
    // M 145 6.4.4: an A-2-6 material with 30% passing, LL 50 and PI 30 gives
    // 0.01(30 - 15)(30 - 10) = 3, with a note that only the PI portion of the formula is used.
    expect(calculateAashtoGroupIndex({ passingNo200: 30, liquidLimit: 50, plasticityIndex: 30, aashtoGroup: "A-2-6" })).toBe(3);
    expect(calculateAashtoGroupIndex({ passingNo200: 30, liquidLimit: 50, plasticityIndex: 30, aashtoGroup: "A-2-7" })).toBe(3);
    // The liquid limit term would pull the same soil down to 2, so the group has to be passed in.
    expect(calculateAashtoGroupIndex({ passingNo200: 30, liquidLimit: 50, plasticityIndex: 30, aashtoGroup: "A-6" })).toBe(2);
  });

  it("reports a negative result as zero", () => {
    // M 145 6.4.3: 60% passing, LL 25 and PI 1 gives 3.1 - 4.1 = -1.0, reported as zero.
    expect(calculateAashtoGroupIndex({ passingNo200: 60, liquidLimit: 25, plasticityIndex: 1, aashtoGroup: "A-4" })).toBe(0);
  });

  it("reports a whole number rather than the fractional result", () => {
    // 50% passing, LL 45 and PI 10 gives (15)(0.225) = 3.375, reported as 3.
    expect(calculateAashtoGroupIndex({ passingNo200: 50, liquidLimit: 45, plasticityIndex: 10, aashtoGroup: "A-6" })).toBe(3);
  });

  it("does not truncate a high index, since M 145 sets no ceiling", () => {
    // 100% passing, LL 60 and PI 30 gives (65)(0.3) + 0.01(85)(20) = 19.5 + 17 = 36.5 → 37,
    // and a PI of 40 pushes the same soil past 40.
    expect(calculateAashtoGroupIndex({ passingNo200: 100, liquidLimit: 60, plasticityIndex: 30, aashtoGroup: "A-7-6" })).toBe(37);
    expect(calculateAashtoGroupIndex({ passingNo200: 100, liquidLimit: 60, plasticityIndex: 40, aashtoGroup: "A-7-6" })).toBe(45);
  });

  it("reads F from the No. 200 sieve, so a No. 40 value cannot stand in for it", () => {
    // 60% passing No. 200 with LL 30 and PI 11 gives (25)(0.15) + 0.01(45)(1) = 4.2 → 4,
    // while the 85% passing No. 40 of the same sample would have reported 8.
    expect(calculateAashtoGroupIndex({ passingNo200: 60, liquidLimit: 30, plasticityIndex: 11, aashtoGroup: "A-6" })).toBe(4);
    expect(calculateAashtoGroupIndex({ passingNo200: 85, liquidLimit: 30, plasticityIndex: 11, aashtoGroup: "A-6" })).toBe(8);
  });

  it("withholds the index when a measured input is missing", () => {
    expect(calculateAashtoGroupIndex({ passingNo200: Number.NaN, liquidLimit: 30, plasticityIndex: 11 })).toBeNull();
    expect(calculateAashtoGroupIndex({ passingNo200: 60, liquidLimit: Number.NaN, plasticityIndex: 11 })).toBeNull();
    expect(calculateAashtoGroupIndex({ passingNo200: 60, liquidLimit: 30, plasticityIndex: Number.NaN })).toBeNull();
  });
});
