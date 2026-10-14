import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveCompressiveTestId, setSessionToken } from "@/lib/api";

const fetchMock = vi.fn();

const response = (status: number, body: unknown): Response => ({
  ok: status >= 200 && status < 300,
  status,
  headers: new Headers(),
  json: vi.fn().mockResolvedValue(body),
}) as unknown as Response;

const compressiveList = (rows: Array<Record<string, unknown>>) =>
  response(200, { table: "compressive_tests", data: rows, limit: 5000, offset: 0 });

const resultRow = (row: Record<string, unknown>) =>
  response(200, { table: "test_results", data: row });

const test7 = {
  id: "7",
  project_id: "42",
  test_key: "compressive",
  updated_at: "2026-06-10 10:00:00",
  created_at: "2026-06-01 10:00:00",
};
const test9 = {
  id: "9",
  project_id: "42",
  test_key: "compressive",
  updated_at: "2026-06-12 10:00:00",
  created_at: "2026-06-02 10:00:00",
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  setSessionToken("preview-test-session");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("resolveCompressiveTestId", () => {
  it("honors an explicit compressive id stored in the result payload", async () => {
    fetchMock
      .mockResolvedValueOnce(compressiveList([test7, test9]))
      .mockResolvedValueOnce(resultRow({
        id: 88,
        project_id: 42,
        test_key: "compressive",
        payload_json: JSON.stringify({ compressive_test_id: 7 }),
      }));

    // Payload names test 7 even though test 9 is newer.
    await expect(resolveCompressiveTestId(88, 42)).resolves.toBe(7);
  });

  it("honors the bare test_id link live rows carry", async () => {
    fetchMock
      .mockResolvedValueOnce(compressiveList([test7, test9]))
      .mockResolvedValueOnce(resultRow({
        id: 407,
        project_id: 42,
        test_key: "compressive",
        payload_json: JSON.stringify({ test_id: 7 }),
      }));

    await expect(resolveCompressiveTestId(407, 42)).resolves.toBe(7);
  });

  it("also reads the camelCase key from key_results_json", async () => {
    fetchMock
      .mockResolvedValueOnce(compressiveList([test7, test9]))
      .mockResolvedValueOnce(resultRow({
        id: 88,
        project_id: 42,
        test_key: "compressive",
        payload_json: "{}",
        key_results_json: JSON.stringify({ compressiveTestId: "7" }),
      }));

    await expect(resolveCompressiveTestId(88, 42)).resolves.toBe(7);
  });

  it("falls back to the newest project test when the payload names nothing", async () => {
    fetchMock
      .mockResolvedValueOnce(compressiveList([test7, test9]))
      .mockResolvedValueOnce(resultRow({
        id: 88,
        project_id: 42,
        test_key: "compressive",
        payload_json: "{}",
      }));

    await expect(resolveCompressiveTestId(88, 42)).resolves.toBe(9);
  });

  it("ignores a payload id that belongs to another project", async () => {
    fetchMock
      .mockResolvedValueOnce(compressiveList([test7]))
      .mockResolvedValueOnce(resultRow({
        id: 88,
        project_id: 42,
        test_key: "compressive",
        payload_json: JSON.stringify({ compressive_test_id: 99 }),
      }));

    // Test 99 is not one of project 42's tests: latest-wins, not a blind trust.
    await expect(resolveCompressiveTestId(88, 42)).resolves.toBe(7);
  });

  it("returns null when the project has no compressive tests, without reading the row", async () => {
    fetchMock.mockResolvedValueOnce(compressiveList([]));

    await expect(resolveCompressiveTestId(88, 42)).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns null when the test list cannot be loaded", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await expect(resolveCompressiveTestId(88, 42)).resolves.toBeNull();
  });
});
