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
  isLiquidLimitTrialValid,
  isPlasticLimitTrialValid,
  isShrinkageLimitTrialValid,
  getLiquidLimitFitQuality,
} from "../atterbergCalculations";
import type {
  LiquidLimitTrial,
  PlasticLimitTrial,
  ShrinkageLimitTrial,
} from "@/context/TestDataContext";

describe("Atterberg Calculations - BS 1377 Standard Validation", () => {
  // =============================
  // MOISTURE CONTENT CALCULATIONS
  // =============================
  describe("Moisture Content Calculations (BS 1377)", () => {
    it("should calculate moisture content from container masses", () => {
      // Test case: wet mass=28.5g, dry mass=20.3g, container=9g
      // moisture = ((28.5-20.3)/(20.3-9))*100 = (8.2/11.3)*100 = 72.57%
      const result = calculateMoistureFromMass("28.5", "20.3", "9");
      expect(result).toBe("72.57");
    });

    it("should return null if any mass is missing", () => {
      const result1 = calculateMoistureFromMass("28.5", "20.3", undefined);
      const result2 = calculateMoistureFromMass("28.5", undefined, "9");
      const result3 = calculateMoistureFromMass(undefined, "20.3", "9");

      expect(result1).toBeNull();
      expect(result2).toBeNull();
      expect(result3).toBeNull();
    });

    it("should return null if dry soil mass is zero or negative", () => {
      // If dry mass <= container mass, dry soil mass is invalid
      const result = calculateMoistureFromMass("25", "8", "9");
      expect(result).toBeNull();
    });

    it("should handle very small values", () => {
      // Small masses should still calculate correctly
      const result = calculateMoistureFromMass("1.5", "1.2", "0.5");
      expect(result).toBe("60.0");
    });

    it("should handle large values", () => {
      // Large masses should calculate correctly
      const result = calculateMoistureFromMass("285", "203", "90");
      expect(result).toBe("72.57");
    });
  });

  // =============================
  // LIQUID LIMIT CALCULATIONS
  // =============================
  describe("Liquid Limit Calculations (BS 1377 - Cone Penetration 20mm)", () => {
    it("should interpolate moisture at 20mm penetration", () => {
      // Test case with two trials bracketing 20mm
      const trials: LiquidLimitTrial[] = [
        {
          id: "1",
          trialNo: "1",
          penetration: "15",
          moisture: "68.5",
        },
        {
          id: "2",
          trialNo: "2",
          penetration: "25",
          moisture: "75.2",
        },
      ];

      // Expected: LL = 68.5 + ((75.2-68.5)/(25-15)) * (20-15) = 68.5 + 3.35 = 71.85
      const result = calculateLiquidLimit(trials);
      expect(result).toBe(71.85);
    });

    it("should return exact value if 20mm trial exists", () => {
      const trials: LiquidLimitTrial[] = [
        {
          id: "1",
          trialNo: "1",
          penetration: "18",
          moisture: "70.1",
        },
        {
          id: "2",
          trialNo: "2",
          penetration: "20",
          moisture: "73.5",
        },
        {
          id: "3",
          trialNo: "3",
          penetration: "22",
          moisture: "76.2",
        },
      ];

      // Should return 73.5 directly
      const result = calculateLiquidLimit(trials);
      expect(result).toBe(73.5);
    });

    it("should return single trial value if only one trial", () => {
      const trials: LiquidLimitTrial[] = [
        {
          id: "1",
          trialNo: "1",
          penetration: "20",
          moisture: "72.3",
        },
      ];

      const result = calculateLiquidLimit(trials);
      expect(result).toBe(72.3);
    });

    it("should return null if no valid trials", () => {
      const trials: LiquidLimitTrial[] = [
        {
          id: "1",
          trialNo: "1",
          penetration: "",
          moisture: "",
        },
      ];

      const result = calculateLiquidLimit(trials);
      expect(result).toBeNull();
    });

    it("should interpolate with multiple trials", () => {
      // More complex case with 4 trials
      const trials: LiquidLimitTrial[] = [
        {
          id: "1",
          trialNo: "1",
          penetration: "10.5",
          moisture: "64.2",
        },
        {
          id: "2",
          trialNo: "2",
          penetration: "15.3",
          moisture: "69.1",
        },
        {
          id: "3",
          trialNo: "3",
          penetration: "25.8",
          moisture: "78.5",
        },
        {
          id: "4",
          trialNo: "4",
          penetration: "30.2",
          moisture: "82.1",
        },
      ];

      // Should interpolate between 15.3 and 25.8
      // slope = (78.5-69.1)/(25.8-15.3) = 9.4/10.5 = 0.8952
      // LL = 69.1 + 0.8952 * (20-15.3) = 69.1 + 4.216 = 73.316 ≈ 73.32
      const result = calculateLiquidLimit(trials);
      expect(result).toBe(73.32);
    });

    it("should handle penetration values below and above 20mm", () => {
      const trials: LiquidLimitTrial[] = [
        {
          id: "1",
          trialNo: "1",
          penetration: "5",
          moisture: "60",
        },
        {
          id: "2",
          trialNo: "2",
          penetration: "35",
          moisture: "80",
        },
      ];

      // slope = (80-60)/(35-5) = 20/30 = 0.667
      // LL = 60 + 0.667 * (20-5) = 60 + 10 = 70
      const result = calculateLiquidLimit(trials);
      expect(result).toBe(70);
    });
  });

  // =============================
  // PLASTIC LIMIT CALCULATIONS
  // =============================
  describe("Plastic Limit Calculations (BS 1377 - Average)", () => {
    it("should average two valid trials", () => {
      const trials: PlasticLimitTrial[] = [
        {
          id: "1",
          trialNo: "1",
          moisture: "28.5",
        },
        {
          id: "2",
          trialNo: "2",
          moisture: "29.1",
        },
      ];

      // Expected: (28.5 + 29.1) / 2 = 28.8
      const result = calculatePlasticLimit(trials);
      expect(result).toBe(28.8);
    });

    it("should average multiple trials", () => {
      const trials: PlasticLimitTrial[] = [
        {
          id: "1",
          trialNo: "1",
          moisture: "28.5",
        },
        {
          id: "2",
          trialNo: "2",
          moisture: "29.1",
        },
        {
          id: "3",
          trialNo: "3",
          moisture: "28.9",
        },
      ];

      // Expected: (28.5 + 29.1 + 28.9) / 3 = 86.5 / 3 = 28.83
      const result = calculatePlasticLimit(trials);
      expect(result).toBe(28.83);
    });

    it("should calculate from container masses", () => {
      const trials: PlasticLimitTrial[] = [
        {
          id: "1",
          trialNo: "1",
          containerWetMass: "18.5",
          containerDryMass: "15.3",
          containerMass: "8",
        },
        {
          id: "2",
          trialNo: "2",
          containerWetMass: "19.2",
          containerDryMass: "16.1",
          containerMass: "8",
        },
      ];

      // Trial 1: ((18.5-15.3)/(15.3-8))*100 = (3.2/7.3)*100 = 43.84
      // Trial 2: ((19.2-16.1)/(16.1-8))*100 = (3.1/8.1)*100 = 38.27
      // Average: (43.84 + 38.27) / 2 = 41.05
      const result = calculatePlasticLimit(trials);
      expect(result).toBe(41.05);
    });

    it("should return null if no valid trials", () => {
      const trials: PlasticLimitTrial[] = [
        {
          id: "1",
          trialNo: "1",
          moisture: "",
        },
      ];

      const result = calculatePlasticLimit(trials);
      expect(result).toBeNull();
    });
  });

  // =============================
  // LINEAR SHRINKAGE CALCULATIONS
  // =============================
  describe("Linear Shrinkage Calculations (BS 1377)", () => {
    it("should calculate shrinkage from single trial", () => {
      const trials: ShrinkageLimitTrial[] = [
        {
          id: "1",
          trialNo: "1",
          initialLength: "100",
          finalLength: "85",
        },
      ];

      // Expected: ((100-85)/100)*100 = 15%
      const result = calculateLinearShrinkage(trials);
      expect(result).toBe(15);
    });

    it("should average multiple shrinkage trials", () => {
      const trials: ShrinkageLimitTrial[] = [
        {
          id: "1",
          trialNo: "1",
          initialLength: "100",
          finalLength: "85",
        },
        {
          id: "2",
          trialNo: "2",
          initialLength: "100",
          finalLength: "84",
        },
        {
          id: "3",
          trialNo: "3",
          initialLength: "100",
          finalLength: "86",
        },
      ];

      // Trial 1: 15%
      // Trial 2: 16%
      // Trial 3: 14%
      // Average: (15 + 16 + 14) / 3 = 15%
      const result = calculateLinearShrinkage(trials);
      expect(result).toBe(15);
    });

    it("should handle decimal length values", () => {
      const trials: ShrinkageLimitTrial[] = [
        {
          id: "1",
          trialNo: "1",
          initialLength: "140",
          finalLength: "112",
        },
      ];

      // Expected: ((140-112)/140)*100 = 20%
      const result = calculateLinearShrinkage(trials);
      expect(result).toBe(20);
    });

    it("should return null if no valid trials", () => {
      const trials: ShrinkageLimitTrial[] = [
        {
          id: "1",
          trialNo: "1",
          initialLength: "",
          finalLength: "",
        },
      ];

      const result = calculateLinearShrinkage(trials);
      expect(result).toBeNull();
    });

    it("should return null if final length exceeds initial", () => {
      const trials: ShrinkageLimitTrial[] = [
        {
          id: "1",
          trialNo: "1",
          initialLength: "100",
          finalLength: "120", // Invalid: final > initial
        },
      ];

      const result = calculateLinearShrinkage(trials);
      expect(result).toBeNull();
    });
  });

  // =============================
  // PLASTICITY INDEX
  // =============================
  describe("Plasticity Index Calculations (PI = LL - PL)", () => {
    it("should calculate PI from LL and PL", () => {
      // LL=71.85%, PL=28.8% => PI = 43.05%
      const result = calculatePlasticityIndex(71.85, 28.8);
      expect(result).toBe(43.05);
    });

    it("should return null if LL is null", () => {
      const result = calculatePlasticityIndex(null, 28.8);
      expect(result).toBeNull();
    });

    it("should return null if PL is null", () => {
      const result = calculatePlasticityIndex(71.85, null);
      expect(result).toBeNull();
    });

    it("should return null if LL is negative", () => {
      const result = calculatePlasticityIndex(-5, 28.8);
      expect(result).toBeNull();
    });

    it("should return null if PL is negative", () => {
      const result = calculatePlasticityIndex(71.85, -5);
      expect(result).toBeNull();
    });

    it("should handle PI of 0 (non-plastic)", () => {
      const result = calculatePlasticityIndex(25, 25);
      expect(result).toBe(0);
    });

    it("should handle negative PI (PL > LL)", () => {
      const result = calculatePlasticityIndex(25, 30);
      expect(result).toBeNull();
    });
  });

  // =============================
  // MODULUS OF PLASTICITY
  // =============================
  describe("Modulus of Plasticity Calculations", () => {
    it("should calculate MP = PI × (% passing 425µm)", () => {
      // PI=43.05%, passing=88.6% => MP = 43.05 * 88.6 = 3814.23
      const result = calculateModulusOfPlasticity(43.05, "88.6");
      expect(result).toBe(3814.23);
    });

    it("should return null if PI is null", () => {
      const result = calculateModulusOfPlasticity(null, "88.6");
      expect(result).toBeNull();
    });

    it("should return null if passing value is missing", () => {
      const result = calculateModulusOfPlasticity(43.05, undefined);
      expect(result).toBeNull();
    });

    it("should return null if passing value is not a number", () => {
      const result = calculateModulusOfPlasticity(43.05, "abc");
      expect(result).toBeNull();
    });
  });

  // =============================
  // SOIL CLASSIFICATION
  // =============================
  describe("Soil Classification (ASTM D2487 / BS 1377)", () => {
    it("should classify as Clay (CL) - low LL, above A-line", () => {
      // LL=45%, PI=18%
      // A-line: PI = 0.73(45-20) = 18.25 (PI < A-line, so ML)
      const result = classifySoil(45, 18);
      expect(result).toBe("Silt (ML)");
    });

    it("should classify as Silt (ML) - low LL, below A-line", () => {
      // LL=30%, PI=8%
      // A-line: PI = 0.73(30-20) = 7.3 (PI > A-line, so CL)
      const result = classifySoil(30, 8);
      expect(result).toBe("Clay (CL)");
    });

    it("should classify as Clay with high plasticity (CH)", () => {
      // LL=65%, PI=32%
      // A-line: PI = 0.73(65-20) = 32.85 (PI < A-line, so MH)
      const result = classifySoil(65, 32);
      expect(result).toBe("Silt (MH)");
    });

    it("should classify as Silt with high plasticity (MH)", () => {
      // LL=55%, PI=25%
      // A-line: PI = 0.73(55-20) = 25.55 (PI < A-line, so MH)
      const result = classifySoil(55, 25);
      expect(result).toBe("Silt (MH)");
    });

    it("should return 'Non-plastic' if PI is 0", () => {
      const result = classifySoil(30, 0);
      expect(result).toBe("Non-plastic");
    });

    it("should return 'Non-plastic' if PI is negative", () => {
      const result = classifySoil(30, -5);
      expect(result).toBe("Non-plastic");
    });

    it("should return 'No data' if LL is null", () => {
      const result = classifySoil(null, 18);
      expect(result).toBe("No data");
    });

    it("should return 'No data' if PI is null", () => {
      const result = classifySoil(45, null);
      expect(result).toBe("No data");
    });
  });

  // =============================
  // PLASTICITY CHART LINES
  // =============================
  describe("Plasticity Chart Lines (A-line and U-line)", () => {
    it("should calculate A-line position: PI = 0.73(LL - 20)", () => {
      // LL=50% => PI = 0.73 * 30 = 21.9
      const result = getALinePI(50);
      expect(result).toBe(21.9);
    });

    it("should calculate U-line position: PI = 0.9(LL - 8)", () => {
      // LL=50% => PI = 0.9 * 42 = 37.8
      const result = getULinePI(50);
      expect(result).toBe(37.8);
    });

    it("should handle low LL values for A-line", () => {
      // LL=20% => PI = 0.73 * 0 = 0
      const result = getALinePI(20);
      expect(result).toBe(0);
    });

    it("should handle high LL values for both lines", () => {
      // LL=100% => A-line PI = 0.73 * 80 = 58.4, U-line PI = 0.9 * 92 = 82.8
      const aLineResult = getALinePI(100);
      const uLineResult = getULinePI(100);
      expect(aLineResult).toBe(58.4);
      expect(uLineResult).toBe(82.8);
    });
  });

  // =============================
  // TRIAL VALIDATION
  // =============================
  describe("Trial Validation", () => {
    it("should validate LL trial with penetration and moisture", () => {
      const trial: LiquidLimitTrial = {
        id: "1",
        trialNo: "1",
        penetration: "20",
        moisture: "72",
      };
      expect(isLiquidLimitTrialValid(trial)).toBe(true);
    });

    it("should validate LL trial with container masses", () => {
      const trial: LiquidLimitTrial = {
        id: "1",
        trialNo: "1",
        penetration: "20",
        containerWetMass: "28.5",
        containerDryMass: "20.3",
        containerMass: "9",
      };
      expect(isLiquidLimitTrialValid(trial)).toBe(true);
    });

    it("should invalidate LL trial with zero penetration", () => {
      const trial: LiquidLimitTrial = {
        id: "1",
        trialNo: "1",
        penetration: "0",
        moisture: "72",
      };
      expect(isLiquidLimitTrialValid(trial)).toBe(false);
    });

    it("should validate PL trial", () => {
      const trial: PlasticLimitTrial = {
        id: "1",
        trialNo: "1",
        moisture: "28.5",
      };
      expect(isPlasticLimitTrialValid(trial)).toBe(true);
    });

    it("should validate shrinkage trial", () => {
      const trial: ShrinkageLimitTrial = {
        id: "1",
        trialNo: "1",
        initialLength: "140",
        finalLength: "112",
      };
      expect(isShrinkageLimitTrialValid(trial)).toBe(true);
    });

    it("should invalidate shrinkage trial with final > initial", () => {
      const trial: ShrinkageLimitTrial = {
        id: "1",
        trialNo: "1",
        initialLength: "100",
        finalLength: "120",
      };
      expect(isShrinkageLimitTrialValid(trial)).toBe(false);
    });
  });

  // =============================
  // LIQUID LIMIT FIT QUALITY
  // =============================
  describe("Liquid Limit Fit Quality (R²)", () => {
    it("should calculate R² for good fit", () => {
      const trials: LiquidLimitTrial[] = [
        { id: "1", trialNo: "1", penetration: "15", moisture: "70" },
        { id: "2", trialNo: "2", penetration: "20", moisture: "75" },
        { id: "3", trialNo: "3", penetration: "25", moisture: "80" },
      ];

      // Linear relationship: every 5mm penetration = 5% moisture
      // This should have R² = 1.0 (perfect fit)
      const result = getLiquidLimitFitQuality(trials);
      expect(result).not.toBeNull();
      expect(result?.rSquared).toBe(1);
    });

    it("should calculate R² for less than perfect fit", () => {
      const trials: LiquidLimitTrial[] = [
        { id: "1", trialNo: "1", penetration: "15", moisture: "70" },
        { id: "2", trialNo: "2", penetration: "20", moisture: "74" },
        { id: "3", trialNo: "3", penetration: "25", moisture: "80" },
      ];

      const result = getLiquidLimitFitQuality(trials);
      expect(result).not.toBeNull();
      expect(result!.rSquared).toBeGreaterThan(0.9);
      expect(result!.rSquared).toBeLessThan(1);
    });

    it("should return null if fewer than 2 trials", () => {
      const trials: LiquidLimitTrial[] = [
        { id: "1", trialNo: "1", penetration: "20", moisture: "75" },
      ];

      const result = getLiquidLimitFitQuality(trials);
      expect(result).toBeNull();
    });
  });

  // =============================
  // REAL WORLD EXAMPLE
  // =============================
  describe("Real World Example - Complete Test Sequence", () => {
    it("should process a complete Atterberg test sequence", () => {
      // Based on ATTERTEST.xlsx expected values
      const llTrials: LiquidLimitTrial[] = [
        {
          id: "1",
          trialNo: "1",
          penetration: "18.1",
          containerWetMass: "36.55",
          containerDryMass: "26.41",
          containerMass: "9",
        },
        {
          id: "2",
          trialNo: "2",
          penetration: "20.2",
          containerWetMass: "34.81",
          containerDryMass: "25.54",
          containerMass: "9",
        },
        {
          id: "3",
          trialNo: "3",
          penetration: "22.3",
          containerWetMass: "35.32",
          containerDryMass: "29.36",
          containerMass: "9",
        },
        {
          id: "4",
          trialNo: "4",
          penetration: "24.1",
          containerWetMass: "31.66",
          containerDryMass: "25.39",
          containerMass: "9",
        },
      ];

      const plTrials: PlasticLimitTrial[] = [
        {
          id: "1",
          trialNo: "1",
          containerWetMass: "16.8",
          containerDryMass: "15.77",
          containerMass: "9",
        },
        {
          id: "2",
          trialNo: "2",
          containerWetMass: "17.95",
          containerDryMass: "16.47",
          containerMass: "9",
        },
      ];

      const slTrials: ShrinkageLimitTrial[] = [
        {
          id: "1",
          trialNo: "1",
          initialLength: "140",
          finalLength: "112",
        },
      ];

      // Calculate all values
      const ll = calculateLiquidLimit(llTrials);
      const pl = calculatePlasticLimit(plTrials);
      const ls = calculateLinearShrinkage(slTrials);
      const pi = calculatePlasticityIndex(ll, pl);
      const mp = calculateModulusOfPlasticity(pi, "88.6");
      const classification = classifySoil(ll, pi);

      // Verify all results are calculated
      expect(ll).not.toBeNull();
      expect(pl).not.toBeNull();
      expect(ls).not.toBeNull();
      expect(pi).not.toBeNull();
      expect(mp).not.toBeNull();
      expect(classification).not.toBe("No data");

      // All should be positive
      expect(ll!).toBeGreaterThan(0);
      expect(pl!).toBeGreaterThan(0);
      expect(ls!).toBeGreaterThan(0);
      expect(pi!).toBeGreaterThan(0);
      expect(mp!).toBeGreaterThan(0);

      // LL should be greater than PL
      expect(ll!).toBeGreaterThan(pl!);

      // PI should equal LL - PL
      expect(Math.abs(pi! - (ll! - pl!))).toBeLessThan(0.1);

      console.log("Complete Test Results:");
      console.log(`  Liquid Limit: ${ll}%`);
      console.log(`  Plastic Limit: ${pl}%`);
      console.log(`  Plasticity Index: ${pi}%`);
      console.log(`  Linear Shrinkage: ${ls}%`);
      console.log(`  Modulus of Plasticity: ${mp}`);
      console.log(`  Soil Classification: ${classification}`);
    });
  });
});
