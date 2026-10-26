/**
 * Unconfined Compressive Strength (UCS) calculations.
 *
 * Strength (MPa) = Load (kN) * 1000 / Area (mm^2)
 * Since 1 MPa = 1 N/mm^2, and load is in kN:
 *   strength = load_kN * 1000 / (width_mm * height_mm or area_mm2)
 */

export interface UCSRow {
  sampleId: string;
  load: string;
  area: string;
}

export interface UCSCalculation {
  sampleId: string;
  load: number;
  area: number;
  strength: number; // MPa
}

export const calculateUCSStrength = (load: string, area: string): number | null => {
  const l = parseFloat(load);
  const a = parseFloat(area);
  if (!l || !a) return null;
  return (l * 1000) / a;
};

export const calculateUCSRows = (rows: UCSRow[]): UCSCalculation[] => {
  return rows
    .map((r) => {
      const strength = calculateUCSStrength(r.load, r.area);
      const l = parseFloat(r.load);
      const a = parseFloat(r.area);
      if (strength !== null && l && a) {
        return { sampleId: r.sampleId, load: l, area: a, strength };
      }
      return null;
    })
    .filter((r): r is UCSCalculation => r !== null);
};

export const averageUCS = (calculations: UCSCalculation[]): number | null => {
  if (calculations.length === 0) return null;
  const sum = calculations.reduce((s, c) => s + c.strength, 0);
  return sum / calculations.length;
};