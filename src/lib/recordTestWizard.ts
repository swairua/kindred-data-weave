import type { RecordMetadata } from "@/context/TestDataContext";

export type Material = "soil" | "concrete" | "rock" | "special";

/**
 * The tests offered under each material.
 *
 * This mirrors the catalogue held in `test_definitions`: only these tests are
 * selectable, and a test is only offered under the material it belongs to.
 */
export const ALLOWED_TEST_KEYS: Partial<Record<Material, ReadonlySet<string>>> = {
  soil: new Set(["atterberg", "grading", "proctor", "spt", "cpt"]),
  concrete: new Set(["compressive", "slump", "ndt", "coring"]),
  rock: new Set(["schmidt_rock", "ucs", "pointload"]),
  special: new Set(),
};

export const isTestAllowed = (material: Material | null, testKey: string): boolean => {
  if (!material) return false;
  const allowedKeys = ALLOWED_TEST_KEYS[material];
  return allowedKeys === undefined || allowedKeys.has(testKey);
};

export const isInitialTestValid = (material: Material | null, testKey: string | null, enabled: boolean, registered: boolean): boolean =>
  !!material && !!testKey && enabled && registered && isTestAllowed(material, testKey);

/**
 * The project `test_type` a test records against.
 *
 * A project stores the test it belongs to (e.g. "coring"), so the wizard can
 * list the matching projects when a test is picked.
 */
export const getExpectedTestType = (testKey: string | null): string | null => {
  if (!testKey) return null;
  if (ALLOWED_TEST_KEYS.soil?.has(testKey)) return testKey;
  if (ALLOWED_TEST_KEYS.concrete?.has(testKey)) return testKey;
  if (ALLOWED_TEST_KEYS.rock?.has(testKey)) return testKey;
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
