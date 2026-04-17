import type {
  AtterbergRecord,
  AtterbergTest,
  CalculatedResults,
  LiquidLimitTrial,
  PlasticLimitTrial,
  ShrinkageLimitTrial,
  TestStatus,
} from "@/context/TestDataContext";

const round = (value: number) => Number(value.toFixed(2));

const isFilled = (value: string | null | undefined) => Boolean(value && value.trim().length > 0);
const isFiniteNumber = (value: string | null | undefined) => isFilled(value) && !Number.isNaN(Number(value));
const isNumber = (value: number | undefined | null): value is number => typeof value === "number" && Number.isFinite(value);

export const sanitizeNumericInput = (value: string) => {
  const normalized = value.replace(/,/g, ".").replace(/[^\d.]/g, "");
  const [whole = "", ...fraction] = normalized.split(".");
  return fraction.length > 0 ? `${whole}.${fraction.join("")}` : whole;
};

// ===== Moisture from Mass (BS 1377) =====

/**
 * Calculate moisture content from container masses per BS 1377.
 * moisture = ((containerWetMass - containerDryMass) / (containerDryMass - containerMass)) × 100
 */
export const calculateMoistureFromMass = (
  containerWetMass: string | undefined,
  containerDryMass: string | undefined,
  containerMass: string | undefined,
): string | null => {
  if (!isFiniteNumber(containerWetMass) || !isFiniteNumber(containerDryMass) || !isFiniteNumber(containerMass)) {
    return null;
  }
  const wet = Number(containerWetMass);
  const dry = Number(containerDryMass);
  const container = Number(containerMass);
  const waterMass = wet - dry;
  const drySoilMass = dry - container;
  if (drySoilMass <= 0 || waterMass < 0) return null;
  return String(round((waterMass / drySoilMass) * 100));
};

/**
 * Get the effective moisture for a trial: auto-calculated from mass if available, else direct entry.
 */
export const getTrialMoisture = (trial: LiquidLimitTrial | PlasticLimitTrial): string => {
  const fromMass = calculateMoistureFromMass(trial.containerWetMass, trial.containerDryMass, trial.containerMass);
  return fromMass ?? trial.moisture;
};

export const getWaterMass = (trial: LiquidLimitTrial | PlasticLimitTrial): number | null => {
  if (!isFiniteNumber(trial.containerWetMass) || !isFiniteNumber(trial.containerDryMass)) return null;
  return round(Number(trial.containerWetMass) - Number(trial.containerDryMass));
};

export const getDrySoilMass = (trial: LiquidLimitTrial | PlasticLimitTrial): number | null => {
  if (!isFiniteNumber(trial.containerDryMass) || !isFiniteNumber(trial.containerMass)) return null;
  const val = Number(trial.containerDryMass) - Number(trial.containerMass);
  return val > 0 ? round(val) : null;
};

// ===== Trial validators =====

export const isLiquidLimitTrialStarted = (trial: LiquidLimitTrial) =>
  isFilled(trial.penetration) || isFilled(trial.moisture) || isFilled(trial.containerWetMass);

export const isPlasticLimitTrialStarted = (trial: PlasticLimitTrial) =>
  isFilled(trial.moisture) || isFilled(trial.containerWetMass);

export const isShrinkageLimitTrialStarted = (trial: ShrinkageLimitTrial) =>
  isFilled(trial.initialLength) || isFilled(trial.finalLength);

export const isLiquidLimitTrialValid = (trial: LiquidLimitTrial): boolean => {
  const moisture = getTrialMoisture(trial);
  return (
    isFiniteNumber(trial.penetration) &&
    Number(trial.penetration) > 0 &&
    isFiniteNumber(moisture) &&
    Number(moisture) >= 0
  );
};

export const isPlasticLimitTrialValid = (trial: PlasticLimitTrial): boolean => {
  const moisture = getTrialMoisture(trial);
  return isFiniteNumber(moisture) && Number(moisture) >= 0;
};

export const isShrinkageLimitTrialValid = (trial: ShrinkageLimitTrial): boolean => {
  return (
    isFiniteNumber(trial.initialLength) &&
    isFiniteNumber(trial.finalLength) &&
    Number(trial.initialLength) > 0 &&
    Number(trial.finalLength) > 0 &&
    Number(trial.finalLength) <= Number(trial.initialLength)
  );
};

// ===== Valid trial getters =====

export const getValidLiquidLimitTrials = (trials: LiquidLimitTrial[]) =>
  trials
    .filter(isLiquidLimitTrialValid)
    .map((trial) => ({
      penetration: Number(trial.penetration),
      moisture: Number(getTrialMoisture(trial)),
      trialNo: trial.trialNo,
    }))
    .sort((a, b) => a.penetration - b.penetration);

export const getValidPlasticLimitTrials = (trials: PlasticLimitTrial[]) =>
  trials.filter(isPlasticLimitTrialValid).map((trial) => Number(getTrialMoisture(trial)));

export const getValidShrinkageLimitTrials = (trials: ShrinkageLimitTrial[]) =>
  trials
    .filter(isShrinkageLimitTrialValid)
    .map((trial) => ({
      initialLength: Number(trial.initialLength),
      finalLength: Number(trial.finalLength),
      trialNo: trial.trialNo,
    }));

export const averageNumbers = (values: number[]) => {
  if (values.length === 0) return null;
  return round(values.reduce((sum, value) => sum + value, 0) / values.length);
};

/**
 * Calculate Liquid Limit (LL) using cone penetration method (BS 1377).
 * Interpolates moisture content at 20mm penetration.
 */
export const calculateLiquidLimit = (trials: LiquidLimitTrial[]): number | null => {
  const validTrials = getValidLiquidLimitTrials(trials);

  if (validTrials.length === 0) return null;
  if (validTrials.length === 1) return validTrials[0].moisture;

  const targetPenetration = 20;

  // Prefer linear regression at 20 mm when 2+ valid trials exist
  const regression = calculateLinearRegression(
    validTrials.map((t) => ({ x: t.penetration, y: t.moisture })),
  );
  if (regression && Number.isFinite(regression.slope) && Number.isFinite(regression.intercept)) {
    return round(regression.slope * targetPenetration + regression.intercept);
  }

  // Fallback: piecewise interpolation
  let lower: (typeof validTrials)[number] | null = null;
  let upper: (typeof validTrials)[number] | null = null;

  for (const trial of validTrials) {
    if (trial.penetration <= targetPenetration) lower = trial;
    if (trial.penetration >= targetPenetration && !upper) upper = trial;
  }

  if (lower?.penetration === targetPenetration) return lower.moisture;
  if (upper?.penetration === targetPenetration) return upper.moisture;

  if (lower && upper && lower.penetration !== upper.penetration) {
    const slope = (upper.moisture - lower.moisture) / (upper.penetration - lower.penetration);
    return round(lower.moisture + slope * (targetPenetration - lower.penetration));
  }

  if (lower) return lower.moisture;
  if (upper) return upper.moisture;

  return null;
};

/**
 * Calculate Plastic Limit (PL) as average moisture content.
 */
export const calculatePlasticLimit = (trials: PlasticLimitTrial[]): number | null => {
  const validTrials = getValidPlasticLimitTrials(trials);
  return averageNumbers(validTrials);
};

/**
 * Calculate Linear Shrinkage (LS) per BS 1377.
 * LS = ((initialLength - finalLength) / initialLength) × 100
 */
export const calculateLinearShrinkage = (trials: ShrinkageLimitTrial[]): number | null => {
  const validTrials = getValidShrinkageLimitTrials(trials);
  if (validTrials.length === 0) return null;

  const shrinkages = validTrials.map((trial) =>
    ((trial.initialLength - trial.finalLength) / trial.initialLength) * 100
  );

  return averageNumbers(shrinkages);
};

// Keep calculateShrinkageLimit as alias for linear shrinkage (BS 1377 standard)
export const calculateShrinkageLimit = (trials: ShrinkageLimitTrial[]): number | null => {
  return calculateLinearShrinkage(trials);
};

/**
 * Calculate Plasticity Index (PI) = LL - PL.
 * Enforces the physical constraint that LL must be >= PL.
 * If PL > LL (physically impossible), returns null as the data is invalid.
 */
export const calculatePlasticityIndex = (liquidLimit: number | null, plasticLimit: number | null): number | null => {
  if (liquidLimit === null || plasticLimit === null) return null;
  if (liquidLimit < 0 || plasticLimit < 0) return null;

  // CRITICAL: PL must never exceed LL - this violates soil mechanics fundamentals
  if (plasticLimit > liquidLimit) {
    return null; // Return null to indicate invalid state, not a calculated value
  }

  const pi = round(liquidLimit - plasticLimit);

  // PI should never be negative in valid soil mechanics
  return pi >= 0 ? pi : null;
};

/**
 * Calculate Modulus of Plasticity = PI × (% passing 425µm)
 * Per BS 1377 / Master Excel: e.g. PI=42.45, passing=88.6 → 3761.07
 */
export const calculateModulusOfPlasticity = (plasticityIndex: number | null, passing425um: string | undefined): number | null => {
  if (plasticityIndex === null || !isFiniteNumber(passing425um)) return null;
  return round(plasticityIndex * Number(passing425um));
};

/**
 * Calculate A-line position: PI = 0.73(LL - 20)
 * Used in Plasticity Chart for soil classification
 */
export const getALinePI = (liquidLimit: number): number => {
  return round(0.73 * (liquidLimit - 20));
};

/**
 * Calculate U-line position: PI = 0.9(LL - 8)
 * Upper limit for natural soils
 */
export const getULinePI = (liquidLimit: number): number => {
  return round(0.9 * (liquidLimit - 8));
};

/**
 * Classify soil based on LL and PI using ASTM D2487 / BS 1377
 * Returns classification code (CL, CH, ML, MH) or "Non-plastic"
 */
export const classifySoil = (liquidLimit: number | null, plasticityIndex: number | null): string => {
  if (liquidLimit === null || plasticityIndex === null) return "No data";
  if (plasticityIndex < 0) return "Non-plastic";
  if (plasticityIndex === 0) return "Non-plastic";

  const aLinePI = getALinePI(liquidLimit);
  const isAboveALine = plasticityIndex > aLinePI;

  if (liquidLimit < 50) {
    return isAboveALine ? "Clay (CL)" : "Silt (ML)";
  } else {
    return isAboveALine ? "Clay (CH)" : "Silt (MH)";
  }
};

export const calculateTestResult = (test: AtterbergTest): CalculatedResults => {
  switch (test.type) {
    case "liquidLimit": {
      const liquidLimit = calculateLiquidLimit(test.trials);
      return liquidLimit === null ? {} : { liquidLimit };
    }
    case "plasticLimit": {
      const plasticLimit = calculatePlasticLimit(test.trials);
      return plasticLimit === null ? {} : { plasticLimit };
    }
    case "shrinkageLimit": {
      const linearShrinkage = calculateLinearShrinkage(test.trials);
      return linearShrinkage === null ? {} : { linearShrinkage, shrinkageLimit: linearShrinkage };
    }
  }
};

export const countValidTrials = (test: AtterbergTest) => {
  switch (test.type) {
    case "liquidLimit":
      return test.trials.filter(isLiquidLimitTrialValid).length;
    case "plasticLimit":
      return test.trials.filter(isPlasticLimitTrialValid).length;
    case "shrinkageLimit":
      return test.trials.filter(isShrinkageLimitTrialValid).length;
  }
};

export const countStartedTrials = (test: AtterbergTest) => {
  switch (test.type) {
    case "liquidLimit":
      return test.trials.filter(isLiquidLimitTrialStarted).length;
    case "plasticLimit":
      return test.trials.filter(isPlasticLimitTrialStarted).length;
    case "shrinkageLimit":
      return test.trials.filter(isShrinkageLimitTrialStarted).length;
  }
};

export const isLiquidLimitTestComplete = (test: Extract<AtterbergTest, { type: "liquidLimit" }>) => countValidTrials(test) >= 2;
export const isPlasticLimitTestComplete = (test: Extract<AtterbergTest, { type: "plasticLimit" }>) => countValidTrials(test) >= 2;
export const isShrinkageLimitTestComplete = (test: Extract<AtterbergTest, { type: "shrinkageLimit" }>) =>
  getValidShrinkageLimitTrials(test.trials).length >= 1;

export const isAtterbergTestComplete = (test: AtterbergTest) => {
  switch (test.type) {
    case "liquidLimit":
      return isLiquidLimitTestComplete(test);
    case "plasticLimit":
      return isPlasticLimitTestComplete(test);
    case "shrinkageLimit":
      return isShrinkageLimitTestComplete(test);
  }
};

export const getActiveResultValue = (test: AtterbergTest, result: CalculatedResults = test.result) => {
  switch (test.type) {
    case "liquidLimit":
      return result.liquidLimit ?? null;
    case "plasticLimit":
      return result.plasticLimit ?? null;
    case "shrinkageLimit":
      return result.linearShrinkage ?? result.shrinkageLimit ?? null;
  }
};

export const calculateRecordResults = (record: AtterbergRecord): CalculatedResults => {
  const liquidLimitValues = record.tests
    .filter((test) => test.type === "liquidLimit")
    .map((test) => calculateTestResult(test).liquidLimit)
    .filter(isNumber);

  const plasticLimitValues = record.tests
    .filter((test) => test.type === "plasticLimit")
    .map((test) => calculateTestResult(test).plasticLimit)
    .filter(isNumber);

  const linearShrinkageValues = record.tests
    .filter((test) => test.type === "shrinkageLimit")
    .map((test) => calculateTestResult(test).linearShrinkage)
    .filter(isNumber);

  const liquidLimit = averageNumbers(liquidLimitValues);
  const plasticLimit = averageNumbers(plasticLimitValues);
  const linearShrinkage = averageNumbers(linearShrinkageValues);
  const plasticityIndex = calculatePlasticityIndex(liquidLimit, plasticLimit);
  const modulusOfPlasticity = calculateModulusOfPlasticity(plasticityIndex, record.passing425um);

  return {
    ...(liquidLimit !== null ? { liquidLimit } : {}),
    ...(plasticLimit !== null ? { plasticLimit } : {}),
    ...(linearShrinkage !== null ? { linearShrinkage, shrinkageLimit: linearShrinkage } : {}),
    ...(plasticityIndex !== null ? { plasticityIndex } : {}),
    ...(modulusOfPlasticity !== null ? { modulusOfPlasticity } : {}),
  };
};

export const countRecordDataPoints = (record: AtterbergRecord) => record.tests.reduce((sum, test) => sum + countValidTrials(test), 0);

export const countRecordStartedDataPoints = (record: AtterbergRecord) => record.tests.reduce((sum, test) => sum + countStartedTrials(test), 0);

export const countCompletedTests = (record: AtterbergRecord) =>
  record.tests.reduce((sum, test) => sum + (isAtterbergTestComplete(test) ? 1 : 0), 0);

export const calculateProjectResults = (records: AtterbergRecord[]): CalculatedResults => {
  const liquidLimit = averageNumbers(records.map((record) => record.results.liquidLimit).filter(isNumber));
  const plasticLimit = averageNumbers(records.map((record) => record.results.plasticLimit).filter(isNumber));
  const linearShrinkage = averageNumbers(records.map((record) => record.results.linearShrinkage).filter(isNumber));
  const plasticityIndex = calculatePlasticityIndex(liquidLimit, plasticLimit);

  return {
    ...(liquidLimit !== null ? { liquidLimit } : {}),
    ...(plasticLimit !== null ? { plasticLimit } : {}),
    ...(linearShrinkage !== null ? { linearShrinkage, shrinkageLimit: linearShrinkage } : {}),
    ...(plasticityIndex !== null ? { plasticityIndex } : {}),
  };
};

export const deriveAtterbergStatus = (dataPoints: number, completedTests: number, totalTests: number, startedDataPoints?: number): TestStatus => {
  // Use startedDataPoints if available, otherwise fall back to dataPoints
  const trialDataPoints = startedDataPoints !== undefined ? startedDataPoints : dataPoints;

  if (trialDataPoints === 0) return "not-started";
  if (totalTests > 0 && completedTests === totalTests) return "completed";
  return "in-progress";
};

export const getTestValidationMessages = (test: AtterbergTest): { errors: string[]; warnings: string[] } => {
  const errors: string[] = [];
  const warnings: string[] = [];
  const validTrialsCount = countValidTrials(test);

  if (validTrialsCount === 0) {
    errors.push(`No valid trials entered for ${test.title}`);
  } else if (validTrialsCount === 1) {
    warnings.push(`Only 1 valid trial - recommend at least 2 trials for ${test.title}`);
  }

  if (test.type === "liquidLimit") {
    const validTrials = getValidLiquidLimitTrials(test.trials);
    const penetrationValues = validTrials.map((t) => t.penetration);
    const minPen = Math.min(...penetrationValues);
    const maxPen = Math.max(...penetrationValues);

    if (validTrialsCount > 0 && Math.abs(maxPen - minPen) < 3) {
      warnings.push("Penetration range is narrow - recommend wider range for better interpolation");
    }

    // Check for outliers in moisture content
    if (validTrialsCount >= 2) {
      const moistureValues = validTrials.map((t) => t.moisture);
      const mean = averageNumbers(moistureValues);
      if (mean !== null) {
        const variance = moistureValues.reduce((sum, m) => sum + Math.pow(m - mean, 2), 0) / moistureValues.length;
        const stdDev = Math.sqrt(variance);
        const outliers = validTrials.filter((t) => Math.abs(t.moisture - mean) > 2 * stdDev);
        if (outliers.length > 0) {
          warnings.push(`${outliers.length} trial(s) may be outliers - moisture values differ significantly from mean`);
        }
      }
    }

    // Check fit quality
    const fitQuality = getLiquidLimitFitQuality(test.trials);
    if (fitQuality && fitQuality.rSquared < 0.95) {
      warnings.push(`R² = ${fitQuality.rSquared.toFixed(3)} - data scatter is high, verify measurements`);
    }
  }

  if (test.type === "plasticLimit") {
    if (validTrialsCount < 2) {
      errors.push("At least 2 trials are required to calculate Plastic Limit");
    } else {
      // Check coefficient of variation for plastic limit
      const validValues = getValidPlasticLimitTrials(test.trials);
      const cv = calculateCoefficientOfVariation(validValues);
      if (cv !== null && cv > 5) {
        warnings.push(`High variation in moisture (CV=${cv.toFixed(1)}%) - check trial consistency`);
      }
    }
  }

  if (test.type === "shrinkageLimit") {
    const validTrials = getValidShrinkageLimitTrials(test.trials);
    if (validTrialsCount > 0 && validTrials.some((t) => t.initialLength <= 0 || t.finalLength <= 0)) {
      errors.push("Length values must be positive numbers");
    }

    // Check for unrealistic final lengths
    if (validTrialsCount > 0) {
      const unrealistic = validTrials.filter((t) => t.finalLength > t.initialLength);
      if (unrealistic.length > 0) {
        errors.push("Final length cannot exceed initial length");
      }
    }

    // Check for excessive shrinkage
    if (validTrialsCount > 0) {
      const excessive = validTrials.filter((t) => {
        const shrinkage = ((t.initialLength - t.finalLength) / t.initialLength) * 100;
        return shrinkage > 100;
      });
      if (excessive.length > 0) {
        errors.push("Shrinkage cannot exceed 100%");
      }
    }
  }

  return { errors, warnings };
};

export const getRecordValidationMessages = (record: AtterbergRecord): { errors: string[]; warnings: string[]; info: string[] } => {
  const errors: string[] = [];
  const warnings: string[] = [];
  const info: string[] = [];

  if (record.tests.length === 0) {
    info.push("No tests added yet. Click 'Add Test' to begin.");
  }

  const completedTests = countCompletedTests(record);
  const totalTests = record.tests.length;

  if (totalTests > 0) {
    info.push(`Progress: ${completedTests}/${totalTests} tests completed`);
  }

  const { liquidLimit, plasticLimit, plasticityIndex } = record.results;

  // CRITICAL: Check for physically impossible PL > LL condition
  if (liquidLimit !== undefined && plasticLimit !== undefined && plasticLimit > liquidLimit) {
    errors.push(
      `❌ CRITICAL DATA ERROR: Plastic Limit (${plasticLimit}%) exceeds Liquid Limit (${liquidLimit}%). ` +
      `This is physically impossible in soil mechanics (PL must always be ≤ LL). ` +
      `Please verify your test data for PL trials (especially container moisture percentages). ` +
      `This record cannot be exported until corrected.`
    );
  }

  if (plasticityIndex === null && liquidLimit !== undefined && plasticLimit !== undefined) {
    // PI is null because it was calculated as invalid (PL > LL)
    warnings.push(
      `Plastic Limit exceeds Liquid Limit (see error above). Plasticity Index cannot be calculated.`
    );
  } else if (plasticityIndex !== undefined && plasticityIndex < 1) {
    info.push("Soil appears to be non-plastic or nearly non-plastic");
  }

  return { errors, warnings, info };
};

/**
 * Check if a record can be safely exported or saved.
 * Returns validation result with canExport flag and error messages.
 */
export const canRecordBeExported = (record: AtterbergRecord): { canExport: boolean; errorMessages: string[] } => {
  const errorMessages: string[] = [];

  const { liquidLimit, plasticLimit } = record.results;

  // CRITICAL: Block export if PL > LL
  if (liquidLimit !== undefined && plasticLimit !== undefined && plasticLimit > liquidLimit) {
    errorMessages.push(
      `Plastic Limit (${plasticLimit}%) exceeds Liquid Limit (${liquidLimit}%). ` +
      `This is physically impossible and must be corrected before exporting.`
    );
  }

  return {
    canExport: errorMessages.length === 0,
    errorMessages,
  };
};

export const buildAtterbergSummaryFields = (results: CalculatedResults, recordCount: number, totalDataPoints: number) => [
  { label: "Avg LL", value: results.liquidLimit !== undefined ? `${results.liquidLimit}%` : "" },
  { label: "Avg PL", value: results.plasticLimit !== undefined ? `${results.plasticLimit}%` : "" },
  { label: "Avg LS", value: results.linearShrinkage !== undefined ? `${results.linearShrinkage}%` : "" },
  { label: "Avg PI", value: results.plasticityIndex !== undefined ? `${results.plasticityIndex}%` : "" },
  { label: "Records", value: String(recordCount) },
  { label: "Valid Data Points", value: String(totalDataPoints) },
];

export const areCalculatedResultsEqual = (left: CalculatedResults, right: CalculatedResults) =>
  left.liquidLimit === right.liquidLimit &&
  left.plasticLimit === right.plasticLimit &&
  left.shrinkageLimit === right.shrinkageLimit &&
  left.linearShrinkage === right.linearShrinkage &&
  left.plasticityIndex === right.plasticityIndex;

export const getLiquidLimitGraphData = (trials: LiquidLimitTrial[]) =>
  getValidLiquidLimitTrials(trials).map((trial) => ({
    penetration: trial.penetration,
    moisture: trial.moisture,
    trial: trial.trialNo,
  }));

/**
 * Linear regression for curve fitting
 * Returns slope, intercept, and R-squared value
 */
export const calculateLinearRegression = (
  points: Array<{ x: number; y: number }>,
): { slope: number; intercept: number; rSquared: number } | null => {
  if (points.length < 2) return null;

  const n = points.length;
  const sumX = points.reduce((sum, p) => sum + p.x, 0);
  const sumY = points.reduce((sum, p) => sum + p.y, 0);
  const sumXY = points.reduce((sum, p) => sum + p.x * p.y, 0);
  const sumX2 = points.reduce((sum, p) => sum + p.x * p.x, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  // Calculate R-squared
  const meanY = sumY / n;
  const ssTotal = points.reduce((sum, p) => sum + Math.pow(p.y - meanY, 2), 0);
  const ssResidual = points.reduce((sum, p) => sum + Math.pow(p.y - (slope * p.x + intercept), 2), 0);
  const rSquared = 1 - ssResidual / ssTotal;

  return {
    slope: round(slope),
    intercept: round(intercept),
    rSquared: round(rSquared),
  };
};

/**
 * Predict Y value using linear regression
 */
export const predictWithLinearRegression = (
  x: number,
  slope: number,
  intercept: number,
): number => {
  return round(slope * x + intercept);
};

/**
 * Calculate coefficient of variation for moisture values
 * Used to assess consistency of plastic limit trials
 */
export const calculateCoefficientOfVariation = (values: number[]): number | null => {
  if (values.length === 0) return null;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  if (mean === 0) return null;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);
  return round((stdDev / mean) * 100);
};

/**
 * Fit line through liquid limit trials and get R-squared
 * Helps assess quality of cone penetration test data
 */
export const getLiquidLimitFitQuality = (trials: LiquidLimitTrial[]): { rSquared: number; slope: number; intercept: number } | null => {
  const validTrials = getValidLiquidLimitTrials(trials);
  if (validTrials.length < 2) return null;

  const points = validTrials.map((t) => ({ x: t.penetration, y: t.moisture }));
  const regression = calculateLinearRegression(points);

  return regression
    ? {
        rSquared: regression.rSquared,
        slope: regression.slope,
        intercept: regression.intercept,
      }
    : null;
};

// Legacy aliases for backwards compatibility
export const isLinearShrinkageTrialValid = isShrinkageLimitTrialValid;
export const getValidLinearShrinkageTrials = getValidShrinkageLimitTrials;
