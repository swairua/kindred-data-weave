/**
 * Direct Shear Test calculations (Mohr-Coulomb failure envelope).
 *
 * The shear strength of soil is given by the Mohr-Coulomb criterion:
 *   tau = c + sigma * tan(phi)
 *
 * where:
 *   tau = shear stress at failure (kPa)
 *   c   = cohesion (intercept of the failure envelope, kPa)
 *   sigma = normal stress (kPa)
 *   phi = angle of internal friction (degrees)
 *
 * A linear regression on (normal stress, shear stress) pairs gives:
 *   slope  = tan(phi)  ->  phi = atan(slope) * 180 / PI
 *   intercept = c (cohesion)
 */

export interface ShearRow {
  normalStress: string;
  shearStress: string;
}

export interface ShearEnvelope {
  cohesion: number;      // c, kPa (intercept)
  phi: number;           // angle of internal friction, degrees
  slope: number;         // tan(phi)
  intercept: number;     // same as cohesion
}

export const calculateShearEnvelope = (
  rows: ShearRow[]
): ShearEnvelope | null => {
  const data = rows
    .map((r) => ({ x: parseFloat(r.normalStress), y: parseFloat(r.shearStress) }))
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));

  if (data.length < 2) return null;

  const n = data.length;
  const sumX = data.reduce((s, p) => s + p.x, 0);
  const sumY = data.reduce((s, p) => s + p.y, 0);
  const sumXY = data.reduce((s, p) => s + p.x * p.y, 0);
  const sumX2 = data.reduce((s, p) => s + p.x * p.x, 0);

  const denominator = n * sumX2 - sumX * sumX;
  if (denominator === 0) return null;

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;
  const phi = (Math.atan(slope) * 180) / Math.PI;

  return { cohesion: intercept, phi, slope, intercept: intercept };
};

export const shearStrength = (normalStress: number, envelope: ShearEnvelope): number => {
  return envelope.cohesion + normalStress * Math.tan((envelope.phi * Math.PI) / 180);
};