import { describe, it, expect } from "vitest";
import {
  collectSamples,
  selectSampleRows,
  assembleRecords,
  readSampleRecords,
  type TestResultSampleRow,
} from "@/lib/testResultSamples";

/**
 * These cover the three database states the app can be in:
 *
 *   before    one row per (project, test_key), no sample_key column
 *   during    the legacy project row and the new per-sample rows coexist
 *   after     one row per sample
 */

const record = (id: string, label: string, sampleNumber: string) => ({
  id: `record-${id}`,
  title: "Record",
  label,
  note: "",
  isExpanded: false,
  tests: [],
  results: {},
  sampleNumber,
});

const payload = (records: unknown[], title = "PROJECT") => ({
  exportDate: "2026-09-26T00:00:00.000Z",
  version: "3.0",
  project: { title, projectName: title, clientName: "AHP", date: "2026-06-12", records },
});

/** Project 19 really does hold 13 samples shaped like this: BH01/BH1/BH01 ... */
const project19Records = [
  record("a", "BH01", "0.0-3.0"),
  record("b", "BH1", "3.0-7.5"),
  record("c", "BH01", "7.5-10.0"),
  record("d", "BH2", "0.0-3.0"),
  record("e", "BH02", "3.0-9.0"),
  record("f", "BH02", "9.0-10.0"),
  record("g", "BH03", "0.0-3.0"),
  record("h", "BH03", "3.0-4.5"),
  record("i", "BH03", "4.50-7.50"),
  record("j", "BH 03", "7.50-10.0"),
  record("k", "BH04", "0.0-6.0"),
  record("l", "BH04", "6.0-9.0"),
  record("m", "BH04", "9.0-10"),
];

const legacyRow = (id: number | string, projectId: number | string, records: unknown[]): TestResultSampleRow => ({
  id,
  project_id: projectId,
  test_key: "atterberg",
  name: "PROJECT",
  category: "soil",
  project_name: "PROJECT",
  updated_at: "2026-06-12 10:00:00",
  payload_json: payload(records),
});

const sampleRow = (
  id: number | string,
  projectId: number | string,
  rec: ReturnType<typeof record>,
  order: number,
): TestResultSampleRow => ({
  id,
  project_id: projectId,
  test_key: "atterberg",
  sample_key: rec.id,
  sample_label: rec.label,
  sample_depth: rec.sampleNumber,
  sort_order: order,
  name: "PROJECT",
  category: "soil",
  project_name: "PROJECT",
  updated_at: "2026-06-12 10:00:00",
  payload_json: payload([rec]),
});

describe("readSampleRecords", () => {
  it("returns an array for the wrapped project payload", () => {
    expect(readSampleRecords(legacyRow(1, 19, project19Records))).toHaveLength(13);
  });

  it("returns an empty array when the payload is missing or has no records", () => {
    expect(readSampleRecords({ id: 1, project_id: 1, test_key: "atterberg" })).toEqual([]);
    expect(readSampleRecords({ id: 1, project_id: 1, test_key: "atterberg", payload_json: null })).toEqual([]);
    expect(readSampleRecords({ id: 1, project_id: 1, test_key: "atterberg", payload_json: { project: {} } })).toEqual([]);
  });
});

describe("before the migration - one row per pair", () => {
  it("expands a project row into one sample per record", () => {
    const samples = collectSamples([legacyRow(103, 19, project19Records)]);
    expect(samples).toHaveLength(13);
    expect(samples.map((s) => s.label)).toEqual([
      "BH01", "BH1", "BH01", "BH2", "BH02", "BH02",
      "BH03", "BH03", "BH03", "BH 03", "BH04", "BH04", "BH04",
    ]);
  });

  it("keeps label and depth so repeated boreholes stay distinguishable", () => {
    const samples = collectSamples([legacyRow(103, 19, project19Records)]);
    const bh01 = samples.filter((s) => s.label === "BH01");
    expect(bh01.map((s) => s.depth)).toEqual(["0.0-3.0", "7.5-10.0"]);
  });

  it("falls back to the record's own id when there is no sample_key column", () => {
    const samples = collectSamples([legacyRow(103, 19, project19Records)]);
    expect(samples[0].sampleKey).toBe("record-a");
    expect(samples[0].resultId).toBe(103);
  });

  it("keeps one sample for a single-sample test", () => {
    const rows = [{ ...legacyRow(88, 42, [record("z", "TP01", "0.0-1.5")]), test_key: "grading" }];
    expect(collectSamples(rows)).toHaveLength(1);
  });
});

describe("during the migration - legacy row alongside sample rows", () => {
  it("ignores the legacy row so samples are not counted twice", () => {
    const rows = [
      sampleRow(201, 19, project19Records[0], 0),
      sampleRow(202, 19, project19Records[1], 1),
      sampleRow(203, 19, project19Records[2], 2),
      legacyRow(103, 19, project19Records),
    ];
    const samples = collectSamples(rows);
    expect(samples).toHaveLength(3);
    expect(samples.map((s) => s.sampleKey)).toEqual(["record-a", "record-b", "record-c"]);
  });

  it("uses the sample columns in preference to the record fields", () => {
    const rows = [sampleRow(201, 19, project19Records[0], 0), legacyRow(103, 19, project19Records)];
    const [first] = collectSamples(rows);
    expect(first.label).toBe("BH01");
    expect(first.depth).toBe("0.0-3.0");
  });
});

describe("after the migration - one row per sample", () => {
  const rows = project19Records.map((rec, index) => sampleRow(300 + index, 19, rec, index));

  it("returns one sample per row", () => {
    expect(collectSamples(rows)).toHaveLength(13);
  });

  it("orders samples by sort_order, not by row id", () => {
    const shuffled = [rows[5], rows[0], rows[9], rows[2]];
    expect(assembleRecords(shuffled).map((r) => r.id)).toEqual([
      "record-a", "record-c", "record-f", "record-j",
    ]);
  });

  it("targets the exact row for Open", () => {
    const samples = collectSamples(rows);
    expect(samples[7].resultId).toBe(307);
    expect(samples[7].sampleKey).toBe("record-h");
  });
});

describe("duplicate rows that older databases accumulated", () => {
  it("keeps only the newest row for a sample", () => {
    const older = { ...sampleRow(400, 19, project19Records[0], 0), updated_at: "2026-05-01 09:00:00" };
    const newer = { ...sampleRow(401, 19, project19Records[0], 0), updated_at: "2026-06-12 10:00:00" };
    const selected = selectSampleRows([newer, older]);
    expect(selected).toHaveLength(1);
    expect(selected[0].id).toBe(401);
  });

  it("prefers a usable row over one whose first record is null", () => {
    const blank = { ...sampleRow(500, 19, project19Records[0], 0), payload_json: payload([null]) };
    const good = sampleRow(501, 19, project19Records[0], 0);
    const selected = selectSampleRows([blank, good]);
    expect(selected).toHaveLength(1);
    expect(selected[0].id).toBe(501);
  });

  it("falls back to the blank row when nothing else exists", () => {
    const blank = { ...sampleRow(500, 19, project19Records[0], 0), payload_json: payload([null]) };
    expect(selectSampleRows([blank])).toHaveLength(1);
  });
});

describe("ids arriving as strings", () => {
  // api.php returns every non-JSON column as a string because it does not set
  // MYSQLI_OPT_INT_AND_FLOAT_NATIVE. A strict numeric guard here silently renders
  // an empty table, so these must be accepted and grouped identically.
  it("accepts string ids instead of dropping the rows", () => {
    const rows = [
      { ...legacyRow("88", 42, [record("a", "TP01", "0.0-1.5")]) },
      { ...legacyRow("90", 42, [record("b", "TP02", "1.5-3.0")]) },
    ];
    expect(collectSamples(rows)).toHaveLength(1);
    expect(collectSamples(rows)[0].resultId).toBe(90);
  });

  it("groups mixed string and numeric project ids together", () => {
    const rows = [
      { ...sampleRow(1, "19", project19Records[0], 0) },
      { ...sampleRow(2, 19, project19Records[1], 1) },
    ];
    expect(collectSamples(rows)).toHaveLength(2);
  });

  it("still skips rows whose id is not a number", () => {
    const rows = [
      { ...sampleRow(1, 19, project19Records[0], 0), id: "not-an-id" },
      sampleRow(2, 19, project19Records[1], 1),
    ];
    expect(collectSamples(rows)).toHaveLength(1);
  });
});

describe("several projects at once", () => {
  it("keeps each project's samples separate", () => {
    const rows = [
      sampleRow(601, 19, project19Records[0], 0),
      sampleRow(602, 19, project19Records[1], 1),
      sampleRow(603, 14, project19Records[0], 0),
      sampleRow(604, 14, project19Records[3], 1),
    ];
    const samples = collectSamples(rows);
    expect(samples).toHaveLength(4);
    expect(samples.filter((s) => s.row.project_id === 19)).toHaveLength(2);
    expect(samples.filter((s) => s.row.project_id === 14)).toHaveLength(2);
  });

  it("does not merge a different test_key into the same pair", () => {
    const rows = [
      sampleRow(701, 19, project19Records[0], 0),
      { ...sampleRow(702, 19, project19Records[1], 0), test_key: "grading" },
    ];
    expect(collectSamples(rows)).toHaveLength(2);
  });
});

