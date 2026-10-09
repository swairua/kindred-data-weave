/**
 * Pure calculations for the concrete cube compressive strength test.
 *
 * These were previously inline in the component, which made them impossible to unit test —
 * and they are the part of the feature that decides whether a result is accepted, so they
 * live here where they can be exercised directly.
 */

/** A cube row as it appears in the entry grid. `id` is null for a row not yet persisted. */
export interface CompressiveCubeInput {
  /** Database id of a persisted cube. Null/absent for rows the technician just added. */
  id?: number | null;
  mark: string;
  dateOfCast: string;
  dateOfTest: string;
  load: string;
  width: string;
  height: string;
  depth: string;
  mass: string;
  remarks: string;
}

/** A blank cube row with the standard 150 mm defaults. */
export const emptyCubeRow = (): CompressiveCubeInput => ({
  id: null,
  mark: "",
  dateOfCast: "",
  dateOfTest: "",
  load: "",
  width: "150",
  height: "150",
  depth: "150",
  mass: "",
  remarks: "",
});

/**
 * parseFloat that maps blanks, NaN and infinities to null.
 * Keeps "not entered" (null) distinct from a real 0, which matters because
 * 0 MPa is a legitimate — and failing — result.
 */
export const parseNumber = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/** Type guard that keeps 0 but drops null/NaN — the opposite of a truthiness check. */
export const isFiniteNumber = (value: number | null): value is number =>
  value !== null && Number.isFinite(value);

/** Render a nullable database value back into a text input, falling back to a default. */
export const toInputValue = (
  value: string | number | null | undefined,
  fallback = "",
): string => {
  if (value === null || value === undefined) return fallback;
  const text = String(value);
  return text === "" ? fallback : text;
};

/**
 * Days between two YYYY-MM-DD dates, or null if either is missing or the test
 * predates the cast. Both dates are built at local midnight and the result is
 * floored, so a daylight-saving shift across the interval cannot lose a day.
 */export const ageOf = (dateOfCast: string, dateOfTest: string): number | null => {
  if (!dateOfCast || !dateOfTest) return null;
  const [castYear, castMonth, castDay] = dateOfCast.split("-").map(Number);
  const [testYear, testMonth, testDay] = dateOfTest.split("-").map(Number);
  if ([castYear, castMonth, castDay, testYear, testMonth, testDay].some((p) => !Number.isFinite(p))) {
    return null;
  }
  const cast = new Date(castYear, castMonth - 1, castDay, 0, 0, 0, 0);
  const test = new Date(testYear, testMonth - 1, testDay, 0, 0, 0, 0);
  const days = Math.floor((test.getTime() - cast.getTime()) / (1000 * 60 * 60 * 24));
  return days >= 0 ? days : null;
};

/**
 * The cast date shared by most cubes in the set, for the report's single
 * "DATE CASTED" line. Blank entries are ignored and ties resolve to the
 * earliest date so the choice is deterministic. Null when no cube has one.
 */
export const mostCommonCastDate = (rows: CompressiveCubeInput[]): string | null => {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const date = row.dateOfCast.trim();
    if (date) counts.set(date, (counts.get(date) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [date, count] of counts) {
    if (count > bestCount || (count === bestCount && (best === null || date < best))) {
      best = date;
      bestCount = count;
    }
  }
  return best;
};

/**
 * Compressive strength in MPa = load over the loaded cross-section.
 *   (kN * 1000) => newtons, and N/mm² is exactly MPa, so the factors cancel.
 * Returns null rather than 0 when the cube can't be computed, so a genuine
 * 0 MPa reading stays distinguishable from an unfilled field.
 */
export const strengthOf = (row: CompressiveCubeInput): number | null => {
  const load = parseNumber(row.load);
  const w = parseNumber(row.width);
  const h = parseNumber(row.height);
  if (load === null || w === null || h === null) return null;
  if (load < 0 || w <= 0 || h <= 0) return null;
  const area = w * h;
  if (!Number.isFinite(area) || area <= 0) return null;
  const strength = (load * 1000) / area;
  return Number.isFinite(strength) ? strength : null;
};

/** Bulk density in kg/m³: grams over the mm³ volume, converted to kg and m³. */
export const densityOf = (row: CompressiveCubeInput): number | null => {
  const mass = parseNumber(row.mass);
  const w = parseNumber(row.width);
  const h = parseNumber(row.height);
  const d = parseNumber(row.depth);
  if (mass === null || w === null || h === null || d === null) return null;
  if (mass <= 0 || w <= 0 || h <= 0 || d <= 0) return null;
  const volumeM3 = (w * h * d) / 1000000000; // mm³ -> m³
  if (!Number.isFinite(volumeM3) || volumeM3 <= 0) return null;
  const density = (mass / 1000) / volumeM3; // g -> kg
  return Number.isFinite(density) ? density : null;
};

export const formatStrength = (row: CompressiveCubeInput): string => {
  const strength = strengthOf(row);
  return strength === null ? "" : strength.toFixed(2);
};

export const formatDensity = (row: CompressiveCubeInput): string => {
  const density = densityOf(row);
  return density === null ? "" : density.toFixed(0);
};

export type StrengthCategory = "veryLow" | "low" | "normal" | "high";

export const strengthCategory = (strength: number): StrengthCategory => {
  if (strength < 7) return "veryLow";
  if (strength < 20) return "low";
  if (strength < 40) return "normal";
  return "high";
};

export const strengthRemark = (row: CompressiveCubeInput): string => {
  const strength = strengthOf(row);
  if (strength === null) return "";
  if (strength < 7) return "Very low strength";
  if (strength < 20) return "Low strength";
  if (strength < 40) return "Normal structural concrete";
  return "High strength";
};

/**
 * Characteristic cube strength from a concrete class designation.
 * "C25/30" -> 30 (the second figure is the cube strength), "C30" / "M30" -> 30.
 * Returns null when the designation carries no usable number.
 */
export const cubeStrengthFromClass = (concreteClass: string): number | null => {
  const figures = concreteClass.match(/\d+(?:\.\d+)?/g);
  if (!figures || figures.length === 0) return null;
  const value = Number.parseFloat(figures.length >= 2 ? figures[1] : figures[0]);
  return Number.isFinite(value) && value > 0 ? value : null;
};


/**
 * Expected strength gain as a percentage of the 28-day characteristic
 * strength (lab reference table: 1d 16%, 3d 40%, 7d 65%, 14d 90%, 28d 99%).
 */
export const STRENGTH_GAIN_TABLE = [
  { days: 1, percent: 16 },
  { days: 3, percent: 40 },
  { days: 7, percent: 65 },
  { days: 14, percent: 90 },
  { days: 28, percent: 99 },
] as const;

/** Expected percentage at an exact reporting age; null for off-nominal ages. */
export const expectedPercentAtAge = (ageDays: number | null): number | null => {
  if (ageDays === null) return null;
  return STRENGTH_GAIN_TABLE.find((row) => row.days === ageDays)?.percent ?? null;
};

/** Expected MPa for a class target at an age; null when indeterminable. */
export const expectedStrength = (
  classTarget: number | null,
  ageDays: number | null,
): number | null => {
  const percent = ageDays === null ? null : expectedPercentAtAge(ageDays);
  if (classTarget === null || !Number.isFinite(classTarget) || classTarget <= 0 || percent === null) {
    return null;
  }
  return (classTarget * percent) / 100;
};

/**
 * Reporting ages, each with the tolerance it may deviate by.
 * The original buckets were `age <= 7` and `25..31`, which counted a 3-day cube
 * as a 7-day cube and silently dropped everything aged 8-24 days.
 * The 1-day and 3-day bands take exact days only (tolerance 0) so the windows
 * stay disjoint; anything off-nominal is reported under "other" rather than
 * forced into a band. CONFIRM with the lab if early/late breaks deserve wider
 * windows than the nominal day.
 */
export const AGE_BANDS = [
  { key: "oneDay" as const, label: "1-Day", nominalDays: 1, toleranceDays: 0 },
  { key: "threeDay" as const, label: "3-Day", nominalDays: 3, toleranceDays: 0 },
  { key: "sevenDay" as const, label: "7-Day", nominalDays: 7, toleranceDays: 1 },
  { key: "fourteenDay" as const, label: "14-Day", nominalDays: 14, toleranceDays: 2 },
  { key: "twentyEightDay" as const, label: "28-Day", nominalDays: 28, toleranceDays: 3 },
];

/** BS EN 206 / BS 8500 allow a single cube this far below the group target before the group fails. */
export const ACCEPTANCE_MARGIN_MPA = 4;

export interface GroupVerdict {
  meetsMean: boolean;
  meetsLowestCube: boolean;
  accepted: boolean;
}

/** Group acceptance: the mean must reach the target and no cube may fall below target - margin. */
export const groupVerdict = (
  mean: number | null,
  min: number | null,
  target: number,
): GroupVerdict | null => {
  if (mean === null) return null;
  const meetsMean = mean >= target;
  const meetsLowestCube = min !== null && min >= target - ACCEPTANCE_MARGIN_MPA;
  return { meetsMean, meetsLowestCube, accepted: meetsMean && meetsLowestCube };
};

export interface AgeGroup {
  key: string;
  label: string;
  nominalDays: number | null;
  count: number;
  mean: number | null;
  min: number | null;
  max: number | null;
  target: number | null;
  verdict: GroupVerdict | null;
}

export interface MultiStandardTargets {
  oneDay: number;
  threeDay: number;
  sevenDay: number;
  fourteenDay: number;
  twentyEightDay: number;
}

/**
 * Band targets derived from a concrete class via the gain table
 * (C30 -> 4.8 / 12 / 19.5 / 27 / 29.7 MPa), rounded to one decimal.
 */
export const classBandTargets = (classTarget: number): MultiStandardTargets => {
  const round1 = (value: number) => Math.round(value * 10) / 10;
  const at = (days: number): number => {
    const percent = STRENGTH_GAIN_TABLE.find((row) => row.days === days)?.percent ?? 0;
    return round1((classTarget * percent) / 100);
  };
  return {
    oneDay: at(1),
    threeDay: at(3),
    sevenDay: at(7),
    fourteenDay: at(14),
    twentyEightDay: at(28),
  };
};

/**
 * Compact per-cube gain readout, e.g. "84% (expected 65%)": the achieved
 * share of the class target against the age expectation. Empty unless the
 * cube has a strength, an age on the gain table, and a class target.
 */
export const gainSummary = (
  row: CompressiveCubeInput,
  classTarget: number | null,
): string => {
  const strength = strengthOf(row);
  const age = ageOf(row.dateOfCast, row.dateOfTest);
  const expected = age === null ? null : expectedPercentAtAge(age);
  if (strength === null || classTarget === null || !Number.isFinite(classTarget) || classTarget <= 0 || expected === null) {
    return "";
  }
  const achieved = Math.round((strength / classTarget) * 100);
  return `${achieved}% (expected ${expected}%)`;
};

export interface AgeGroupBreakdown {
  bands: AgeGroup[];
  other: AgeGroup;
}

const summarise = (
  strengths: number[],
  key: string,
  label: string,
  nominalDays: number | null,
  target: number | null,
): AgeGroup => {
  const mean = strengths.length ? strengths.reduce((a, b) => a + b, 0) / strengths.length : null;
  const min = strengths.length ? Math.min(...strengths) : null;
  return {
    key,
    label,
    nominalDays,
    count: strengths.length,
    mean,
    min,
    max: strengths.length ? Math.max(...strengths) : null,
    target,
    verdict: target === null ? null : groupVerdict(mean, min, target),
  };
};

/**
 * Cubes grouped by the age they were actually tested at.
 *
 * Cube acceptance is judged on the mean of a group broken at one age, so averaging a
 * 7-day and a 28-day cube together produces a number that describes nothing. Anything
 * outside every tolerance window is reported as "other" rather than being dropped.
 */
export const buildAgeGroups = (
  rows: CompressiveCubeInput[],
  targets: MultiStandardTargets,
): AgeGroupBreakdown => {
  const collect = (matches: (age: number) => boolean): number[] =>
    rows
      .filter((row) => {
        const age = ageOf(row.dateOfCast, row.dateOfTest);
        return age !== null && matches(age);
      })
      .map(strengthOf)
      .filter(isFiniteNumber);

  const targetFor = (key: string): number => {
    switch (key) {
      case "oneDay": return targets.oneDay;
      case "threeDay": return targets.threeDay;
      case "fourteenDay": return targets.fourteenDay;
      case "twentyEightDay": return targets.twentyEightDay;
      default: return targets.sevenDay;
    }
  };

  const bandLabel = (band: (typeof AGE_BANDS)[number]): string =>
    band.toleranceDays === 0
      ? `${band.label} (${band.nominalDays} day${band.nominalDays === 1 ? "" : "s"})`
      : `${band.label} (${band.nominalDays - band.toleranceDays}–${band.nominalDays + band.toleranceDays} days)`;

  const bands = AGE_BANDS.map((band) => {
    const target = targetFor(band.key);
    const strengths = collect((age) => Math.abs(age - band.nominalDays) <= band.toleranceDays);
    return summarise(
      strengths,
      band.key,
      bandLabel(band),
      band.nominalDays,
      target,
    );
  });

  const other = collect((age) =>
    !AGE_BANDS.some((band) => Math.abs(age - band.nominalDays) <= band.toleranceDays),
  );

  return { bands, other: summarise(other, "other", "Other ages", null, null) };
};

/**
 * Per-cube pass/fail against a single threshold. This is an indicative tally, not an
 * acceptance verdict — BS EN 206 / BS 8500 judge the group (see groupVerdict).
 * `filter(isFiniteNumber)` is deliberate: `.filter(Boolean)` used to discard a real
 * 0 MPa result, hiding a catastrophic failure from the counts entirely.
 */
export const getPassFailResults = (rows: CompressiveCubeInput[], threshold: number) => {
  const strengths = rows.map(strengthOf).filter(isFiniteNumber);
  const passCount = strengths.filter((s) => s >= threshold).length;
  return {
    passCount,
    failCount: strengths.length - passCount,
    passRate: strengths.length ? (passCount / strengths.length) * 100 : 0,
    tested: strengths.length,
  };
};

export const getStrengthDistribution = (rows: CompressiveCubeInput[]) => {
  const categories = { veryLow: 0, low: 0, normal: 0, high: 0 };
  rows.forEach((row) => {
    const strength = strengthOf(row);
    if (isFiniteNumber(strength)) categories[strengthCategory(strength)]++;
  });
  return categories;
};
