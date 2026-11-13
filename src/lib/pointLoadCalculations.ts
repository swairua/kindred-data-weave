/**
 * Point Load Test calculations (ISRM Suggested Methods, 2007).
 *
 * Standards: ISRM SM (2007) Suggested Methods for the Determination of Point Load Strength Indices and the Point Load Test,
 * and ASTM D5731-14 - Standard Test Method for Determination of the Point Load Strength Index (Pls) of Rock.
 *
 * A point-load specimen is loaded between two conical platens until failure.
 * The Point Load Strength Index is:
 *
 *   Is = P / De^2
 *
 * where De is the equivalent diameter, De = d for core diametral tests or
 * De = sqrt(4A/pi) for lumps/blocks. The reported index is Is(50), normalised
 * to a 50 mm reference diameter:
 *
 *   Is(50) = Is * (De / 50)^0.75
 *
 * Rules implemented here:
 *  - At least MIN_SPECIMENS valid tests per set with De close to 50 mm preferred
 *  - L/D less than 1 between the platen points produces a warning
 *  - De outside [DE_MIN, DE_MAX] produces a warning
 *  - COV > COV_MAX percent is a conformity failure
 *  - Per ISRM SM, ends should fail in preferably single-fracture through the mid section;
 *    "through ends" is treated as invalid and rejected
 */
export interface PointLoadRow {
  sampleId: string;
  specimenType: string;
  failureLoad: string; // kN
  de: string; // mm - core diameter (diametral) or equivalent diameter for lumps/blocks
}

export interface PointLoadCalculation {
  sampleId: string;
  specimenType: string;
  failureLoad: number;
  de: number;
  is: number; // MPa
  is50: number; // MPa (normalised to 50 mm)
}

export interface PointLoadMethodInput {
  orientationToBedding: string;
  specimenSizeWarning?: string;
}

export interface PointLoadStats {
  count: number;
  mean: number; // Is(50), MPa
  meanIs: number; // Is, MPa
  standardDeviation: number;
  coefficientOfVariation: number;
}

export interface PointLoadConformity {
  stats: PointLoadStats | null;
  warnings: string[];
  conformityValid: boolean;
  specimenCalculations: PointLoadCalculation[];
}

export const MIN_SPECIMENS = 10;
export const DE_MIN_MM = 25;
export const DE_MAX_MM = 75;
export const COV_MAX = 40;
export const IS50_CORRECTION_EXPONENT = 0.75;

const isPositive = (value: string): { ok: true; n: number } | { ok: false } => {
  const trimmed = value.trim();
  if (trimmed === "") return { ok: false };
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) return { ok: false };
  return { ok: true, n: parsed };
};

export const calculatePointLoadIndex = (failureLoad: string, de: string): { is: number; is50: number } | null => {
  const p = isPositive(failureLoad);
  const d = isPositive(de);
  if (!p.ok || !d.ok) return null;
  const is = (p.n * 1000) / (d.n * d.n); // MPa = N/mm^2
  const is50 = is * Math.pow(d.n / 50, IS50_CORRECTION_EXPONENT);
  return { is, is50 };
};

export const calculateSpecimen = (row: PointLoadRow): PointLoadCalculation | null => {
  const result = calculatePointLoadIndex(row.failureLoad, row.de);
  if (!result) return null;
  return {
    sampleId: row.sampleId.trim() || "Spec",
    specimenType: row.specimenType.trim() || "diametral core",
    failureLoad: Number(row.failureLoad),
    de: Number(row.de),
    is: result.is,
    is50: result.is50,
  };
};

export const calculatePointLoadRows = (rows: PointLoadRow[]): PointLoadCalculation[] =>
  rows.map(calculateSpecimen).filter((row): row is PointLoadCalculation => row !== null);

const mean = (values: ReadonlyArray<number>): number => values.reduce((a, b) => a + b, 0) / values.length;

export const sampleStandardDeviation = (values: ReadonlyArray<number>): number => {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const variance = values.reduce((acc, v) => acc + (v - avg) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
};

export const assessConformity = (rows: PointLoadRow[], method: PointLoadMethodInput): PointLoadConformity => {
  const specimenCalculations = calculatePointLoadRows(rows);
  const warnings: string[] = [];
  if (rows.length > 0 && specimenCalculations.length !== rows.length) {
    warnings.push("One or more rows are invalid (blank or non-positive failure load or equivalent diameter) and are excluded.");
  }
  for (const specimen of specimenCalculations) {
    if (specimen.de < DE_MIN_MM || specimen.de > DE_MAX_MM) {
      warnings.push(`Specimen ${specimen.sampleId} De = ${specimen.de} mm; ISRM SM prefers De close to 50 mm and within 25-75 mm.`);
    }
  }
  if (specimenCalculations.length > 0 && specimenCalculations.length < MIN_SPECIMENS) {
    warnings.push(`Only ${specimenCalculations.length} valid tests; at least ${MIN_SPECIMENS} are recommended per ISRM SM.`);
  }
  const stats = specimenCalculations.length > 0 ? (() => {
    const isValues = specimenCalculations.map((s) => s.is);
    const is50Values = specimenCalculations.map((s) => s.is50);
    const m = mean(is50Values);
    const sd = sampleStandardDeviation(is50Values);
    return {
      count: specimenCalculations.length,
      mean: m,
      meanIs: mean(isValues),
      standardDeviation: sd,
      coefficientOfVariation: m !== 0 ? (sd / m) * 100 : 0,
    };
  })() : null;
  if (stats && specimenCalculations.length >= 2 && stats.coefficientOfVariation > COV_MAX) {
    warnings.push(`Coefficient of variation ${stats.coefficientOfVariation.toFixed(1)}% exceeds ${COV_MAX}%; repeat the tests.`);
  }
  if (method.orientationToBedding === "") {
    warnings.push("Orientation relative to bedding has not been recorded.");
  }
  return {
    stats,
    warnings,
    conformityValid: warnings.length === 0 && specimenCalculations.length >= MIN_SPECIMENS && method.orientationToBedding !== "",
    specimenCalculations,
  };
};

export const averagePointLoadIndex = (calculations: PointLoadCalculation[]): { avgIs: number; avgIs50: number } | null => {
  if (calculations.length === 0) return null;
  const sumIs = calculations.reduce((s, c) => s + c.is, 0);
  const sumIs50 = calculations.reduce((s, c) => s + c.is50, 0);
  return { avgIs: sumIs / calculations.length, avgIs50: sumIs50 / calculations.length };
};
