/**
 * Concrete Coring Test calculations (BS EN 12504-1).
 *
 * Core strength (MPa) = Load (kN) * 1000 / Area (mm^2)
 *   Area = pi * (diameter / 2)^2
 *
 * L/D ratio = Length / Diameter
 *
 * Correction factor for L/D < 2.0 (BS EN 12504-1):
 *   factor = 0.87 + 0.065 * (L/D)
 *
 * Corrected strength = Core strength * correction factor
 */

export interface CoringRow {
  coreId: string;
  diameter: string;
  length: string;
  load: string;
}

export interface CoringCalculation {
  coreId: string;
  diameter: number;
  length: number;
  ldRatio: number;
  load: number;
  coreStrength: number; // MPa
  correctedStrength: number; // MPa
}

export const calculateLDRatio = (diameter: string, length: string): number | null => {
  const d = parseFloat(diameter);
  const l = parseFloat(length);
  if (!d || !l) return null;
  return l / d;
};

export const calculateCoreStrength = (diameter: string, load: string): number | null => {
  const d = parseFloat(diameter);
  const loadKn = parseFloat(load);
  if (!d || !loadKn) return null;
  const area = Math.PI * (d / 2) ** 2;
  return (loadKn * 1000) / area;
};

export const lDCorrectionFactor = (ldRatio: number): number => {
  if (ldRatio >= 2.0) return 1.0;
  return 0.87 + 0.065 * ldRatio;
};

export const calculateCorrectedStrength = (
  diameter: string,
  length: string,
  load: string
): number | null => {
  const strength = calculateCoreStrength(diameter, load);
  const ld = calculateLDRatio(diameter, length);
  if (strength === null || ld === null) return null;
  const factor = lDCorrectionFactor(ld);
  return strength * factor;
};

export const calculateCoringRows = (rows: CoringRow[]): CoringCalculation[] => {
  return rows
    .map((r) => {
      const ldRatio = calculateLDRatio(r.diameter, r.length);
      const coreStrength = calculateCoreStrength(r.diameter, r.load);
      const correctedStrength = calculateCorrectedStrength(
        r.diameter,
        r.length,
        r.load
      );
      const d = parseFloat(r.diameter);
      const l = parseFloat(r.length);
      const load = parseFloat(r.load);
      if (ldRatio !== null && coreStrength !== null && correctedStrength !== null && d && l && load) {
        return {
          coreId: r.coreId,
          diameter: d,
          length: l,
          ldRatio,
          load,
          coreStrength,
          correctedStrength,
        };
      }
      return null;
    })
    .filter((r): r is CoringCalculation => r !== null);
};

export const averageCorrectedStrength = (
  calculations: CoringCalculation[]
): number | null => {
  if (calculations.length === 0) return null;
  const sum = calculations.reduce((s, c) => s + c.correctedStrength, 0);
  return sum / calculations.length;
};
