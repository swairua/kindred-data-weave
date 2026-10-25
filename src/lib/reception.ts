/**
 * Shared acknowledgement + helpers for the sample-reception flow in compress/.
 *
 * The three mockups describe one pipeline: Log a consignment (wizard) ->
 * Sample reception (dashboard) -> Sample receipt acknowledgement (print).
 * Reception has no backend tables yet, so consignments persist through
 * `listReceptionConsignments` / `saveReceptionConsignment` (server row when
 * the table ships, localStorage until then). This module owns the pure,
 * unit-testable half: numbering, hold gating and due-date maths.
 */

/** Sample condition chips exactly as shown on the log-a-consignment grid. */
export type ReceptionCondition = "Intact" | "Disturbed" | "Seal broken" | "Too little";

export interface ReceptionSampleInput {
  labId: string;
  clientMark: string;
  location: string;
  depthLabel: string;
  sampleType: string;
  container: string;
  massKg: string;
  condition: ReceptionCondition;
  onHoldReason?: string;
  tests: string[];
  customFields?: { key: string; value: string }[];
}

/** Area where a custom field or photo applies. */
export type ReceptionFieldArea = 'consignment' | 'transport' | 'sample' | 'tests';

export interface ReceptionFieldDefinition {
  id: number;
  area: ReceptionFieldArea;
  fieldKey: string;
  label: string;
  valueType: 'text' | 'number' | 'date' | 'select';
  options?: string[];
  sortOrder: number;
  isRequired: boolean;
  isActive: boolean;
}

export interface ReceptionPhoto {
  id: number;
  rcNo: string;
  filePath: string;
  originalFilename?: string;
  fileSize?: number;
  mimeType?: string;
  caption?: string;
  uploadedBy?: number;
  createdAt?: string;
}

export interface ReceptionConsignmentInput {
  rcNo: string;
  jobNo: string;
  client: string;
  project: string;
  clientRef: string;
  deliveredBy: string;
  vehicleReg: string;
  receivedAt: string;
  methodSet: string;
  receivedBy: string;
  storagePlan: string;
  status: "draft" | "logged" | "on-hold" | "in-testing" | "processed";
  samples: ReceptionSampleInput[];
  /** Transport checks ticked on receipt ("Cool box used for U100s", …). */
  transportChecks?: {
    coolBox?: boolean;
    tubesUpright?: boolean;
    fieldLog?: boolean;
  };
  /** User-defined custom fields per area. Stored inside payload_json keyed by field_key. */
  customFields?: { key: string; value: string }[];            // consignment-level fields
  transportCustomFields?: { key: string; value: string }[];   // transport-check fields
  testCustomFields?: { key: string; value: string }[];
  /** Attached photos of the consignment (replaces the old photosCount counter). */
  photos?: ReceptionPhoto[];
  /** Date the cubes in this consignment were cast — drives the crushing due dates. */
  cubeCastDate?: string;
  /** Linked project ID(s) created from this reception. */
  projectId?: number | null;
  projectIds?: number[];
  /** When the reception was processed into project(s). */
  processedAt?: string | null;
}

/** Test-code columns of the "Tests requested" matrix. */
export const RECEPTION_TEST_CODES = [
  "MC",
  "PSD",
  "HYD",
  "ATT",
  "CMP",
  "CBR",
  "UU",
  "CON",
  "CHEM",
] as const;

export type ReceptionTestCode = (typeof RECEPTION_TEST_CODES)[number];

/** Sample conditions that force the sample (and its tests) onto hold. */
export const HOLD_CONDITIONS: ReceptionCondition[] = ["Seal broken", "Too little"];

export const isSampleOnHold = (condition: string): boolean =>
  (HOLD_CONDITIONS as string[]).includes(condition);

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Next sequential Lab ID for a job, e.g. `26-0418/06`.
 * Existing ids are scanned for the `/NN` suffix; gaps are not reused.
 */
export const nextLabId = (jobNo: string, existing: string[]): string => {
  let max = 0;
  for (const id of existing) {
    const match = new RegExp(`^${escapeRegExp(jobNo)}/(\\d+)$`).exec(id.trim());
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `${jobNo}/${String(max + 1).padStart(2, "0")}`;
};

/** Next sequential consignment number, e.g. `RC-26-0419`. */
export const nextRcNo = (existing: string[]): string => {
  let max = 0;
  let prefix = "RC-26";
  for (const rc of existing) {
    const match = /^RC-(\d+)-(\d+)$/.exec(rc.trim());
    if (match) {
      prefix = `RC-${match[1]}`;
      max = Math.max(max, Number(match[2]));
    }
  }
  return `${prefix}-${String(max + 1).padStart(4, "0")}`;
};

/** Count held samples / requested tests for the summary rail. */
export const receptionSummary = (samples: ReceptionSampleInput[]) => {
  const onHold = samples.filter((s) => isSampleOnHold(s.condition)).length;
  const tests = samples.reduce((n, s) => n + s.tests.length, 0);
  const heldTests = samples
    .filter((s) => isSampleOnHold(s.condition))
    .reduce((n, s) => n + s.tests.length, 0);
  return { samples: samples.length, tests, onHold, heldTests };
};

/**
 * Cube crushing due dates computed from the cast date, as shown on the
 * reception dashboard ("Cubes due for crushing"). Standard 7- and 28-day breaks.
 */
export const cubeDueDates = (dateOfCast: string): { sevenDay: string | null; twentyEightDay: string | null } => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateOfCast.trim());
  if (!match) return { sevenDay: null, twentyEightDay: null };
  const base = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(base.getTime())) return { sevenDay: null, twentyEightDay: null };
  const iso = (days: number) => {
    const d = new Date(base);
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  return { sevenDay: iso(7), twentyEightDay: iso(28) };
};

/** A blank grid row with the next Lab ID filled in. */
export const emptyReceptionSample = (labId: string): ReceptionSampleInput => ({
  labId,
  clientMark: "",
  location: "",
  depthLabel: "",
  sampleType: "",
  container: "",
  massKg: "",
  condition: "Intact",
  tests: [],
});

/** A blank consignment draft matching the wizard defaults. */
export const emptyReceptionConsignment = (rcNo: string): ReceptionConsignmentInput => ({
  rcNo,
  jobNo: "",
  client: "",
  project: "",
  clientRef: "",
  deliveredBy: "",
  vehicleReg: "",
  receivedAt: new Date().toISOString().slice(0, 16),
  methodSet: "BS 1377-2:2022",
  receivedBy: "",
  storagePlan: "Auto by type",
  status: "draft",
  samples: [],
  customFields: [],
  transportCustomFields: [],
  photos: [],
});

/** Short description of a sample type, as shown under the type on the samples grid. */
export const SAMPLE_TYPE_NOTES: Record<string, string> = {
  "Disturbed bulk": "Heavy-duty bag",
  "Undisturbed U100": "U100 tube, waxed & capped",
  "SPT split-spoon": "Jar, sealed",
  Groundwater: "1 L bottle",
  "Concrete cube": "150 mm cube",
};

/** The type/container pair used when a sample type is chosen on the grid. */
export const SAMPLE_TYPE_CONTAINERS: Record<string, string> = {
  "Disturbed bulk": "Heavy-duty bag",
  "Undisturbed U100": "U100 tube, waxed & capped",
  "SPT split-spoon": "Jar, sealed",
  Groundwater: "1 L bottle",
  "Concrete cube": "150 mm cube",
};

/** Short tag shown next to the Lab ID on the tests-requested matrix. */
export const sampleTypeTag = (sampleType: string): string => {
  const trimmed = sampleType.trim();
  if (!trimmed) return "Sample";
  if (trimmed === "Undisturbed U100") return "U100";
  if (trimmed === "SPT split-spoon") return "SPT";
  if (trimmed === "Disturbed bulk") return "Bulk";
  if (trimmed === "Groundwater") return "Water";
  if (trimmed === "Concrete cube") return "Cube";
  return trimmed;
};

/** Human-readable consignment status, matching the dashboard status pills. */
export const RECEPTION_STATUS_LABELS: Record<ReceptionConsignmentInput["status"], string> = {
  draft: "To log",
  logged: "Logged",
  "on-hold": "On hold",
  "in-testing": "In testing",
  processed: "Processed",
};

/**
 * A consignment is on hold when any of its samples failed the intake condition.
 * Drafts are never on hold — they have not been received yet.
 */
export const consignmentIsOnHold = (consignment: ReceptionConsignmentInput): boolean =>
  consignment.samples.some((s) => isSampleOnHold(s.condition));

/**
 * Derive the consignment status from its samples. A consignment with a held
 * sample is "on hold"; one that has been received is "logged"; drafts stay drafts.
 */
export const deriveConsignmentStatus = (
  consignment: ReceptionConsignmentInput,
): ReceptionConsignmentInput["status"] => {
  if (consignment.status === "draft") return "draft";
  if (consignmentIsOnHold(consignment)) return "on-hold";
  return "logged";
};

/** Material column of the dashboard table, derived from the sample types. */
export const consignmentMaterial = (consignment: ReceptionConsignmentInput): string => {
  const types = new Set<string>();
  for (const sample of consignment.samples) {
    const tag = sampleTypeTag(sample.sampleType);
    if (tag !== "Sample") types.add(tag);
  }
  if (types.size === 0) return "—";
  if (types.has("Cube")) return "Concrete cubes 150 mm";
  const hasWater = types.has("Water");
  const rest = Array.from(types)
    .filter((tag) => tag !== "Water")
    .map((tag) => (tag === "Bulk" ? "bulk" : tag));
  const body = rest.join(", ");
  if (hasWater && body) return `Soil: ${body}; water`;
  if (hasWater) return "Soil: water";
  return `Soil: ${body}`;
};

/** Material column of the dashboard table, derived from the sample types. */
export const receptionTestCodeToTestType = (code: string): "compressive" | "atterberg" | "grading" | "proctor" | null => {
  switch (code) {
    case "CMP":
      return "compressive";
    case "ATT":
    case "UU":
    case "CON":
      return "atterberg";
    case "PSD":
    case "HYD":
    case "CBR":
    case "CHEM":
      return "grading";
    case "MC":
      return "grading";
    default:
      return null;
  }
};

export const getTestTypesFromConsignment = (consignment: ReceptionConsignmentInput): Set<string> => {
  const types = new Set<string>();
  for (const sample of consignment.samples || []) {
    for (const code of sample.tests || []) {
      const t = receptionTestCodeToTestType(code);
      if (t) types.add(t);
    }
  }
  return types;
};

export const getPrimaryTestTypeFromConsignment = (consignment: ReceptionConsignmentInput): string => {
  const codes = new Set<string>();
  for (const sample of consignment.samples || []) {
    for (const code of sample.tests || []) {
      codes.add(code);
    }
  }
  if (codes.has("CMP")) return "compressive";
  if (codes.has("ATT") || codes.has("UU") || codes.has("CON")) return "atterberg";
  if (codes.has("PSD") || codes.has("HYD") || codes.has("CBR") || codes.has("CHEM") || codes.has("MC")) return "grading";
  return "atterberg";
};
