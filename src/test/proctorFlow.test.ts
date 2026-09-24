import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearProctorResults, loadProctorResult, saveProctorResult } from "@/lib/proctorPersistence";
import { calculateProctor, createProctorPayload, emptyProctorRecord, getProctorRecord } from "@/lib/proctorRecords";
import { getExpectedTestType, hasRequiredSoilSampleMetadata, isInitialTestValid, isTestAllowed, toRecordMetadata } from "@/lib/recordTestWizard";

const apiState = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  nextId: 1,
}));

vi.mock("@/lib/api", () => ({
  listRecords: vi.fn(async () => ({ data: apiState.rows })),
  createRecord: vi.fn(async (_table: string, data: Record<string, unknown>) => {
    const row = { ...data, id: apiState.nextId++ };
    apiState.rows.push(row);
    return { data: row, id: row.id };
  }),
  updateRecord: vi.fn(async (_table: string, id: number, data: Record<string, unknown>) => {
    const rowIndex = apiState.rows.findIndex((row) => row.id === id);
    const row = { ...apiState.rows[rowIndex], ...data };
    apiState.rows[rowIndex] = row;
    return { data: row, id };
  }),
  deleteRecord: vi.fn(async (_table: string, id: number) => {
    apiState.rows = apiState.rows.filter((row) => row.id !== id);
    return { deleted: true };
  }),
}));

const completeSample = {
  sampleId: "BH-04",
  sampleNo: "2",
  sampleDepthFrom: "18.2",
  sampleDepthTo: "20.0",
  sampledSubmittedBy: "J. Doe",
  sampleDateSubmitted: "2025-01-10",
  sampleDateTested: "2025-01-12",
  sampleNotes: "Brown clay",
};

const createPayload = (sampleId: string) => {
  const record = {
    ...emptyProctorRecord({ sampleId, sampleNumber: "2", sampleDepthFrom: "18.2", sampleDepthTo: "20.0" }),
    standardRows: [
      { moisture: "8", dryDensity: "1800" },
      { moisture: "10", dryDensity: "1950" },
    ],
    modifiedRows: [
      { moisture: "7", dryDensity: "2000" },
      { moisture: "9", dryDensity: "2100" },
    ],
  };
  return createProctorPayload(
    { title: "Test Project", clientName: "Test Client", date: "2025-01-01" },
    record,
    calculateProctor(record.standardRows),
    calculateProctor(record.modifiedRows),
  );
};

beforeEach(() => {
  apiState.rows = [];
  apiState.nextId = 1;
});

describe("Proctor wizard flow", () => {
  it("allows the enabled Proctor option only for soil and maps it to its own project type", () => {
    expect(isTestAllowed("soil", "proctor")).toBe(true);
    expect(isTestAllowed("concrete", "proctor")).toBe(false);
    expect(isInitialTestValid("soil", "proctor", true, true)).toBe(true);
    expect(isInitialTestValid("soil", "proctor", false, true)).toBe(false);
    expect(getExpectedTestType("proctor")).toBe("proctor");
  });

  it("requires PSD-equivalent sample details and transfers them to record metadata", () => {
    expect(hasRequiredSoilSampleMetadata({ ...completeSample, sampleNo: " " })).toBe(false);
    expect(hasRequiredSoilSampleMetadata(completeSample)).toBe(true);
    expect(toRecordMetadata(completeSample)).toEqual({
      sampleId: "BH-04",
      sampleNumber: "2",
      sampleDepthFrom: "18.2",
      sampleDepthTo: "20.0",
      sampledSubmittedBy: "J. Doe",
      sampleNotes: "Brown clay",
      dateSubmitted: "2025-01-10",
      dateTested: "2025-01-12",
      testedBy: "J. Doe",
    });
  });
});

describe("Proctor results", () => {
  it("calculates optimum moisture and maximum dry density from complete points", () => {
    expect(calculateProctor([
      { moisture: "8", dryDensity: "1800" },
      { moisture: "10", dryDensity: "1950" },
      { moisture: "", dryDensity: "2200" },
    ])).toEqual({ omc: 10, mdd: 1950 });
    expect(calculateProctor([{ moisture: "", dryDensity: "" }])).toEqual({ omc: null, mdd: null });
  });

  it("round-trips both methods and keeps the sample display convention", () => {
    const payload = createPayload("BH-04");
    const loaded = getProctorRecord(JSON.stringify(payload));
    expect(payload.version).toBe("1.0");
    expect(payload.project.records[0].label).toBe("BH-04");
    expect(loaded.standardRows).toEqual(payload.project.records[0].standardRows);
    expect(loaded.modifiedRows).toEqual(payload.project.records[0].modifiedRows);
    expect(payload.calculations).toEqual({
      standard: { omc: 10, mdd: 1950 },
      modified: { omc: 9, mdd: 2100 },
    });
  });

  it("creates once, updates subsequent saves, and scopes load and clear by project", async () => {
    const firstPayload = createPayload("BH-04");
    const recordId = await saveProctorResult(10, null, {
      test_key: "proctor",
      category: "soil",
      payload_json: firstPayload,
    });

    expect(recordId).toBe(1);
    expect(await loadProctorResult(10)).toMatchObject({ id: 1, project_id: 10, test_key: "proctor" });

    const secondPayload = createPayload("BH-05");
    const updatedId = await saveProctorResult(10, recordId, {
      test_key: "proctor",
      category: "soil",
      payload_json: secondPayload,
    });

    expect(updatedId).toBe(recordId);
    expect(apiState.rows).toHaveLength(1);
    expect(await loadProctorResult(20)).toBeNull();

    apiState.rows.push({ id: 2, project_id: 20, test_key: "proctor" });
    apiState.rows.push({ id: 3, project_id: 10, test_key: "grading" });
    await clearProctorResults(10);
    expect(apiState.rows.map((row) => [row.project_id, row.test_key])).toEqual([[20, "proctor"], [10, "grading"]]);
  });
});
