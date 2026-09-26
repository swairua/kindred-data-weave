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

describe("Atterberg project persistence", () => {
  it("adds test results to the selected project without creating a duplicate project", async () => {
    await persistAtterbergProjectToApi({
      lookup: { projectName: "Other project name", clientName: "Other client", projectDate: "2026-01-01" },
      payload: {
        exportDate: "2026-06-12",
        version: "1.0",
        project: {
          title: "Updated grading project",
          clientName: "New client",
          date: "2026-06-12",
          records: [],
        },
      },
      dataPoints: 0,
      status: "not-started",
      keyResults: [],
      projectId: 42,
    });

    expect(persistenceMocks.fetchFullProject).toHaveBeenCalledWith(42);
    expect(persistenceMocks.updateRecord).toHaveBeenCalledWith("projects", 42, expect.objectContaining({
      name: "Updated grading project",
      client_name: "New client",
      project_date: "2026-06-12",
    }));
    expect(persistenceMocks.createRecord).toHaveBeenCalledWith("test_results", expect.objectContaining({
      project_id: 42,
      test_key: "atterberg",
    }));
    expect(persistenceMocks.createRecord).not.toHaveBeenCalledWith("projects", expect.any(Object));
  });

  describe("duplicate prevention", () => {
    const saveArgs = {
      lookup: { projectName: "Grading project", clientName: "Client", projectDate: "2026-06-01" },
      payload: {
        exportDate: "2026-06-12",
        version: "1.0",
        project: { title: "Grading project", clientName: "Client", date: "2026-06-12", records: [] },
      },
      dataPoints: 3,
      status: "in-progress",
      keyResults: [],
      projectId: 42,
    };

    /**
     * Ids and project ids are strings because that is what the PHP API returns: `api.php` uses a
     * plain `new mysqli(...)` and `hydrateRow()` only decodes `*_json` columns. Mocking them as
     * numbers is what let the string/number comparison bug hide.
     */
    const useStringIdStore = (seed: Array<{ id: string; project_id: string; test_key: string; updated_at: string }> = []) => {
      const store = new Map<number, Record<string, unknown>>();
      for (const row of seed) store.set(Number(row.id), { ...row });
      let nextId = 100;

      persistenceMocks.listRecords.mockImplementation(async (table: string) =>
        table === "test_results" ? { data: Array.from(store.values()) } : { data: [] },
      );
      persistenceMocks.createRecord.mockImplementation(async (table: string, payload: Record<string, unknown>) => {
        if (table !== "test_results") return { data: { id: 42 } };
        const id = String(nextId++);
        const row = { id, project_id: "42", test_key: "atterberg", updated_at: "2026-06-13 00:00:00", ...payload };
        store.set(Number(id), row);
        return { data: { ...row } };
      });
      persistenceMocks.updateRecord.mockImplementation(async (table: string, id: string | number, payload: Record<string, unknown>) => {
        if (table !== "test_results") return { data: { id: 42 } };
        const key = Number(id);
        const row = { ...(store.get(key) ?? {}), ...payload, updated_at: "2026-06-13 00:00:00" };
        store.set(key, row);
        return { data: { ...row } };
      });
      persistenceMocks.deleteRecord.mockImplementation(async (table: string, id: string | number) => {
        if (table === "test_results") store.delete(Number(id));
        return {};
      });
      return store;
    };

    it("keeps a single row after the same test is saved three times", async () => {
      const store = useStringIdStore();

      await persistAtterbergProjectToApi(saveArgs);
      await persistAtterbergProjectToApi(saveArgs);
      await persistAtterbergProjectToApi(saveArgs);

      const rows = Array.from(store.values()).filter((row) => row.test_key === "atterberg");
      expect(rows).toHaveLength(1);
      expect(persistenceMocks.createRecord.mock.calls.filter(([table]) => table === "test_results")).toHaveLength(1);
      expect(persistenceMocks.updateRecord.mock.calls.filter(([table]) => table === "test_results")).toHaveLength(2);
    });

    it("updates the newest row and deletes legacy duplicates left by the old save path", async () => {
      const store = useStringIdStore([
        { id: "76", project_id: "42", test_key: "atterberg", updated_at: "2026-05-11 13:53:14" },
        { id: "77", project_id: "42", test_key: "atterberg", updated_at: "2026-06-01 09:00:00" },
        { id: "78", project_id: "42", test_key: "atterberg", updated_at: "2026-05-20 10:00:00" },
      ]);

      await persistAtterbergProjectToApi(saveArgs);

      // Only the newest row survives, and the two older duplicates are removed.
      expect(Array.from(store.keys())).toEqual([77]);
      // Ids are passed through exactly as the API returned them (strings here); `api.ts` is what
      // normalises them to numbers in production.
      expect(persistenceMocks.updateRecord).toHaveBeenCalledWith(
        "test_results",
        "77",
        expect.objectContaining({ test_key: "atterberg", data_points: 3 }),
      );
      expect(persistenceMocks.deleteRecord).toHaveBeenCalledWith("test_results", "76");
      expect(persistenceMocks.deleteRecord).toHaveBeenCalledWith("test_results", "78");
      expect(persistenceMocks.createRecord.mock.calls.filter(([table]) => table === "test_results")).toHaveLength(0);
    });

    it("leaves rows belonging to other tests alone", async () => {
      const store = useStringIdStore([
        { id: "90", project_id: "42", test_key: "grading", updated_at: "2026-06-05 08:00:00" },
      ]);

      await persistAtterbergProjectToApi(saveArgs);

      expect(Array.from(store.values()).map((row) => row.test_key)).toEqual(["grading", "atterberg"]);
    });
  });
});
