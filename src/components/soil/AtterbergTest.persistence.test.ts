const persistenceMocks = vi.hoisted(() => ({
  createRecord: vi.fn(),
  deleteRecord: vi.fn(),
  fetchFullProject: vi.fn(),
  listRecords: vi.fn(),
  updateRecord: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  createRecord: persistenceMocks.createRecord,
  deleteRecord: persistenceMocks.deleteRecord,
  fetchFullProject: persistenceMocks.fetchFullProject,
  listRecords: persistenceMocks.listRecords,
  updateRecord: persistenceMocks.updateRecord,
}));

import { persistAtterbergProjectToApi } from "@/components/soil/AtterbergTest";

type StoredRow = Record<string, unknown> & { id: string };

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

type SaveArgs = Parameters<typeof persistAtterbergProjectToApi>[0];

const payloadFor = (records: unknown[]) => ({
  exportDate: "2026-06-12",
  version: "3.0",
  project: {
    title: "Grading project",
    projectName: "Grading project",
    clientName: "Client",
    date: "2026-06-12",
    records,
  },
});

const threeSamples = [
  record("a", "BH01", "0.0-3.0"),
  record("b", "BH01", "3.0-7.5"),
  record("c", "BH02", "0.0-4.0"),
];

const baseArgs = (records: unknown[]): SaveArgs => ({
  lookup: { projectName: "Grading project", clientName: "Client", projectDate: "2026-06-01" },
  // The fixtures are deliberately minimal - a real record carries tests and trials - so the
  // shape is asserted through the stored payload rather than typed field by field.
  payload: payloadFor(records) as unknown as SaveArgs["payload"],
  dataPoints: 21,
  status: "completed",
  keyResults: [{ label: "Avg LL", value: "50%" }],
  projectId: 42,
});

/**
 * A fake test_results table.
 *
 * Ids and project ids are strings because that is what the PHP API returns: `api.php` uses a
 * plain `new mysqli(...)` and `hydrateRow()` only decodes `*_json` columns. Mocking them as
 * numbers is what let the string/number comparison bug hide.
 *
 * `rejectCreates` simulates the unique key (project_id, test_key, sample_key) refusing a
 * second row for a sample, which is what happens when two tabs save at once.
 */
const useStore = (seed: StoredRow[] = [], rejectCreates: string[] = []) => {
  const store = new Map<number, StoredRow>();
  for (const row of seed) store.set(Number(row.id), { ...row });
  const rejected = new Set(rejectCreates);
  let nextId = 500;

  persistenceMocks.listRecords.mockImplementation(async (table: string) =>
    table === "test_results" ? { data: Array.from(store.values()) } : { data: [] },
  );
  persistenceMocks.createRecord.mockImplementation(async (table: string, payload: Record<string, unknown>) => {
    if (table !== "test_results") return { data: { id: 42 } };
    if (rejected.has(String(payload.sample_key ?? ""))) throw new Error("Duplicate entry");
    const id = String(nextId++);
    const row: StoredRow = {
      id,
      project_id: "42",
      test_key: "atterberg",
      updated_at: "2026-06-13 00:00:00",
      ...payload,
    };
    store.set(Number(id), row);
    return { data: { ...row } };
  });
  persistenceMocks.updateRecord.mockImplementation(async (table: string, id: string | number, payload: Record<string, unknown>) => {
    if (table !== "test_results") return { data: { id: 42 } };
    const key = Number(id);
    const row = { ...(store.get(key) ?? { id: String(id) }), ...payload, updated_at: "2026-06-13 00:00:00" };
    store.set(key, row);
    return { data: { ...row } };
  });
  persistenceMocks.deleteRecord.mockImplementation(async (table: string, id: string | number) => {
    if (table === "test_results") store.delete(Number(id));
    return {};
  });
  return store;
};

const sampleRows = (store: Map<number, StoredRow>) =>
  Array.from(store.values()).filter((row) => String(row.sample_key ?? "") !== "");

const createsFor = (table: string) =>
  persistenceMocks.createRecord.mock.calls.filter(([called]) => called === table);
const updatesFor = (table: string) =>
  persistenceMocks.updateRecord.mock.calls.filter(([called]) => called === table);
const deletesFor = (table: string) =>
  persistenceMocks.deleteRecord.mock.calls.filter(([called]) => called === table);

beforeEach(() => {
  persistenceMocks.createRecord.mockReset().mockResolvedValue({ data: { id: 99 } });
  persistenceMocks.deleteRecord.mockReset().mockResolvedValue({});
  persistenceMocks.fetchFullProject.mockReset().mockResolvedValue({
    id: 42,
    name: "Grading project",
    client_name: "Client",
    project_date: "2026-06-01",
  });
  persistenceMocks.listRecords.mockReset().mockResolvedValue({ data: [] });
  persistenceMocks.updateRecord.mockReset().mockResolvedValue({
    data: { id: 42, name: "Grading project", client_name: "Client", project_date: "2026-06-01" },
  });
});


describe("Atterberg project persistence - one test_results row per sample", () => {
  it("writes one row per sample, each holding a single record", async () => {
    const store = useStore();

    await persistAtterbergProjectToApi(baseArgs(threeSamples));

    const rows = sampleRows(store);
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.sample_key)).toEqual(["record-a", "record-b", "record-c"]);
    expect(rows.map((row) => row.sort_order)).toEqual([0, 1, 2]);
    expect(rows.map((row) => row.sample_label)).toEqual(["BH01", "BH01", "BH02"]);
    expect(rows.map((row) => row.sample_depth)).toEqual(["0.0-3.0", "3.0-7.5", "0.0-4.0"]);

    for (const row of rows) {
      const stored = row.payload_json as { project: { records: unknown[] } };
      expect(stored.project.records).toHaveLength(1);
    }
  });

  it("keeps the project envelope and aggregate on every sample row", async () => {
    const store = useStore();

    await persistAtterbergProjectToApi(baseArgs(threeSamples));

    for (const row of sampleRows(store)) {
      expect(row.status).toBe("completed");
      expect(row.data_points).toBe(21);
      expect(row.key_results_json).toEqual([{ label: "Avg LL", value: "50%" }]);
      const stored = row.payload_json as { project: { title: string } };
      expect(stored.project.title).toBe("Grading project");
    }
  });

  it("updates every sample in place when the same test is saved again", async () => {
    const store = useStore();

    await persistAtterbergProjectToApi(baseArgs(threeSamples));
    await persistAtterbergProjectToApi(baseArgs(threeSamples));
    await persistAtterbergProjectToApi(baseArgs(threeSamples));

    expect(sampleRows(store)).toHaveLength(3);
    expect(createsFor("test_results")).toHaveLength(3);
    expect(updatesFor("test_results")).toHaveLength(6);
    expect(deletesFor("test_results")).toHaveLength(0);
  });

  it("deletes only the sample removed from the form", async () => {
    const store = useStore([
      { id: "1", project_id: "42", test_key: "atterberg", sample_key: "record-a", sample_label: "BH01", sort_order: 0, updated_at: "2026-06-01 09:00:00" },
      { id: "2", project_id: "42", test_key: "atterberg", sample_key: "record-b", sample_label: "BH01", sort_order: 1, updated_at: "2026-06-01 09:00:00" },
      { id: "3", project_id: "42", test_key: "atterberg", sample_key: "record-c", sample_label: "BH02", sort_order: 2, updated_at: "2026-06-01 09:00:00" },
    ]);

    // The technician deleted the middle sample.
    await persistAtterbergProjectToApi(baseArgs([threeSamples[0], threeSamples[2]]));

    expect(Array.from(store.keys())).toEqual([1, 3]);
    expect(sampleRows(store).map((row) => row.sample_key)).toEqual(["record-a", "record-c"]);
    expect(createsFor("test_results")).toHaveLength(0);
  });

  it("adds a newly added sample without touching the existing ones", async () => {
    const store = useStore([
      { id: "1", project_id: "42", test_key: "atterberg", sample_key: "record-a", sample_label: "BH01", sort_order: 0, updated_at: "2026-06-01 09:00:00" },
    ]);

    await persistAtterbergProjectToApi(baseArgs([threeSamples[0], threeSamples[2]]));

    expect(sampleRows(store).map((row) => row.sample_key)).toEqual(["record-a", "record-c"]);
    expect(createsFor("test_results")).toHaveLength(1);
    expect(updatesFor("test_results")).toHaveLength(1);
  });


  it("removes the legacy project-level row that held every sample in one record", async () => {
    const store = useStore([
      { id: "76", project_id: "42", test_key: "atterberg", sample_key: "", updated_at: "2026-06-01 09:00:00" },
    ]);

    await persistAtterbergProjectToApi(baseArgs(threeSamples));

    expect(sampleRows(store)).toHaveLength(3);
    expect(store.has(76)).toBe(false);
    expect(deletesFor("test_results")).toContainEqual(["test_results", "76"]);
  });

  it("collapses duplicate rows for the same sample, keeping the newest", async () => {
    const store = useStore([
      { id: "10", project_id: "42", test_key: "atterberg", sample_key: "record-a", sort_order: 0, updated_at: "2026-05-01 09:00:00" },
      { id: "11", project_id: "42", test_key: "atterberg", sample_key: "record-a", sort_order: 0, updated_at: "2026-06-01 09:00:00" },
    ]);

    await persistAtterbergProjectToApi(baseArgs([threeSamples[0]]));

    // Row 11 is newest so it is the one updated; row 10 is the duplicate and is removed.
    expect(updatesFor("test_results")[0][1]).toBe("11");
    expect(deletesFor("test_results")).toContainEqual(["test_results", "10"]);
    expect(store.has(10)).toBe(false);
    expect(store.has(11)).toBe(true);
  });

  it("falls back to updating when the unique key rejects a create", async () => {
    // The row for record-a already exists, but the first read misses it - as it would if
    // another tab saved a moment earlier - so the save takes the create path and the unique
    // key rejects it. The save must re-read and update that row rather than fail.
    const store = useStore(
      [{ id: "20", project_id: "42", test_key: "atterberg", sample_key: "record-a", sort_order: 0, updated_at: "2026-06-01 09:00:00" }],
      ["record-a"],
    );
    const readStore = persistenceMocks.listRecords.getMockImplementation();
    let testResultsReads = 0;
    persistenceMocks.listRecords.mockImplementation(async (table: string) => {
      if (table !== "test_results") return { data: [] };
      testResultsReads += 1;
      if (testResultsReads === 1) return { data: [] };
      return readStore ? readStore(table) : { data: [] };
    });

    await persistAtterbergProjectToApi(baseArgs([threeSamples[0]]));

    expect(createsFor("test_results").length).toBeGreaterThan(0);
    expect(updatesFor("test_results")[0][1]).toBe("20");
    expect(store.has(20)).toBe(true);
    expect(sampleRows(store)).toHaveLength(1);
  });

  it("leaves rows belonging to other tests alone", async () => {
    const store = useStore([
      { id: "90", project_id: "42", test_key: "grading", updated_at: "2026-06-05 08:00:00" },
    ]);

    await persistAtterbergProjectToApi(baseArgs(threeSamples));

    expect(store.get(90)?.test_key).toBe("grading");
    expect(deletesFor("test_results")).toHaveLength(0);
  });

  it("writes nothing when the payload has no records", async () => {
    // An empty records array means the project never hydrated, not that every sample was
    // deleted. Writing here would erase real samples.
    const store = useStore([
      { id: "30", project_id: "42", test_key: "atterberg", sample_key: "record-a", updated_at: "2026-06-01 09:00:00" },
    ]);

    await persistAtterbergProjectToApi(baseArgs([]));

    expect(Array.from(store.keys())).toEqual([30]);
    expect(createsFor("test_results")).toHaveLength(0);
    expect(updatesFor("test_results")).toHaveLength(0);
    expect(deletesFor("test_results")).toHaveLength(0);
  });

  it("adds results to the selected project without creating a duplicate project", async () => {
    const store = useStore();

    await persistAtterbergProjectToApi({
      ...baseArgs([threeSamples[0]]),
      lookup: { projectName: "Other project name", clientName: "Other client", projectDate: "2026-01-01" },
    });

    expect(persistenceMocks.fetchFullProject).toHaveBeenCalledWith(42);
    expect(persistenceMocks.updateRecord).toHaveBeenCalledWith("projects", 42, expect.objectContaining({
      name: "Grading project",
    }));
    expect(createsFor("projects")).toHaveLength(0);
    expect(sampleRows(store)).toHaveLength(1);
  });
});

