/**
 * Schmidt Hammer / Rebound Hammer calculations.
 *
 * Average rebound number = mean of valid rebound readings.
 *
 * Estimated compressive strength (empirical correlation):
 *   f_c ≈ 1.2 * R - 13.5   (MPa)
 *
 * where R = average rebound number.
 * This is an approximate correlation; actual strength must be verified
 * by cube testing.
 */

export interface SchmidtRow {
  location: string;
  r1: string;
  r2: string;
  r3: string;
  r4: string;
  r5: string;
}

export interface SchmidtCalculation {
  location: string;
  readings: number[];
  avgRebound: number;
  estimatedStrength: number; // MPa
}

export const getValidReadings = (row: SchmidtRow): number[] => {
  return [row.r1, row.r2, row.r3, row.r4, row.r5]
    .map(Number)
    .filter((v) => Number.isFinite(v) && v > 0);
};

export const calculateAverageRebound = (row: SchmidtRow): number | null => {
  const vals = getValidReadings(row);
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
};

export const estimateStrengthFromRebound = (avgRebound: number): number => {
  return Math.max(0, 1.2 * avgRebound - 13.5);
};

export const calculateSchmidtRows = (rows: SchmidtRow[]): SchmidtCalculation[] => {
  return rows
    .map((r) => {
      const readings = getValidReadings(r);
      if (readings.length === 0) return null;
      const avgRebound = readings.reduce((a, b) => a + b, 0) / readings.length;
      return {
        location: r.location,
        readings,
        avgRebound,
        estimatedStrength: estimateStrengthFromRebound(avgRebound),
      };
    })
    .filter((r): r is SchmidtCalculation => r !== null);
};

export const averageRebound = (calculations: SchmidtCalculation[]): number | null => {
  if (calculations.length === 0) return null;
  const sum = calculations.reduce((s, c) => s + c.avgRebound, 0);
  return sum / calculations.length;
};