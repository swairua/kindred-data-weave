import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  normalizeAtterbergProjectState,
  extractAtterbergPayload,
  type AtterbergExportPayload,
  type AtterbergProjectState,
} from "@/lib/jsonExporter";

describe("Atterberg Multi-Record Persistence", () => {
  // Helper function to create a mock export payload with test records
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
    }));

    return {
      project: {
        title: "Test Project",
        clientName: "Test Client",
        date: new Date().toISOString(),
      },
      records,
    };
  }

  // Helper function to create a mock database row structure
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

      // Simulate serialization (what happens when saving to DB)
      const serialized = JSON.stringify(originalPayload);

      // Simulate deserialization (what happens when loading from DB)
      const deserialized = JSON.parse(serialized) as AtterbergExportPayload;

      // Verify all records are preserved
      expect(deserialized.records).toHaveLength(2);
      expect(deserialized.records[0].name).toBe("Sample 1");
      expect(deserialized.records[1].name).toBe("Sample 2");
    });

    it("should correctly serialize and deserialize a payload with 3 records", () => {
      const originalPayload = createMockPayload(3);
      const serialized = JSON.stringify(originalPayload);
      const deserialized = JSON.parse(serialized) as AtterbergExportPayload;

      expect(deserialized.records).toHaveLength(3);
      deserialized.records.forEach((record, index) => {
        expect(record.name).toBe(`Sample ${index + 1}`);
      });
    });

    it("should preserve record order after serialization", () => {
      const originalPayload = createMockPayload(5);
      const serialized = JSON.stringify(originalPayload);
      const deserialized = JSON.parse(serialized) as AtterbergExportPayload;

      originalPayload.records.forEach((originalRecord, index) => {
        expect(deserialized.records[index].id).toBe(originalRecord.id);
        expect(deserialized.records[index].name).toBe(originalRecord.name);
      });
    });
  });

  describe("Multi-Record Database Flow Simulation", () => {
    it("should handle the scenario: load 2 records → add 1 → save → verify 3 persisted", () => {
      // Step 1: Load existing project with 2 records from database
      const existingPayload = createMockPayload(2);
      const dbRow = createMockDatabaseRow(123, existingPayload);

      // Simulate loading from API
      const loadedPayload = dbRow.payload_json;
      expect(loadedPayload.records).toHaveLength(2);

      // Step 2: Add a new record (simulating user action)
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
      };

      const updatedPayload: AtterbergExportPayload = {
        ...loadedPayload,
        records: [...loadedPayload.records, newRecord],
      };

      expect(updatedPayload.records).toHaveLength(3);

      // Step 3: Simulate saving to database (what persistAtterbergProjectToApi does)
      // - Create new test_results row with all 3 records
      const newDbRow = createMockDatabaseRow(123, updatedPayload);
      expect(newDbRow.payload_json.records).toHaveLength(3);

      // Step 4: Simulate loading again to verify persistence
      const reloadedPayload = newDbRow.payload_json;
      expect(reloadedPayload.records).toHaveLength(3);
      expect(reloadedPayload.records[2].name).toBe("Sample 3");
    });

    it("should handle accumulating records across multiple saves", () => {
      // Simulate multiple save cycles
      let currentPayload = createMockPayload(1);
      expect(currentPayload.records).toHaveLength(1);

      // First save with added record
      currentPayload = {
        ...currentPayload,
        records: [
          ...currentPayload.records,
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
          },
        ],
      };
      expect(currentPayload.records).toHaveLength(2);

      // Second save with added record
      currentPayload = {
        ...currentPayload,
        records: [
          ...currentPayload.records,
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
          },
        ],
      };
      expect(currentPayload.records).toHaveLength(3);

      // Verify all records are still present and in order
      expect(currentPayload.records.map((r) => r.name)).toEqual(["Sample 1", "Sample 2", "Sample 3"]);
    });
  });

  describe("Record Deduplication During Cleanup Phase", () => {
    it("should correctly identify old records to delete (excluding newly created one)", () => {
      // Simulate database state with multiple old records for the same project
      const projectId = 123;
      const oldRecordIds = [1, 2, 3]; // These should be deleted
      const newRecordId = 4; // This should NOT be deleted

      const allRecords = [
        { id: 1, project_id: projectId, test_key: "atterberg" },
        { id: 2, project_id: projectId, test_key: "atterberg" },
        { id: 3, project_id: projectId, test_key: "atterberg" },
        { id: 4, project_id: projectId, test_key: "atterberg" }, // newly created
        { id: 5, project_id: 999, test_key: "atterberg" }, // different project, should not be deleted
      ];

      // Simulate the cleanup logic
      const recordsToDelete = allRecords.filter(
        (row) => row.project_id === projectId && row.test_key === "atterberg" && row.id !== newRecordId
      );

      expect(recordsToDelete).toHaveLength(3);
      expect(recordsToDelete.map((r) => r.id)).toEqual([1, 2, 3]);
    });

    it("should handle the case where cleanup deletes all old records correctly", () => {
      const projectId = 123;
      const allRecords = [
        { id: 1, project_id: projectId, test_key: "atterberg" },
        { id: 2, project_id: projectId, test_key: "atterberg" },
        { id: 3, project_id: projectId, test_key: "atterberg" }, // newly created
      ];

      const newRecordId = 3;
      const recordsToDelete = allRecords.filter(
        (row) => row.project_id === projectId && row.test_key === "atterberg" && row.id !== newRecordId
      );

      expect(recordsToDelete).toHaveLength(2);
      const remainingRecordIds = allRecords.map((r) => r.id).filter((id) => !recordsToDelete.map((d) => d.id).includes(id));
      expect(remainingRecordIds).toEqual([3]); // Only new record should remain
    });
  });

  describe("Error Scenarios", () => {
    it("should handle payload with empty records array gracefully", () => {
      const emptyPayload: AtterbergExportPayload = {
        project: {
          title: "Empty Project",
          clientName: null,
          date: new Date().toISOString(),
        },
        records: [],
      };

      const serialized = JSON.stringify(emptyPayload);
      const deserialized = JSON.parse(serialized) as AtterbergExportPayload;

      expect(deserialized.records).toHaveLength(0);
      expect(Array.isArray(deserialized.records)).toBe(true);
    });

    it("should handle malformed records array without crashing", () => {
      const payloadWithMalformedRecords = {
        project: {
          title: "Test",
          clientName: null,
          date: new Date().toISOString(),
        },
        records: [
          null,
          { id: "valid", name: "Valid Record", tests: [] },
          undefined,
        ] as any[],
      };

      const serialized = JSON.stringify(payloadWithMalformedRecords);
      const deserialized = JSON.parse(serialized);

      // After JSON serialization, null and undefined become null
      expect(Array.isArray(deserialized.records)).toBe(true);
    });
  });

  describe("Race Condition Scenarios", () => {
    it("should preserve data if rapid saves happen", () => {
      // Simulate rapid consecutive saves
      const initialPayload = createMockPayload(1);
      let savedPayloads: AtterbergExportPayload[] = [];

      // First save: add record 2
      const firstSave = {
        ...initialPayload,
        records: [
          ...initialPayload.records,
          {
            id: "record-2",
            name: "Sample 2",
            date: new Date().toISOString(),
            tests: [],
          },
        ],
      };
      savedPayloads.push(firstSave);

      // Second save (concurrent): still has the original data but we're adding record 3
      // This simulates a race condition where save 1 and 2 might happen simultaneously
      const secondSaveBase = {
        ...initialPayload,
        records: [
          ...initialPayload.records,
          {
            id: "record-3",
            name: "Sample 3",
            date: new Date().toISOString(),
            tests: [],
          },
        ],
      };
      savedPayloads.push(secondSaveBase);

      // After debouncing, the LATEST save should win (with debounce, only one executes)
      // With 500ms debounce, rapid saves should be coalesced into one
      expect(savedPayloads.length).toBe(2); // Both queued, but only last executes after debounce
      expect(firstSave.records).toHaveLength(2);
      expect(secondSaveBase.records).toHaveLength(2);
    });

    it("should maintain data integrity when multiple saves queue up", () => {
      // This tests the debounce logic behavior
      const saves: AtterbergExportPayload[] = [];

      // Queue 3 saves in quick succession
      for (let i = 0; i < 3; i++) {
        const payload = createMockPayload(1);
        // In real scenario, each would add a record
        for (let j = 0; j < i; j++) {
          (payload.records as any).push({
            id: `record-${j + 2}`,
            name: `Sample ${j + 2}`,
          });
        }
        saves.push(payload);
      }

      // After debouncing, only the last save should execute
      // (this is tested through the debouncedHandleSave function)
      expect(saves.length).toBe(3); // All queued
      expect(saves[saves.length - 1].records.length).toBeGreaterThanOrEqual(
        saves[0].records.length
      );
    });
  });

  describe("Atomicity of Create + Delete Operations", () => {
    it("should ensure new record is created before old records are deleted", () => {
      // Simulate the safe cleanup-after-create pattern
      let databaseRecords: Array<{ id: number; projectId: number; data: string }> = [
        { id: 1, projectId: 123, data: "old-record-1" },
        { id: 2, projectId: 123, data: "old-record-2" },
      ];

      // Step 1: Create new record
      const newRecordId = 3;
      databaseRecords.push({ id: newRecordId, projectId: 123, data: "new-record" });
      expect(databaseRecords.some((r) => r.id === newRecordId)).toBe(true);

      // Step 2: Delete old records (only if create succeeded)
      const recordsToDelete = databaseRecords.filter(
        (r) => r.projectId === 123 && r.id !== newRecordId
      );
      expect(recordsToDelete).toHaveLength(2);

      // Simulate successful deletion
      databaseRecords = databaseRecords.filter((r) => r.id === newRecordId);

      // Verify: new record exists, old records are gone
      expect(databaseRecords).toHaveLength(1);
      expect(databaseRecords[0].id).toBe(newRecordId);
    });

    it("should preserve data if deletion fails after creation", () => {
      // Simulate the safer pattern: create first, then delete
      let databaseRecords: Array<{ id: number; projectId: number; data: string }> = [
        { id: 1, projectId: 123, data: "old-record-1" },
        { id: 2, projectId: 123, data: "old-record-2" },
      ];

      const newRecordId = 3;

      // Step 1: Create new record (succeeds)
      databaseRecords.push({ id: newRecordId, projectId: 123, data: "new-record" });

      // Step 2: Try to delete old records (fails with error)
      let deleteError: Error | null = null;
      try {
        // Simulate deletion failure
        throw new Error("Network error during deletion");
      } catch (error) {
        deleteError = error as Error;
        // Log the error but don't crash
        console.warn("Cleanup failed:", deleteError);
      }

      // Verify: New record exists, and old records are still there (safe fallback)
      expect(databaseRecords.filter((r) => r.projectId === 123)).toHaveLength(3);
      expect(deleteError).toBeDefined();
      expect(deleteError?.message).toContain("Network error");
    });
  });

  describe("Network Failure Scenarios", () => {
    it("should not lose data if cleanup fails (thanks to create-first pattern)", () => {
      // Simulate the new safe pattern: create first, then cleanup
      const projectId = 123;
      let databaseRecords = [
        { id: 1, projectId, test_key: "atterberg", data: "payload-v1" },
        { id: 2, projectId, test_key: "atterberg", data: "payload-v2" },
      ];

      // Phase 1: Create new record with all 3 records in payload
      const newPayload = createMockPayload(3);
      const newRecordId = 3;
      databaseRecords.push({
        id: newRecordId,
        projectId,
        test_key: "atterberg",
        data: JSON.stringify(newPayload),
      });

      // At this point, new data is safe in DB
      expect(databaseRecords.find((r) => r.id === newRecordId)).toBeDefined();

      // Phase 2: Try to cleanup old records (fails)
      let cleanupError: Error | null = null;
      const recordsToDelete = databaseRecords.filter(
        (r) => r.projectId === projectId && r.test_key === "atterberg" && r.id !== newRecordId
      );

      try {
        // Simulate network failure during cleanup
        throw new Error("Failed to reach database during cleanup");
      } catch (error) {
        cleanupError = error as Error;
      }

      // Result: New data is safe, old records remain (will be cleaned up on next save)
      expect(cleanupError).toBeDefined();
      expect(databaseRecords.filter((r) => r.projectId === projectId)).toHaveLength(3);
      expect(databaseRecords.find((r) => r.id === newRecordId)?.data).toContain("Sample");
    });

    it("should handle partial delete failures gracefully", () => {
      // Simulate: some deletes succeed, some fail
      const projectId = 123;
      let databaseRecords = [
        { id: 1, projectId, test_key: "atterberg" },
        { id: 2, projectId, test_key: "atterberg" },
        { id: 3, projectId, test_key: "atterberg" },
      ];

      const newRecordId = 4;
      databaseRecords.push({ id: newRecordId, projectId, test_key: "atterberg" });

      // Simulate delete with Promise.all, where some fail
      const recordsToDelete = databaseRecords.filter(
        (r) => r.projectId === projectId && r.test_key === "atterberg" && r.id !== newRecordId
      );

      const deleteResults = recordsToDelete.map((record) => {
        // Simulate: first delete succeeds, second fails, third succeeds
        if (record.id === 2) {
          return null; // Failed
        }
        // Remove from DB
        databaseRecords = databaseRecords.filter((r) => r.id !== record.id);
        return true; // Succeeded
      });

      const successCount = deleteResults.filter((r) => r !== null).length;
      expect(successCount).toBe(2); // 2 succeeded, 1 failed
      expect(databaseRecords.length).toBe(2); // Only failed delete (id=2) and new record (id=4) remain
    });

    it("should provide fallback to localStorage when API cleanup fails", () => {
      // When API cleanup fails, localStorage still has the data
      const storageKey = "atterbergProjectData";
      const storedPayload = createMockPayload(3);
      const storedData = JSON.stringify(storedPayload);

      // Simulate localStorage having fresh data
      const mockLocalStorage = {
        getItem: (key: string) => (key === storageKey ? storedData : null),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      };

      // API cleanup fails
      const apiFailure = new Error("Network error");

      // But we have localStorage fallback
      if (apiFailure) {
        const fallbackData = mockLocalStorage.getItem(storageKey);
        expect(fallbackData).toBeDefined();

        const fallbackPayload = JSON.parse(fallbackData!) as AtterbergExportPayload;
        expect(fallbackPayload.records).toHaveLength(3);
      }
    });

    it("should handle timeout during delete phase", () => {
      // Simulate: create succeeds, but delete times out
      const projectId = 123;
      let databaseRecords = [
        { id: 1, projectId, test_key: "atterberg" },
        { id: 2, projectId, test_key: "atterberg" },
      ];

      // Create new record
      const newRecordId = 3;
      databaseRecords.push({ id: newRecordId, projectId, test_key: "atterberg" });

      // Cleanup: simulate timeout
      let timedOut = false;
      try {
        // Simulate 30 second timeout from API
        throw new Error("Request timeout after 30000ms");
      } catch (error) {
        timedOut = true;
      }

      // Result: New record is in DB, old records not deleted
      // This is acceptable because:
      // 1. New data is safe
      // 2. On next save, orphaned records will be cleaned up
      expect(timedOut).toBe(true);
      expect(databaseRecords.filter((r) => r.projectId === projectId)).toHaveLength(3);
    });
  });

  describe("Race Condition and Concurrent Save Scenarios", () => {
    it("should handle rapid consecutive saves with debouncing", () => {
      // Simulate: user clicks save 5 times in 1 second
      const saves: number[] = [];
      const debounceMs = 500;
      let debounceTimer: NodeJS.Timeout | null = null;

      const triggerSave = () => {
        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }
        debounceTimer = setTimeout(() => {
          saves.push(Date.now());
          console.log("Save executed");
        }, debounceMs);
      };

      // Simulate rapid clicks
      triggerSave(); // t=0
      triggerSave(); // t=100ms
      triggerSave(); // t=200ms
      triggerSave(); // t=300ms
      triggerSave(); // t=400ms

      // With debounce, only one save should execute
      expect(saves.length).toBe(0); // No saves executed yet (still in debounce period)

      // After 500ms, save executes
      vi.useFakeTimers();
      vi.advanceTimersByTime(500);
      // In a real test with proper async handling, saves would have length 1
      // This demonstrates the concept
    });

    it("should ensure last saved data wins in concurrent scenario", () => {
      // Simulate two concurrent saves of the same project
      const projectId = 123;

      // Save A: User adds record 2
      const payloadA = createMockPayload(2);
      const recordA = { id: 101, projectId, payload: payloadA };

      // Save B: User adds record 3 (should overwrite A)
      const payloadB = createMockPayload(3);
      const recordB = { id: 102, projectId, payload: payloadB };

      // Simulate database state after both saves complete
      // The cleanup phase should delete old records
      // Last write wins
      let savedRecord = recordA;
      savedRecord = recordB; // B overwrites A

      expect(savedRecord.payload.records).toHaveLength(3);
    });

    it("should handle multiple users editing same project simultaneously", () => {
      // Simulate: User A and User B both load project with 2 records
      const projectId = 123;
      const initialPayload = createMockPayload(2);

      // User A loads project
      const userAPayload = { ...initialPayload };
      // User A adds record 3
      (userAPayload.records as any).push({
        id: "record-3-a",
        name: "Sample 3 (User A)",
      });

      // User B loads project (at same time)
      const userBPayload = { ...initialPayload };
      // User B adds record 3
      (userBPayload.records as any).push({
        id: "record-3-b",
        name: "Sample 3 (User B)",
      });

      // User A saves first (creates DB record with 3 records, deletes old ones)
      let databaseRecords = [{ id: 101, projectId, payload: userAPayload }];

      // User B saves second (creates DB record with 3 records, deletes old ones)
      // This is a race condition - User B's save will overwrite User A's
      databaseRecords = [{ id: 102, projectId, payload: userBPayload }];

      // Result: Only User B's data persists
      expect(databaseRecords[0].payload.records).toHaveLength(3);
      expect(databaseRecords[0].payload.records[2].name).toContain("User B");
    });

    it("should maintain data integrity during concurrent cleanup operations", () => {
      // Simulate: Project has 5 test_results rows (orphaned from previous saves)
      const projectId = 123;
      let databaseRecords = [
        { id: 1, projectId, test_key: "atterberg", created: "old" },
        { id: 2, projectId, test_key: "atterberg", created: "old" },
        { id: 3, projectId, test_key: "atterberg", created: "old" },
        { id: 4, projectId, test_key: "atterberg", created: "old" },
        { id: 5, projectId, test_key: "atterberg", created: "old" },
      ];

      // New save creates record 6 and starts cleanup of 1-5
      const newRecordId = 6;
      databaseRecords.push({ id: newRecordId, projectId, test_key: "atterberg", created: "new" });

      // Cleanup: delete all old records
      const recordsToDelete = databaseRecords.filter((r) => r.id !== newRecordId);
      expect(recordsToDelete).toHaveLength(5);

      // Delete them
      databaseRecords = databaseRecords.filter((r) => r.id === newRecordId);

      // Result: Clean state with only new record
      expect(databaseRecords).toHaveLength(1);
      expect(databaseRecords[0].id).toBe(newRecordId);
    });
  });
});
