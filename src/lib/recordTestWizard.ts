import type { RecordMetadata } from "@/context/TestDataContext";

export type Material = "soil" | "concrete" | "rock" | "special";

const ALLOWED_TEST_KEYS: Partial<Record<Material, ReadonlySet<string>>> = {
  soil: new Set(["atterberg", "grading", "proctor", "cpt", "spt", "cbr", "shear", "consolidation", "schmidt"]),
  concrete: new Set(["compressive", "slump", "upvt", "schmidt", "ndt"]),
  rock: new Set(["coring", "ucs", "pointload", "porosity", "schmidt", "schmidt_rock", "ndt"]),
  special: new Set(["dcp"]),
};

export const isTestAllowed = (material: Material | null, testKey: string): boolean => {
  if (!material) return false;
  const allowedKeys = ALLOWED_TEST_KEYS[material];
  return allowedKeys === undefined || allowedKeys.has(testKey);
};

export const isInitialTestValid = (material: Material | null, testKey: string | null, enabled: boolean, registered: boolean): boolean =>
  !!material && !!testKey && enabled && registered && isTestAllowed(material, testKey);

export const getExpectedTestType = (testKey: string | null): string | null => {
  if (testKey === "atterberg") return "atterberg";
  if (testKey === "grading") return "grading";
  if (testKey === "proctor") return "proctor";
  if (testKey === "compressive") return "compressive";
  if (testKey === "spt") return "spt";
  if (testKey === "cpt") return "cpt";
  if (testKey === "slump") return "concrete";
  if (testKey === "schmidt") return "concrete";
  if (testKey === "ucs") return "rock";
  if (testKey === "pointload") return "rock";
  if (testKey === "ndt") return "rock";
  if (testKey === "cbr") return "soil";
  if (testKey === "shear") return "soil";
  if (testKey === "consolidation") return "soil";
  if (testKey === "upvt") return "concrete";
  if (testKey === "coring") return "rock";
  if (testKey === "porosity") return "rock";
  if (testKey === "schmidt_rock") return "rock";
  if (testKey === "dcp") return "special";
  return null;
};

export interface SoilSampleMetadataInput {
  sampleId: string;
  sampleNo: string;
  sampleDepthFrom: string;
  sampleDepthTo: string;
  sampledSubmittedBy: string;
  sampleDateSubmitted: string;
  sampleDateTested: string;
  sampleNotes: string;
}

export const hasRequiredSoilSampleMetadata = (sample: SoilSampleMetadataInput): boolean =>
  sample.sampleId.trim().length > 0
  && sample.sampleNo.trim().length > 0
  && sample.sampleDepthFrom.trim().length > 0
  && sample.sampleDepthTo.trim().length > 0
  && sample.sampledSubmittedBy.trim().length > 0
  && sample.sampleDateSubmitted.trim().length > 0
  && sample.sampleDateTested.trim().length > 0;

export const toRecordMetadata = (sample: SoilSampleMetadataInput): RecordMetadata => ({
  sampleId: sample.sampleId,
  sampleNumber: sample.sampleNo,
  sampleDepthFrom: sample.sampleDepthFrom,
  sampleDepthTo: sample.sampleDepthTo,
  sampledSubmittedBy: sample.sampledSubmittedBy,
  sampleNotes: sample.sampleNotes,
  dateSubmitted: sample.sampleDateSubmitted,
  dateTested: sample.sampleDateTested,
  testedBy: sample.sampledSubmittedBy,
});
