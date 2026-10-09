import type { CalculatedResults } from "@/context/TestDataContext";
import { classifyAtterberg, getALinePI } from "./atterbergCalculations";

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

/** AASHTO groupings paired with each fine-grained USCS symbol. */
const AASHTO_FINE: Record<string, { group: string; description: string }> = {
  "CL-ML": { group: "A-4", description: "Silty clay soil" },
  CL: { group: "A-6", description: "Clayey soil" },
  ML: { group: "A-4 or A-5", description: "Silty soil" },
  CH: { group: "A-7-6", description: "Highly plastic soil" },
  MH: { group: "A-7-5", description: "Elastic silty soil" },
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

  // Delegate the A-line / LL-boundary decision to the canonical classifier
  // so this surface never diverges from the guide's rules (equality → clay).
  const result = classifyAtterberg(ll, ll - pi);

  if (result.status === "suspect") {
    return {
      uscsGroup: "Suspect data",
      uscsSymbol: "—",
      uscsDescription: "Plasticity Index above U-line — check test data",
      aashtoGroup: "—",
      aashtoDescription: "Classification withheld until test data is verified",
      classification: "fine-grained",
    };
  }

  const symbol = result.USCS_dual ?? result.USCS_classification;
  if (!result.flags.valid || !symbol) {
    return {
      uscsGroup: "Inorganic",
      uscsSymbol: "CH/CL",
      uscsDescription: "Clay (inorganic) - insufficient data for precise classification",
      aashtoGroup: "A-7",
      aashtoDescription: "Silty or clayey soil",
      classification: "fine-grained",
    };
  }

  const aashto = AASHTO_FINE[symbol];
  return {
    uscsGroup: "Inorganic",
    uscsSymbol: symbol,
    uscsDescription: uscsDescriptionMap[symbol] ?? symbol,
    aashtoGroup: aashto.group,
    aashtoDescription: aashto.description,
    classification: "fine-grained",
  };
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
  // (equality → clay per the guide; same rounding as the canonical classifier)
  const aboveLine = ll !== undefined && pi !== undefined && pi >= getALinePI(ll);

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

  // Fines > 12% — use A-line (equality → clay per the guide)
  const aboveLine = ll !== undefined && pi !== undefined && pi >= getALinePI(ll);

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
 *
 * Implements the AASHTO M 145 / ASTM D3282 groups from the laboratory's
 * classification note ("AASHTO SOIL CLASSIFICATION SYSTEM — Developer Logic &
 * Classification Rules", reference Table 5.1):
 *
 * - Granular vs silt-clay split on P200 (No. 200 passing) at 35%.
 * - A-1-a: P10 ≤ 50, P40 ≤ 30, P200 ≤ 15, PI ≤ 6 (LL plays no role).
 * - A-1-b: P40 ≤ 50, P200 ≤ 25, PI ≤ 6 (LL plays no role).
 * - A-3: P40 ≥ 51, P200 ≤ 10, non-plastic (fine sand).
 * - A-2-4…A-2-7: P200 ≤ 35 with the LL ≤/> 40 × PI ≤/> 10 splits.
 * - A-4…A-7-6: P200 > 35 with the same LL/PI splits; A-7-5 iff PI ≤ LL − 30.
 *
 * With proper A-7 subgrouping: PI ≤ LL-30 → A-7-5; PI > LL-30 → A-7-6
 *
 * The sieve evidence (P10/P40) is optional so existing callers without sieve
 * data keep working: when P40 is missing and the soil sits in the PI ≤ 6 /
 * LL ≤ 40 zone, the previous approximation is returned and
 * getAashtoEvidenceWarnings() flags it as unverified.
 */
export interface AashtoSieveEvidence {
  /** % passing the No. 10 (2.00 mm) sieve. Null/undefined when not measured. */
  p10?: number | null;
  /** % passing the No. 40 (0.425 mm) sieve. Null/undefined when not measured. */
  p40?: number | null;
  /** Explicit non-plastic flag (A-3 requires NP; otherwise PI < 0.5 counts). */
  nonPlastic?: boolean;
}

const toFiniteOrNull = (value: number | null | undefined): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

export const classifySoilAASHTO = (
  grainSize: GrainSizeDistribution,
  atterberg: CalculatedResults,
  sieves: AashtoSieveEvidence = {},
): string => {
  const { fines } = grainSize;
  const { liquidLimit = 0, plasticityIndex = 0 } = atterberg;
  const p10 = toFiniteOrNull(sieves.p10);
  const p40 = toFiniteOrNull(sieves.p40);
  const isNP = sieves.nonPlastic === true || plasticityIndex < 0.5;

  // Granular materials (≤35% passing No. 200)
  if (fines <= 35) {
    // A-1-a: P10 ≤ 50, P40 ≤ 30, P200 ≤ 15, PI ≤ 6
    if (p10 !== null && p10 <= 50 && p40 !== null && p40 <= 30 && fines <= 15 && plasticityIndex <= 6) {
      return "A-1-a";
    }
    // A-1-b: P40 ≤ 50, P200 ≤ 25, PI ≤ 6
    if (p40 !== null && p40 <= 50 && fines <= 25 && plasticityIndex <= 6) {
      return "A-1-b";
    }
    // A-3: P40 ≥ 51, P200 ≤ 10, non-plastic (fine sand)
    if (p40 !== null && p40 >= 51 && fines <= 10 && isNP) {
      return "A-3";
    }
    // No P40 evidence: legacy approximation (flagged by getAashtoEvidenceWarnings).
    if (p40 === null && plasticityIndex <= 6) {
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

export interface AashtoEvidenceInput {
  /** % passing the No. 10 (2.00 mm) sieve. Null/undefined when not measured. */
  p10?: number | null;
  /** % passing the No. 40 (0.425 mm) sieve. Null/undefined when not measured. */
  p40?: number | null;
  /** % passing the No. 200 (0.075 mm) sieve — the primary split. */
  p200?: number | null;
  plasticityIndex?: number | null;
  nonPlastic?: boolean;
}

/**
 * Evidence warnings for the AASHTO granular groups ("warn + approximate"
 * policy from the classification note's CRITICAL NOTE: all three sieve
 * values are required for correct classification of granular soils).
 *
 * Returns an empty array when the evidence is complete or when the soil is
 * silt-clay (P200 > 35), where P10/P40 play no role. Otherwise each entry
 * names the missing sieve and the groups that cannot be verified, so the UI
 * can show the classifier output as an approximation.
 */
export const getAashtoEvidenceWarnings = ({
  p10,
  p40,
  p200,
  plasticityIndex,
  nonPlastic,
}: AashtoEvidenceInput): string[] => {
  const fines = toFiniteOrNull(p200);
  if (fines === null) {
    return ["No. 200 passing value is missing — AASHTO classification cannot be determined."];
  }
  if (fines > 35) return [];
  const pi = toFiniteOrNull(plasticityIndex);
  const isNP = nonPlastic === true || (pi !== null && pi < 0.5);
  // Only the PI ≤ 6 / NP zone can be an A-1 or A-3 soil; A-2 groups need no
  // P10/P40 evidence, so there is nothing to warn about outside this zone.
  if (pi !== null && pi > 6 && !isNP) return [];
  const passing40 = toFiniteOrNull(p40);
  if (passing40 === null) {
    return [
      "No. 40 sieve (0.425 mm) passing value is missing — A-1-a, A-1-b and A-3 cannot be verified.",
    ];
  }
  const passing10 = toFiniteOrNull(p10);
  if (passing10 === null && passing40 <= 30 && fines <= 15) {
    return [
      "No. 10 sieve (2.00 mm) passing value is missing — A-1-a cannot be fully verified.",
    ];
  }
  return [];
};

export interface AashtoGroupIndexInput {
  /** Percentage passing the 75 µm (No. 200) sieve — AASHTO M 145 F. */
  passingNo200: number;
  liquidLimit: number;
  plasticityIndex: number;
  /** Group from classifySoilAASHTO; it selects the A-2-6 / A-2-7 rule. */
  aashtoGroup?: string | null;
}

/**
 * AASHTO M 145 (2008) 6.4 group index:
 *
 *   GI = (F - 35)[0.2 + 0.005(LL - 40)] + 0.01(F - 15)(PI - 10)
 *
 * where F is the percentage passing the 75 µm (No. 200) sieve, not the No. 40
 * sieve. Only the plasticity term is used for the A-2-6 and A-2-7 subgroups, a
 * negative result is reported as zero, and the value is reported as a whole
 * number. Returns null when any input is missing or not a finite number.
 */
export const calculateAashtoGroupIndex = ({
  passingNo200,
  liquidLimit,
  plasticityIndex,
  aashtoGroup,
}: AashtoGroupIndexInput): number | null => {
  if (![passingNo200, liquidLimit, plasticityIndex].every(Number.isFinite)) return null;
  const plasticityOnly = aashtoGroup === "A-2-6" || aashtoGroup === "A-2-7";
  const liquidTerm = plasticityOnly ? 0 : (passingNo200 - 35) * (0.2 + 0.005 * (liquidLimit - 40));
  const plasticityTerm = 0.01 * (passingNo200 - 15) * (plasticityIndex - 10);
  return Math.floor(Math.max(liquidTerm + plasticityTerm, 0) + 0.5);
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

  // Delegate the A-line / LL-boundary decision to the canonical classifier.
  const result = classifyAtterberg(liquidLimit, liquidLimit - plasticityIndex);

  if (result.status === "suspect") {
    return { classification: "Suspect data — check test values", characteristics, nonPlastic: false };
  }

  const symbol = result.USCS_dual ?? result.USCS_classification ?? "ML";

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
