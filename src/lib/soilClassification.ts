import type { CalculatedResults } from "@/context/TestDataContext";

/**
 * USCS (Unified Soil Classification System) Classification
 * Based on grain size distribution and Atterberg limits
 * 
 * Core rule: Above A-line = Clay (C), Below = Silt (M), LL=50 splits Low (L) and High (H)
 * A-Line equation: PI = 0.73(LL - 20)
 */

export interface GrainSizeDistribution {
  gravel: number; // % retained on #4 sieve (4.75mm)
  sand: number; // % between #4 (4.75mm) and #200 (0.075mm)
  fines: number; // % passing #200 (0.075mm)
}

export interface ClassificationResults {
  uscsGroup: string;
  uscsSymbol: string;
  uscsDescription: string;
  aashtoGroup: string;
  aashtoDescription: string;
  classification: "coarse-grained" | "fine-grained" | "organic" | "unknown";
}

/**
 * USCS description lookup with proper descriptive labels
 */
const uscsDescriptionMap: Record<string, string> = {
  ML: "Silt of Low Plasticity",
  MH: "Silt of High Plasticity",
  "CL-ML": "Silty Clay of Low Plasticity",
  CL: "Clay of Low Plasticity",
  CH: "Clay of High Plasticity",
};

/**
 * Determine soil classification based on grain size and Atterberg limits
 */
export const classifySoilUSCS = (
  grainSize: GrainSizeDistribution,
  atterberg: CalculatedResults,
): ClassificationResults => {
  const { gravel, sand, fines } = grainSize;
  const { liquidLimit, plasticLimit, plasticityIndex } = atterberg;

  // ≥50% passing No. 200 → Fine-grained
  if (fines >= 50) {
    return classifyFineGrained(liquidLimit, plasticityIndex);
  } else if (sand > gravel) {
    return classifySand(sand, fines, liquidLimit, plasticityIndex);
  } else {
    return classifyGravel(gravel, fines, liquidLimit, plasticityIndex);
  }
};

const classifyFineGrained = (ll: number | undefined, pi: number | undefined): ClassificationResults => {
  const isNonPlastic = pi === undefined || pi === 0 || pi < 0.5;

  if (isNonPlastic) {
    return {
      uscsGroup: "Non-plastic fines",
      uscsSymbol: "ML",
      uscsDescription: uscsDescriptionMap["ML"],
      aashtoGroup: "A-4",
      aashtoDescription: "Non-plastic silty soil",
      classification: "fine-grained",
    };
  }

  if (ll === undefined || pi === undefined) {
    return {
      uscsGroup: "Inorganic",
      uscsSymbol: "CH/CL",
      uscsDescription: "Clay (inorganic) - insufficient data for precise classification",
      aashtoGroup: "A-7",
      aashtoDescription: "Silty or clayey soil",
      classification: "fine-grained",
    };
  }

  // A-line: PI = 0.73(LL - 20)
  const aLineValue = 0.73 * (ll - 20);
  const aboveLine = pi > aLineValue;

  if (ll < 50) {
    // Low plasticity
    if (aboveLine && pi >= 4 && pi <= 7) {
      // Hatched zone — dual symbol
      return {
        uscsGroup: "Inorganic",
        uscsSymbol: "CL-ML",
        uscsDescription: uscsDescriptionMap["CL-ML"],
        aashtoGroup: "A-4",
        aashtoDescription: "Silty clay soil",
        classification: "fine-grained",
      };
    }
    if (aboveLine) {
      return {
        uscsGroup: "Inorganic",
        uscsSymbol: "CL",
        uscsDescription: uscsDescriptionMap["CL"],
        aashtoGroup: "A-6",
        aashtoDescription: "Clayey soil",
        classification: "fine-grained",
      };
    }
    return {
      uscsGroup: "Inorganic",
      uscsSymbol: "ML",
      uscsDescription: uscsDescriptionMap["ML"],
      aashtoGroup: "A-4 or A-5",
      aashtoDescription: "Silty soil",
      classification: "fine-grained",
    };
  } else {
    // High plasticity (LL ≥ 50)
    if (aboveLine) {
      return {
        uscsGroup: "Inorganic",
        uscsSymbol: "CH",
        uscsDescription: uscsDescriptionMap["CH"],
        aashtoGroup: "A-7-6",
        aashtoDescription: "Highly plastic soil",
        classification: "fine-grained",
      };
    }
    return {
      uscsGroup: "Inorganic",
      uscsSymbol: "MH",
      uscsDescription: uscsDescriptionMap["MH"],
      aashtoGroup: "A-7-5",
      aashtoDescription: "Elastic silty soil",
      classification: "fine-grained",
    };
  }
};

/**
 * Coarse-grained: Sand-dominated
 * For fines > 12%, use A-line position to determine clayey vs silty
 */
const classifySand = (
  sand: number,
  fines: number,
  ll: number | undefined,
  pi: number | undefined,
): ClassificationResults => {
  if (fines <= 12) {
    return {
      uscsGroup: "Clean sand",
      uscsSymbol: "SP/SW",
      uscsDescription: "Sand (clean, no fines)",
      aashtoGroup: "A-1 or A-3",
      aashtoDescription: "Sandy soil",
      classification: "coarse-grained",
    };
  }

  // Fines > 12% — use A-line to determine clayey vs silty
  const aboveLine = ll !== undefined && pi !== undefined && pi > 0.73 * (ll - 20);

  if (aboveLine) {
    return {
      uscsGroup: "Clayey sand",
      uscsSymbol: "SC",
      uscsDescription: "Clayey sand",
      aashtoGroup: "A-2-6 or A-2-7",
      aashtoDescription: "Sandy clay",
      classification: "coarse-grained",
    };
  }
  return {
    uscsGroup: "Silty sand",
    uscsSymbol: "SM",
    uscsDescription: "Silty sand",
    aashtoGroup: "A-2-4 or A-2-5",
    aashtoDescription: "Sandy silt",
    classification: "coarse-grained",
  };
};

/**
 * Coarse-grained: Gravel-dominated
 * For fines > 12%, use A-line position to determine clayey vs silty
 */
const classifyGravel = (
  gravel: number,
  fines: number,
  ll: number | undefined,
  pi: number | undefined,
): ClassificationResults => {
  if (fines <= 12) {
    return {
      uscsGroup: "Clean gravel",
      uscsSymbol: "GP/GW",
      uscsDescription: "Gravel (clean, no fines)",
      aashtoGroup: "A-1 or A-2-4",
      aashtoDescription: "Gravelly soil",
      classification: "coarse-grained",
    };
  }

  // Fines > 12% — use A-line
  const aboveLine = ll !== undefined && pi !== undefined && pi > 0.73 * (ll - 20);

  if (aboveLine) {
    return {
      uscsGroup: "Clayey gravel",
      uscsSymbol: "GC",
      uscsDescription: "Clayey gravel",
      aashtoGroup: "A-2-6",
      aashtoDescription: "Gravelly clay",
      classification: "coarse-grained",
    };
  }
  return {
    uscsGroup: "Silty gravel",
    uscsSymbol: "GM",
    uscsDescription: "Silty gravel",
    aashtoGroup: "A-1 or A-2-5",
    aashtoDescription: "Gravelly silt",
    classification: "coarse-grained",
  };
};

/**
 * AASHTO Classification
 * With proper A-7 subgrouping: PI ≤ LL-30 → A-7-5; PI > LL-30 → A-7-6
 */
export const classifySoilAASHTO = (
  grainSize: GrainSizeDistribution,
  atterberg: CalculatedResults,
): string => {
  const { fines } = grainSize;
  const { liquidLimit = 0, plasticityIndex = 0 } = atterberg;

  // Granular materials (≤35% passing No. 200)
  if (fines <= 35) {
    if (plasticityIndex <= 6) {
      return liquidLimit <= 40 ? "A-1-a" : "A-1-b";
    }
    if (plasticityIndex <= 10) {
      return liquidLimit <= 40 ? "A-2-4" : "A-2-5";
    }
    return liquidLimit <= 40 ? "A-2-6" : "A-2-7";
  }

  // Silt-clay materials (>35% passing No. 200)
  if (liquidLimit <= 40) {
    return plasticityIndex <= 10 ? "A-4" : "A-6";
  }

  if (plasticityIndex <= 10) {
    return "A-5";
  }

  // A-7 subgroup: PI ≤ LL - 30 → A-7-5; PI > LL - 30 → A-7-6
  return plasticityIndex <= (liquidLimit - 30) ? "A-7-5" : "A-7-6";
};

/**
 * Calculate Atterberg-based soil behavior indices
 */
export const calculatePlasticityChart = (
  liquidLimit: number | undefined,
  plasticityIndex: number | undefined,
): { classification: string; characteristics: string[]; nonPlastic: boolean } | null => {
  if (liquidLimit === undefined) return null;

  const isNonPlastic = plasticityIndex === undefined || plasticityIndex === 0 || plasticityIndex < 0.5;

  if (isNonPlastic) {
    const characteristics: string[] = ["Non-plastic material"];
    if (liquidLimit < 30) characteristics.push("Low liquid limit");
    else if (liquidLimit < 50) characteristics.push("Intermediate liquid limit");
    else characteristics.push("High liquid limit");
    return {
      classification: uscsDescriptionMap["ML"],
      characteristics,
      nonPlastic: true,
    };
  }

  const characteristics: string[] = [];

  // LL thresholds
  if (liquidLimit < 30) characteristics.push("Low liquid limit");
  else if (liquidLimit < 50) characteristics.push("Intermediate liquid limit");
  else characteristics.push("High liquid limit");

  // PI thresholds
  if (plasticityIndex < 5) characteristics.push("Low plasticity");
  else if (plasticityIndex < 15) characteristics.push("Medium plasticity");
  else characteristics.push("High plasticity");

  // A-line position
  const aLineValue = 0.73 * (liquidLimit - 20);
  const aboveLine = plasticityIndex > aLineValue;

  let symbol: string;
  if (liquidLimit < 50) {
    if (aboveLine && plasticityIndex >= 4 && plasticityIndex <= 7) symbol = "CL-ML";
    else if (aboveLine) symbol = "CL";
    else symbol = "ML";
  } else {
    symbol = aboveLine ? "CH" : "MH";
  }

  return {
    classification: uscsDescriptionMap[symbol] || symbol,
    characteristics,
    nonPlastic: false,
  };
};

/**
 * Validate soil classification requirements
 */
export const validateClassificationData = (
  grainSize: GrainSizeDistribution | null,
  atterberg: CalculatedResults,
): { valid: boolean; missingData: string[]; warnings: string[] } => {
  const missing: string[] = [];
  const warnings: string[] = [];

  if (!grainSize) {
    missing.push("Grain size distribution");
  } else {
    const { gravel, sand, fines } = grainSize;
    if (isNaN(gravel) || isNaN(sand) || isNaN(fines)) {
      missing.push("Valid grain size percentages");
    } else if (Math.abs(gravel + sand + fines - 100) > 0.1) {
      missing.push("Grain size percentages must sum to 100%");
    }
  }

  const isNonPlastic = atterberg.plasticityIndex === undefined ||
                       atterberg.plasticityIndex === 0 ||
                       atterberg.plasticityIndex < 0.5;

  if (!atterberg.liquidLimit) {
    missing.push("Liquid Limit (or indication of non-plastic material)");
  }

  if (!isNonPlastic && !atterberg.plasticLimit) {
    missing.push("Plastic Limit");
  }

  if (isNonPlastic && atterberg.liquidLimit && atterberg.plasticLimit) {
    warnings.push("Soil is classified as non-plastic (PI ≈ 0)");
  }

  return { valid: missing.length === 0, missingData: missing, warnings };
};

/**
 * Get soil behavior index (for engineering purposes)
 */
export const calculateBehaviorIndex = (
  atterberg: CalculatedResults,
): { index: number; behavior: string } | null => {
  const { liquidLimit, plasticityIndex } = atterberg;
  if (!liquidLimit || !plasticityIndex) return null;

  const index = (liquidLimit - 20) * plasticityIndex / 0.73;

  let behavior = "";
  if (index < 1) behavior = "Low activity";
  else if (index < 5) behavior = "Normal activity";
  else if (index < 10) behavior = "Moderate activity";
  else behavior = "High activity";

  return { index: Math.round(index * 100) / 100, behavior };
};
