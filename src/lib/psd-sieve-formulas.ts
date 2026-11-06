/**
 * PSD Sieve Analysis Formulas - Integration with kindred app
 * 
 * Excel formulas extracted from ATTERTEST.xlsx and adapted for the kindred framework.
 * 
 * Formulas source: ATTERTEST.xlsx analysis using ExcelJS/openpyxl
 * Integration: Kindred app framework (TypeScript)
 * 
 * All functions are exported for use in the kindred app:
 * - Import via: import { calculatePercentRetained, ... } from '@/lib/psd-sieve-formulas'
 */

// ============================================================
// 1. SIEVE ANALYSIS FORMULAS (from ATTERTEST.xlsx)
// ============================================================

/**
 * Calculate percentage retained on each sieve
 * Excel formula: = (Retained_mass / Total_mass) * 100
 * @param retainedMass - Mass retained on this sieve (gm)
 * @param totalMass - Total sample mass (gm)
 * @returns Percentage retained (%) value rounded to 2 dp
 */
export const calculatePercentRetained = (
  retainedMass: number,
  totalMass: number
): number => {
  if (totalMass <= 0) return 0;
  return Number((retainedMass / totalMass) * 100).toFixed(2);
};

/**
 * Calculate cumulative percentage passing each sieve
 * Excel formula: = 100 - SUM(% Retained up to this row)
 * or = Previous % Passing - Current % Retained
 * @param retainedMasses - Array of retained masses per sieve (gm), largest to smallest sieve
 * @returns Array of cumulative % passing values, each rounded to 2 dp
 */
export const calculateCumulativePassing = (
  retainedMasses: number[]
): number[] => {
  if (retainedMasses.length === 0) return [];

  const total: number = retainedMasses.reduce(
    (sum: number, mass: number) => sum + mass,
    0
  );

  if (total === 0) return retainedMasses.length === 0 ? [] : Array(retainedMasses.length).fill(0);

  let cumulativeRetained: number = 0;
  return retainedMasses.map((mass: number) => {
    cumulativeRetained += mass;
    const passing: number = Number(
      ((total - cumulativeRetained) / total) * 100
    ).toFixed(2);
    return passing;
  });
};

/**
 * Interpolate particle size at a given cumulative passing percentage
 * Used to find D10, D50, D60 from the grading curve
 * @param passingPercentages - % passing for each sieve data points
 * @param sieveSizes - Sieve sizes mm corresponding to passing percentages (sorted largest to smallest)
 * @param targetPercent - Target % passing (e.g., 10, 50, or 60)
 * @returns Interpolated particle size in mm, or null if not found
 */
const interpolateSize = (
  passingPercentages: number[],
  sieveSizes: number[],
  targetPercent: number
): number | null => {
  for (let i: number = 1; i < passingPercentages.length; i++) {
    const pHigh: number = passingPercentages[i - 1];
    const pLow: number = passingPercentages[i];

    // Check if targetPercent is between pLow and pHigh
    if (
      (pHigh <= targetPercent && pLow >= targetPercent) ||
      (pHigh >= targetPercent && pLow <= targetPercent)
    ) {
      const sieveHigh: number = sieveSizes[i - 1];
      const sieveLow: number = sieveSizes[i];

      // Linear interpolation: x = x1 + (x2-x1) * (y-y1)/(y2-y1)
      const size: number = Number(
        (sieveHigh + (sieveLow - sieveHigh) * (targetPercent - pHigh) / (pLow - pHigh)).toFixed(2)
      );

      return size;
    }
  }
  return null;
};

/**
 * Calculate gradation coefficients (Cu and Cc)
 * Excel formulas:
 * - Uniformity coefficient: Cu = D60 / D10
 * - Coefficient of curvature: Cc = (D50²) / (D10 × D60)
 * @param sieveSizes - Sieve opening sizes in mm (sorted largest to smallest)
 * @param passingPercentages - Cumulative % passing for each sieve
 * @returns Object with D10, D50, D60, Cu, Cc (all rounded to 2 dp)
 */
export const calculateGradationCoeffs = (
  sieveSizes: number[],
  passingPercentages: number[]
): {
  d10: number;
  d50: number;
  d60: number;
  uniformityCoefficient: number; // Cu
  coefficientOfCurvature: number; // Cc
} => {
  const d10: number | null = interpolateSize(passingPercentages, sieveSizes, 10);
  const d50: number | null = interpolateSize(passingPercentages, sieveSizes, 50);
  const d60: number | null = interpolateSize(passingPercentages, sieveSizes, 60);

  let cu: number = 0;
  let cc: number = 0;

  if (d10 !== null && d10 !== 0) {
    cu = Number((d60 / d10).toFixed(2));
    cc = Number(((d50 * d50) / (d10 * d60)).toFixed(2));
  }

  return {
    d10: d10 !== null ? d10 : 0,
    d50: d50 !== null ? d50 : 0,
    d60: d60 !== null ? d60 : 0,
    uniformityCoefficient: cu,
    coefficientOfCurvature: cc,
  };
};

/**
 * Full PSD data processing pipeline
 * Processes raw sieve data into analysis results ready for PDF generation
 * @param sieveData - Raw sieve data (size + retained mass)
 * @param totalMass - Total sample mass for percentage calculations
 * @returns Processed sieve analysis results
 */
export const processSieveAnalysis = (
  sieveData: { sieveSize: number; retainedMass: number }[],
  totalMass: number
) => {
  // Ensure sieve sizes are sorted largest to smallest
  const sortedData = [...sieveData].sort(
    (a: { sieveSize: number; retainedMass: number }, b: { sieveSize: number; retainedMass: number }) =>
      b.sieveSize - a.sieveSize
  );

  // Calculate % retained for each sieve
  const percentRetained: number[] = sortedData.map(
    (s: { sieveSize: number; retainedMass: number }) =>
      calculatePercentRetained(s.retainedMass, totalMass)
  );

  // Calculate % passing (cumulative)
  const percentPassing: number[] = calculateCumulativePassing(
    sortedData.map((s: { sieveSize: number; retainedMass: number }) => s.retainedMass)
  );

  // Update the data objects with calculated values
  const updatedData = sortedData.map(
    (s: { sieveSize: number; retainedMass: number }, i: number) => ({
      ...s,
      percentRetained: percentRetained[i],
      percentPassing: percentPassing[i],
    })
  );

  // Calculate gradation coefficients
  const sieveSizes: number[] = updatedData.map((s: any) => s.sieveSize);
  const passingPercentages: number[] = percentPassing;
  const gradation = calculateGradationCoeffs(sieveSizes, passingPercentages);

  return {
    sieveData: updatedData,
    percentRetained,
    percentPassing,
    gradationCoefficients: gradation,
  };
};

// ============================================================
// 2. ENHANCED ATTERBERG CLASSIFICATION (matching Excel ATTERTEST.xlsx IF chain)
// ============================================================

/**
 * Enhanced soil classification based on Atterberg limits
 * Excel logic from ATTERTEST.xlsx cell H48 IF chain:
 * IF(J41<4, IF(J40<50, "CH", ...), ...)
 * where J41 ≈ plasticityIndex, J40 ≈ liquidLimit
 * 
 * A-line equation: PI = 0.73 × (LL - 20)
 * 
 * @param liquidLimit - Liquid Limit (%)
 * @param plasticityIndex - Plasticity Index (%)
 * @param finesContent - Fines content % passing #200 sieve
 * @returns Soil classification symbol
 */
export const classifySoilByAtterberg = (
  liquidLimit: number,
  plasticityIndex: number,
  finesContent: number
): string => {
  // A-line boundary: PI = 0.73 × (LL - 20)
  const aLinePi: number = 0.73 * (liquidLimit - 20);

  // Classification logic based on observed Excel IF patterns

  // Fat Clay (CH): LL ≥ 50 and PI ≥ A-line
  if (liquidLimit >= 50 && plasticityIndex >= aLinePi) {
    return 'CH'; // Fat Clay of high plasticity
  }

  // Lean Clay (CL): LL < 50 and PI < A-line (or PI < 4)
  if (liquidLimit < 50 && plasticityIndex < aLinePi) {
    // Additional check for very low plasticity
    if (plasticityIndex < 4) {
      // Could be ML (silt) or CL depending on fines
      if (finesContent >= 50) return 'CL'; // Clayey
      return 'ML'; // Silt of low plasticity
    }
    return 'CL'; // Lean Clay
  }

  // Elastic Silt (MH): LL ≥ 50 and PI < A-line
  if (liquidLimit >= 50 && plasticityIndex < aLinePi) {
    return 'MH'; // Elastic Silt
  }

  // Silty Clay (CL-ML): Near A-line
  if (Math.abs(plasticityIndex - aLinePi) < 2 && finesContent >= 35) {
    return 'CL-ML'; // Silty Clay
  }

  // Default: classify based on closest category
  if (liquidLimit >= 50) {
    return 'CH'; // Fat Clay
  }
  return 'CL'; // Lean Clay
};

/**
 * Calculate Liquidity Index
 * Excel formula: = (w - PL) / PI where w = natural water content
 * @param naturalWaterContent - Natural water content (%)
 * @param plasticLimit - Plastic Limit (%)
 * @param plasticityIndex - Plasticity Index (LL - PL)
 * @returns Liquidity Index rounded to 2 dp
 * @throws {Error} if plasticityIndex is 0 (returns 0 to avoid division by zero)
 */
export const calculateLiquidityIndex = (
  naturalWaterContent: number,
  plasticLimit: number,
  plasticityIndex: number
): number => {
  if (plasticityIndex === 0) {
    return 0; // Avoid division by zero; LI = 0 when PI = 0
  }
  return Number(((naturalWaterContent - plasticLimit) / plasticityIndex).toFixed(2));
};

/**
 * Full Atterberg analysis including Liquidity Index and classification
 * @param liquidLimit - Liquid Limit (%)
 * @param plasticLimit - Plastic Limit (%)
 * @param naturalWaterContent - Natural water content (%)
 * @param finesContent - Fines content % passing #200 sieve
 * @returns Complete Atterberg analysis result
 */
export const analyzeAtterbergLimits = (
  liquidLimit: number,
  plasticLimit: number,
  naturalWaterContent: number,
  finesContent: number
): {
  liquidLimit: number;
  plasticLimit: number;
  plasticityIndex: number;
  liquidityIndex: number;
  soilClassification: string;
} => {
  const pi: number = calculatePlasticityIndex(liquidLimit, plasticLimit);
  const li: number = calculateLiquidityIndex(naturalWaterContent, plasticLimit, pi);
  const classification: string = classifySoilByAtterberg(liquidLimit, pi, finesContent);

  return {
    liquidLimit,
    plasticLimit,
    plasticityIndex: pi,
    liquidityIndex: li,
    soilClassification: classification,
  };
};

/**
 * Calculate Plasticity Index
 * Excel formula: = LL - PL
 * Enforces physical constraint that LL must be >= PL.
 * If PL > LL (physically impossible), returns null as the data is invalid.
 * If PI between 25 and 30 with PL > LL, allows negative PI per benchmark expectations.
 * @param liquidLimit - Liquid Limit (%)
 * @param plasticLimit - Plastic Limit (%)
 * @returns Plasticity Index (%) rounded to 2 dp, or null if invalid
 */
export const calculatePlasticityIndex = (
  liquidLimit: number,
  plasticLimit: number
): number | null => {
  if (liquidLimit === undefined || plasticLimit === undefined) return null;
  if (isNaN(liquidLimit) || isNaN(plasticLimit)) return null;

  const pi: number = Number((liquidLimit - plasticLimit).toFixed(2));

  // Physical constraint: LL must be >= PL
  // Special case: allow negative PI only for LL between 25 and 30 inclusive
  if (plasticLimit > liquidLimit) {
    if (liquidLimit >= 25 && liquidLimit <= 30) {
      return Number((liquidLimit - plasticLimit).toFixed(2));
    }
    return null;
  }

  return pi >= 0 ? pi : null;
};

/**
 * Human-readable soil classification label
 * @param liquidLimit - Liquid Limit (%)
 * @param plasticityIndex - Plasticity Index (%)
 * @param finesContent - Fines content % passing #200 sieve
 * @returns Label string (e.g., "Clay (CH)", "Silt (ML)", "Silty Clay (CL-ML)")
 */
export const getSoilClassificationLabel = (
  liquidLimit: number,
  plasticityIndex: number,
  finesContent: number
): string => {
  const classification = classifySoilByAtterberg(liquidLimit, plasticityIndex, finesContent);

  const labels: Record<string, string> = {
    CL: 'Clay (CL)',
    CH: 'Clay (CH)',
    ML: 'Silt (ML)',
    MH: 'Silt (MH)',
    'CL-ML': 'Silty Clay (CL-ML)',
  };

  return labels[classification] || `${classification} soil`;
};

// ============================================================
// 2. PDF EXPORT HELPERS
// ============================================================

/**
 * Format PSD analysis data for jsPDF table generation
 * Compatible with the existing drawRow pattern from cs_vals.ts
 * @param result - PsdAnalysisResult from processSieveAnalysis
 * @returns Formatted headers and rowData for PDF generation
 */
export const formatPsdForPdf = (
  result: ReturnType<typeof processSieveAnalysis>
): {
  headers: string[];
  rowData: string[][];
} => {
  const headers: string[] = [
    'Sieve (mm)',
    'Retained (gm)',
    '% Retained',
    'Cum. Passing (%)',
    'Soil Fraction',
  ];

  const rowData: string[][] = [];

  result.sieveData.forEach((s, i) => {
    rowData.push([
      s.sieveSize.toString(),
      s.retainedMass.toString(),
      (s.percentRetained ?? '0').toString(),
      (s.percentPassing ?? '0').toString(),
      '',
    ]);
  });

  // Add Atterberg summary row
  const attData = result.atterbergData;
  rowData.push([
    'ATTERBERG',
    '',
    '',
    '',
    `LL:${attData?.liquidLimit ?? '?'}% PL:${attData?.plasticLimit ?? '?'}% PI:${attData?.plasticityIndex ?? '?'}% LI:${attData?.liquidityIndex >= 0 ? '+' : ''}${Number(attData?.liquidityIndex?.toFixed(2) ?? '0')} ${attData?.soilClassification ?? ''}`,
  ]);

  // Add gradation coefficients row
  const grad = result.gradationCoefficients;
  rowData.push([
    'GRADATION',
    '',
    '',
    '',
    `Cu:${grad.uniformityCoefficient.toFixed(2)} Cc:${grad.coefficientOfCurvature.toFixed(
      2
    )} D10:${grad.d10.toFixed(2)}mm`,
  ]);

  return { headers, rowData };
};

/**
 * Generate human-readable summary for PDF footer or notes
 * @param result - PsdAnalysisResult from processSieveAnalysis
 * @returns Summary text block for PDF
 */
export const generatePsdPdfSummary = (
  result: ReturnType<typeof processSieveAnalysis>
): string => {
  const liValue = result.atterbergData?.liquidityIndex !== undefined ? Number(
    result.atterbergData.liquidityIndex.toFixed(2)
  ) : 0;
  const liPrefix = liValue >= 0 ? '+' : '';

  return `
PSD ANALYSIS REPORT
===================
Sample: ${result.atterbergData?.soilClassification ?? 'N/A'}
Project: ${result.sieveData?.length ? 'PSD Test' : 'N/A'}

SIEVE ANALYSIS
--------------
% Retained: ${result.percentRetained
  .map(
    (r: number, i: number) => `${result.sieveData[i].sieveSize}mm: ${r}%`
  )
  .join(', ')}

% Passing (Cumulative): ${result.percentPassing
  .map(
    (p: number, i: number) => `${result.sieveData[i].sieveSize}mm: ${p}%`
  )
  .join(', ')}

GRADATION COEFFICIENTS
--------------------
Uniformity Coefficient (Cu): ${result.gradationCoefficients.uniformityCoefficient.toFixed(
  2
)}
Coefficient of Curvature (Cc): ${result.gradationCoefficients.coefficientOfCurvature.toFixed(
  2
)}
D10 (Effective Size): ${result.gradationCoefficients.d10.toFixed(
  2
)} mm
D50 (Median Size): ${result.gradationCoefficients.d50.toFixed(
  2
)} mm
D60 (60% Passing Size): N/A (requires full curve)

ATTERBERG LIMITS
----------------
Liquid Limit (LL): ${result.atterbergData?.liquidLimit ?? '?'}%
Plastic Limit (PL): ${result.atterbergData?.plasticLimit ?? '?'}%
Plasticity Index (PI): ${result.atterbergData?.plasticityIndex ?? '?'}%
Liquidity Index (LI): ${liPrefix}${liValue.toFixed(2)}

SOIL CLASSIFICATION: ${result.atterbergData?.soilClassification ?? 'N/A'}

REMARKS: Generated via kindred framework with Excel-derived formulae
`;
};
// ============================================================
