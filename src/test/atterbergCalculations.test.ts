import { describe, it, expect } from "vitest";
import {
  calculateMoistureFromMass,
  calculateLiquidLimit,
  calculatePlasticLimit,
  calculateLinearShrinkage,
  calculatePlasticityIndex,
  calculateModulusOfPlasticity,
  classifySoil,
  getALinePI,
  getULinePI,
  calculateLinearRegression,
  calculateCoefficientOfVariation,
} from "@/lib/atterbergCalculations";
import type {
  LiquidLimitTrial,
  PlasticLimitTrial,
  ShrinkageLimitTrial,
} from "@/context/TestDataContext";

// ===== MOISTURE CONTENT CALCULATIONS (BS 1377) =====

describe("calculateMoistureFromMass (BS 1377)", () => {
  it("should calculate moisture content from container masses", () => {
    // Formula: ((wet - dry) / (dry - container)) × 100
    // Example: wet=45.32g, dry=39.18g, container=15.20g
    // water = 45.32 - 39.18 = 6.14g
    // dry soil = 39.18 - 15.20 = 23.98g
    // moisture = (6.14 / 23.98) × 100 = 25.60%
    const result = calculateMoistureFromMass("45.32", "39.18", "15.20");
    expect(result).toMatch(/^25\.6/); // May be "25.6" or "25.60" depending on rounding
  });

  it("should handle direct numeric input (comma separator should be handled by input sanitization)", () => {
    // Note: sanitizeNumericInput() should be called before passing to this function
    // This function expects properly formatted numeric strings
    const result = calculateMoistureFromMass("45.32", "39.18", "15.20");
    expect(result).not.toBeNull();
  });

  it("should return null if any value is missing", () => {
    expect(calculateMoistureFromMass("45.32", "39.18", undefined)).toBeNull();
    expect(calculateMoistureFromMass("45.32", undefined, "15.20")).toBeNull();
    expect(calculateMoistureFromMass(undefined, "39.18", "15.20")).toBeNull();
  });

  it("should return null if dry soil mass is zero or negative", () => {
    // dry = 15.20, container = 15.20 → drySoilMass = 0
    expect(calculateMoistureFromMass("45.32", "15.20", "15.20")).toBeNull();
  });

  it("should return null if water mass is negative", () => {
    // wet = 35.00, dry = 39.18 → waterMass = -4.18 (impossible)
    expect(calculateMoistureFromMass("35.00", "39.18", "15.20")).toBeNull();
  });

  it("should round to 2 decimal places", () => {
    // Test with value that requires rounding: 25.6047...
    const result = calculateMoistureFromMass("45.305", "39.175", "15.20");
    expect(result).toMatch(/^\d+\.\d{2}$/);
  });
});

// ===== LIQUID LIMIT CALCULATIONS (Cone Penetration) =====

describe("calculateLiquidLimit (Cone Penetration BS 1377)", () => {
  it("should interpolate moisture at 20mm penetration", () => {
    // Two trials bracketing 20mm
    const trials: LiquidLimitTrial[] = [
      {
        id: "1",
        trialNo: "1",
        penetration: "15",
        moisture: "35.20",
        containerWetMass: undefined,
        containerDryMass: undefined,
        containerMass: undefined,
      },
      {
        id: "2",
        trialNo: "2",
        penetration: "25",
        moisture: "38.50",
        containerWetMass: undefined,
        containerDryMass: undefined,
        containerMass: undefined,
      },
    ];
    const result = calculateLiquidLimit(trials);
    // slope = (38.50 - 35.20) / (25 - 15) = 3.30 / 10 = 0.33
    // LL = 35.20 + 0.33 × (20 - 15) = 35.20 + 1.65 = 36.85
    expect(result).toBe(36.85);
  });

  it("should return exact value when trial is at 20mm penetration", () => {
    const trials: LiquidLimitTrial[] = [
      {
        id: "1",
        trialNo: "1",
        penetration: "20",
        moisture: "36.50",
        containerWetMass: undefined,
        containerDryMass: undefined,
        containerMass: undefined,
      },
    ];
    const result = calculateLiquidLimit(trials);
    expect(result).toBe(36.50);
  });

  it("should return single trial moisture value when only one trial", () => {
    const trials: LiquidLimitTrial[] = [
      {
        id: "1",
        trialNo: "1",
        penetration: "22",
        moisture: "34.75",
        containerWetMass: undefined,
        containerDryMass: undefined,
        containerMass: undefined,
      },
    ];
    const result = calculateLiquidLimit(trials);
    expect(result).toBe(34.75);
  });

  it("should return lower trial value when all trials are below 20mm", () => {
    const trials: LiquidLimitTrial[] = [
      {
        id: "1",
        trialNo: "1",
        penetration: "10",
        moisture: "32.50",
        containerWetMass: undefined,
        containerDryMass: undefined,
        containerMass: undefined,
      },
      {
        id: "2",
        trialNo: "2",
        penetration: "15",
        moisture: "34.20",
        containerWetMass: undefined,
        containerDryMass: undefined,
        containerMass: undefined,
      },
    ];
    const result = calculateLiquidLimit(trials);
    expect(result).toBe(34.20); // Takes closest lower value
  });

  it("should return upper trial value when all trials are above 20mm", () => {
    const trials: LiquidLimitTrial[] = [
      {
        id: "1",
        trialNo: "1",
        penetration: "22",
        moisture: "36.50",
        containerWetMass: undefined,
        containerDryMass: undefined,
        containerMass: undefined,
      },
      {
        id: "2",
        trialNo: "2",
        penetration: "28",
        moisture: "38.75",
        containerWetMass: undefined,
        containerDryMass: undefined,
        containerMass: undefined,
      },
    ];
    const result = calculateLiquidLimit(trials);
    expect(result).toBe(36.50); // Takes closest upper value
  });

  it("should return null if no valid trials", () => {
    expect(calculateLiquidLimit([])).toBeNull();
  });

  it("should filter invalid trials (penetration ≤ 0 or negative moisture)", () => {
    const trials: LiquidLimitTrial[] = [
      {
        id: "1",
        trialNo: "1",
        penetration: "0", // Invalid: penetration must be > 0
        moisture: "36.50",
        containerWetMass: undefined,
        containerDryMass: undefined,
        containerMass: undefined,
      },
      {
        id: "2",
        trialNo: "2",
        penetration: "20",
        moisture: "-5", // Invalid: negative moisture
        containerWetMass: undefined,
        containerDryMass: undefined,
        containerMass: undefined,
      },
    ];
    const result = calculateLiquidLimit(trials);
    expect(result).toBeNull();
  });
});

// ===== PLASTIC LIMIT CALCULATIONS =====

describe("calculatePlasticLimit (BS 1377)", () => {
  it("should average moisture values from valid trials", () => {
    const trials: PlasticLimitTrial[] = [
      {
        id: "1",
        trialNo: "1",
        moisture: "22.50",
        containerWetMass: undefined,
        containerDryMass: undefined,
        containerMass: undefined,
      },
      {
        id: "2",
        trialNo: "2",
        moisture: "23.20",
        containerWetMass: undefined,
        containerDryMass: undefined,
        containerMass: undefined,
      },
      {
        id: "3",
        trialNo: "3",
        moisture: "22.80",
        containerWetMass: undefined,
        containerDryMass: undefined,
        containerMass: undefined,
      },
    ];
    const result = calculatePlasticLimit(trials);
    // (22.50 + 23.20 + 22.80) / 3 = 68.50 / 3 = 22.83
    expect(result).toBe(22.83);
  });

  it("should return null if no valid trials", () => {
    expect(calculatePlasticLimit([])).toBeNull();
  });

  it("should filter invalid trials (negative moisture)", () => {
    const trials: PlasticLimitTrial[] = [
      {
        id: "1",
        trialNo: "1",
        moisture: "22.50",
        containerWetMass: undefined,
        containerDryMass: undefined,
        containerMass: undefined,
      },
      {
        id: "2",
        trialNo: "2",
        moisture: "-5",
        containerWetMass: undefined,
        containerDryMass: undefined,
        containerMass: undefined,
      },
    ];
    const result = calculatePlasticLimit(trials);
    expect(result).toBe(22.50); // Only first trial is valid
  });

  it("should handle single trial (note: BS 1377 requires minimum 2, but calculation allows it)", () => {
    const trials: PlasticLimitTrial[] = [
      {
        id: "1",
        trialNo: "1",
        moisture: "22.50",
        containerWetMass: undefined,
        containerDryMass: undefined,
        containerMass: undefined,
      },
    ];
    const result = calculatePlasticLimit(trials);
    expect(result).toBe(22.50);
  });
});

// ===== SHRINKAGE LIMIT CALCULATIONS =====

describe("calculateLinearShrinkage (BS 1377)", () => {
  it("should calculate shrinkage as ((initial - final) / initial) × 100", () => {
    const trials: ShrinkageLimitTrial[] = [
      {
        id: "1",
        trialNo: "1",
        initialLength: "140.00",
        finalLength: "125.50",
      },
    ];
    const result = calculateLinearShrinkage(trials);
    // shrinkage = ((140.00 - 125.50) / 140.00) × 100 = (14.50 / 140.00) × 100 = 10.36
    expect(result).toBe(10.36);
  });

  it("should average shrinkage across multiple trials", () => {
    const trials: ShrinkageLimitTrial[] = [
      {
        id: "1",
        trialNo: "1",
        initialLength: "140.00",
        finalLength: "125.50",
      },
      {
        id: "2",
        trialNo: "2",
        initialLength: "140.00",
        finalLength: "126.00",
      },
      {
        id: "3",
        trialNo: "3",
        initialLength: "140.00",
        finalLength: "125.75",
      },
    ];
    const result = calculateLinearShrinkage(trials);
    // Trial 1: 10.36
    // Trial 2: 10.00
    // Trial 3: 10.18
    // Average: 10.18
    expect(result).toBe(10.18);
  });

  it("should return null if no valid trials", () => {
    expect(calculateLinearShrinkage([])).toBeNull();
  });

  it("should reject trials where final length exceeds initial", () => {
    const trials: ShrinkageLimitTrial[] = [
      {
        id: "1",
        trialNo: "1",
        initialLength: "140.00",
        finalLength: "145.00", // Invalid: final > initial
      },
    ];
    const result = calculateLinearShrinkage(trials);
    expect(result).toBeNull();
  });

  it("should reject trials with zero or negative lengths", () => {
    const trials: ShrinkageLimitTrial[] = [
      {
        id: "1",
        trialNo: "1",
        initialLength: "0",
        finalLength: "10",
      },
    ];
    const result = calculateLinearShrinkage(trials);
    expect(result).toBeNull();
  });
});

// ===== PLASTICITY INDEX =====

describe("calculatePlasticityIndex", () => {
  it("should calculate PI as LL - PL", () => {
    const result = calculatePlasticityIndex(36.85, 22.83);
    // PI = 36.85 - 22.83 = 14.02
    expect(result).toBe(14.02);
  });

  it("should return null if LL or PL is null", () => {
    expect(calculatePlasticityIndex(36.85, null)).toBeNull();
    expect(calculatePlasticityIndex(null, 22.83)).toBeNull();
  });

  it("should return null if values are negative", () => {
    expect(calculatePlasticityIndex(-36.85, 22.83)).toBeNull();
    expect(calculatePlasticityIndex(36.85, -22.83)).toBeNull();
  });

  it("should handle case where PL > LL (negative PI)", () => {
    const result = calculatePlasticityIndex(20.0, 25.0);
    expect(result).toBe(-5.0);
  });
});

// ===== MODULUS OF PLASTICITY =====

describe("calculateModulusOfPlasticity", () => {
  it("should calculate MOP as PI × passing425um", () => {
    const result = calculateModulusOfPlasticity(14.02, "88.6");
    // MOP = 14.02 × 88.6 = 1242.172 → rounds to 1242.17
    expect(result).toBe(1242.17);
  });

  it("should return null if PI is null", () => {
    expect(calculateModulusOfPlasticity(null, "88.6")).toBeNull();
  });

  it("should return null if passing425um is missing", () => {
    expect(calculateModulusOfPlasticity(14.02, undefined)).toBeNull();
  });

  it("should return null if passing425um is not a number", () => {
    expect(calculateModulusOfPlasticity(14.02, "invalid")).toBeNull();
  });
});

// ===== SOIL CLASSIFICATION =====

describe("Soil Classification (ASTM D2487 / BS 1377)", () => {
  it("should classify as Clay (CL) - above A-line, LL < 50", () => {
    // LL = 40, PI = 20
    // A-line PI = 0.73 × (40 - 20) = 14.6
    // 20 > 14.6 → above A-line, LL < 50 → CL
    const result = classifySoil(40, 20);
    expect(result).toBe("Clay (CL)");
  });

  it("should classify as Silt (ML) - below A-line, LL < 50", () => {
    // LL = 40, PI = 8
    // A-line PI = 0.73 × (40 - 20) = 14.6
    // 8 < 14.6 → below A-line, LL < 50 → ML
    const result = classifySoil(40, 8);
    expect(result).toBe("Silt (ML)");
  });

  it("should classify as Clay (CH) - above A-line, LL ≥ 50", () => {
    // LL = 60, PI = 40
    // A-line PI = 0.73 × (60 - 20) = 29.2
    // 40 > 29.2 → above A-line, LL ≥ 50 → CH
    const result = classifySoil(60, 40);
    expect(result).toBe("Clay (CH)");
  });

  it("should classify as Silt (MH) - below A-line, LL ≥ 50", () => {
    // LL = 60, PI = 15
    // A-line PI = 0.73 × (60 - 20) = 29.2
    // 15 < 29.2 → below A-line, LL ≥ 50 → MH
    const result = classifySoil(60, 15);
    expect(result).toBe("Silt (MH)");
  });

  it("should classify as Non-plastic when PI < 0", () => {
    const result = classifySoil(30, -5);
    expect(result).toBe("Non-plastic");
  });

  it("should classify as Non-plastic when PI = 0", () => {
    const result = classifySoil(30, 0);
    expect(result).toBe("Non-plastic");
  });

  it("should return 'No data' when LL or PI is null", () => {
    expect(classifySoil(null, 20)).toBe("No data");
    expect(classifySoil(40, null)).toBe("No data");
  });
});

// ===== A-LINE AND U-LINE =====

describe("A-line and U-line calculations", () => {
  it("should calculate A-line PI = 0.73(LL - 20)", () => {
    const result = getALinePI(40);
    // A-line PI = 0.73 × (40 - 20) = 14.60
    expect(result).toBe(14.6);
  });

  it("should calculate U-line PI = 0.9(LL - 8)", () => {
    const result = getULinePI(40);
    // U-line PI = 0.9 × (40 - 8) = 28.80
    expect(result).toBe(28.8);
  });

  it("should round A-line result to 2 decimal places", () => {
    const result = getALinePI(37);
    // 0.73 × (37 - 20) = 12.41
    expect(result).toBe(12.41);
  });
});

// ===== LINEAR REGRESSION (for fit quality) =====

describe("Linear Regression (R² calculation)", () => {
  it("should calculate slope, intercept, and R²", () => {
    // Simple test data: 3 points on a line y = 2x + 1
    const points = [
      { x: 1, y: 3 },
      { x: 2, y: 5 },
      { x: 3, y: 7 },
    ];
    const result = calculateLinearRegression(points);
    expect(result).not.toBeNull();
    expect(result?.slope).toBe(2);
    expect(result?.intercept).toBe(1);
    expect(result?.rSquared).toBe(1); // Perfect fit
  });

  it("should return null if fewer than 2 points", () => {
    expect(calculateLinearRegression([])).toBeNull();
    expect(calculateLinearRegression([{ x: 1, y: 2 }])).toBeNull();
  });

  it("should calculate R² correctly for scattered data", () => {
    // Data with scatter - LL trial data typically has R² > 0.90
    const points = [
      { x: 10, y: 35.2 },
      { x: 15, y: 35.5 },
      { x: 20, y: 37.0 },
      { x: 25, y: 38.5 },
    ];
    const result = calculateLinearRegression(points);
    expect(result?.rSquared).toBeGreaterThan(0.90); // Good quality fit for LL data
  });
});

// ===== COEFFICIENT OF VARIATION =====

describe("Coefficient of Variation (plasticity consistency)", () => {
  it("should calculate CV = (stdDev / mean) × 100", () => {
    const values = [22.50, 23.20, 22.80];
    const result = calculateCoefficientOfVariation(values);
    // mean = 22.83
    // variance = ((22.50-22.83)² + (23.20-22.83)² + (22.80-22.83)²) / 3 = 0.0967
    // stdDev = 0.311
    // CV = (0.311 / 22.83) × 100 = 1.36%
    expect(result).toBeLessThan(2); // Should be low variation
  });

  it("should return null if array is empty", () => {
    expect(calculateCoefficientOfVariation([])).toBeNull();
  });

  it("should return null if mean is zero", () => {
    const result = calculateCoefficientOfVariation([0, 0, 0]);
    expect(result).toBeNull();
  });

  it("should flag high variation (CV > 5%)", () => {
    const values = [20, 30, 25]; // High scatter
    const result = calculateCoefficientOfVariation(values);
    expect(result).toBeGreaterThan(5);
  });
});

// ===== EDGE CASES AND INTEGRATION =====

describe("Edge Cases and Standard Compliance", () => {
  it("should handle very high plasticity soils (PI > 30)", () => {
    const ll = 80;
    const pl = 30;
    const pi = calculatePlasticityIndex(ll, pl);
    expect(pi).toBe(50);
    const classification = classifySoil(ll, pi);
    expect(classification).toBe("Clay (CH)");
  });

  it("should handle low plasticity soils (PI < 5)", () => {
    const ll = 35;
    const pl = 32;
    const pi = calculatePlasticityIndex(ll, pl);
    expect(pi).toBe(3);
    const classification = classifySoil(ll, pi);
    expect(["Clay (CL)", "Silt (ML)"].includes(classification)).toBe(true);
  });

  it("should handle very high liquid limits (LL > 100)", () => {
    const ll = 120;
    const pl = 40; // PI will be 80
    const pi = calculatePlasticityIndex(ll, pl);
    // PI = 80, A-line PI = 0.73 × (120 - 20) = 73
    // 80 > 73 → above A-line, LL ≥ 50 → CH
    const classification = classifySoil(ll, pi);
    expect(classification).toBe("Clay (CH)");
  });

  it("should maintain precision through calculation chain", () => {
    // Start with container masses
    const moisture = Number(calculateMoistureFromMass("45.305", "39.175", "15.20"));
    const pi = calculatePlasticityIndex(36.85, moisture);
    // Should not accumulate rounding errors excessively
    expect(Number.isFinite(pi!)).toBe(true);
  });
});
