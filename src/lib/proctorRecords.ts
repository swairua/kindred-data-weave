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

export interface ProctorRecord {
  label: string;
  sampleNumber: string;
  sampleDepthFrom: string;
  sampleDepthTo: string;
  sampledSubmittedBy: string;
  dateSubmitted: string;
  dateTested: string;
  sampleNotes: string;
  type: ProctorMethod;
  standardMouldVolume: string;
  modifiedMouldVolume: string;
  standardRows: ProctorRow[];
  modifiedRows: ProctorRow[];
}

export interface ProctorPointCalculation {
  wetMaterialMass: number | null;
  bulkDensity: number | null;
  waterMass: number | null;
  drySoilMass: number | null;
  moistureContent: number | null;
  dryDensity: number | null;
}

export interface ProctorSummary {
  omc: number | null;
  mdd: number | null;
  bulkDensity: number | null;
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

export const emptyProctorRecord = (metadata: RecordMetadata = {}): ProctorRecord => ({
  label: metadata.sampleId || "",
  sampleNumber: metadata.sampleNumber || "",
  sampleDepthFrom: metadata.sampleDepthFrom || "",
  sampleDepthTo: metadata.sampleDepthTo || "",
  sampledSubmittedBy: metadata.sampledSubmittedBy || metadata.testedBy || "",
  dateSubmitted: metadata.dateSubmitted || "",
  dateTested: metadata.dateTested || "",
  sampleNotes: metadata.sampleNotes || "",
  type: "standard",
  standardMouldVolume: "",
  modifiedMouldVolume: "",
  standardRows: createProctorRows(),
  modifiedRows: createProctorRows(),
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
    sampledSubmittedBy: readString(source.sampledSubmittedBy) || readString(source.testedBy) || fallback.sampledSubmittedBy,
    dateSubmitted: readString(source.dateSubmitted) || fallback.dateSubmitted,
    dateTested: readString(source.dateTested) || fallback.dateTested,
    sampleNotes: readString(source.sampleNotes) || fallback.sampleNotes,
    type: source.type === "modified" ? "modified" : "standard",
    standardMouldVolume: readString(source.standardMouldVolume),
    modifiedMouldVolume: readString(source.modifiedMouldVolume),
    standardRows: normalizeRows(source.standardRows, fallback.standardRows),
    modifiedRows: normalizeRows(source.modifiedRows, fallback.modifiedRows),
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
  const rawFields = [
    row.moistureAdded,
    row.mouldWetMass,
    row.mouldTare,
    row.containerNumber,
    row.containerWetMass,
    row.containerDryMass,
    row.containerTare,
  ];
  const hasRawValues = rawFields.some((value) => value.trim() !== "");

  const legacyCalculation = (): ProctorPointCalculation => {
    const moistureContent = row.legacy ? parseValue(row.legacy.moisture) : null;
    const dryDensity = row.legacy ? parseValue(row.legacy.dryDensity) : null;
    if (moistureContent === null || dryDensity === null || !Number.isFinite(moistureContent) || !Number.isFinite(dryDensity) || moistureContent < 0 || dryDensity <= 0) {
      return emptyCalculation();
    }
    return { ...emptyCalculation(), moistureContent, dryDensity };
  };

  if (!hasRawValues) return legacyCalculation();
  if (rawFields.some((value) => value.trim() === "")) return legacyCalculation();
  const volume = parseValue(mouldVolume);
  const moistureAdded = parseValue(row.moistureAdded);
  const mouldWetMass = parseValue(row.mouldWetMass);
  const mouldTare = parseValue(row.mouldTare);
  const containerWetMass = parseValue(row.containerWetMass);
  const containerDryMass = parseValue(row.containerDryMass);
  const containerTare = parseValue(row.containerTare);
  if ([volume, moistureAdded, mouldWetMass, mouldTare, containerWetMass, containerDryMass, containerTare].some((value) => value === null || !Number.isFinite(value))) {
    return emptyCalculation();
  }

  const wetMaterialMass = mouldWetMass! - mouldTare!;
  const waterMass = containerWetMass! - containerDryMass!;
  const drySoilMass = containerDryMass! - containerTare!;
  if (volume! <= 0 || moistureAdded! < 0 || wetMaterialMass <= 0 || waterMass < 0 || drySoilMass <= 0) return emptyCalculation();

  const bulkDensity = (wetMaterialMass / volume!) * 1000;
  const moistureContent = (waterMass / drySoilMass) * 100;
  const dryDensity = bulkDensity / (1 + moistureContent / 100);
  return { wetMaterialMass, bulkDensity, waterMass, drySoilMass, moistureContent, dryDensity };
};

export const calculateProctor = (rows: ProctorRow[], mouldVolume: string): ProctorSummary => {
  const points = rows
    .map((row) => calculateProctorPoint(row, mouldVolume))
    .filter((point) => point.moistureContent !== null && point.dryDensity !== null);
  if (points.length === 0) return { omc: null, mdd: null, bulkDensity: null };
  const optimum = points.reduce((max, point) => point.dryDensity! > max.dryDensity! ? point : max, points[0]);
  return { omc: optimum.moistureContent, mdd: optimum.dryDensity, bulkDensity: optimum.bulkDensity };
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
