import type { RecordMetadata } from "@/context/TestDataContext";

export interface ProctorLegacyPoint {
  moisture: string;
  dryDensity: string;
}

export interface ProctorRow {
  moistureAdded: string;
  mouldWetMass: string;
  mouldTare: string;
  containerNumber: string;
  containerWetMass: string;
  containerDryMass: string;
  containerTare: string;
  legacy?: ProctorLegacyPoint;
}

export type ProctorMethod = "standard" | "modified";

/** Compaction effort as recorded on the sheet; blank means the field was not entered. */
export interface ProctorEffort {
  layers: string;
  blowsPerLayer: string;
  rammerMass: string;
  dropHeight: string;
}

export interface ProctorRecord {
  label: string;
  sampleNumber: string;
  sampleDepthFrom: string;
  sampleDepthTo: string;
  sampledSubmittedBy: string;
  testedBy: string;
  dateSubmitted: string;
  dateTested: string;
  sampleNotes: string;
  type: ProctorMethod;
  standardMouldVolume: string;
  modifiedMouldVolume: string;
  standardRows: ProctorRow[];
  modifiedRows: ProctorRow[];
  standardEffort: ProctorEffort;
  modifiedEffort: ProctorEffort;
  /** Particle density of the soil, used to plot the zero air voids line. Blank when not determined. */
  specificGravity: string;
  /** Air voids percentages for the saturation lines drawn on the chart, comma separated. The zero air voids line is always drawn. */
  airVoidsTarget: string;
  /** Percentage of the sample by dry mass removed as oversize before compaction. */
  oversizePercent: string;
  /** Oven-dried relative density of the oversize particles. */
  oversizeSpecificGravity: string;
  /** Field dry density of the total sample, compared with the laboratory maximum. */
  fieldDryDensity: string;
  /** Specified minimum relative compaction, as a percentage of maximum dry density. Blank when no limit applies. */
  requiredRelativeCompaction: string;
  /** Optimum moisture content as reported on the source test sheet. Blank when not reported. */
  reportedOmc: string;
  /** Maximum dry density as reported on the source test sheet. Blank when not reported. */
  reportedMdd: string;
}

export interface ProctorPointCalculation {
  wetMaterialMass: number | null;
  bulkDensity: number | null;
  waterMass: number | null;
  drySoilMass: number | null;
  moistureContent: number | null;
  dryDensity: number | null;
}

/** Where OMC/MDD came from: the fitted compaction curve, the best measured point, or nothing usable. */
export type ProctorOptimumSource = "curve" | "peak-point" | "none";

/** Least-squares parabola through the plotted points. */
export interface ProctorCurveFit {
  a: number;
  b: number;
  c: number;
  rSquared: number;
  omc: number;
  mdd: number;
}

/** A single plot of dry density against moisture content. */
export interface ProctorCurvePoint {
  moisture: number;
  dryDensity: number;
}

export interface ProctorSummary {
  omc: number | null;
  mdd: number | null;
  /** Bulk density at the reported optimum; derived from the fitted curve when optimumSource is "curve". */
  bulkDensity: number | null;
  optimumSource: ProctorOptimumSource;
  curve: ProctorCurveFit | null;
  rSquared: number | null;
  /** Number of valid moisture contents plotted. */
  pointCount: number;
  /** Reasons the reported optimum may be unreliable (BS 1377-4:1990, 3.3). */
  warnings: string[];
}

export interface ProctorPayload {
  version: "2.0";
  project: {
    title: string;
    clientName: string;
    date: string;
    records: ProctorRecord[];
  };
  calculations: {
    standard: ProctorSummary;
    modified: ProctorSummary;
  };
}

export const createProctorRows = (): ProctorRow[] => Array.from({ length: 6 }, () => ({
  moistureAdded: "",
  mouldWetMass: "",
  mouldTare: "",
  containerNumber: "",
  containerWetMass: "",
  containerDryMass: "",
  containerTare: "",
}));

// BS 1377-4:1990, 3.3.2.1 (2.5 kg rammer) and 3.5 (4.5 kg rammer), 1 L mould.
const STANDARD_EFFORT: ProctorEffort = { layers: "3", blowsPerLayer: "27", rammerMass: "2.5", dropHeight: "300" };
const MODIFIED_EFFORT: ProctorEffort = { layers: "5", blowsPerLayer: "27", rammerMass: "4.5", dropHeight: "450" };

export const emptyProctorRecord = (metadata: RecordMetadata = {}): ProctorRecord => ({
  label: metadata.sampleId || "",
  sampleNumber: metadata.sampleNumber || "",
  sampleDepthFrom: metadata.sampleDepthFrom || "",
  sampleDepthTo: metadata.sampleDepthTo || "",
  sampledSubmittedBy: metadata.sampledSubmittedBy || "",
  testedBy: metadata.testedBy || "",
  dateSubmitted: metadata.dateSubmitted || "",
  dateTested: metadata.dateTested || "",
  sampleNotes: metadata.sampleNotes || "",
  type: "standard",
  // BS 1377-4:1990, 3.3.2.1: the 2.5 kg and 4.5 kg rammer methods both use the 1 L compaction mould.
  standardMouldVolume: "1000",
  modifiedMouldVolume: "1000",
  standardRows: createProctorRows(),
  modifiedRows: createProctorRows(),
  standardEffort: { ...STANDARD_EFFORT },
  modifiedEffort: { ...MODIFIED_EFFORT },
  specificGravity: "",
  airVoidsTarget: "5, 10",
  oversizePercent: "",
  oversizeSpecificGravity: "",
  fieldDryDensity: "",
  requiredRelativeCompaction: "",
  reportedOmc: "",
  reportedMdd: "",
});

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const readString = (value: unknown) => typeof value === "string" ? value : value == null ? "" : String(value);
const parseValue = (value: string) => value.trim() === "" ? null : Number(value);
const emptyCalculation = (): ProctorPointCalculation => ({
  wetMaterialMass: null,
  bulkDensity: null,
  waterMass: null,
  drySoilMass: null,
  moistureContent: null,
  dryDensity: null,
});

const GRAVITY = 9.81;

/** Compaction energy per unit volume, kJ/m3: layers x blows x rammer weight x drop height / mould volume. */
export const compactionEnergy = (effort: ProctorEffort, mouldVolumeCm3: string): number | null => {
  const layers = parseValue(effort.layers);
  const blowsPerLayer = parseValue(effort.blowsPerLayer);
  const rammerMass = parseValue(effort.rammerMass);
  const dropHeight = parseValue(effort.dropHeight);
  const volume = parseValue(mouldVolumeCm3);
  const inputs = [layers, blowsPerLayer, rammerMass, dropHeight, volume];
  if (inputs.some((value) => value === null || !Number.isFinite(value) || value <= 0)) return null;
  const joulesPerCubicMetre = (layers! * blowsPerLayer! * rammerMass! * GRAVITY * (dropHeight! / 1000)) / (volume! * 1e-6);
  return joulesPerCubicMetre / 1000;
};

// ---------------------------------------------------------------------------------------
// Compaction curve - BS 1377-4:1990, 3.3 dry density/moisture content relationship
// ---------------------------------------------------------------------------------------

/** Density of water used by the saturation lines, kg/m3. */
const WATER_DENSITY = 1000;

/** Three moisture contents at distinct values are needed to determine a parabola. */
const CURVE_MIN_POINTS = 3;

/** BS 1377-4 practice is to plot at least five moisture contents bracketing the peak. */
const CURVE_RECOMMENDED_POINTS = 5;

/** A weaker fit than this is flagged so the technician re-checks the readings. */
const CURVE_MIN_R_SQUARED = 0.9;

/** The five measured masses a technician must record before a point can be calculated. */
type ProctorMeasurementField =
  | "mouldWetMass"
  | "mouldTare"
  | "containerWetMass"
  | "containerDryMass"
  | "containerTare";

const MEASUREMENT_FIELDS: ProctorMeasurementField[] = [
  "mouldWetMass",
  "mouldTare",
  "containerWetMass",
  "containerDryMass",
  "containerTare",
];

const determinant3 = (m: number[][]): number =>
  m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
  - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
  + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);

/** Cramer's rule for a 3x3 system; null when the matrix is singular. */
const solve3 = (m: number[][], v: number[]): number[] | null => {
  const det = determinant3(m);
  if (!Number.isFinite(det) || Math.abs(det) < 1e-9) return null;
  const out: number[] = [];
  for (let column = 0; column < 3; column += 1) {
    const replaced = m.map((row, r) => row.map((cell, c) => (c === column ? v[r] : cell)));
    out.push(determinant3(replaced) / det);
  }
  return out.every((value) => Number.isFinite(value)) ? out : null;
};

/**
 * Least-squares parabola through all plotted points, read at its vertex as OMC/MDD. The fit is
 * rejected unless the curve opens downward and the vertex lies between the neighbours of the
 * measured maximum, so the peak is bracketed.
 */
export const fitCompactionCurve = (points: ProctorCurvePoint[]): ProctorCurveFit | null => {
  const samples = points
    .filter((point) => Number.isFinite(point.moisture) && Number.isFinite(point.dryDensity))
    .sort((a, b) => a.moisture - b.moisture);
  if (samples.length < CURVE_MIN_POINTS) return null;
  if (new Set(samples.map((point) => point.moisture)).size < CURVE_MIN_POINTS) return null;

  const peakDensity = Math.max(...samples.map((point) => point.dryDensity));
  const peakIndex = samples.findIndex((point) => point.dryDensity === peakDensity);
  if (samples.filter((point) => point.dryDensity === peakDensity).length !== 1) return null;
  if (peakIndex === 0 || peakIndex === samples.length - 1) return null;

  const power = (k: number) => samples.reduce((sum, point) => sum + point.moisture ** k, 0);
  const moment = (k: number) => samples.reduce((sum, point) => sum + point.moisture ** k * point.dryDensity, 0);
  const solved = solve3(
    [
      [power(0), power(1), power(2)],
      [power(1), power(2), power(3)],
      [power(2), power(3), power(4)],
    ],
    [moment(0), moment(1), moment(2)],
  );
  if (!solved) return null;
  const [c, b, a] = solved;
  if (a >= 0) return null;

  const omc = -b / (2 * a);
  const mdd = a * omc * omc + b * omc + c;
  if (!Number.isFinite(omc) || !Number.isFinite(mdd) || mdd <= 0) return null;
  if (omc < samples[peakIndex - 1].moisture || omc > samples[peakIndex + 1].moisture) return null;

  const mean = samples.reduce((sum, point) => sum + point.dryDensity, 0) / samples.length;
  const totalSpread = samples.reduce((sum, point) => sum + (point.dryDensity - mean) ** 2, 0);
  const residualSpread = samples.reduce((sum, point) => {
    const predicted = a * point.moisture ** 2 + b * point.moisture + c;
    return sum + (point.dryDensity - predicted) ** 2;
  }, 0);
  const rSquared = totalSpread <= 0 ? (residualSpread <= 0 ? 1 : 0) : 1 - residualSpread / totalSpread;
  return { a, b, c, rSquared, omc, mdd };
};


/**
 * Dry density at zero air voids, rd = rw.Gs / (1 + w.Gs), with w as a decimal fraction.
 * This is the physical upper bound the compaction curve must stay below.
 */
export const zeroAirVoidsDensity = (specificGravity: number, moisturePercent: number): number | null => {
  if (!Number.isFinite(specificGravity) || specificGravity <= 0) return null;
  return (WATER_DENSITY * specificGravity) / (1 + (moisturePercent / 100) * specificGravity);
};

/**
 * Dry density at a target air voids content. Writing na = Va/V and the solid, water
 * and air volumes as V = Vs(1 + w.Gs) + Va gives rd = Gs.rw(1 - na)/(1 + w.Gs), so
 * the line is the zero air voids line scaled down by the air voids fraction:
 * rd(na) = rd(ZAV) x (1 - na). It therefore always sits below the ZAV line.
 */
export const airVoidsDensity = (
  airVoidsPercent: number,
  specificGravity: number,
  moisturePercent: number,
): number | null => {
  const saturation = zeroAirVoidsDensity(specificGravity, moisturePercent);
  if (saturation === null) return null;
  if (!Number.isFinite(airVoidsPercent) || airVoidsPercent < 0 || airVoidsPercent >= 100) return null;
  return saturation * (1 - airVoidsPercent / 100);
};

/** Air voids percentages typed as a list such as "5, 10"; invalid entries are ignored. */
export const parseAirVoidsTargets = (value: string): number[] => [
  ...new Set(
    value.split(/[\s,;]+/)
      .map((item) => Number(item))
      .filter((percent) => Number.isFinite(percent) && percent > 0 && percent < 100),
  ),
].sort((a, b) => a - b);

/**
 * ASTM D4718 correction of the finer-fraction maximum dry density and optimum moisture to the
 * total sample. The oversize is assumed to carry no water, so all of it sits in the finer fraction.
 */
export const correctForOversize = (
  mdd: number,
  omc: number,
  oversizePercent: number,
  oversizeSpecificGravity: number,
): { mdd: number; omc: number } => {
  const oversizeFraction = oversizePercent / 100;
  return {
    mdd: 1 / (oversizeFraction / (oversizeSpecificGravity * WATER_DENSITY) + (1 - oversizeFraction) / mdd),
    omc: (1 - oversizeFraction) * omc,
  };
};

export type FieldAcceptance = "pass" | "fail" | "no-limit" | "not-assessed";

/** Relative compaction of a field density against the reference maximum dry density. */
export const assessFieldCompaction = (
  fieldDryDensity: number | null,
  referenceMdd: number | null,
  requiredPercent: number | null,
): { relativeCompaction: number | null; acceptance: FieldAcceptance } => {
  if (fieldDryDensity === null || referenceMdd === null || referenceMdd <= 0) {
    return { relativeCompaction: null, acceptance: "not-assessed" };
  }
  const relativeCompaction = (fieldDryDensity / referenceMdd) * 100;
  if (requiredPercent === null) return { relativeCompaction, acceptance: "no-limit" };
  return { relativeCompaction, acceptance: relativeCompaction >= requiredPercent ? "pass" : "fail" };
};

const sampleRange = (from: number, to: number, samples: number): number[] => {
  if (!Number.isFinite(from) || !Number.isFinite(to) || samples < 2) return [];
  const step = (to - from) / (samples - 1);
  return Array.from({ length: samples }, (_, index) => from + step * index);
};

const isCurvePoint = (point: ProctorCurvePoint & { dryDensity: number | null }): point is ProctorCurvePoint =>
  point.dryDensity !== null;

export const zeroAirVoidsCurve = (
  specificGravity: number,
  moistureRange: number[],
  samples = 40,
): ProctorCurvePoint[] =>
  sampleRange(moistureRange[0], moistureRange[1], samples)
    .map((moisture) => ({ moisture, dryDensity: zeroAirVoidsDensity(specificGravity, moisture) }))
    .filter(isCurvePoint);

export const airVoidsCurve = (
  airVoidsPercent: number,
  specificGravity: number,
  moistureRange: number[],
  samples = 40,
): ProctorCurvePoint[] =>
  sampleRange(moistureRange[0], moistureRange[1], samples)
    .map((moisture) => ({ moisture, dryDensity: airVoidsDensity(airVoidsPercent, specificGravity, moisture) }))
    .filter(isCurvePoint);

/** Evaluates the fitted parabola so the smooth curve can be drawn between the measured points. */
export const sampleCompactionCurve = (fit: ProctorCurveFit, moistureRange: number[], samples = 40): ProctorCurvePoint[] =>
  sampleRange(moistureRange[0], moistureRange[1], samples).map((moisture) => ({
    moisture,
    dryDensity: fit.a * moisture * moisture + fit.b * moisture + fit.c,
  }));

const emptySummary = (): ProctorSummary => ({
  omc: null,
  mdd: null,
  bulkDensity: null,
  optimumSource: "none",
  curve: null,
  rSquared: null,
  pointCount: 0,
  warnings: [],
});

/** Flags the cases where BS 1377-4:1990, 3.3 would not accept the reported optimum at face value. */
const proctorWarnings = (points: ProctorCurvePoint[], fit: ProctorCurveFit | null, specificGravity: number | null): string[] => {
  const warnings: string[] = [];
  if (points.length < CURVE_RECOMMENDED_POINTS) {
    warnings.push(
      `Only ${points.length} moisture content${points.length === 1 ? "" : "s"} completed; BS 1377-4 expects at least ${CURVE_RECOMMENDED_POINTS} with the peak bracketed.`,
    );
  }
  const peakDryDensity = Math.max(...points.map((point) => point.dryDensity));
  const peakIndex = points.findIndex((point) => point.dryDensity === peakDryDensity);
  if (peakIndex === 0 || peakIndex === points.length - 1) {
    warnings.push("Maximum dry density sits on the outermost completed point, so the curve has not turned over and OMC/MDD are not reliable.");
  }
  if (points.length >= CURVE_MIN_POINTS && !fit) {
    warnings.push("A stable compaction curve could not be fitted; OMC and MDD are taken from the highest measured point.");
  }
  if (fit && fit.rSquared < CURVE_MIN_R_SQUARED) {
    warnings.push(`Curve fit is poor (R2 = ${fit.rSquared.toFixed(2)}); check the readings and that the points bracket the peak.`);
  }
  if (specificGravity !== null) {
    const aboveZeroAirVoids = points.filter((point) => {
      const limit = zeroAirVoidsDensity(specificGravity, point.moisture);
      return limit !== null && point.dryDensity > limit;
    }).length;
    if (aboveZeroAirVoids > 0) {
      warnings.push(
        `${aboveZeroAirVoids} point${aboveZeroAirVoids === 1 ? " plots" : "s plot"} above the zero air voids line, which no compacted soil can reach; check the masses or the specific gravity.`,
      );
    }
  }
  return warnings;
};


const normalizeEffort = (value: unknown, fallback: ProctorEffort): ProctorEffort => {
  const source = isObject(value) ? value : {};
  const field = (key: keyof ProctorEffort) => source[key] === undefined ? fallback[key] : readString(source[key]);
  return {
    layers: field("layers"),
    blowsPerLayer: field("blowsPerLayer"),
    rammerMass: field("rammerMass"),
    dropHeight: field("dropHeight"),
  };
};

const normalizeRows = (value: unknown, fallback: ProctorRow[]): ProctorRow[] => {
  if (!Array.isArray(value)) return fallback;
  const rows = value.map((item) => {
    const row = isObject(item) ? item : {};
    const legacySource = isObject(row.legacy) ? row.legacy : row;
    const legacy = {
      moisture: readString(legacySource.moisture),
      dryDensity: readString(legacySource.dryDensity),
    };
    const hasLegacyValues = legacy.moisture !== "" || legacy.dryDensity !== "";
    return {
      moistureAdded: readString(row.moistureAdded),
      mouldWetMass: readString(row.mouldWetMass),
      mouldTare: readString(row.mouldTare),
      containerNumber: readString(row.containerNumber),
      containerWetMass: readString(row.containerWetMass),
      containerDryMass: readString(row.containerDryMass),
      containerTare: readString(row.containerTare),
      ...(hasLegacyValues ? { legacy } : {}),
    };
  });
  return rows.length < 6 ? [...rows, ...createProctorRows().slice(0, 6 - rows.length)] : rows;
};

export const normalizeProctorRecord = (value: unknown, metadata: RecordMetadata = {}): ProctorRecord => {
  const source = isObject(value) ? value : {};
  const fallback = emptyProctorRecord(metadata);
  return {
    ...fallback,
    label: readString(source.label) || readString(source.sampleId) || fallback.label,
    sampleNumber: readString(source.sampleNumber) || fallback.sampleNumber,
    sampleDepthFrom: readString(source.sampleDepthFrom) || fallback.sampleDepthFrom,
    sampleDepthTo: readString(source.sampleDepthTo) || fallback.sampleDepthTo,
    sampledSubmittedBy: readString(source.sampledSubmittedBy) || fallback.sampledSubmittedBy,
    testedBy: readString(source.testedBy) || fallback.testedBy,
    dateSubmitted: readString(source.dateSubmitted) || fallback.dateSubmitted,
    dateTested: readString(source.dateTested) || fallback.dateTested,
    sampleNotes: readString(source.sampleNotes) || fallback.sampleNotes,
    type: source.type === "modified" ? "modified" : "standard",
    standardMouldVolume: readString(source.standardMouldVolume) || fallback.standardMouldVolume,
    modifiedMouldVolume: readString(source.modifiedMouldVolume) || fallback.modifiedMouldVolume,
    standardRows: normalizeRows(source.standardRows, fallback.standardRows),
    modifiedRows: normalizeRows(source.modifiedRows, fallback.modifiedRows),
    standardEffort: normalizeEffort(source.standardEffort, STANDARD_EFFORT),
    modifiedEffort: normalizeEffort(source.modifiedEffort, MODIFIED_EFFORT),
    specificGravity: readString(source.specificGravity),
    airVoidsTarget: readString(source.airVoidsTarget) || fallback.airVoidsTarget,
    oversizePercent: readString(source.oversizePercent),
    oversizeSpecificGravity: readString(source.oversizeSpecificGravity),
    fieldDryDensity: readString(source.fieldDryDensity),
    requiredRelativeCompaction: readString(source.requiredRelativeCompaction),
    reportedOmc: readString(source.reportedOmc),
    reportedMdd: readString(source.reportedMdd),
  };
};

export const getProctorRecord = (payload: unknown, metadata: RecordMetadata = {}): ProctorRecord => {
  let parsedPayload = payload;
  if (typeof payload === "string") {
    try {
      parsedPayload = JSON.parse(payload) as unknown;
    } catch {
      return emptyProctorRecord(metadata);
    }
  }
  if (!isObject(parsedPayload)) return emptyProctorRecord(metadata);
  const project = isObject(parsedPayload.project) ? parsedPayload.project : parsedPayload;
  const records = Array.isArray(project.records) ? project.records : [];
  return normalizeProctorRecord(records[0], metadata);
};

export const calculateProctorPoint = (row: ProctorRow, mouldVolume: string): ProctorPointCalculation => {
  // Only the five measured masses drive the calculation. "Moisture addition" and "Container No."
  // are recorded readings that feed no formula, so a blank in either must not blank the point.
  const hasRawValues = MEASUREMENT_FIELDS.some((field) => row[field].trim() !== "");

  const legacyCalculation = (): ProctorPointCalculation => {
    const moistureContent = row.legacy ? parseValue(row.legacy.moisture) : null;
    const dryDensity = row.legacy ? parseValue(row.legacy.dryDensity) : null;
    if (moistureContent === null || dryDensity === null || !Number.isFinite(moistureContent) || !Number.isFinite(dryDensity) || moistureContent < 0 || dryDensity <= 0) {
      return emptyCalculation();
    }
    return { ...emptyCalculation(), moistureContent, dryDensity };
  };

  if (!hasRawValues) return legacyCalculation();
  if (MEASUREMENT_FIELDS.some((field) => row[field].trim() === "")) return legacyCalculation();
  const volume = parseValue(mouldVolume);
  const moistureAdded = parseValue(row.moistureAdded);
  const mouldWetMass = parseValue(row.mouldWetMass);
  const mouldTare = parseValue(row.mouldTare);
  const containerWetMass = parseValue(row.containerWetMass);
  const containerDryMass = parseValue(row.containerDryMass);
  const containerTare = parseValue(row.containerTare);
  if (volume === null || !Number.isFinite(volume)) return emptyCalculation();
  if ([mouldWetMass, mouldTare, containerWetMass, containerDryMass, containerTare]
    .some((value) => value === null || !Number.isFinite(value))) {
    return emptyCalculation();
  }
  // The moisture addition is optional, but a negative volume of water added is not physical.
  if (moistureAdded !== null && (!Number.isFinite(moistureAdded) || moistureAdded < 0)) return emptyCalculation();

  const wetMaterialMass = mouldWetMass! - mouldTare!;
  const waterMass = containerWetMass! - containerDryMass!;
  const drySoilMass = containerDryMass! - containerTare!;
  if (volume! <= 0 || wetMaterialMass <= 0 || waterMass < 0 || drySoilMass <= 0) return emptyCalculation();

  const bulkDensity = (wetMaterialMass / volume!) * 1000;
  const moistureContent = (waterMass / drySoilMass) * 100;
  const dryDensity = bulkDensity / (1 + moistureContent / 100);
  return { wetMaterialMass, bulkDensity, waterMass, drySoilMass, moistureContent, dryDensity };
};

/** Only a bracketed fitted curve through enough points is reportable as complete (BS 1377-4:1990, 3.3). */
export const isReportableOptimum = (summary: ProctorSummary): boolean =>
  summary.optimumSource === "curve"
  && summary.pointCount >= CURVE_RECOMMENDED_POINTS
  && summary.rSquared !== null
  && summary.rSquared >= CURVE_MIN_R_SQUARED;

/**
 * Optimum moisture content and maximum dry density for one compaction method.
 *
 * BS 1377-4:1990, 3.3 determines these by drawing a smooth dry density/moisture content curve
 * through the plotted points and reading its peak. A least-squares parabola through the plotted
 * points estimates that peak; unsupported fits fall back to the densest measurement, and the
 * caller is told which basis was used plus any reason to distrust it.
 */
export const calculateProctor = (
  rows: ProctorRow[],
  mouldVolume: string,
  specificGravity: number | null = null,
): ProctorSummary => {
  const measured = rows
    .map((row) => calculateProctorPoint(row, mouldVolume))
    .filter((point): point is ProctorPointCalculation & { moistureContent: number; dryDensity: number } =>
      point.moistureContent !== null && point.dryDensity !== null);
  if (measured.length === 0) return emptySummary();

  const points: ProctorCurvePoint[] = measured
    .map((point) => ({ moisture: point.moistureContent, dryDensity: point.dryDensity }))
    .sort((a, b) => a.moisture - b.moisture);
  const fit = fitCompactionCurve(points);
  const warnings = proctorWarnings(points, fit, specificGravity);

  if (fit) {
    return {
      omc: fit.omc,
      mdd: fit.mdd,
      // rho_d = rho_bulk / (1 + w), so the bulk density on the fitted curve follows from the vertex.
      bulkDensity: fit.mdd * (1 + fit.omc / 100),
      optimumSource: "curve",
      curve: fit,
      rSquared: fit.rSquared,
      pointCount: points.length,
      warnings,
    };
  }

  const peak = points.reduce((max, point) => (point.dryDensity > max.dryDensity ? point : max), points[0]);
  const peakMeasurement = measured.reduce((max, point) => (point.dryDensity > max.dryDensity ? point : max), measured[0]);
  return {
    omc: peak.moisture,
    mdd: peak.dryDensity,
    bulkDensity: peakMeasurement.bulkDensity,
    optimumSource: "peak-point",
    curve: null,
    rSquared: null,
    pointCount: points.length,
    warnings,
  };
};

export const createProctorPayload = (
  project: { title: string; clientName: string; date: string },
  record: ProctorRecord,
  standard: ProctorSummary,
  modified: ProctorSummary,
): ProctorPayload => ({
  version: "2.0",
  project: { ...project, records: [record] },
  calculations: { standard, modified },
});
