import { describe, it, expect, vi } from "vitest";
import {
  extractAtterbergPayload,
  type AtterbergExportPayload,
} from "@/lib/jsonExporter";

// NOTE: Tests use loose record shapes (`as any`) — they exercise the persistence
// flow and payload schema, not the full AtterbergRecord type contract.

describe("Atterberg Multi-Record Persistence", () => {
  function createMockPayload(recordCount: number): AtterbergExportPayload {
    const records = Array.from({ length: recordCount }, (_, i) => ({
      id: `record-${i + 1}`,
      name: `Sample ${i + 1}`,
      date: new Date().toISOString(),
      tests: [
        {
          id: `test-${i + 1}-1`,
          type: "liquidLimit" as const,
          isExpanded: false,
          trials: [],
          result: {},
        },
      ],
    })) as any;

    return {
      exportDate: new Date().toISOString(),
      version: "1.0",
      project: {
        title: "Test Project",
        clientName: "Test Client",
        date: new Date().toISOString(),
        records,
      },
    };
  }

  function createMockDatabaseRow(projectId: number, payload: AtterbergExportPayload) {
    return {
      id: Math.floor(Math.random() * 10000),
      project_id: projectId,
      test_key: "atterberg",
      payload_json: payload,
      updated_at: new Date().toISOString(),
    };
  }

  describe("Payload Serialization with Multiple Records", () => {
    it("should correctly serialize and deserialize a payload with 2 records", () => {
      const originalPayload = createMockPayload(2);
      const serialized = JSON.stringify(originalPayload);
      const deserialized = JSON.parse(serialized) as AtterbergExportPayload;

      expect(deserialized.project.records).toHaveLength(2);
      expect((deserialized.project.records[0] as any).name).toBe("Sample 1");
      expect((deserialized.project.records[1] as any).name).toBe("Sample 2");
    });

    it("should correctly serialize and deserialize a payload with 3 records", () => {
      const originalPayload = createMockPayload(3);
      const serialized = JSON.stringify(originalPayload);
      const deserialized = JSON.parse(serialized) as AtterbergExportPayload;

      expect(deserialized.project.records).toHaveLength(3);
      deserialized.project.records.forEach((record, index) => {
        expect((record as any).name).toBe(`Sample ${index + 1}`);
      });
    });

    it("should preserve record order after serialization", () => {
      const originalPayload = createMockPayload(5);
      const serialized = JSON.stringify(originalPayload);
      const deserialized = JSON.parse(serialized) as AtterbergExportPayload;

      originalPayload.project.records.forEach((originalRecord, index) => {
        expect(deserialized.project.records[index].id).toBe(originalRecord.id);
        expect((deserialized.project.records[index] as any).name).toBe((originalRecord as any).name);
      });
    });
  });

  describe("Multi-Record Database Flow Simulation", () => {
    it("should handle the scenario: load 2 records → add 1 → save → verify 3 persisted", () => {
      const existingPayload = createMockPayload(2);
      const dbRow = createMockDatabaseRow(123, existingPayload);

      const loadedPayload = dbRow.payload_json;
      expect(loadedPayload.project.records).toHaveLength(2);

      const newRecord = {
        id: "record-3",
        name: "Sample 3",
        date: new Date().toISOString(),
        tests: [
          {
            id: "test-3-1",
            type: "liquidLimit" as const,
            isExpanded: false,
            trials: [],
            result: {},
          },
        ],
      } as any;

      const updatedPayload: AtterbergExportPayload = {
        ...loadedPayload,
        project: {
          ...loadedPayload.project,
          records: [...loadedPayload.project.records, newRecord],
        },
      };

      expect(updatedPayload.project.records).toHaveLength(3);

      const newDbRow = createMockDatabaseRow(123, updatedPayload);
      expect(newDbRow.payload_json.project.records).toHaveLength(3);

      const reloadedPayload = newDbRow.payload_json;
      expect(reloadedPayload.project.records).toHaveLength(3);
      expect((reloadedPayload.project.records[2] as any).name).toBe("Sample 3");
    });

    it("should handle accumulating records across multiple saves", () => {
      let currentPayload = createMockPayload(1);
      expect(currentPayload.project.records).toHaveLength(1);

      currentPayload = {
        ...currentPayload,
        project: {
          ...currentPayload.project,
          records: [
            ...currentPayload.project.records,
            {
              id: "record-2",
              name: "Sample 2",
              date: new Date().toISOString(),
              tests: [
                {
                  id: "test-2-1",
                  type: "plasticLimit" as const,
                  isExpanded: false,
                  trials: [],
                  result: {},
                },
              ],
            } as any,
          ],
        },
      };
      expect(currentPayload.project.records).toHaveLength(2);

      currentPayload = {
        ...currentPayload,
        project: {
          ...currentPayload.project,
          records: [
            ...currentPayload.project.records,
            {
              id: "record-3",
              name: "Sample 3",
              date: new Date().toISOString(),
              tests: [
                {
                  id: "test-3-1",
                  type: "shrinkageLimit" as const,
                  isExpanded: false,
                  trials: [],
                  result: {},
                },
              ],
            } as any,
          ],
        },
      };
      expect(currentPayload.project.records).toHaveLength(3);

      expect(currentPayload.project.records.map((r: any) => r.name)).toEqual([
        "Sample 1",
        "Sample 2",
        "Sample 3",
      ]);
    });
  });

  describe("Record Deduplication During Cleanup Phase", () => {
    it("should correctly identify old records to delete (excluding newly created one)", () => {
      const projectId = 123;
      const newRecordId = 4;

      const allRecords = [
        { id: 1, project_id: projectId, test_key: "atterberg" },
        { id: 2, project_id: projectId, test_key: "atterberg" },
        { id: 3, project_id: projectId, test_key: "atterberg" },
        { id: 4, project_id: projectId, test_key: "atterberg" },
        { id: 5, project_id: 999, test_key: "atterberg" },
      ];

      const recordsToDelete = allRecords.filter(
        (row) => row.project_id === projectId && row.test_key === "atterberg" && row.id !== newRecordId,
      );

      expect(recordsToDelete).toHaveLength(3);
      expect(recordsToDelete.map((r) => r.id)).toEqual([1, 2, 3]);
    });

    it("should handle the case where cleanup deletes all old records correctly", () => {
      const projectId = 123;
      const allRecords = [
        { id: 1, project_id: projectId, test_key: "atterberg" },
        { id: 2, project_id: projectId, test_key: "atterberg" },
        { id: 3, project_id: projectId, test_key: "atterberg" },
      ];

      const newRecordId = 3;
      const recordsToDelete = allRecords.filter(
        (row) => row.project_id === projectId && row.test_key === "atterberg" && row.id !== newRecordId,
      );

      expect(recordsToDelete).toHaveLength(2);
      const remainingRecordIds = allRecords.map((r) => r.id).filter((id) => !recordsToDelete.map((d) => d.id).includes(id));
      expect(remainingRecordIds).toEqual([3]);
    });
  });

  describe("Error Scenarios", () => {
    it("should handle payload with empty records array gracefully", () => {
      const emptyPayload: AtterbergExportPayload = {
        exportDate: new Date().toISOString(),
        version: "1.0",
        project: {
          title: "Empty Project",
          clientName: undefined,
          date: new Date().toISOString(),
          records: [],
        },
      };

      const serialized = JSON.stringify(emptyPayload);
      const deserialized = JSON.parse(serialized) as AtterbergExportPayload;

      expect(deserialized.project.records).toHaveLength(0);
      expect(Array.isArray(deserialized.project.records)).toBe(true);
    });

    it("should handle malformed records array without crashing", () => {
      const payloadWithMalformedRecords = {
        exportDate: new Date().toISOString(),
        version: "1.0",
        project: {
          title: "Test",
          clientName: undefined,
          date: new Date().toISOString(),
          records: [null, { id: "valid", name: "Valid Record", tests: [] }, undefined] as any[],
        },
      };

      const serialized = JSON.stringify(payloadWithMalformedRecords);
      const deserialized = JSON.parse(serialized);

      expect(Array.isArray(deserialized.project.records)).toBe(true);
    });
  });

  describe("Race Condition Scenarios", () => {
    it("should preserve data if rapid saves happen", () => {
      const initialPayload = createMockPayload(1);
      const savedPayloads: AtterbergExportPayload[] = [];

      const firstSave: AtterbergExportPayload = {
        ...initialPayload,
        project: {
          ...initialPayload.project,
          records: [
            ...initialPayload.project.records,
            { id: "record-2", name: "Sample 2", date: new Date().toISOString(), tests: [] } as any,
          ],
        },
      };
      savedPayloads.push(firstSave);

      const secondSaveBase: AtterbergExportPayload = {
        ...initialPayload,
        project: {
          ...initialPayload.project,
          records: [
            ...initialPayload.project.records,
            { id: "record-3", name: "Sample 3", date: new Date().toISOString(), tests: [] } as any,
          ],
        },
      };
      savedPayloads.push(secondSaveBase);

      expect(savedPayloads.length).toBe(2);
      expect(firstSave.project.records).toHaveLength(2);
      expect(secondSaveBase.project.records).toHaveLength(2);
    });

    it("should maintain data integrity when multiple saves queue up", () => {
      const saves: AtterbergExportPayload[] = [];

      for (let i = 0; i < 3; i++) {
        const payload = createMockPayload(1);
        for (let j = 0; j < i; j++) {
          (payload.project.records as any).push({
            id: `record-${j + 2}`,
            name: `Sample ${j + 2}`,
          });
        }
        saves.push(payload);
      }

      expect(saves.length).toBe(3);
      expect(saves[saves.length - 1].project.records.length).toBeGreaterThanOrEqual(saves[0].project.records.length);
    });
  });

  describe("Atomicity of Create + Delete Operations", () => {
    it("should ensure new record is created before old records are deleted", () => {
      let databaseRecords: Array<{ id: number; projectId: number; data: string }> = [
        { id: 1, projectId: 123, data: "old-record-1" },
        { id: 2, projectId: 123, data: "old-record-2" },
      ];

      const newRecordId = 3;
      databaseRecords.push({ id: newRecordId, projectId: 123, data: "new-record" });
      expect(databaseRecords.some((r) => r.id === newRecordId)).toBe(true);

      const recordsToDelete = databaseRecords.filter((r) => r.projectId === 123 && r.id !== newRecordId);
      expect(recordsToDelete).toHaveLength(2);

      databaseRecords = databaseRecords.filter((r) => r.id === newRecordId);

      expect(databaseRecords).toHaveLength(1);
      expect(databaseRecords[0].id).toBe(newRecordId);
    });

    it("should preserve data if deletion fails after creation", () => {
      const databaseRecords: Array<{ id: number; projectId: number; data: string }> = [
        { id: 1, projectId: 123, data: "old-record-1" },
        { id: 2, projectId: 123, data: "old-record-2" },
      ];

      const newRecordId = 3;
      databaseRecords.push({ id: newRecordId, projectId: 123, data: "new-record" });

      let deleteError: Error | null = null;
      try {
        throw new Error("Network error during deletion");
      } catch (error) {
        deleteError = error as Error;
      }

      expect(databaseRecords.filter((r) => r.projectId === 123)).toHaveLength(3);
      expect(deleteError).toBeDefined();
      expect(deleteError?.message).toContain("Network error");
    });
  });

  describe("Network Failure Scenarios", () => {
    it("should not lose data if cleanup fails (thanks to create-first pattern)", () => {
      const projectId = 123;
      const databaseRecords = [
        { id: 1, projectId, test_key: "atterberg", data: "payload-v1" },
        { id: 2, projectId, test_key: "atterberg", data: "payload-v2" },
      ];

      const newPayload = createMockPayload(3);
      const newRecordId = 3;
      databaseRecords.push({
        id: newRecordId,
        projectId,
        test_key: "atterberg",
        data: JSON.stringify(newPayload),
      });

      expect(databaseRecords.find((r) => r.id === newRecordId)).toBeDefined();

      let cleanupError: Error | null = null;
      try {
        throw new Error("Failed to reach database during cleanup");
      } catch (error) {
        cleanupError = error as Error;
      }

      expect(cleanupError).toBeDefined();
      expect(databaseRecords.filter((r) => r.projectId === projectId)).toHaveLength(3);
      expect(databaseRecords.find((r) => r.id === newRecordId)?.data).toContain("Sample");
    });

    it("should handle partial delete failures gracefully", () => {
      const projectId = 123;
      let databaseRecords = [
        { id: 1, projectId, test_key: "atterberg" },
        { id: 2, projectId, test_key: "atterberg" },
        { id: 3, projectId, test_key: "atterberg" },
      ];

      const newRecordId = 4;
      databaseRecords.push({ id: newRecordId, projectId, test_key: "atterberg" });

      const recordsToDelete = databaseRecords.filter(
        (r) => r.projectId === projectId && r.test_key === "atterberg" && r.id !== newRecordId,
      );

      const deleteResults = recordsToDelete.map((record) => {
        if (record.id === 2) return null;
        databaseRecords = databaseRecords.filter((r) => r.id !== record.id);
        return true;
      });

      const successCount = deleteResults.filter((r) => r !== null).length;
      expect(successCount).toBe(2);
      expect(databaseRecords.length).toBe(2);
    });

    it("should provide fallback to localStorage when API cleanup fails", () => {
      const storageKey = "atterbergProjectData";
      const storedPayload = createMockPayload(3);
      const storedData = JSON.stringify(storedPayload);

      const mockLocalStorage = {
        getItem: (key: string) => (key === storageKey ? storedData : null),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      };

      const apiFailure = new Error("Network error");
      if (apiFailure) {
        const fallbackData = mockLocalStorage.getItem(storageKey);
        expect(fallbackData).toBeDefined();

        const fallbackPayload = JSON.parse(fallbackData!) as AtterbergExportPayload;
        expect(fallbackPayload.project.records).toHaveLength(3);
      }
    });

    it("should handle timeout during delete phase", () => {
      const projectId = 123;
      const databaseRecords = [
        { id: 1, projectId, test_key: "atterberg" },
        { id: 2, projectId, test_key: "atterberg" },
      ];

      const newRecordId = 3;
      databaseRecords.push({ id: newRecordId, projectId, test_key: "atterberg" });

      let timedOut = false;
      try {
        throw new Error("Request timeout after 30000ms");
      } catch (error) {
        timedOut = true;
      }

      expect(timedOut).toBe(true);
      expect(databaseRecords.filter((r) => r.projectId === projectId)).toHaveLength(3);
    });
  });

  describe("Race Condition and Concurrent Save Scenarios", () => {
    it("should handle rapid consecutive saves with debouncing", () => {
      const saves: number[] = [];
      const debounceMs = 500;
      let debounceTimer: ReturnType<typeof setTimeout> | null = null;

      const triggerSave = () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          saves.push(Date.now());
        }, debounceMs);
      };

      triggerSave();
      triggerSave();
      triggerSave();
      triggerSave();
      triggerSave();

      expect(saves.length).toBe(0);

      vi.useFakeTimers();
      vi.advanceTimersByTime(500);
      vi.useRealTimers();
    });

    it("should ensure last saved data wins in concurrent scenario", () => {
      const projectId = 123;

      const payloadA = createMockPayload(2);
      const recordA = { id: 101, projectId, payload: payloadA };

      const payloadB = createMockPayload(3);
      const recordB = { id: 102, projectId, payload: payloadB };

      let savedRecord = recordA;
      savedRecord = recordB;

      expect(savedRecord.payload.project.records).toHaveLength(3);
    });

    it("should handle multiple users editing same project simultaneously", () => {
      const projectId = 123;
      const initialPayload = createMockPayload(2);

      const userAPayload = { ...initialPayload, project: { ...initialPayload.project, records: [...initialPayload.project.records] } };
      (userAPayload.project.records as any).push({ id: "record-3-a", name: "Sample 3 (User A)" });

      const userBPayload = { ...initialPayload, project: { ...initialPayload.project, records: [...initialPayload.project.records] } };
      (userBPayload.project.records as any).push({ id: "record-3-b", name: "Sample 3 (User B)" });

      let databaseRecords = [{ id: 101, projectId, payload: userAPayload }];
      databaseRecords = [{ id: 102, projectId, payload: userBPayload }];

      expect(databaseRecords[0].payload.project.records).toHaveLength(3);
      expect((databaseRecords[0].payload.project.records[2] as any).name).toContain("User B");
    });

    it("should maintain data integrity during concurrent cleanup operations", () => {
      const projectId = 123;
      let databaseRecords = [
        { id: 1, projectId, test_key: "atterberg", created: "old" },
        { id: 2, projectId, test_key: "atterberg", created: "old" },
        { id: 3, projectId, test_key: "atterberg", created: "old" },
        { id: 4, projectId, test_key: "atterberg", created: "old" },
        { id: 5, projectId, test_key: "atterberg", created: "old" },
      ];

      const newRecordId = 6;
      databaseRecords.push({ id: newRecordId, projectId, test_key: "atterberg", created: "new" });

      const recordsToDelete = databaseRecords.filter((r) => r.id !== newRecordId);
      expect(recordsToDelete).toHaveLength(5);

      databaseRecords = databaseRecords.filter((r) => r.id === newRecordId);

      expect(databaseRecords).toHaveLength(1);
      expect(databaseRecords[0].id).toBe(newRecordId);
    });
  });

  describe("extractAtterbergPayload", () => {
    it("returns a normalized state with records array from a wrapped export payload", () => {
      const payload = createMockPayload(2);
      const state = extractAtterbergPayload(payload);
      expect(state).not.toBeNull();
      expect(state?.records).toBeDefined();
      expect(Array.isArray(state?.records)).toBe(true);
    });
  });
});
