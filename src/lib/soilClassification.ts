import type { CalculatedResults } from "@/context/TestDataContext";

/**
 * USCS (Unified Soil Classification System) Classification
 * Based on grain size distribution and Atterberg limits
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
 * Determine soil classification based on grain size and Atterberg limits
 */
export const classifySoilUSCS = (
  grainSize: GrainSizeDistribution,
  atterberg: CalculatedResults,
): ClassificationResults => {
  const { gravel, sand, fines } = grainSize;
  const { liquidLimit, plasticLimit, plasticityIndex } = atterberg;

  // Determine major classification
  if (fines > 50) {
    // Fine-grained soil
    return classifyFineGrained(liquidLimit, plasticityIndex);
  } else if (sand > gravel) {
    // Sand-dominated
    return classifySand(sand, fines, liquidLimit, plasticityIndex);
  } else {
    // Gravel-dominated
    return classifyGravel(gravel, fines, liquidLimit, plasticityIndex);
  }
};

const classifyFineGrained = (ll: number | undefined, pi: number | undefined): ClassificationResults => {
  // Handle non-plastic soils (PI ≈ 0 or undefined)
  const isNonPlastic = pi === undefined || pi === 0 || pi < 0.5;

  if (isNonPlastic) {
    return {
      uscsGroup: "Non-plastic fines",
      uscsSymbol: "ML",
      uscsDescription: "Non-plastic silt or fine sand",
      aashtoGroup: "A-4",
      aashtoDescription: "Non-plastic silty soil",
      classification: "fine-grained",
    };
  }

  // A-line: PI = 0.73(LL - 20)
  const alineValue = ll !== undefined ? 0.73 * (ll - 20) : undefined;
  const aboveLine = pi !== undefined && alineValue !== undefined && pi > alineValue;

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

  if (ll < 50) {
    // Low compressibility
    if (aboveLine) {
      return {
        uscsGroup: "Inorganic",
        uscsSymbol: "CL",
        uscsDescription: "Lean clay (low compressibility)",
        aashtoGroup: "A-6",
        aashtoDescription: "Clayey soil",
        classification: "fine-grained",
      };
    } else {
      return {
        uscsGroup: "Inorganic",
        uscsSymbol: "ML",
        uscsDescription: "Silt (low compressibility)",
        aashtoGroup: "A-4 or A-5",
        aashtoDescription: "Silty soil",
        classification: "fine-grained",
      };
    }
  } else {
    // High compressibility
    if (aboveLine) {
      return {
        uscsGroup: "Inorganic",
        uscsSymbol: "CH",
        uscsDescription: "Fat clay (high compressibility)",
        aashtoGroup: "A-7-6",
        aashtoDescription: "Highly plastic soil",
        classification: "fine-grained",
      };
    } else {
      return {
        uscsGroup: "Inorganic",
        uscsSymbol: "MH",
        uscsDescription: "Elastic silt (high compressibility)",
        aashtoGroup: "A-7-5",
        aashtoDescription: "Elastic silty soil",
        classification: "fine-grained",
      };
    }
  }
};

const classifySand = (
  sand: number,
  fines: number,
  ll: number | undefined,
  pi: number | undefined,
): ClassificationResults => {
  const wellGraded = false; // Would need Cu and Cc parameters
  const silty = fines > 12 && fines <= 50;
  const clayey = !silty && fines > 12;

  if (!silty && !clayey) {
    return {
      uscsGroup: "Clean sand",
      uscsSymbol: "SP/SW",
      uscsDescription: "Sand (clean, no fines)",
      aashtoGroup: "A-1 or A-3",
      aashtoDescription: "Sandy soil",
      classification: "coarse-grained",
    };
  }

  if (silty) {
    const aboveLine = ll !== undefined && pi !== undefined && pi > 0.73 * (ll - 20);
    return {
      uscsGroup: "Silty sand",
      uscsSymbol: aboveLine ? "SC" : "SM",
      uscsDescription: aboveLine ? "Silty sand with clay" : "Silty sand",
      aashtoGroup: "A-2-4 or A-2-5",
      aashtoDescription: "Sandy silt",
      classification: "coarse-grained",
    };
  }

  return {
    uscsGroup: "Clayey sand",
    uscsSymbol: "SC",
    uscsDescription: "Clayey sand",
    aashtoGroup: "A-2-6 or A-2-7",
    aashtoDescription: "Sandy clay",
    classification: "coarse-grained",
  };
};

const classifyGravel = (
  gravel: number,
  fines: number,
  ll: number | undefined,
  pi: number | undefined,
): ClassificationResults => {
  const silty = fines > 12 && fines <= 50;
  const clayey = !silty && fines > 12;

  if (!silty && !clayey) {
    return {
      uscsGroup: "Clean gravel",
      uscsSymbol: "GP/GW",
      uscsDescription: "Gravel (clean, no fines)",
      aashtoGroup: "A-1 or A-2-4",
      aashtoDescription: "Gravelly soil",
      classification: "coarse-grained",
    };
  }

  if (silty) {
    return {
      uscsGroup: "Silty gravel",
      uscsSymbol: "GM",
      uscsDescription: "Silty gravel",
      aashtoGroup: "A-1 or A-2-5",
      aashtoDescription: "Gravelly silt",
      classification: "coarse-grained",
    };
  }

  return {
    uscsGroup: "Clayey gravel",
    uscsSymbol: "GC",
    uscsDescription: "Clayey gravel",
    aashtoGroup: "A-2-6",
    aashtoDescription: "Gravelly clay",
    classification: "coarse-grained",
  };
};

/**
 * AASHTO Classification
 * Simplified AASHTO classification based on grain size and Atterberg limits
 */
export const classifySoilAASHTO = (
  grainSize: GrainSizeDistribution,
  atterberg: CalculatedResults,
): string => {
  const { fines } = grainSize;
  const { liquidLimit = 0, plasticityIndex = 0 } = atterberg;

  if (fines <= 35) {
    return plasticityIndex <= 6 ? "A-1" : "A-3";
  } else if (fines <= 35) {
    return plasticityIndex <= 10 ? "A-2-4" : "A-2-5";
  } else if (fines > 35 && fines < 75) {
    if (liquidLimit < 40) {
      return plasticityIndex <= 10 ? "A-4" : "A-5";
    } else {
      return plasticityIndex <= 16 ? "A-6" : "A-7-5";
    }
  } else {
    if (liquidLimit < 40) {
      return "A-4";
    } else if (plasticityIndex <= 16) {
      return "A-7-5";
    } else {
      return "A-7-6";
    }
  }
};

/**
 * Calculate Atterberg-based soil behavior indices
 */
export const calculatePlasticityChart = (
  liquidLimit: number | undefined,
  plasticityIndex: number | undefined,
): { classification: string; characteristics: string[]; nonPlastic: boolean } | null => {
  // Handle missing data
  if (liquidLimit === undefined) {
    return null;
  }

  const characteristics: string[] = [];
  const isNonPlastic = plasticityIndex === undefined || plasticityIndex === 0 || plasticityIndex < 0.5;

  // Handle non-plastic soils
  if (isNonPlastic) {
    characteristics.push("Non-plastic material");
    if (liquidLimit < 30) {
      characteristics.push("Low liquid limit");
    } else if (liquidLimit < 50) {
      characteristics.push("Intermediate liquid limit");
    } else {
      characteristics.push("High liquid limit");
    }
    return {
      classification: "Non-plastic silt or fine-grained soil (ML)",
      characteristics,
      nonPlastic: true,
    };
  }

  const characteristics_list: string[] = [];

  // LL thresholds
  if (liquidLimit < 30) {
    characteristics_list.push("Low liquid limit");
  } else if (liquidLimit < 50) {
    characteristics_list.push("Intermediate liquid limit");
  } else {
    characteristics_list.push("High liquid limit");
  }

  // PI thresholds
  if (plasticityIndex < 5) {
    characteristics_list.push("Low plasticity");
  } else if (plasticityIndex < 15) {
    characteristics_list.push("Medium plasticity");
  } else {
    characteristics_list.push("High plasticity");
  }

  // A-line position
  const aLineValue = 0.73 * (liquidLimit - 20);
  const aboveLine = plasticityIndex > aLineValue;

  let classification = "Unknown";
  if (liquidLimit < 50) {
    classification = aboveLine ? "Lean Clay (CL)" : "Silt (ML)";
  } else {
    classification = aboveLine ? "Fat Clay (CH)" : "Elastic Silt (MH)";
  }

  return {
    classification,
    characteristics: characteristics_list,
    nonPlastic: false,
  };
};

/**
 * Validate soil classification requirements
 * Note: Non-plastic soils (PI = 0) are valid and don't require plastic limit
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

  // For non-plastic soils, plastic limit is not required
  if (!isNonPlastic && !atterberg.plasticLimit) {
    missing.push("Plastic Limit");
  }

  // Warn if soil appears to be non-plastic but has both LL and PL
  if (isNonPlastic && atterberg.liquidLimit && atterberg.plasticLimit) {
    warnings.push("Soil is classified as non-plastic (PI ≈ 0)");
  }

  return {
    valid: missing.length === 0,
    missingData: missing,
    warnings,
  };
};

/**
 * Get soil behavior index (for engineering purposes)
 */
export const calculateBehaviorIndex = (
  atterberg: CalculatedResults,
): { index: number; behavior: string } | null => {
  const { liquidLimit, plasticityIndex } = atterberg;

  if (!liquidLimit || !plasticityIndex) {
    return null;
  }

  // Behavior Index = (LL - 20)(PI - 0)/0.73
  // This is essentially the plasticity index relative to A-line
  const index = (liquidLimit - 20) * plasticityIndex / 0.73;

  let behavior = "";
  if (index < 1) behavior = "Low activity";
  else if (index < 5) behavior = "Normal activity";
  else if (index < 10) behavior = "Moderate activity";
  else behavior = "High activity";

  return { index: Math.round(index * 100) / 100, behavior };
};
