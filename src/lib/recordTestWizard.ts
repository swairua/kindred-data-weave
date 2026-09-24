import type { RecordMetadata } from "@/context/TestDataContext";

export type Material = "soil" | "concrete" | "rock" | "special";

const ALLOWED_TEST_KEYS: Partial<Record<Material, ReadonlySet<string>>> = {
  soil: new Set(["atterberg", "grading", "proctor"]),
  concrete: new Set(["compressive"]),
  rock: new Set(),
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
