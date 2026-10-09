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
  | "compressiveCalculations";

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

export const FORMULAS_REFERENCE_VERSION = "1.0.0";

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
        ],
        sourceModule: "gradingCalculations",
        sourceFunctions: ["calculateHydrometer"],
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
          "7-day band: 7 +/- 1 days;  28-day band: 28 +/- 3 days",
        ],
        variables: [],
        notes: [
          "Each band is judged on its own mean: a 7-day and a 28-day cube are never averaged together.",
          "Cubes outside every band are reported under Other ages, never dropped.",
        ],
        sourceModule: "compressiveCalculations",
        sourceFunctions: ["cubeStrengthFromClass", "buildAgeGroups"],
      },
      {
        heading: "Acceptance",
        formulas: [
          "group accepted when mean >= target AND lowest cube >= target - 4",
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
        sourceFunctions: ["groupVerdict", "getPassFailResults", "strengthCategory", "ACCEPTANCE_MARGIN_MPA"],
      },
    ],
  },
];
