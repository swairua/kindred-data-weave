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

/** The bottom row of the sieve stack is the pan, so no percentage passes it. Its mass still counts towards the sample total. */
const isPanRow = (sieveSize: string) => {
  const label = sieveSize.trim().toLowerCase();
  return label === "pan" || label.startsWith("<");
};

export const calculateGrading = (rows: GradingRow[]): GradingCalculations => {
  const totalWeight = rows.reduce((sum, row) => sum + numeric(row.weightRetained), 0);
  const percentageRetained = rows.map((row) => totalWeight > 0 ? (numeric(row.weightRetained) / totalWeight) * 100 : 0);
  let retained = 0;
  const cumulativePassing = rows.map((row) => {
    retained += numeric(row.weightRetained);
    return totalWeight > 0 && !isPanRow(row.sieveSize) ? (1 - retained / totalWeight) * 100 : null;
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
 * Effective depth H (cm) against the corrected reading R (g/L). The reading term
 * is subtracted: a larger reading is a denser suspension, so the hydrometer
 * floats higher and the bulb sits closer to the surface. The constants are the
 * published scale calibrations of the two hydrometer bodies the lab records
 * (L = 16.294964 - 0.164R for the 152H and 16.294964 - 0.2645R for the 151H).
 * BS 1377-2:1990 9.5.7.2.2 takes the value from the calibration of the individual
 * instrument derived under 9.5.4.2, so a body type that is not listed here falls
 * back to the default rather than to a guessed curve.
 */
const HYDROMETER_DEPTH_CALIBRATION: Record<string, { intercept: number; slope: number }> = {
  "152H": { intercept: 16.294964, slope: 0.164 },
  "151H": { intercept: 16.294964, slope: 0.2645 },
};

/** BS 1377-2:1990 Table 7 — kinematic viscosity of water (m²/s x 10⁻⁶) from which the Stokes' constant is derived. */
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
 * BS 1377-2:1990 9.5.7.2 — for each hydrometer reading derives the true reading Rh from the
 * meniscus correction on the observed reading (9.5.7.2.1), the reading Rd in the
 * dispersant (9.5.7.2.4), the effective depth from the hydrometer's own scale
 * calibration (9.5.7.2.2), the equivalent particle diameter from Stokes' law
 * (9.5.7.2.3), and the percentage finer K (9.5.7.2.5) on the mass of soil used
 * for the hydrometer test and on the whole sample, for the grading curve.
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

  // BS 1377-2:1990 9.5.7.2.1 makes the true reading Rh = Rn' + Cm; the 1990 edition carries no
  // temperature-correction term, it holds the suspension at the bath temperature (9.5.2.18)
  // and covers drift by re-reading the dispersant blank (9.5.6.3.9). A manual value is
  // still accepted for a lab working to a correction-based instrument.
  const temperatureCorrection = manualTemperatureCorrection ?? 0;
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
    const effectiveDepth = calibration.intercept - calibration.slope * correctedReading;
    const particleDiameter = effectiveDepth > 0 && specificGravity > 1 && time > 0
      ? stokesConstant * Math.sqrt((effectiveDepth / 100) / ((specificGravity - 1) * time * 60))
      : null;
    // BS 1377-2:1990 9.5.7.2.5: K = 100 x sG x Rd / (m x (sG - 1)). The (sG - 1) divisor is the
    // specific-gravity correction: it turns the density excess read on the hydrometer scale
    // into the mass of soil in suspension, so K is only meaningful for sG > 1.
    const specificGravityFactor = specificGravity > 1 ? specificGravity / (specificGravity - 1) : null;
    const finesInSuspension = specificGravityFactor !== null && hydrometerMass !== null && hydrometerMass > 0 && suspensionVolume > 0
      ? ((correctedReading * specificGravityFactor * suspensionVolume) / (hydrometerMass * 1000)) * 100
      : null;
    const finesByHydrometer = specificGravityFactor !== null && sampleMass !== null && sampleMass > 0 && suspensionVolume > 0
      ? ((correctedReading * specificGravityFactor * suspensionVolume) / (sampleMass * 1000)) * 100
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