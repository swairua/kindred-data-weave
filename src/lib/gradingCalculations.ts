export interface GradingRow {
  sieveSize: string;
  weightRetained: string;
}

export interface GradingCalculations {
  totalWeight: number;
  percentageRetained: number[];
  cumulativePassing: Array<number | null>;
  d10: number | null;
  d30: number | null;
  d60: number | null;
  cu: number | null;
  cc: number | null;
}

const numeric = (value: string) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const calculateGrading = (rows: GradingRow[]): GradingCalculations => {
  const totalWeight = rows.reduce((sum, row) => sum + numeric(row.weightRetained), 0);
  const percentageRetained = rows.map((row) => totalWeight > 0 ? (numeric(row.weightRetained) / totalWeight) * 100 : 0);
  let retained = 0;
  const cumulativePassing = rows.map((row, index) => {
    retained += numeric(row.weightRetained);
    return totalWeight > 0 && row.sieveSize.toLowerCase() !== "pan" ? (1 - retained / totalWeight) * 100 : null;
  });

  const points = rows
    .map((row, index) => ({ size: numeric(row.sieveSize), passing: cumulativePassing[index] }))
    .filter((point): point is { size: number; passing: number } => point.size > 0 && point.passing !== null)
    .sort((a, b) => a.size - b.size);

  const interpolate = (target: number): number | null => {
    for (let index = 0; index < points.length - 1; index += 1) {
      const first = points[index];
      const second = points[index + 1];
      if (first.passing <= target && second.passing >= target && second.passing !== first.passing) {
        const ratio = (target - first.passing) / (second.passing - first.passing);
        return 10 ** (Math.log10(first.size) + ratio * (Math.log10(second.size) - Math.log10(first.size)));
      }
    }
    return null;
  };

  const d10 = interpolate(10);
  const d30 = interpolate(30);
  const d60 = interpolate(60);
  const cu = d10 && d60 ? d60 / d10 : null;
  const cc = d10 && d30 && d60 ? (d30 * d30) / (d10 * d60) : null;

  return { totalWeight, percentageRetained, cumulativePassing, d10, d30, d60, cu, cc };
};

export const calculateMoisture = (wetMass: string, dryMass: string) => {
  const wet = numeric(wetMass);
  const dry = numeric(dryMass);
  const waterWeight = wet > 0 && dry > 0 ? wet - dry : null;
  const moistureContent = waterWeight !== null && dry > 0 ? (waterWeight / dry) * 100 : null;
  return { waterWeight, moistureContent };
};

/* -------------------------------------------------------------------------- */
/* Hydrometer analysis — BS 1377-2:1990, clause 9.5 (Form 2Q)                 */
/* -------------------------------------------------------------------------- */

export interface HydrometerRowInput {
  time: string;
  actualHydrometer: string;
}

export interface HydrometerInputs {
  dryWeight: string;
  suspensionVolume: string;
  sG: string;
  temperature: string;
  hydrometerType: string;
  zeroCorrection: string;
  meniscusCorrection: string;
  temperatureCorrection: string;
  kFactor: string;
}

export interface HydrometerResult {
  time: number | null;
  adjustedReading: number | null;
  compositeCorrection: number;
  correctedReading: number | null;
  effectiveDepth: number | null;
  particleDiameter: number | null;
  finesInSuspension: number | null;
  finesByHydrometer: number | null;
}

export interface HydrometerCalculations {
  results: HydrometerResult[];
  specificGravity: number;
  suspensionVolume: number;
  hydrometerMass: number | null;
  sampleMass: number | null;
  compositeCorrection: number;
  temperatureCorrection: number;
  stokesConstant: number;
}

const DEFAULT_SPECIFIC_GRAVITY = 2.65;
const DEFAULT_SUSPENSION_VOLUME = 1000;
const DEFAULT_MENISCUS_CORRECTION = 0.1;
const DEFAULT_HYDROMETER_TYPE = "152H";
const DEFAULT_KINEMATIC_VISCOSITY = 1.005;
const STANDARD_GRAVITY = 9.80665;

/**
 * Effective-depth calibration (H in cm against corrected reading R in g/L),
 * BS 1377-2:1990 Fig. 18. The intercept is a property of the hydrometer body,
 * so it is held per body type rather than derived.
 */
const HYDROMETER_DEPTH_CALIBRATION: Record<string, { intercept: number; slope: number }> = {
  "152H": { intercept: 15.2, slope: 0.4444 },
  "151E": { intercept: 16.5, slope: 0.4444 },
};

/** BS 1377-2:1990 Table 8 — temperature correction (g/L) for a BS 1512 hydrometer. */
const HYDROMETER_TEMPERATURE_CORRECTIONS: Array<[number, number]> = [
  [15, 0.66], [17, 0.36], [19, 0.09], [20, -0.05], [21, -0.2],
  [23, -0.48], [25, -0.77], [27, -1.06], [29, -1.36], [31, -1.66],
];

/** Kinematic viscosity of water (m²/s × 10⁻⁶) used to derive Stokes' constant. */
const WATER_KINEMATIC_VISCOSITY: Array<[number, number]> = [
  [15, 1.141], [16, 1.112], [17, 1.083], [18, 1.056], [19, 1.03], [20, 1.005],
  [21, 0.981], [22, 0.958], [23, 0.934], [24, 0.913], [25, 0.893], [26, 0.874],
  [27, 0.855], [28, 0.836], [29, 0.818], [30, 0.801], [31, 0.784], [32, 0.768],
];

const parseNumeric = (value: string | number | undefined | null): number | null => {
  if (value === undefined || value === null) return null;
  const parsed = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/** Linear interpolation across a calibration table, clamped outside its range. */
const interpolateTable = (table: Array<[number, number]>, value: number) => {
  if (value <= table[0][0]) return table[0][1];
  const last = table[table.length - 1];
  if (value >= last[0]) return last[1];
  for (let index = 0; index < table.length - 1; index += 1) {
    const [lowKey, lowValue] = table[index];
    const [highKey, highValue] = table[index + 1];
    if (value >= lowKey && value <= highKey) {
      const ratio = (value - lowKey) / (highKey - lowKey);
      return lowValue + ratio * (highValue - lowValue);
    }
  }
  return last[1];
};

const EMPTY_HYDROMETER_RESULT: HydrometerResult = {
  time: null,
  adjustedReading: null,
  compositeCorrection: 0,
  correctedReading: null,
  effectiveDepth: null,
  particleDiameter: null,
  finesInSuspension: null,
  finesByHydrometer: null,
};

/**
 * BS 1377-2:1990 9.5 — for each hydrometer reading derives the adjusted and
 * corrected readings, the effective depth, the equivalent particle diameter
 * from Stokes' law, and the percentage finer on the hydrometer sample basis
 * and on the whole-sample basis used to draw the grading curve.
 */
export const calculateHydrometer = (
  rows: HydrometerRowInput[],
  inputs: HydrometerInputs,
  totalDryMass: string,
): HydrometerCalculations => {
  const specificGravity = parseNumeric(inputs.sG) ?? DEFAULT_SPECIFIC_GRAVITY;
  const suspensionVolume = parseNumeric(inputs.suspensionVolume) ?? DEFAULT_SUSPENSION_VOLUME;
  const hydrometerMass = parseNumeric(inputs.dryWeight);
  const sampleMass = parseNumeric(totalDryMass) ?? hydrometerMass;
  const temperature = parseNumeric(inputs.temperature);
  const zeroCorrection = parseNumeric(inputs.zeroCorrection) ?? 0;
  const meniscusCorrection = parseNumeric(inputs.meniscusCorrection) ?? DEFAULT_MENISCUS_CORRECTION;
  const manualTemperatureCorrection = parseNumeric(inputs.temperatureCorrection);
  const manualKFactor = parseNumeric(inputs.kFactor);
  const calibration = HYDROMETER_DEPTH_CALIBRATION[inputs.hydrometerType.trim()]
    ?? HYDROMETER_DEPTH_CALIBRATION[DEFAULT_HYDROMETER_TYPE];

  const temperatureCorrection = manualTemperatureCorrection
    ?? (temperature === null ? 0 : interpolateTable(HYDROMETER_TEMPERATURE_CORRECTIONS, temperature));
  const compositeCorrection = meniscusCorrection + temperatureCorrection;

  // K = 1000·√(18ν/g) so that D(mm) = K·√(H(m) / ((sG − 1)·t(s)))
  const kinematicViscosity = temperature === null
    ? DEFAULT_KINEMATIC_VISCOSITY
    : interpolateTable(WATER_KINEMATIC_VISCOSITY, temperature);
  const stokesConstant = manualKFactor
    ?? 1000 * Math.sqrt((18 * kinematicViscosity * 1e-6) / STANDARD_GRAVITY);

  const results = rows.map((row) => {
    const time = parseNumeric(row.time);
    const actual = parseNumeric(row.actualHydrometer);
    if (time === null || actual === null) {
      return { ...EMPTY_HYDROMETER_RESULT, time, compositeCorrection };
    }

    const adjustedReading = actual + zeroCorrection;
    const correctedReading = adjustedReading + compositeCorrection;
    const effectiveDepth = calibration.intercept + calibration.slope * correctedReading;
    const particleDiameter = effectiveDepth > 0 && specificGravity > 1 && time > 0
      ? stokesConstant * Math.sqrt((effectiveDepth / 100) / ((specificGravity - 1) * time * 60))
      : null;
    const finesInSuspension = hydrometerMass !== null && hydrometerMass > 0 && suspensionVolume > 0
      ? ((correctedReading * specificGravity * suspensionVolume) / (hydrometerMass * 1000)) * 100
      : null;
    const finesByHydrometer = sampleMass !== null && sampleMass > 0 && suspensionVolume > 0
      ? ((correctedReading * specificGravity * suspensionVolume) / (sampleMass * 1000)) * 100
      : null;

    return {
      time,
      adjustedReading,
      compositeCorrection,
      correctedReading,
      effectiveDepth,
      particleDiameter,
      finesInSuspension,
      finesByHydrometer,
    };
  });

  return {
    results,
    specificGravity,
    suspensionVolume,
    hydrometerMass,
    sampleMass,
    compositeCorrection,
    temperatureCorrection,
    stokesConstant,
  };
};