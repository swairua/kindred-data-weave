/**
 * Unconfined Compressive Strength (UCS) calculations.
 *
 * Standards: ISRM Suggested Methods for the determination of the uniaxial
 * compressive strength of rock materials (ISRM SM, 2007) and ASTM D7012-14
 * (compressive strength and elastic moduli of intact rock core specimens).
 *
 * Rules implemented here:
 *  - Strength computed from specimen geometry: qu = 4F / (pi d^2)
 *  - At least MIN_SPECIMENS valid specimens are required per test set
 *  - L/D outside [L_D_MIN, L_D_MAX] produces a warning
 *  - The stress rate outside [STRESS_RATE_MIN, STRESS_RATE_MAX] is a
 *    conformity failure (ISRM SM, rate of loading 0.5 - 1.0 MPa/s)
 *  - The set must not include failure modes that rise from the loading
 *    apparatus (end failures), which are rejected per ISRM SM
 *  - Report mean, standard deviation and coefficient of variation
 */

export interface UCSSpecimenRow {
  sampleId: string;
  diameter: string; // mm
  length: string; // mm
  load: string; // kN
}

export interface UCSMethodInput {
  orientationToBedding: string;
  stressRate: string; // MPa/s
  failureMode: string;
  flatEnds: string;
}

export interface UCSSpecimenCalculation {
  sampleId: string;
  diameter: number;
  length: number;
  load: number;
  area: number; // mm^2
  strength: number; // MPa
  ldRatio: number;
}

export interface UCSStats {
  count: number;
  mean: number;
  standardDeviation: number;
  coefficientOfVariation: number;
}

export interface UCSCalculation {
  specimenStrength: UCSSpecimenCalculation[];
  stats: UCSStats | null;
  conformityValid: boolean;
  warnings: string[];
}

export const MIN_SPECIMENS = 3;
export const MAX_SPECIMENS = 10;
export const L_D_MIN = 2;
export const L_D_MAX = 3;
export const STRESS_RATE_MIN = 0.5;
export const STRESS_RATE_MAX = 1.0;

const isPositive = (value: string): { ok: true; n: number } | { ok: false } => {
  const parsed = Number(value);
  if (value.trim() === "" || !Number.isFinite(parsed) || parsed <= 0) return { ok: false };
  return { ok: true, n: parsed };
};

const specimenArea = (diameter: number): number => (Math.PI / 4) * diameter * diameter;

export const calculateSpecimen = (row: UCSSpecimenRow): UCSSpecimenCalculation | null => {
  const d = isPositive(row.diameter);
  const l = isPositive(row.length);
  const p = isPositive(row.load);
  if (!d.ok || !l.ok || !p.ok) return null;
  const area = specimenArea(d.n);
  return {
    sampleId: row.sampleId.trim() || `Specimen`,
    diameter: d.n,
    length: l.n,
    load: p.n,
    area,
    strength: (p.n * 1000) / area,
    ldRatio: l.n / d.n,
  };
};

export const mean = (values: ReadonlyArray<number>): number => values.reduce((a, b) => a + b, 0) / values.length;

export const sampleStandardDeviation = (values: ReadonlyArray<number>): number => {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const variance = values.reduce((acc, v) => acc + (v - avg) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
};

export const assessConformity = (rows: UCSSpecimenRow[], method: UCSMethodInput): UCSCalculation => {
  const specimens = rows.map(calculateSpecimen).filter((s): s is UCSSpecimenCalculation => s !== null);
  const warnings: string[] = [];
  if (rows.length > 0 && specimens.length !== rows.length) {
    warnings.push("One or more rows are invalid (blank or non-positive diameter/length/load) and are excluded.");
  }
  for (const specimen of specimens) {
    if (specimen.ldRatio < L_D_MIN || specimen.ldRatio > L_D_MAX) {
      warnings.push(`Specimen ${specimen.sampleId} has L/D ${specimen.ldRatio.toFixed(2)} outside ${L_D_MIN}-${L_D_MAX}.`);
    }
  }
  const rate = Number(method.stressRate);
  if (method.stressRate.trim() !== "" && Number.isFinite(rate) && (rate < STRESS_RATE_MIN || rate > STRESS_RATE_MAX)) {
    warnings.push(`Stress rate ${rate} MPa/s is outside ${STRESS_RATE_MIN}-${STRESS_RATE_MAX} MPa/s (ISRM SM 2007).`);
  }
  if (/end/i.test(method.failureMode)) {
    warnings.push("Some specimens failed through the ends; those results are rejected per ISRM SM and must be re-taken.");
  }
  if (specimens.length > 0 && specimens.length < MIN_SPECIMENS) {
    warnings.push(`Only ${specimens.length} valid specimens; at least ${MIN_SPECIMENS} are required by ISRM SM.`);
  }
  if (method.flatEnds !== "pass") {
    warnings.push("End flatness and parallelism have not been confirmed; verify before reporting.");
  }
  const strengths = specimens.map((s) => s.strength);
  const stats = strengths.length > 0 ? {
    count: strengths.length,
    mean: mean(strengths),
    standardDeviation: sampleStandardDeviation(strengths),
    coefficientOfVariation: strengths.length > 1 ? (sampleStandardDeviation(strengths) / mean(strengths)) * 100 : 0,
  } : null;
  return {
    specimenStrength: specimens,
    stats,
    conformityValid: warnings.length === 0 && specimens.length >= MIN_SPECIMENS && method.flatEnds === "pass",
    warnings,
  };
};
