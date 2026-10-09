import { describe, it, expect } from "vitest";

import {
  ageOf,
  buildAgeGroups,
  classBandTargets,
  cubeStrengthFromClass,
  densityOf,
  emptyCubeRow,
  expectedPercentAtAge,
  expectedStrength,
  formatDensity,
  formatStrength,
  gainSummary,
  getPassFailResults,
  getStrengthDistribution,
  groupVerdict,
  mostCommonCastDate,
  parseNumber,
  strengthOf,
  STRENGTH_GAIN_TABLE,
  type CompressiveCubeInput,
} from "@/lib/compressiveCalculations";

const cube = (over: Partial<CompressiveCubeInput> = {}): CompressiveCubeInput => ({
  ...emptyCubeRow(),
  ...over,
});

describe("parseNumber", () => {
  it("maps blanks and non-numeric input to null rather than NaN or 0", () => {
    expect(parseNumber("")).toBeNull();
    expect(parseNumber(null)).toBeNull();
    expect(parseNumber(undefined)).toBeNull();
    expect(parseNumber("abc")).toBeNull();
  });

  it("keeps a real zero as zero", () => {
    expect(parseNumber("0")).toBe(0);
  });
});

describe("strengthOf", () => {
  it("computes MPa from kN over the mm² cross-section", () => {
    // 667 kN on a 150 x 150 mm face = 667000 N / 22500 mm² = 29.64 MPa
    const row = cube({ load: "667", width: "150", height: "150" });
    expect(strengthOf(row)).toBeCloseTo(29.6444, 4);
    expect(formatStrength(row)).toBe("29.64");
  });

  it("reproduces the value already stored in the database", () => {
    // database/livemain.sql cube 1: 667 kN, 150x150, stored as 29.64
    expect(formatStrength(cube({ load: "667", width: "150", height: "150" }))).toBe("29.64");
  });

  it("scales with the loaded face, so 100 mm cubes are not compared to 150 mm ones", () => {
    const hundred = cube({ load: "300", width: "100", height: "100" });
    const hundredFifty = cube({ load: "300", width: "150", height: "150" });
    expect(strengthOf(hundred)).toBeCloseTo(30, 6);
    expect(strengthOf(hundredFifty)).toBeCloseTo(13.33, 2);
  });

  it("returns null when the cube cannot be computed, so 'not entered' is not 0 MPa", () => {
    expect(strengthOf(cube({ load: "", width: "150", height: "150" }))).toBeNull();
    expect(strengthOf(cube({ load: "667", width: "", height: "150" }))).toBeNull();
    expect(strengthOf(cube({ load: "667", width: "0", height: "150" }))).toBeNull();
  });

  it("preserves a genuine 0 MPa result instead of discarding it", () => {
    // A cube that carried no load is a real, very serious result and must be reported.
    const row = cube({ load: "0", width: "150", height: "150" });
    expect(strengthOf(row)).toBe(0);
    expect(formatStrength(row)).toBe("0.00");
  });
});

describe("densityOf", () => {
  it("converts grams and mm³ to kg/m³", () => {
    // 8100 g in a 150 mm cube => 8.1 kg / 0.003375 m³ = 2400 kg/m³
    const row = cube({ mass: "8100", width: "150", height: "150", depth: "150" });
    expect(densityOf(row)).toBeCloseTo(2400, 6);
    expect(formatDensity(row)).toBe("2400");
  });

  it("returns null when the mass was never measured", () => {
    expect(densityOf(cube({ mass: "", width: "150", height: "150", depth: "150" }))).toBeNull();
  });
});

describe("getPassFailResults", () => {
  it("counts a 0 MPa cube as a failure rather than dropping it", () => {
    // Regression: the old `.filter(Boolean)` discarded 0 and hid the failure.
    const rows = [
      cube({ load: "0", width: "150", height: "150" }),
      cube({ load: "800", width: "150", height: "150" }),
    ];
    const result = getPassFailResults(rows, 25);
    expect(result.tested).toBe(2);
    expect(result.failCount).toBe(1);
    expect(result.passCount).toBe(1);
  });
  it("ignores rows that produce no strength at all", () => {
    const rows = [cube({ load: "" }), cube({ load: "800", width: "150", height: "150" })];
    expect(getPassFailResults(rows, 25).tested).toBe(1);
  });
});


describe("groupVerdict", () => {
  it("accepts a group whose mean reaches the target and whose lowest cube is within margin", () => {
    expect(groupVerdict(31, 27, 30)?.accepted).toBe(true);
  });

  it("rejects when a single cube is more than the margin below target, even if the mean passes", () => {
    const verdict = groupVerdict(31, 25, 30);
    expect(verdict?.meetsMean).toBe(true);
    expect(verdict?.meetsLowestCube).toBe(false);
    expect(verdict?.accepted).toBe(false);
  });

  it("rejects when the mean itself is below target", () => {
    expect(groupVerdict(20, 18, 30)?.accepted).toBe(false);
  });

  it("returns null when the group is empty", () => {
    expect(groupVerdict(null, null, 30)).toBeNull();
  });
});

describe("buildAgeGroups", () => {
  const targets = { oneDay: 4, threeDay: 10, sevenDay: 17, fourteenDay: 22.5, twentyEightDay: 25 };

  const atAge = (days: number, load: string) => {
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const cast = new Date(2026, 0, 1);
    const test = new Date(2026, 0, 1 + days);
    return cube({ dateOfCast: iso(cast), dateOfTest: iso(test), load, width: "150", height: "150" });
  };

  it("keeps 7-day and 28-day cubes in separate groups instead of averaging them together", () => {
    // 7-day at ~17 MPa and 28-day at ~35 MPa must never collapse into one 26 MPa "average".
    const groups = buildAgeGroups([atAge(7, "384"), atAge(28, "790")], targets);
    const seven = groups.bands.find((g) => g.key === "sevenDay")!;
    const twentyEight = groups.bands.find((g) => g.key === "twentyEightDay")!;

    expect(seven.count).toBe(1);
    expect(seven.mean).toBeCloseTo(17.07, 1);
    expect(twentyEight.count).toBe(1);
    expect(twentyEight.mean).toBeCloseTo(35.11, 1);
  });

  it("routes a 3-day cube to its own band, judged against the 3-day target", () => {
    // Regression: the old bucket was `age <= 7`, so a 3-day cube was judged against 17 MPa.
    const groups = buildAgeGroups([atAge(3, "384")], targets);
    expect(groups.bands.find((g) => g.key === "sevenDay")!.count).toBe(0);
    const three = groups.bands.find((g) => g.key === "threeDay")!;
    expect(three.count).toBe(1);
    expect(three.target).toBe(10);
    expect(groups.other.count).toBe(0);
  });

  it("groups 1-day and 14-day cubes in their own bands", () => {
    const groups = buildAgeGroups([atAge(1, "100"), atAge(14, "600")], targets);
    expect(groups.bands.find((g) => g.key === "oneDay")!.count).toBe(1);
    expect(groups.bands.find((g) => g.key === "fourteenDay")!.count).toBe(1);
    expect(groups.other.count).toBe(0);
  });

  it("keeps off-nominal early ages under 'other'", () => {
    // 1-day and 3-day bands take exact days only, so a 2-day cube matches nothing.
    const groups = buildAgeGroups([atAge(2, "200")], targets);
    expect(groups.bands.every((g) => g.count === 0)).toBe(true);
    expect(groups.other.count).toBe(1);
  });

  it("tolerates a day either side of each reporting age", () => {
    const groups = buildAgeGroups([atAge(6, "384"), atAge(8, "384")], targets);
    expect(groups.bands.find((g) => g.key === "sevenDay")!.count).toBe(2);
    expect(groups.other.count).toBe(0);
  });

  it("reports ages 8-24 under 'other' rather than silently dropping them", () => {
    // Regression: the old buckets were age<=7 and 25..31, so a 10-day cube vanished.
    const groups = buildAgeGroups([atAge(10, "667")], targets);
    expect(groups.other.count).toBe(1);
  });

  it("counts every cube somewhere, so the groups reconcile with the total", () => {
    const rows = [atAge(7, "384"), atAge(14, "667"), atAge(28, "790"), atAge(60, "900")];
    const groups = buildAgeGroups(rows, targets);
    const total = groups.bands.reduce((sum, g) => sum + g.count, 0) + groups.other.count;
    expect(total).toBe(rows.length);
  });

  it("rejects a 28-day group whose mean is below target", () => {
    const groups = buildAgeGroups([atAge(28, "400"), atAge(28, "420")], targets);
    const band = groups.bands.find((g) => g.key === "twentyEightDay")!;
    expect(band.count).toBe(2);
    expect(band.verdict?.meetsMean).toBe(false);
    expect(band.verdict?.accepted).toBe(false);
  });

  it("rejects a 28-day group that passes on the mean but has one very low cube", () => {
    // 32 + 32 + 18 => mean ~27.3 clears 25, but 18 is more than 4 MPa below target.
    const groups = buildAgeGroups([atAge(28, "720"), atAge(28, "720"), atAge(28, "405")], targets);
    const band = groups.bands.find((g) => g.key === "twentyEightDay")!;
    expect(band.verdict?.meetsMean).toBe(true);
    expect(band.verdict?.meetsLowestCube).toBe(false);
    expect(band.verdict?.accepted).toBe(false);
  });

  it("has no verdict for an empty band", () => {
    const groups = buildAgeGroups([], targets);
    expect(groups.bands.every((g) => g.count === 0 && g.verdict === null)).toBe(true);
  });
});

describe("getStrengthDistribution", () => {
  it("classifies by strength band and counts a 0 MPa cube", () => {
    const rows = [
      cube({ load: "100", width: "150", height: "150" }), //  4.44 MPa -> veryLow
      cube({ load: "0", width: "150", height: "150" }), //  0.00 MPa -> veryLow
      cube({ load: "900", width: "150", height: "150" }), // 40.00 MPa -> high
    ];
    const dist = getStrengthDistribution(rows);
    expect(dist.veryLow).toBe(2);
    expect(dist.high).toBe(1);
    expect(dist.veryLow + dist.low + dist.normal + dist.high).toBe(3);
  });
});

describe("cubeStrengthFromClass", () => {
  it("uses the cube figure from a C20/25 style designation", () => {
    expect(cubeStrengthFromClass("C25/30")).toBe(30);
    expect(cubeStrengthFromClass("C20/25")).toBe(25);
  });

  it("falls back to the single figure when there is no pair", () => {
    expect(cubeStrengthFromClass("C30")).toBe(30);
    expect(cubeStrengthFromClass("M25")).toBe(25);
  });

  it("returns null when there is no usable number", () => {
    expect(cubeStrengthFromClass("")).toBeNull();
    expect(cubeStrengthFromClass("C")).toBeNull();
  });
});

describe("ageOf", () => {
  it("counts whole days between cast and test dates", () => {
    expect(ageOf("2026-01-01", "2026-01-29")).toBe(28);
    expect(ageOf("2026-01-01", "2026-01-01")).toBe(0);
  });

  it("returns null when a date is missing or the test predates the cast", () => {
    expect(ageOf("", "2026-01-29")).toBeNull();
    expect(ageOf("2026-01-01", "")).toBeNull();
    expect(ageOf("2026-01-29", "2026-01-01")).toBeNull();
  });
});

describe("auto-field guards", () => {
  it("rejects non-positive dimensions instead of dividing by them", () => {
    expect(strengthOf(cube({ load: "500", width: "0", height: "150" }))).toBeNull();
    expect(strengthOf(cube({ load: "500", width: "-150", height: "150" }))).toBeNull();
    expect(densityOf(cube({ mass: "8100", width: "150", height: "150", depth: "0" }))).toBeNull();
  });

  it("rejects a negative load instead of reporting negative strength", () => {
    expect(strengthOf(cube({ load: "-5", width: "150", height: "150" }))).toBeNull();
  });

  it("renders blanks for uncomputable auto fields rather than NaN or 0", () => {
    expect(formatStrength(cube({ load: "", width: "150", height: "150" }))).toBe("");
    expect(formatDensity(cube({ mass: "", width: "150", height: "150", depth: "150" }))).toBe("");
  });
});

describe("strength gain table", () => {
  it("holds the lab reference percentages for every reporting age", () => {
    expect(STRENGTH_GAIN_TABLE.map((row) => [row.days, row.percent])).toEqual([
      [1, 16],
      [3, 40],
      [7, 65],
      [14, 90],
      [28, 99],
    ]);
  });

  it("returns the expectation at exact reporting ages only", () => {
    expect(expectedPercentAtAge(7)).toBe(65);
    expect(expectedPercentAtAge(28)).toBe(99);
    expect(expectedPercentAtAge(2)).toBeNull();
    expect(expectedPercentAtAge(null)).toBeNull();
  });

  it("converts a class target into MPa at an age", () => {
    expect(expectedStrength(30, 7)).toBeCloseTo(19.5, 10);
    expect(expectedStrength(30, 2)).toBeNull();
    expect(expectedStrength(null, 7)).toBeNull();
  });

  it("derives all five band targets from a concrete class", () => {
    expect(classBandTargets(30)).toEqual({
      oneDay: 4.8,
      threeDay: 12,
      sevenDay: 19.5,
      fourteenDay: 27,
      twentyEightDay: 29.7,
    });
  });
});

describe("gainSummary", () => {
  it("shows achieved versus expected share of the class target", () => {
    const row = cube({ dateOfCast: "2026-01-01", dateOfTest: "2026-01-08", load: "667", width: "150", height: "150" });
    expect(gainSummary(row, 30)).toBe("99% (expected 65%)");
  });

  it("stays blank unless strength, age, expectation and target are all known", () => {
    const row = cube({ dateOfCast: "2026-01-01", dateOfTest: "2026-01-08", load: "667", width: "150", height: "150" });
    expect(gainSummary(row, null)).toBe("");
    expect(gainSummary(cube({ load: "", width: "150", height: "150" }), 30)).toBe("");
    // Age 2 is off the gain table, so there is no expectation to show.
    expect(gainSummary(cube({ dateOfCast: "2026-01-01", dateOfTest: "2026-01-03", load: "200", width: "150", height: "150" }), 30)).toBe("");
  });
});

describe("mostCommonCastDate", () => {
  it("returns the cast date most cubes share", () => {
    const rows = [
      cube({ dateOfCast: "2026-01-01" }),
      cube({ dateOfCast: "2026-01-02" }),
      cube({ dateOfCast: "2026-01-01" }),
    ];
    expect(mostCommonCastDate(rows)).toBe("2026-01-01");
  });

  it("ignores blank entries and resolves ties to the earliest date", () => {
    expect(mostCommonCastDate([cube({ dateOfCast: "" }), cube()])).toBeNull();
    const tied = [cube({ dateOfCast: "2026-01-02" }), cube({ dateOfCast: "2026-01-01" })];
    expect(mostCommonCastDate(tied)).toBe("2026-01-01");
  });
});
