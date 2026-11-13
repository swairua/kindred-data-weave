/**
 * Schmidt Hammer / Rebound Hammer calculations.
 *
 * Standards: BS EN 12504-2:2001 (concrete compression testing, rebound method),
 * BS 1881-202:1986 (rebound hammer method for concrete), ASTM C805 (standard
 * test method for rebound number of hardened concrete).
 *
 * Rules implemented here:
 *  - At least REQUIRED_READINGS valid (> 0) readings must be recorded per test area.
 *  - Any reading varying from the mean of the readings by more than
 *    OUTLIER_DEVIATION (12%) is discarded, and the average is recomputed from the
 *    retained readings (BS 1881-202 / ASTM C805 practice).
 *  - If more than MAX_DISCARDS readings are rejected, the test area is unsuitable
 *    for assessment and must be re-taken.
 *  - Estimated compressive strength is reported only when a site-specific
 *    correlation is configured (Excel slope/intercept) - it is never ASSUMED.
 *    A rebound number alone is not a statement of strength, only of surface
 *    hardness.
 */

export interface SchmidtRow {
  location: string;
  readings: string[];
}

export interface SchmidtCalibration {
  /** MPa per rebound-number point. */
  slope: number;
  /** Intercept, MPa. */
  intercept: number;
}

export interface SchmidtRowConformity {
  readingsTaken: number;
  validReadingCount: number;
  retainedCount: number;
  discardedCount: number;
  requiredReadingCount: number;
  maxDiscards: number;
  valid: boolean;
}

export interface SchmidtCalculation {
  location: string;
  /** Retained (outlier-free) readings in order. */
  readings: number[];
  /** Discarded readings in order. */
  discarded: number[];
  /** Indices into the valid readings array of the discarded entries (for highlighting). */
  discardedIndexes: number[];
  avgRebound: number;
  estimatedStrength: number | null;
  conformity: SchmidtRowConformity;
}

export const REQUIRED_READINGS = 10;
export const OUTLIER_DEVIATION = 0.12;
export const MAX_DISCARDS = 2;

/** Parse a raw cell to a rebound reading; rejects zero, negative and non-finite values. */
export const parseReboundReading = (value: string): number | null => {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

/** Finite positive readings in entry order (pre-outlier-rejection). */
export const getValidReadings = (row: SchmidtRow): number[] =>
  (row.readings || [])
    .map(parseReboundReading)
    .filter((value): value is number => value !== null);

const mean = (values: ReadonlyArray<number>): number =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

/** Iteratively discard readings > OUTLIER_DEVIATION from the running mean. */
const rejectOutliers = (readings: ReadonlyArray<number>): number[] => {
  let accepted = [...readings];
  for (let iteration = 0; iteration < 3 && accepted.length > 0; iteration += 1) {
    const candidate = mean(accepted);
    const kept = accepted.filter((value) => Math.abs(value - candidate) <= OUTLIER_DEVIATION * candidate);
    if (kept.length === accepted.length) break;
    accepted = kept;
  }
  return accepted;
};

const evaluateReadings = (row: SchmidtRow): Omit<SchmidtCalculation, "location" | "estimatedStrength"> | null => {
  const validWithIndex = row.readings
    .map((value, rawIndex) => ({ value: parseReboundReading(value), rawIndex }))
    .filter((entry): entry is { value: number; rawIndex: number } => entry.value !== null);
  if (validWithIndex.length === 0) return null;
  const valid = validWithIndex.map((entry) => entry.value);
  const retained = rejectOutliers(valid);
  if (retained.length === 0) return null;
  const avgRebound = mean(retained);
  const discarded = valid.filter((value) => !retained.includes(value));
  // Retained is matched against the valid list by consumption, preserving the order
  // for duplicate readings and giving the raw-cell indexes the UI needs for highlighting.
  const retainedTally = new Map<number, number>();
  for (const value of retained) retainedTally.set(value, (retainedTally.get(value) ?? 0) + 1);
  const discardedIndexes: number[] = [];
  for (const entry of validWithIndex) {
    const left = retainedTally.get(entry.value) ?? 0;
    if (left > 0) retainedTally.set(entry.value, left - 1);
    else discardedIndexes.push(entry.rawIndex);
  }
  const conformity: SchmidtRowConformity = {
    readingsTaken: row.readings.filter((value) => value.trim() !== "").length,
    validReadingCount: valid.length,
    retainedCount: retained.length,
    discardedCount: valid.length - retained.length,
    requiredReadingCount: REQUIRED_READINGS,
    maxDiscards: MAX_DISCARDS,
    valid: valid.length >= REQUIRED_READINGS && (valid.length - retained.length) <= MAX_DISCARDS,
  };
  return { readings: retained, discarded, discardedIndexes, avgRebound, conformity };
};

/** Average of the retained readings for one row (pre-rejection count excluded), or null. */
export const calculateAverageRebound = (row: SchmidtRow): number | null => {
  const evaluated = evaluateReadings(row);
  return evaluated ? evaluated.avgRebound : null;
};

/**
 * Estimated compressive strength from a configuration correlation.
 * Returns null when no correlation is supplied - the rebound number alone is not a statement of strength.
 */
export const estimateStrengthFromRebound = (avgRebound: number, calibration?: SchmidtCalibration | null): number | null => {
  if (!calibration) return null;
  if (!Number.isFinite(calibration.slope) || !Number.isFinite(calibration.intercept)) return null;
  return avgRebound * calibration.slope + calibration.intercept;
};

/** Evaluate one row against the outlier rule and (optionally) a strength correlation. */
export const evaluateSchmidtRow = (
  row: SchmidtRow,
  calibration?: SchmidtCalibration | null,
): SchmidtCalculation | null => {
  const evaluated = evaluateReadings(row);
  if (!evaluated) return null;
  return {
    location: row.location,
    ...evaluated,
    estimatedStrength: estimateStrengthFromRebound(evaluated.avgRebound, calibration),
  };
};

export const calculateSchmidtRows = (
  rows: SchmidtRow[],
  calibration?: SchmidtCalibration | null,
): SchmidtCalculation[] =>
  rows
    .map((row) => evaluateSchmidtRow(row, calibration))
    .filter((row): row is SchmidtCalculation => row !== null);

export const averageRebound = (calculations: SchmidtCalculation[]): number | null => {
  if (calculations.length === 0) return null;
  const sum = calculations.reduce((sumValue, current) => sumValue + current.avgRebound, 0);
  return sum / calculations.length;
};

/** True when every row records REQUIRED_READINGS valid readings and satisfies the outlier rule. */
export const rowsConform = (rows: SchmidtRow[]): boolean =>
  rows.length > 0 && rows.every((row) => {
    const evaluated = evaluateReadings(row);
    return evaluated !== null && evaluated.conformity.valid;
  });
