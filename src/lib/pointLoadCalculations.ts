/**
 * Point Load Test calculations (ISRM suggested method).
 *
 * Point load strength index:
 *   Is = (P * 1000) / (De^2)   (MPa)
 *
 * where:
 *   P = failure load (kN)
 *   De = equivalent core diameter (mm)
 *
 * For diametral tests, De = D (core diameter).
 * For axial/lump tests, De = sqrt(4 * A / pi) where A = W^2 for rectangular cores.
 *
 * The reported value is Is(50), normalized to a 50 mm diameter.
 */

export interface PointLoadRow {
  sampleId: string;
  failureLoad: string;
  de: string;
}

export interface PointLoadCalculation {
  sampleId: string;
  failureLoad: number;
  de: number;
  is50: number; // MPa
}

export const calculatePointLoadIndex = (failureLoad: string, de: string): number | null => {
  const p = parseFloat(failureLoad);
  const d = parseFloat(de);
  if (!p || !d) return null;
  return (p * 1000) / (d * d);
};

export const calculatePointLoadRows = (rows: PointLoadRow[]): PointLoadCalculation[] => {
  return rows
    .map((r) => {
      const is50 = calculatePointLoadIndex(r.failureLoad, r.de);
      const p = parseFloat(r.failureLoad);
      const d = parseFloat(r.de);
      if (is50 !== null && p && d) {
        return { sampleId: r.sampleId, failureLoad: p, de: d, is50 };
      }
      return null;
    })
    .filter((r): r is PointLoadCalculation => r !== null);
};

export const averagePointLoadIndex = (calculations: PointLoadCalculation[]): number | null => {
  if (calculations.length === 0) return null;
  const sum = calculations.reduce((s, c) => s + c.is50, 0);
  return sum / calculations.length;
};