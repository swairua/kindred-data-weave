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
});
