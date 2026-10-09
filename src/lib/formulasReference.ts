/**
 * Calculations & Formulas Reference - content model.
 *
 * The single source of truth for the "Formulas & calculations" PDF the lab
 * downloads from the Grading, Atterberg, Proctor and Compressive sections.
 * Content lives here as data (separate from the jsPDF renderer) so the
 * wording can be reviewed without touching layout code, and every entry
 * names the implementation it documents - `formulasReference.test.ts`
 * fails if a cited function stops existing, so the document cannot drift
 * away from the code.
 *
 * Notation is plain ASCII throughout: jsPDF's built-in Helvetica only
 * covers WinAnsi, so superscripts, Greek letters and special symbols are
 * written out (D30^2, rho_d, <=) rather than risking garbage glyphs.
 */

export type FormulaSourceModule =
  | "atterbergCalculations"
  | "gradingCalculations"
  | "proctorRecords"
  | "compressiveCalculations"
  | "soilClassification"
  | "compressivePdfGenerator";

export interface FormulaVariable {
  symbol: string;
  meaning: string;
}

export interface FormulaEntry {
  heading: string;
  formulas: string[];
  variables: FormulaVariable[];
  notes: string[];
  sourceModule: FormulaSourceModule;
  /** Exports that implement this entry; must exist (enforced by test). */
  sourceFunctions: string[];
}

export interface FormulaSection {
  testKey: "grading" | "atterberg" | "proctor" | "compressive";
  title: string;
  standard: string;
  entries: FormulaEntry[];
}

export const FORMULAS_REFERENCE_VERSION = "1.2.0";

export const FORMULAS_REFERENCE_TITLE = "Calculations and Formulas Reference";

export const FORMULA_SECTIONS: FormulaSection[] = [
  {
    testKey: "grading",
    title: "Particle Size Distribution (Sieve Analysis)",
    standard: "BS 1377-2:1990, clauses 9.2 / 9.3",
    entries: [
      {
        heading: "Percentage retained and cumulative passing",
        formulas: [
          "total = SUM(m_i) over every sieve row including the pan",
          "% retained_i = m_i / total * 100",
          "cumulative passing_i = (1 - SUM(retained to row i) / total) * 100",
        ],
        variables: [
          { symbol: "m_i", meaning: "mass retained on sieve row i (g)" },
          { symbol: "total", meaning: "sum of all retained masses (g)" },
        ],
        notes: [
          "The pan row (<0.063) contributes its mass to the total but reports no passing value.",
          "With no weighed material every percentage reads as auto, never 0%.",
          "Worked (lab sheet KIRIAINI AHP): 40.22 g retained on No. 4 of 176.4 g total -> 22.8% retained, 77.2% passing.",
        ],
        sourceModule: "gradingCalculations",
        sourceFunctions: ["calculateGrading"],
      },
      {
        heading: "Effective sizes D10, D30, D60 (log interpolation)",
        formulas: [
          "r = (p - P1) / (P2 - P1)",
          "D(p) = 10 ^ (log10(d1) + r * (log10(d2) - log10(d1)))",
          "Cu = D60 / D10",
          "Cc = D30^2 / (D10 * D60)",
        ],
        variables: [
          { symbol: "p", meaning: "target percent passing (10, 30 or 60)" },
          { symbol: "d1, P1 / d2, P2", meaning: "bracketing sieve size (mm) and passing (%)" },
          { symbol: "Cu", meaning: "coefficient of uniformity" },
          { symbol: "Cc", meaning: "coefficient of curvature" },
        ],
        notes: [
          "Interpolation runs on the log10 particle-size axis, matching semi-log graph paper.",
          "No D-value is reported when the target falls outside the measured curve.",
        ],
        sourceModule: "gradingCalculations",
        sourceFunctions: ["calculateGrading"],
      },
      {
        heading: "Moisture content",
        formulas: ["w = (wet - dry) / dry * 100  (%)"],
        variables: [
          { symbol: "wet", meaning: "wet mass of soil (g)" },
          { symbol: "dry", meaning: "oven-dry mass of soil (g)" },
        ],
        notes: [],
        sourceModule: "gradingCalculations",
        sourceFunctions: ["calculateMoisture"],
      },
      {
        heading: "Hydrometer analysis (Stokes law)",
        formulas: [
          "Rd = Rn' - Ro'   (reading less the dispersant blank)",
          "Rh = Rd + Cm + Ct   (true reading; Cm = 0.1 g/L meniscus default, Ct = manual temperature correction, default 0)",
          "H = 16.294964 - 0.164 * Rh   (152H)  or  16.294964 - 0.2645 * Rh   (151H)   [cm]",
          "K = 1000 * SQRT(18 * nu * 10^-6 / g)",
          "D = K * SQRT((H / 100) / ((Gs - 1) * t * 60))   [mm]",
          "K% = Rh * (Gs / (Gs - 1)) * V / (m * 1000) * 100   [% finer]",
        ],
        variables: [
          { symbol: "Rn'", meaning: "observed hydrometer reading (g/L)" },
          { symbol: "Ro'", meaning: "dispersant (zero) correction reading (g/L)" },
          { symbol: "H", meaning: "effective depth of the hydrometer bulb (cm)" },
          { symbol: "nu", meaning: "kinematic viscosity of water, from Table 7 by temperature (15-32 C, clamped; default 1.005)" },
          { symbol: "g", meaning: "9.80665 m/s^2" },
          { symbol: "t", meaning: "elapsed time (min)" },
          { symbol: "Gs", meaning: "specific gravity of solids (default 2.65)" },
          { symbol: "V", meaning: "suspension volume (cm3, default 1000)" },
          { symbol: "m", meaning: "soil mass: hydrometer subsample for K (sample), whole-sample mass for K (whole)" },
        ],
        notes: [
          "BS 1377-2:1990 9.5.7.2: the 1990 edition carries no temperature-correction term; a manual value is accepted for correction-based instruments.",
          "The (Gs - 1) divisor converts the density excess on the hydrometer scale into mass of soil in suspension, so K% needs Gs > 1.",
          "Sheet columns map to code fields: Rn' -> observed reading, Rd -> adjusted reading, Rh -> corrected reading, H -> effective depth, D -> particle diameter, K% sample/whole -> fines in suspension / by hydrometer.",
        ],
        sourceModule: "gradingCalculations",
        sourceFunctions: ["calculateHydrometer"],
      },
      {
        heading: "Worked example - Group Index (AASHTO M 145 6.4)",
        formulas: [
          "GI = (F - 35) * (0.2 + 0.005 * (LL - 40)) + 0.01 * (F - 15) * (PI - 10)",
          "F = 82, LL = 38, PI = 21:",
          "GI = (82 - 35) * (0.2 + 0.005 * (38 - 40)) + 0.01 * (82 - 15) * (21 - 10)",
          "GI = 8.9 + 7.4 = 16.3 -> reported as the whole number 16",
        ],
        variables: [
          { symbol: "F", meaning: "% passing the No. 200 (0.075 mm) sieve" },
        ],
        notes: [
          "The standard's own worked example; negative results are reported as zero.",
          "A-2-6 and A-2-7 use the plasticity term alone.",
        ],
        sourceModule: "soilClassification",
        sourceFunctions: ["calculateAashtoGroupIndex"],
      },
    ],
  },
  {
    testKey: "atterberg",
    title: "Atterberg Limits",
    standard: "BS 1377-2:1990, clause 4.3 (cone penetrometer) / ISO 17892-12",
    entries: [
      {
        heading: "Trial moisture content from masses",
        formulas: [
          "water = wet - dry",
          "dry soil = dry - tare",
          "w = water / dry soil * 100  (%)",
        ],
        variables: [
          { symbol: "wet", meaning: "container + wet soil (g)" },
          { symbol: "dry", meaning: "container + oven-dry soil (g)" },
          { symbol: "tare", meaning: "empty container (g)" },
        ],
        notes: [
          "Withheld (blank) when dry soil <= 0 or water < 0.",
          "A directly entered moisture is used only when no masses are available.",
        ],
        sourceModule: "atterbergCalculations",
        sourceFunctions: ["calculateMoistureFromMass", "getTrialMoisture", "getWaterMass", "getDrySoilMass"],
      },
      {
        heading: "Liquid Limit (cone penetrometer, 20 mm)",
        formulas: [
          "LL = moisture of any valid trial at exactly 20 mm penetration",
          "otherwise fit w = a * log10(penetration) + b by least squares and read w at 20 mm",
        ],
        variables: [
          { symbol: "w", meaning: "trial moisture content (%)" },
          { symbol: "penetration", meaning: "cone penetration (mm), working range 10-30" },
        ],
        notes: [
          "Fewer than two usable points (and none at 20 mm) yields no result.",
          "This is the cone method; the Casagrande cup (blow counts, ASTM D4318) is a different procedure.",
        ],
        sourceModule: "atterbergCalculations",
        sourceFunctions: ["calculateLiquidLimit", "calculateLogLinearRegression", "LL_TARGET_PENETRATION_MM", "LL_MIN_VALID_TRIALS"],
      },
      {
        heading: "Plastic Limit",
        formulas: ["PL = mean of the valid plastic-limit trial moistures"],
        variables: [],
        notes: ["At least two valid trials are required."],
        sourceModule: "atterbergCalculations",
        sourceFunctions: ["calculatePlasticLimit", "PL_MIN_VALID_TRIALS"],
      },
      {
        heading: "Linear shrinkage",
        formulas: ["LS = mean of (L0 - L) / L0 * 100  (%)"],
        variables: [
          { symbol: "L0", meaning: "initial mould length (mm)" },
          { symbol: "L", meaning: "oven-dry length (mm)" },
        ],
        notes: [
          "This is linear shrinkage from length change; it is NOT the BS 1377-2 4.5 shrinkage limit, which is determined differently.",
        ],
        sourceModule: "atterbergCalculations",
        sourceFunctions: ["calculateLinearShrinkage", "LS_MIN_VALID_TRIALS"],
      },
      {
        heading: "Non-plastic soils (NP)",
        formulas: [
          "PI = LL - PL = 0 (PL entered equal to LL, or the Non-plastic box ticked)",
          "-> code NP: BS/USCS classification is skipped, soil reported as Non-plastic",
        ],
        variables: [],
        notes: [
          "Per lab note: when shrinkage reads 0.00 and PI is zero with no plastic-limit entries, display Non-plastic rather than classifying.",
        ],
        sourceModule: "atterbergCalculations",
        sourceFunctions: ["classifyAtterberg"],
      },
      {
        heading: "Plasticity Index and related indices",
        formulas: [
          "PI = LL - PL  (withheld when PL exceeds LL: physically invalid)",
          "Modulus of plasticity = PI * (% passing 425 um)",
          "A-line: PI = 0.73 * (LL - 20)",
          "U-line: PI = 0.90 * (LL - 8)  (upper bound for natural soils)",
        ],
        variables: [
          { symbol: "PI", meaning: "plasticity index (%)" },
        ],
        notes: [
          "At or above the A-line the fines classify as clay (C); below it as silt (M); LL = 50 splits low (L) from high (H) plasticity.",
          "PI above the U-line is flagged as suspect data and classification is withheld.",
        ],
        sourceModule: "atterbergCalculations",
        sourceFunctions: ["calculatePlasticityIndex", "calculateModulusOfPlasticity", "getALinePI", "getULinePI", "classifyAtterberg"],
      },
      {
        heading: "Worked example - classification (programmer's guide)",
        formulas: [
          "LL = 48, PL = 22 -> PI = 48 - 22 = 26",
          "A-line value = 0.73 * (48 - 20) = 20.44; PI 26 >= 20.44 -> Clay (C)",
          "LL 48 in [35, 50) -> Intermediate (I); BS code = C + I = CI",
          "USCS: LL < 50 and above A-line -> CL",
          "Description: Clay of Intermediate Plasticity; note: Moderate volume change potential",
        ],
        variables: [],
        notes: [
          "The guide's own example; PI is always derived, never entered directly.",
        ],
        sourceModule: "atterbergCalculations",
        sourceFunctions: ["classifyAtterberg", "getALinePI"],
      },
    ],
  },
  {
    testKey: "classification",
    title: "Soil Classification (BS, USCS, AASHTO)",
    standard: "BS 1377 / ASTM D2487 (USCS) / AASHTO M 145 - ASTM D3282",
    entries: [
      {
        heading: "BS 1377 and USCS decision rules (from LL and PL)",
        formulas: [
          "PI = LL - PL (always derived, never entered directly)",
          "A-line value = 0.73 * (LL - 20): PI >= A-line -> Clay (C), else Silt (M); ties go to Clay",
          "BS second letter: LL < 35 L (Low) / < 50 I (Intermediate) / < 70 H (High) / < 90 V (Very High) / >= 90 E (Extremely High); a boundary belongs to the higher band",
          "BS code = first + second letter (e.g. C + I = CI, Clay of Intermediate Plasticity)",
          "USCS: LL < 50 -> CL / ML, LL >= 50 -> CH / MH on the same A-line split",
          "Hatched zone LL < 50, 4 <= PI <= 7, at/above A-line -> dual symbol CL-ML",
          "Guards: PL > LL invalid; PI = 0 -> NP (skip); PI < 4 borderline; PI > U-line 0.9 * (LL - 8) suspect (withhold)",
        ],
        variables: [
          { symbol: "LL", meaning: "liquid limit (%)" },
          { symbol: "PL", meaning: "plastic limit (%)" },
          { symbol: "PI", meaning: "plasticity index (%)" },
        ],
        notes: [
          "Engineering notes by band: Low / Moderate / High / Very high volume change potential.",
          "Per the programmer's guide the whole classification is two comparisons and a string join.",
        ],
        sourceModule: "atterbergCalculations",
        sourceFunctions: ["classifyAtterberg", "getALinePI", "getULinePI"],
      },
      {
        heading: "USCS grain-size route (ASTM D2487 flow charts)",
        formulas: [
          "fines = % passing No. 200 (0.075 mm)",
          "gravel = 100 - % passing No. 4 (4.75 mm)",
          "sand = % passing No. 4 - % passing No. 200",
          "fines >= 50% -> fine-grained (A-line route above); else sand family if sand > gravel, gravel family otherwise",
          "clean (fines <= 12%): SP/SW or GP/GW; fines > 12%: the A-line decides silty (M) vs clayey (C)",
        ],
        variables: [],
        notes: [
          "Gravel + sand + fines must total 100%; otherwise classification is withheld as invalid data.",
        ],
        sourceModule: "soilClassification",
        sourceFunctions: ["classifySoilUSCS", "validateClassificationData"],
      },
      {
        heading: "AASHTO M 145 groups (12 groups, lab classification note)",
        formulas: [
          "P200 <= 35% -> granular soils, else silt-clay soils",
          "A-1-a: P10 <= 50, P40 <= 30, P200 <= 15, PI <= 6 (stone fragments, gravel, sand)",
          "A-1-b: P40 <= 50, P200 <= 25, PI <= 6 (stone fragments, gravel, sand)",
          "A-3: P40 >= 51, P200 <= 10, non-plastic (fine sand)",
          "A-2-4: P200 <= 35, LL <= 40, PI <= 10 / A-2-5: LL > 40, PI <= 10",
          "A-2-6: P200 <= 35, LL <= 40, PI > 10 / A-2-7: LL > 40, PI > 10",
          "A-4: P200 > 35, LL <= 40, PI <= 10 / A-5: LL > 40, PI <= 10 / A-6: LL <= 40, PI > 10",
          "A-7-5: P200 > 35, LL > 40, PI <= LL - 30 / A-7-6: PI > LL - 30",
          "GI = (F - 35) * (0.2 + 0.005 * (LL - 40)) + 0.01 * (F - 15) * (PI - 10)",
        ],
        variables: [
          { symbol: "P10 / P40 / P200", meaning: "% passing No. 10 (2.00 mm) / No. 40 (0.425 mm) / No. 200 (0.075 mm)" },
          { symbol: "F", meaning: "% passing No. 200 for the Group Index" },
          { symbol: "GI", meaning: "group index, whole number >= 0 (A-2-6/A-2-7 use the plasticity term alone)" },
        ],
        notes: [
          "LL and PI are measured on the fraction passing No. 40; LL plays no role in A-1-a, A-1-b or A-3.",
          "Ratings: A-1/A-2/A-3 Excellent-Good (GI 0-4); A-4..A-7 Fair-Poor (GI up to 8/12/16/20).",
          "Critical note: all three sieve values are required for granular soils; without P10/P40 the app shows a best-effort group flagged as unverified.",
        ],
        sourceModule: "soilClassification",
        sourceFunctions: ["classifySoilAASHTO", "calculateAashtoGroupIndex", "getAashtoEvidenceWarnings"],
      },
    ],
  },
  {
    testKey: "proctor",
    title: "Compaction (Proctor)",
    standard: "BS 1377-4:1990, clause 3.3",
    entries: [
      {
        heading: "Per-point densities and moisture",
        formulas: [
          "wet soil = mould wet - mould tare",
          "water = container wet - container dry",
          "dry soil = container dry - container tare",
          "bulk density rho = wet soil / V * 1000   (kg/m3, V in cm3)",
          "w = water / dry soil * 100  (%)",
          "dry density rho_d = rho / (1 + w / 100)   (kg/m3)",
        ],
        variables: [
          { symbol: "V", meaning: "mould volume (cm3)" },
          { symbol: "w", meaning: "moisture content (%)" },
        ],
        notes: [
          "A point with any missing measurement yields no densities rather than a partial result.",
        ],
        sourceModule: "proctorRecords",
        sourceFunctions: ["calculateProctorPoint"],
      },
      {
        heading: "Optimum moisture content and maximum dry density",
        formulas: [
          "fit rho_d = a*w^2 + b*w + c by least squares (normal equations), minimum 3 distinct moistures",
          "OMC = -b / (2a),  MDD = a*OMC^2 + b*OMC + c",
          "R^2 = 1 - SUM(residual^2) / SUM((rho_d - mean)^2)",
        ],
        variables: [
          { symbol: "OMC", meaning: "optimum moisture content (%)" },
          { symbol: "MDD", meaning: "maximum dry density (kg/m3)" },
        ],
        notes: [
          "The fit is accepted only for a downward-opening curve (a < 0) whose vertex lies within the measured range (+/- 2% margin).",
          "When no parabola can be supported, OMC/MDD fall back to the single densest measured point (reported as peak-point basis).",
        ],
        sourceModule: "proctorRecords",
        sourceFunctions: ["fitCompactionCurve", "calculateProctor"],
      },
      {
        heading: "Zero air voids and air-voids lines",
        formulas: [
          "ZAV: rho_d = 1000 * Gs / (1 + (w / 100) * Gs)",
          "air voids na: rho_d(na) = ZAV * (1 - na / 100)",
        ],
        variables: [
          { symbol: "Gs", meaning: "specific gravity of solids (default 2.65)" },
          { symbol: "na", meaning: "target air voids content (%)" },
        ],
        notes: [
          "The fitted compaction curve must stay below the ZAV line; the air-voids line always sits below ZAV by construction.",
          "Report sheets draw the 0%, 5% and 10% voids lines beside the fitted curve for the same check.",
        ],
        sourceModule: "proctorRecords",
        sourceFunctions: ["zeroAirVoidsDensity", "airVoidsDensity"],
      },
    ],
  },
  {
    testKey: "compressive",
    title: "Compressive Strength of Concrete Cubes",
    standard: "BS EN 12390-3:2002 (testing) / BS EN 206 (conformity)",
    entries: [
      {
        heading: "Compressive strength",
        formulas: ["strength = load_kN * 1000 / (W * H)   (MPa = N/mm2)"],
        variables: [
          { symbol: "load_kN", meaning: "maximum load at failure (kN)" },
          { symbol: "W * H", meaning: "loaded cross-section (mm x mm)" },
        ],
        notes: [
          "A genuine 0 MPa result is kept distinct from an unfilled field: blanks stay blank, never 0.",
          "Negative loads and non-positive dimensions yield no strength.",
        ],
        sourceModule: "compressiveCalculations",
        sourceFunctions: ["strengthOf", "parseNumber"],
      },
      {
        heading: "Bulk density and age",
        formulas: [
          "density = (mass / 1000) / ((W * H * D) / 10^9)   (kg/m3)",
          "age = floored whole days from date of cast to date of test",
        ],
        variables: [
          { symbol: "mass", meaning: "cube mass (g)" },
          { symbol: "W * H * D", meaning: "cube volume (mm3)" },
        ],
        notes: [
          "Densities outside 2200-2600 kg/m3 are flagged as abnormal on screen and in charts.",
          "A test date before the cast date yields no age rather than a negative one.",
        ],
        sourceModule: "compressiveCalculations",
        sourceFunctions: ["densityOf", "ageOf"],
      },
      {
        heading: "Target strength and age groups",
        formulas: [
          "class target: C25/30 -> 30 (the cube figure); single-figure classes use that figure",
          "bands: 1 day exact, 3 days exact, 7 +/- 1, 14 +/- 2, 28 +/- 3 days",
          "band targets follow the class through the gain table (C30 -> 4.8 / 12 / 19.5 / 27 / 29.7 MPa) until typed over",
        ],
        variables: [],
        notes: [
          "Each band is judged on its own mean: cubes of different ages are never averaged together.",
          "Cubes outside every band are reported under Other ages, never dropped.",
          "Early/late breaks off the nominal day fall into Other ages; confirm wider windows with the lab if needed.",
        ],
        sourceModule: "compressiveCalculations",
        sourceFunctions: ["cubeStrengthFromClass", "buildAgeGroups", "classBandTargets", "STRENGTH_GAIN_TABLE"],
      },
      {
        heading: "Strength gain with age (lab reference table)",
        formulas: [
          "1 day -> 16% of 28-day strength",
          "3 days -> 40% of 28-day strength",
          "7 days -> 65% of 28-day strength",
          "14 days -> 90% of 28-day strength",
          "28 days -> 99% of 28-day strength",
          "expected MPa = class target * percent / 100",
        ],
        variables: [],
        notes: [
          "Percentages are of the characteristic (28-day) strength, e.g. C30 at 7 days is expected to reach 19.5 MPa.",
        ],
        sourceModule: "compressiveCalculations",
        sourceFunctions: ["expectedPercentAtAge", "expectedStrength"],
      },
      {
        heading: "Acceptance",
        formulas: [
          "group accepted when mean >= target AND lowest cube >= target - 4",
          "per cube: Satisfactory when strength reaches the age expectation (e.g. >= 65% of class at 7 days, >= 99% at 28 days); unknown age falls back to >= 65%",
          "pass tally: cubes with strength >= threshold (a real 0 MPa counts as a failure)",
        ],
        variables: [
          { symbol: "target", meaning: "band target strength (MPa)" },
        ],
        notes: [
          "The simple pass/fail tally is indicative only; conformity is judged on the group verdict above.",
          "Strength bands: < 7 very low, 7-20 low, 20-40 normal structural, > 40 high.",
        ],
        sourceModule: "compressiveCalculations",
        sourceFunctions: ["groupVerdict", "getPassFailResults", "strengthCategory", "gainSummary", "ACCEPTANCE_MARGIN_MPA"],
      },
      {
        heading: "Report percentages and remarks (lab cube sheet)",
        formulas: [
          "% of class = strength / class target * 100 (whole number)",
          "Satisfactory when strength reaches the age expectation from the gain table (65% at 7 days, 99% at 28 days)",
        ],
        variables: [],
        notes: [
          "Lab sheet VENUS: 25.1 MPa of C30 -> 84% Satisfactory; 21.5 MPa -> 72% Satisfactory.",
        ],
        sourceModule: "compressivePdfGenerator",
        sourceFunctions: ["percentOfClass", "isSatisfactory"],
      },
      {
        heading: "Worked example - 150 mm cube",
        formulas: [
          "load 564.1 kN on 150 x 150 mm: strength = 564.1 * 1000 / (150 * 150) = 25.07 MPa (lab sheet rounds to 25.1)",
          "mass 7927 g: density = (7927 / 1000) / ((150 * 150 * 150) / 10^9) = 2349 kg/m3",
          "cast 19-Sep, tested 26-Sep -> age 7 days -> 7-day band (7 +/- 1)",
        ],
        variables: [],
        notes: [
          "The lab sheet's own readings; recompute them to verify any result row.",
        ],
        sourceModule: "compressiveCalculations",
        sourceFunctions: ["strengthOf", "densityOf", "ageOf"],
      },
    ],
  },
];
