/**
 * Consolidation Test calculations.
 *
 * Records settlement vs time and reports:
 *   - Maximum settlement (mm)
 *   - Time-settlement data pairs
 */

export interface ConsolidationRow {
  time: string;
  settlement: string;
}

export interface ConsolidationPoint {
  time: number;
  settlement: number;
}

export const calculateConsolidationPoints = (
  rows: ConsolidationRow[]
): ConsolidationPoint[] => {
  return rows
    .map((r) => ({ t: parseFloat(r.time), s: parseFloat(r.settlement) }))
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.s))
    .sort((a, b) => a.t - b.t)
    .map((p) => ({ time: p.t, settlement: p.s }));
};

export const maxSettlement = (points: ConsolidationPoint[]): number | null => {
  if (points.length === 0) return null;
  return Math.max(...points.map((p) => p.settlement));
};