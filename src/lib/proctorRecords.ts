import type { RecordMetadata } from "@/context/TestDataContext";

export interface ProctorRow {
  moisture: string;
  dryDensity: string;
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
  standardRows: ProctorRow[];
  modifiedRows: ProctorRow[];
}

export interface ProctorSummary {
  omc: number | null;
  mdd: number | null;
}

export interface ProctorPayload {
  version: "1.0";
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

export const createProctorRows = (): ProctorRow[] => Array.from({ length: 5 }, () => ({ moisture: "", dryDensity: "" }));

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
  standardRows: createProctorRows(),
  modifiedRows: createProctorRows(),
});

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const readString = (value: unknown) => typeof value === "string" ? value : value == null ? "" : String(value);

const normalizeRows = (value: unknown, fallback: ProctorRow[]): ProctorRow[] => {
  if (!Array.isArray(value)) return fallback;
  return value.map((row) => ({
    moisture: readString(isObject(row) ? row.moisture : ""),
    dryDensity: readString(isObject(row) ? row.dryDensity : ""),
  }));
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

export const calculateProctor = (rows: ProctorRow[]): ProctorSummary => {
  const points = rows
    .map((row) => ({ moisture: Number.parseFloat(row.moisture), dryDensity: Number.parseFloat(row.dryDensity) }))
    .filter((point) => Number.isFinite(point.moisture) && Number.isFinite(point.dryDensity));
  if (points.length === 0) return { omc: null, mdd: null };
  const optimum = points.reduce((max, point) => point.dryDensity > max.dryDensity ? point : max, points[0]);
  return { omc: optimum.moisture, mdd: optimum.dryDensity };
};

export const createProctorPayload = (
  project: { title: string; clientName: string; date: string },
  record: ProctorRecord,
  standard: ProctorSummary,
  modified: ProctorSummary,
): ProctorPayload => ({
  version: "1.0",
  project: { ...project, records: [record] },
  calculations: { standard, modified },
});
