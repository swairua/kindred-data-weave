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
  | "cbrCalculations"
  | "consolidationCalculations"
  | "compressiveCalculations"
  | "compressivePdfGenerator"
  | "cptCalculations"
  | "coringCalculations"
  | "gradingCalculations"
  | "pointLoadCalculations"
  | "porosityCalculations"
  | "proctorRecords"
  | "psd-sieve-formulas"
  | "schmidtCalculations"
  | "shearCalculations"
  | "slumpCalculations"
  | "soilClassification"
  | "ucsCalculations"
  | "upvtCalculations";

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
  testKey: "grading" | "atterberg" | "proctor" | "compressive" | "classification" | "cbr" | "shear" | "consolidation" | "ucs" | "pointload" | "porosity" | "upvt" | "schmidt" | "schmidt_rock" | "coring" | "cpt" | "slump";
  title: string;
  standard: string;
  entries: FormulaEntry[];
}

export const FORMULAS_REFERENCE_VERSION = "2.2.0";

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
          "The pan rows (<0.063, <0.075) contribute their mass to the total but report no passing value.",
          "With no weighed material every percentage reads as auto, never 0%.",
          "Worked (lab sheet KIRIAINI AHP): 40.22 g retained on No. 4 of 176.4 g total -> 22.8% retained, 77.2% passing.",
        ],
        sourceModule: "psd-sieve-formulas",
        sourceFunctions: ["calculatePercentRetained", "calculateCumulativePassing"],
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
        sourceModule: "psd-sieve-formulas",
        sourceFunctions: ["calculateGradationCoeffs"],
      },
      {
        heading: "Full PSD pipeline (processSieveAnalysis)",
        formulas: [
          "1. Sort sieve rows largest to smallest",
          "2. % retained_i = m_i / total * 100",
          "3. cumulative passing_i = (1 - SUM(retained to row i) / total) * 100",
          "4. D10, D30, D60 via log interpolation; Cu = D60 / D10; Cc = D30^2 / (D10 * D60)",
          "5. Atterberg limits (LL, PL, PI) from sieve-generated data",
          "6. Soil classification: USCS/AASHTO from fractions + Atterberg",
        ],
        variables: [
          { symbol: "m_i", meaning: "mass retained on sieve row i (g)" },
          { symbol: "total", meaning: "sum of all retained masses (g)" },
        ],
        notes: [
          "Oven-dried LL input: when an oven-dried liquid limit is entered it takes precedence over the air-dried value for classification.",
          "Non-plastic soils (NP) report PI = 0 and skip BS/USCS Atterberg classification.",
        ],
        sourceModule: "psd-sieve-formulas",
        sourceFunctions: ["processSieveAnalysis"],
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
      {
        heading: "Plasticity Index",
        formulas: ["PI = LL - PL"],
        variables: [
          { symbol: "PI", meaning: "plasticity index (%)" },
          { symbol: "LL", meaning: "liquid limit (%)" },
          { symbol: "PL", meaning: "plastic limit (%)" },
        ],
        notes: [
          "Per Excel formula from ATTERTEST.xlsx: PI = LL - PL.",
          "The psd-sieve-formulas module implements calculatePlasticityIndex(ll, pl).",
        ],
        sourceModule: "psd-sieve-formulas",
        sourceFunctions: ["calculatePlasticityIndex"],
      },
      {
        heading: "Liquidity Index",
        formulas: ["LI = (w - PL) / PI"],
        variables: [
          { symbol: "LI", meaning: "liquidity index" },
          { symbol: "w", meaning: "natural water content (%)" },
          { symbol: "PL", meaning: "plastic limit (%)" },
          { symbol: "PI", meaning: "plasticity index (LL - PL)" },
        ],
        notes: [
          "Per Excel formula from ATTERTEST.xlsx: LI = (w - PL) / PI.",
          "The psd-sieve-formulas module implements calculateLiquidityIndex(w, pl, pi).",
        ],
        sourceModule: "psd-sieve-formulas",
        sourceFunctions: ["calculateLiquidityIndex"],
      },
      {
        heading: "Soil Classification by Atterberg Limits",
        formulas: ["A-line method: PI = 0.73 * (LL - 20); classify as CL/CH/MH/ML/CL-ML"],
        variables: [
          { symbol: "LL", meaning: "liquid limit (%)" },
          { symbol: "PI", meaning: "plasticity index (%)" },
          { symbol: "fines", meaning: "fines content % passing #200 sieve" },
        ],
        notes: [
          "Per Excel formula from ATTERTEST.xlsx: A-line classification using psd-sieve-formulas.classifySoilByAtterberg().",
          "The psd-sieve-formulas module implements classifySoilByAtterberg(ll, pi, fines).",
          "Returns CL (lean clay), CH (fat clay), ML (silt), MH (elastic silt), or CL-ML (silty clay).",
        ],
        sourceModule: "psd-sieve-formulas",
        sourceFunctions: ["classifySoilByAtterberg"],
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
           "Relaxed classification gate: fine-grained soils (>= 50% fines) classify on the No. 200 passing value alone.",
           "Manual USCS/AASHTO overrides take precedence over auto-classification on the printed report.",
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
          "The moisture content divides by the container tare: a tin weight entered one column over silently turns a 10% moisture content into several hundred per cent. A container tare of 0 g is legitimate (the recorded masses are then net of tin) and is not flagged.",
          "Entry checks flag a moisture content above 60% (implausible for a compacted soil), a dry density above the particle density, a mould tare of zero, and any point whose masses fail the physical checks - see proctorRowWarnings. These still print in the report.",
        ],
        sourceModule: "proctorRecords",
        sourceFunctions: ["calculateProctorPoint", "proctorRowWarnings"],
      },
      {
        heading: "Optimum moisture content and maximum dry density",
        formulas: [
          "fit rho_d = a*w^2 + b*w + c through the three readings around the measured maximum",
          "OMC = -b / (2a),  MDD = a*OMC^2 + b*OMC + c",
          "R^2 = 1 - SUM(residual^2) / SUM((rho_d - mean)^2), checked against all plotted readings",
        ],
        variables: [
          { symbol: "OMC", meaning: "optimum moisture content (%)" },
          { symbol: "MDD", meaning: "maximum dry density (kg/m3)" },
        ],
        notes: [
          "The fitted compaction curve on screen and in the PDF/xport is a Catmull-Rom spline through every measured point, matching the curves drawn on the laboratory's report sheets.",
          "The three-point parabola through the measured peak and its two neighbours is used only to derive OMC/MDD; the drawn spline is the same curve the technicians draw by hand through all readings.",
          "The measured maximum must be bracketed; the local fit must open downward and its vertex must lie between the neighboring moisture contents.",
          "When no local parabola can be supported, OMC/MDD fall back to the single densest measured point (reported as peak-point basis).",
          "New records default specific gravity Gs to 2.0 and the Y-axis window to 1400-1550 kg/m3; the window is stored per project on the Proctor payload (yAxisMin / yAxisMax), and the exported PDF renders every sample against it.",
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
          { symbol: "Gs", meaning: "measured specific gravity of soil solids" },
          { symbol: "na", meaning: "target air voids content (%)" },
        ],
        notes: [
          "Zero air voids points above this line are not currently flagged: the two BS 1377-4 plausibility notices - 'Specific gravity outside the 2.4 to 2.9 range of mineral soils' and 'N points plot above the zero air voids line' - are suppressed in this build by default (SHOW_SPECIFIC_GRAVITY_WARNINGS=false in proctorRecords.ts) per laboratory decision; reprint with the flag enabled once Gs is settled for the granular soils.",
          "The fitted compaction curve must stay below the ZAV line; the air-voids line always sits below ZAV by construction. Enforced non-conformity is currently handled by the laboratory during review, not by the print.",
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
          "between table ages the expectation interpolates linearly (10 days -> 75.7%); past 28 days it holds 99%; below 1 day there is none",
        ],
        variables: [],
        notes: [
          "Percentages are of the characteristic (28-day) strength, e.g. C30 at 7 days is expected to reach 19.5 MPa.",
          "Report sheets print ages past 31 days as Above 28 instead of the exact day count.",
        ],
        sourceModule: "compressiveCalculations",
        sourceFunctions: ["expectedPercentAtAge", "expectedStrength", "formatReportAge"],
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
  {
    testKey: "cbr",
    title: "California Bearing Ratio (CBR)",
    standard: "BS 1377-4:1990 / ASTM D1883",
    entries: [
      {
        heading: "CBR at 2.5 mm and 5.0 mm penetration",
        formulas: [
          "CBR_2.5 = (load_2.5 / 13.24) * 100  (%)",
          "CBR_5.0 = (load_5.0 / 19.96) * 100  (%)",
          "reported CBR = max(CBR_2.5, CBR_5.0)",
        ],
        variables: [
          { symbol: "load_2.5", meaning: "load at 2.5 mm penetration (kN)" },
          { symbol: "load_5.0", meaning: "load at 5.0 mm penetration (kN)" },
          { symbol: "13.24", meaning: "standard load at 2.5 mm (kN)" },
          { symbol: "19.96", meaning: "standard load at 5.0 mm (kN)" },
        ],
        notes: [
          "Standard loads are 13.24 kN at 2.5 mm and 19.96 kN at 5.0 mm penetration.",
          "The reported CBR is the greater of the two values.",
        ],
        sourceModule: "cbrCalculations",
        sourceFunctions: ["calculateCBR", "calculateCBRRows", "reportCBR", "STANDARD_LOAD_2_5", "STANDARD_LOAD_5_0"],
      },
    ],
  },
  {
    testKey: "shear",
    title: "Direct Shear Test",
    standard: "BS 1377-7:1990 / ASTM D3080",
    entries: [
      {
        heading: "Mohr-Coulomb failure envelope",
        formulas: [
          "tau = c + sigma * tan(phi)",
          "slope = (n * SUM(x*y) - SUM(x) * SUM(y)) / (n * SUM(x^2) - SUM(x)^2)",
          "intercept = (SUM(y) - slope * SUM(x)) / n",
          "phi = atan(slope) * 180 / PI  (degrees)",
          "c = intercept  (cohesion, kPa)",
        ],
        variables: [
          { symbol: "tau", meaning: "shear stress at failure (kPa)" },
          { symbol: "c", meaning: "cohesion / intercept of failure envelope (kPa)" },
          { symbol: "sigma", meaning: "normal stress (kPa)" },
          { symbol: "phi", meaning: "angle of internal friction (degrees)" },
          { symbol: "x", meaning: "normal stress data points" },
          { symbol: "y", meaning: "shear stress data points" },
          { symbol: "n", meaning: "number of shear boxes" },
        ],
        notes: [
          "Requires at least two shear boxes with different normal stresses.",
          "Linear regression fits tau = c + sigma * tan(phi) to the (normal, shear) pairs.",
          "The slope gives tan(phi); the intercept gives cohesion c.",
        ],
        sourceModule: "shearCalculations",
        sourceFunctions: ["calculateShearEnvelope", "shearStrength"],
      },
    ],
  },
  {
    testKey: "consolidation",
    title: "Consolidation Test",
    standard: "BS 1377-6:1990 / ASTM D2435",
    entries: [
      {
        heading: "Time-settlement relationship",
        formulas: [
          "settlement_i = reading_i  (mm)",
          "max_settlement = MAX(settlement_1 ... settlement_n)",
        ],
        variables: [
          { symbol: "settlement_i", meaning: "settlement reading at time i (mm)" },
          { symbol: "time_i", meaning: "elapsed time since load application (min)" },
          { symbol: "max_settlement", meaning: "maximum settlement observed (mm)" },
        ],
        notes: [
          "Plots settlement vs time to determine consolidation behavior.",
          "Maximum settlement is the largest recorded settlement value.",
        ],
        sourceModule: "consolidationCalculations",
        sourceFunctions: ["calculateConsolidationPoints", "maxSettlement"],
      },
    ],
  },
  {
    testKey: "ucs",
    title: "Unconfined Compressive Strength (UCS)",
    standard: "ISRM SM (2007) / ASTM D7012-14",
    entries: [
      {
        heading: "Uniaxial compressive strength",
        formulas: [
          "qu = 4F / (pi d^2)   (MPa = N/mm^2)",
          "A = (pi / 4) * d^2   (mm^2)",
          "mean, sample standard deviation, coefficient of variation (n >= 3)",
        ],
        variables: [
          { symbol: "qu", meaning: "uniaxial compressive strength (MPa)" },
          { symbol: "F", meaning: "maximum load at failure (kN)" },
          { symbol: "d", meaning: "specimen diameter (mm)" },
          { symbol: "L/D", meaning: "length-to-diameter ratio; must lie between 2 and 3 (ISRM SM 2007)" },
          { symbol: "A", meaning: "cross-sectional area of specimen (mm^2)" },
        ],
        notes: [
          "ISRM SM 2007 requires at least 3 valid specimens; cylindrical specimens with L/D between 2 and 3; flat, parallel, polished ends; loading rate 0.5 to 1.0 MPa/s.",
          "Failures through the specimen ends are rejected and the specimen must be re-tested.",
          "Report mean, standard deviation and coefficient of variation. Strength alone is not reported without the number of specimens.",
          "The test is repeated for at least 3 valid specimens; a result is not reportable unless the set conforms ISRM SM 2007 / ASTM D7012-14.",
        ],
        sourceModule: "ucsCalculations",
        sourceFunctions: ["calculateSpecimen", "sampleStandardDeviation", "assessConformity", "mean", "MIN_SPECIMENS", "STRESS_RATE_MIN", "STRESS_RATE_MAX", "L_D_MIN", "L_D_MAX"],
      },
    ],
  },
  {
    testKey: "pointload",
    title: "Point Load Test",
    standard: "ISRM SM (2007) / ASTM D5731-14",
    entries: [
      {
        heading: "Point load strength index",
        formulas: [
          "Is = P / De^2   (MPa), with P in N and De in mm",
          "Is(50) = Is * (De / 50)^0.75   (normalised to a 50 mm reference diameter)",
          "mean, sample standard deviation, coefficient of variation (n >= 10)",
        ],
        variables: [
          { symbol: "Is(50)", meaning: "normalised point load strength index for a 50 mm reference diameter (MPa)" },
          { symbol: "Is", meaning: "unnormalised point load index (MPa)" },
          { symbol: "P", meaning: "load at failure (kN)" },
          { symbol: "De", meaning: "equivalent specimen diameter (mm); De = D for diametral tests, sqrt(4A/pi) for lumps/blocks; test close to 50 mm preferred" },
          { symbol: "COV", meaning: "coefficient of variation of the sample; > 40% is rejected by ISRM SM" },
        ],
        notes: [
          "ISRM SM 2007 recommends at least 10 valid tests per set; De close to 50 mm is preferred; De outside 25-75 mm is flagged.",
          "Failure should preferably be a single fracture through the mid-section; through-end failures are rejected and the specimen re-tested.",
          "Ends fail when load is applied by two conical platens; a loading rate giving failure within approximately one minute is recommended.",
          "Results may be compared to unconfined compressive strength only through material-class-dependent correlations.",
        ],
        sourceModule: "pointLoadCalculations",
        sourceFunctions: ["calculatePointLoadIndex", "calculateSpecimen", "sampleStandardDeviation", "assessConformity", "calculatePointLoadRows", "averagePointLoadIndex", "MIN_SPECIMENS", "DE_MIN_MM", "DE_MAX_MM", "COV_MAX", "IS50_CORRECTION_EXPONENT"],
      },
    ],
  },
  {
    testKey: "porosity",
    title: "Porosity Test",
    standard: "BS 1377-2:1990",
    entries: [
      {
        heading: "Porosity from mass and volume",
        formulas: [
          "n = ((W_sat - W_dry) / V) * 100  (%)",
        ],
        variables: [
          { symbol: "n", meaning: "porosity (%)" },
          { symbol: "W_sat", meaning: "saturated (wet) mass of sample (g)" },
          { symbol: "W_dry", meaning: "oven-dry mass of sample (g)" },
          { symbol: "V", meaning: "volume of sample (cm^3)" },
        ],
        notes: [
          "(W_sat - W_dry) is the mass of water in the pores; numerically equal to pore volume in cm^3 (water density = 1 g/cm^3).",
          "Requires dry weight, saturated weight and volume all to be positive.",
        ],
        sourceModule: "porosityCalculations",
        sourceFunctions: ["calculatePorosity", "calculatePorosityResult"],
      },
    ],
  },
  {
    testKey: "upvt",
    title: "Ultrasonic Pulse Velocity Test (UPVT)",
    standard: "BS EN 12504-4:2004 / ASTM C597",
    entries: [
      {
        heading: "Pulse velocity",
        formulas: [
          "V = L / T   (km/s)",
        ],
        variables: [
          { symbol: "V", meaning: "ultrasonic pulse velocity (km/s)" },
          { symbol: "L", meaning: "path length between transducers (mm)" },
          { symbol: "T", meaning: "transit time of the pulse (microseconds)" },
        ],
        notes: [
          "1 mm / 1 microsecond = 1 km/s, so V = L / T directly.",
          "Quality classification: >=4.5 Excellent, >=3.5 Good, >=3.0 Medium, >=2.0 Poor, <2.0 Very Poor.",
        ],
        sourceModule: "upvtCalculations",
        sourceFunctions: ["calculateVelocity", "calculateUPVTRows", "averageVelocity", "qualityFromVelocity"],
      },
    ],
  },
  {
    testKey: "schmidt",
    title: "Schmidt Hammer / Rebound Hammer",
    standard: "BS EN 12504-2:2001 / ASTM C805",
    entries: [
      {
        heading: "Rebound number and estimated strength",
        formulas: [
          "R_avg = SUM(retained readings) / retained count",
          "reading differs by more than 12% from mean -> discarded; more than 2 rejected -> area invalid",
          "f_c = M * R_avg + B   (only when a site-specific correlation M/B is configured in the record)",
        ],
        variables: [
          { symbol: "R_avg", meaning: "average rebound number of the retained readings" },
          { symbol: "f_c", meaning: "estimated compressive strength (MPa)" },
          { symbol: "M", meaning: "site correlation slope (MPa per rebound)" },
          { symbol: "B", meaning: "site correlation intercept (MPa)" },
        ],
        notes: [
          "Ten rebound readings per test area are required by BS EN 12504-2 / ASTM C805 / BS 1881-202.",
          "Any reading varying from the mean by more than 12% is discarded; if more than two are discarded, the area is unsuitable and must be re-taken.",
          "The strength correlation is never assumed. If the record carries no correlation, the report prints rebound numbers only; estimated strength is printed only with a configured site-specific correlation.",
          "Anvil calibration, impact orientation and surface condition must be documented for a conforming (completed) test; the print states conformity or lists what is missing.",
        ],
        sourceModule: "schmidtCalculations",
        sourceFunctions: ["getValidReadings", "evaluateSchmidtRow", "calculateAverageRebound", "estimateStrengthFromRebound", "calculateSchmidtRows", "averageRebound", "rowsConform", "REQUIRED_READINGS"],
      },
    ],
  },
  {
    testKey: "schmidt_rock",
    title: "Schmidt Hammer (Rock)",
    standard: "ISRM SM (1978) Rebound (Schmidt) hammer testing of rocks",
    entries: [
      {
        heading: "Rebound hardness of rock",
        formulas: [
          "R_avg = SUM(retained readings) / retained count",
          "reading differs by more than 12% from mean -> discarded; more than 2 rejected -> area invalid",
        ],
        variables: [
          { symbol: "R_avg", meaning: "average rebound number of the retained readings" },
        ],
        notes: [
          "ISRM SM (1978) requires at least 10 rebound readings per test area, equally spaced and away from fractures, edges and weathered surfaces.",
          "Any reading varying from the mean by more than 12% is discarded; if more than two are discarded, the area is unsuitable and must be re-taken.",
          "The rebound number is a surface-hardness index. It is NOT a stand-in for compressive strength; UCS must be determined by laboratory tests on representative specimens. No MPa correlation is printed for rock.",
          "Anvil calibration and impact orientation must be documented for a conforming (completed) test; the print states conformity or lists what is missing.",
        ],
        sourceModule: "schmidtCalculations",
        sourceFunctions: ["getValidReadings", "evaluateSchmidtRow", "calculateAverageRebound", "calculateSchmidtRows", "averageRebound", "rowsConform", "REQUIRED_READINGS"],
      },
    ],
  },
  {
    testKey: "coring",
    title: "Concrete Coring Test",
    standard: "BS EN 12504-1:2009",
    entries: [
      {
        heading: "Core strength and L/D correction",
        formulas: [
          "Area = pi * (d / 2)^2   (mm^2; reported in m^2 as Area / 10^6)",
          "Volume = Area * length   (mm^3; reported in m^3 as Volume / 10^9)",
          "Density = (weight in air / 1000) / (Volume in m^3)   (kg/m^3)",
          "strength = (P * 1000) / Area   (MPa)",
          "L/D = length / diameter",
          "factor = 1.0  when L/D >= 2.0",
          "factor = 0.87 + 0.065 * (L/D)  when L/D < 2.0",
          "corrected = strength * factor",
        ],
        variables: [
          { symbol: "d", meaning: "core diameter (mm)" },
          { symbol: "length", meaning: "core length after trimming (mm)" },
          { symbol: "P", meaning: "failure load (kN)" },
          { symbol: "Area", meaning: "loaded cross-sectional area (mm^2)" },
          { symbol: "L/D", meaning: "length-to-diameter ratio" },
          { symbol: "corrected", meaning: "L/D-corrected core strength (MPa)" },
        ],
        notes: [
          "Cores with L/D < 2.0 are strength-reduced: the factor is below 1.0, so the corrected strength is lower than the core strength.",
          "Cores with L/D >= 2.0 use the uncorrected strength.",
          "Average corrected strength is reported across all cores.",
        ],
        sourceModule: "coringCalculations",
        sourceFunctions: ["calculateLDRatio", "calculateCoreStrength", "lDCorrectionFactor", "calculateCorrectedStrength", "calculateCoringRows", "averageCorrectedStrength"],
      },
    ],
  },
  {
    testKey: "cpt",
    title: "Cone Penetration Test",
    standard: "ISO 22476-1 / Robertson (1986) simplified SBT chart",
    entries: [
      {
        heading: "Friction ratio Rf",
        formulas: [
          "Rf = fs / qc * 100   (%)",
          "qc is entered in MPa and fs in kPa, so Rf = fs / (qc * 10)",
        ],
        variables: [
          { symbol: "fs", meaning: "sleeve friction (kPa)" },
          { symbol: "qc", meaning: "cone resistance (MPa)" },
          { symbol: "Rf", meaning: "friction ratio (%)" },
        ],
        notes: [
          "Rf is derived, never typed: it is recomputed from qc and fs on edit and on load.",
          "A zero sleeve friction is legitimate (clean sand) and gives Rf = 0.",
          "Typical Rf range: about 0.5 to 8 percent; high Rf means cohesive soil.",
        ],
        sourceModule: "cptCalculations",
        sourceFunctions: ["calculateFrictionRatio", "rederiveCptRow"],
      },
      {
        heading: "Soil classification (Robertson simplified chart)",
        formulas: [
          "Rf >= 8                       -> Clay",
          "Rf >= 5                       -> Silty Clay to Clay",
          "qc > 10,  Rf < 1              -> Sand",
          "qc > 10,  Rf >= 1             -> Very Stiff Sand to Clayey Sand",
          "qc 5-10,  Rf < 1.5            -> Sand to Silty Sand",
          "qc 5-10,  Rf 1.5-5            -> Silty Sand to Sandy Silt",
          "qc 2-5,   Rf < 2              -> Silty Sand to Sandy Silt",
          "qc 2-5,   Rf 2-5              -> Clayey Silt to Silty Clay",
          "qc 1-2,   Rf < 3              -> Sandy Silt to Clayey Silt",
          "qc 1-2,   Rf 3-5              -> Clayey Silt to Silty Clay",
          "qc <= 1,  Rf < 5              -> Clayey Silt to Silty Clay",
        ],
        variables: [
          { symbol: "qc", meaning: "cone resistance (MPa)" },
          { symbol: "Rf", meaning: "friction ratio (%)" },
        ],
        notes: [
          "The ladder is banded axis-aligned and fully closed: any valid (qc > 0, Rf >= 0) pair classifies.",
          "Earlier banding had gaps (e.g. qc > 10 with Rf >= 1) that returned Unclassified.",
        ],
        sourceModule: "cptCalculations",
        sourceFunctions: ["classifySoilRobertson"],
      },
    ],
  },
  {
    testKey: "slump",
    title: "Slump Test",
    standard: "BS EN 12350-2:2019 / EN 206 consistence classes / ASTM C143",
    entries: [
      {
        heading: "Slump value",
        formulas: [
          "Slump = cone height - height of the subsided concrete   (mm)",
          "Standard Abrams cone: 200 mm base, 100 mm top, 300 mm height",
        ],
        variables: [
          { symbol: "cone height", meaning: "mould height, 300 mm standard (mm)" },
          { symbol: "height after subsidence", meaning: "highest point of the slumped concrete (mm)" },
          { symbol: "Slump", meaning: "subsidence of the fresh concrete (mm)" },
        ],
        notes: [
          "Recorded to the nearest 10 mm under EN 12350-2 and to the nearest 5 mm under ASTM C143.",
          "Only a true slump counts; a shear or collapse slump is discarded and the test repeated.",
          "The slump is derived, never typed: it is recomputed from the heights on edit and on load.",
        ],
        sourceModule: "slumpCalculations",
        sourceFunctions: ["calculateSlump", "rederiveSlumpEntry"],
      },
      {
        heading: "EN 206 consistence classes",
        formulas: [
          "S1  10-40 mm",
          "S2  50-90 mm",
          "S3  100-150 mm",
          "S4  160-210 mm",
          "S5  above 210 mm",
        ],
        variables: [
          { symbol: "Slump", meaning: "subsidence of the fresh concrete (mm)" },
        ],
        notes: [
          "Ranges per BS 8500-1. Intermediate readings round to the nearest class at the midpoints (45, 95, 155, 215) so every slump in the sensitive range classifies.",
          "Below 10 mm is beneath the EN 12350-2 sensitive range and reports Below S1 rather than a class.",
        ],
        sourceModule: "slumpCalculations",
        sourceFunctions: ["classifySlumpClass", "describeWorkability"],
      },
      {
        heading: "Target tolerance and validity",
        formulas: [
          "Target slump <= 40 mm:  tolerance +/-30 mm",
          "Target slump 50-90 mm:  tolerance +/-40 mm",
          "Target slump >= 100 mm: tolerance +/-50 mm",
          "EN 12350-2 sensitive range: 10-210 mm",
        ],
        variables: [
          { symbol: "Target", meaning: "specified slump (mm)" },
          { symbol: "Slump", meaning: "measured slump (mm)" },
        ],
        notes: [
          "Tolerances on a spot sample per BS 8500-1 basis (Concrete Society); targets are optional and their absence is not an error.",
          "Above 210 mm the cone test is unsuitable (collapse likely) - use a slump flow (SCC) test instead.",
        ],
        sourceModule: "slumpCalculations",
        sourceFunctions: ["toleranceBand", "assessCompliance", "assessValidity"],
      },
    ],
  },
];
