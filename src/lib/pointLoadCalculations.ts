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
 * The reported value is Is(50), normalized to a 50 mm diameter:
 *   Is(50) = Is * (50 / De)^2
 *
 * where Is = (P * 1000) / De^2
 */

export interface PointLoadRow {
  sampleId: string;
  failureLoad: string;
  de: string;
  testType?: "diametral" | "axial" | "irregular"; // For future use
}

export interface PointLoadCalculation {
  sampleId: string;
  failureLoad: number;
  de: number;
  is: number;      // MPa (Is)
  is50: number;    // MPa (Is(50) normalized to 50mm)
}

export const calculatePointLoadIndex = (failureLoad: string, de: string): { is: number; is50: number } | null => {
  const p = parseFloat(failureLoad);
  const d = parseFloat(de);
  if (!p || !d) return null;
  const is = (p * 1000) / (d * d);
  const is50 = is * Math.pow(50 / d, 2);
  return { is, is50 };
};

export const calculatePointLoadRows = (rows: PointLoadRow[]): PointLoadCalculation[] => {
  return rows
    .map((r) => {
      const result = calculatePointLoadIndex(r.failureLoad, r.de);
      const p = parseFloat(r.failureLoad);
      const d = parseFloat(r.de);
      if (result && p && d) {
        return { sampleId: r.sampleId, failureLoad: p, de: d, is: result.is, is50: result.is50 };
      }
      return null;
    })
    .filter((r): r is PointLoadCalculation => r !== null);
};

export const averagePointLoadIndex = (calculations: PointLoadCalculation[]): { avgIs: number; avgIs50: number } | null => {
  if (calculations.length === 0) return null;
  const sumIs = calculations.reduce((s, c) => s + c.is, 0);
  const sumIs50 = calculations.reduce((s, c) => s + c.is50, 0);
  return { avgIs: sumIs / calculations.length, avgIs50: sumIs50 / calculations.length };
};