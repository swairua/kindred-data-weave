/**
 * CPT (Cone Penetration Test) calculations - ISO 22476-1 / Robertson (1986).
 *
 * Kept as a standalone module so the formulas reference document can cite
 * the exact implementation (see formulasReference.ts) and so the derived
 * columns can be recomputed from raw readings alone - on load, on edit and
 * on classification-factor change - without the component holding the
 * logic inline.
 *
 * Units follow the app's data model:
 *   qc  - cone resistance, MPa
 *   fs  - sleeve friction, kPa
 *   Rf  - friction ratio, % (derived: Rf = fs / qc x 100)
 */

/** Convert cone resistance (MPa) to kPa. */
const qcToKpa = (qc: number): number => qc * 1000;

/**
 * Friction ratio Rf (%) = sleeve friction fs / cone resistance qc x 100.
 *
 * fs is entered in kPa while qc is in MPa, so Rf = fs / (qc x 10).
 * A zero fs is legitimate (clean sand readings) and yields Rf = 0.
 * Returns 0 when qc is invalid rather than NaN so rows never blank out.
 */
export const calculateFrictionRatio = (qc: number, fsKpa: number): number => {
  if (!Number.isFinite(qc) || qc <= 0) return 0;
  if (!Number.isFinite(fsKpa) || fsKpa <= 0) return 0;
  return (fsKpa / qcToKpa(qc)) * 100;
};

/**
 * Robertson simplified soil-behaviour-type classification.
 *
 * The chart is banded axis-aligned: first by friction ratio (cohesive
 * soils), then by cone-resistance tier (granular soils). Every band is
 * closed, so a valid (qc > 0, Rf >= 0) pair always classifies - the old
 * ladder had gaps at e.g. qc > 10 with Rf >= 1 that fell through to
 * "Unclassified".
 *
 * Robertson SBTn behaviour types mapped to the simplified ladder:
 *   Rf >= 8                  -> Clay
 *   Rf >= 5                  -> Silty Clay to Clay
 *   qc <= 1,  Rf < 5         -> Clayey Silt to Silty Clay
 *   qc 1-2,   Rf < 3         -> Sandy Silt to Clayey Silt
 *   qc 2-5,   Rf < 2         -> Silty Sand to Sandy Silt
 *   qc 5-10,  Rf < 1.5       -> Sand to Silty Sand
 *   qc > 10,  Rf < 1         -> Sand
 *   qc > 10,  Rf >= 1        -> Very Stiff Sand to Clayey Sand
 * (middle Rf ranges resolve to the next cohesive band per tier)
 */
export const classifySoilRobertson = (qc: number, rf: number): string => {
  if (!Number.isFinite(qc) || qc <= 0 || !Number.isFinite(rf) || rf < 0) {
    return "Unclassified";
  }
  if (rf >= 8) return "Clay";
  if (rf >= 5) return "Silty Clay to Clay";
  if (qc > 10) return rf >= 1 ? "Very Stiff Sand to Clayey Sand" : "Sand";
  if (qc > 5) return rf >= 1.5 ? "Silty Sand to Sandy Silt" : "Sand to Silty Sand";
  if (qc > 2) return rf >= 2 ? "Clayey Silt to Silty Clay" : "Silty Sand to Sandy Silt";
  if (qc > 1) return rf >= 3 ? "Clayey Silt to Silty Clay" : "Sandy Silt to Clayey Silt";
  return "Clayey Silt to Silty Clay";
};

/** One CPT reading row, as stored in payload_json. */
export interface CptRow {
  depth: string;
  coneResistance: string; // qc, MPa
  sleeveFriction: string; // fs, kPa
  frictionRatio?: string; // Rf, % - derived
  soilClass?: string; // Robertson SBT - derived
}

/**
 * Recompute the derived friction ratio and Robertson classification for a
 * row. Missing/invalid inputs keep the derived cells blank so partially
 * typed rows do not show stale values.
 */
export const rederiveCptRow = (row: CptRow): CptRow => {
  const qc = parseFloat(row.coneResistance);
  const fs = parseFloat(row.sleeveFriction);
  if (!Number.isFinite(qc) || qc <= 0 || !Number.isFinite(fs)) {
    return { ...row, frictionRatio: "", soilClass: "" };
  }
  const rf = calculateFrictionRatio(qc, fs);
  return { ...row, frictionRatio: rf.toFixed(2), soilClass: classifySoilRobertson(qc, rf) };
};
