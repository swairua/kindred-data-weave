import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRecord, fetchCurrentUser, getSessionToken, listRecords, readRecord, setSessionToken } from "@/lib/api";

const fetchMock = vi.fn();

const response = (status: number, body: unknown, headers: HeadersInit = {}): Response => ({
  ok: status >= 200 && status < 300,
  status,
  headers: new Headers(headers),
  json: vi.fn().mockResolvedValue(body),
}) as unknown as Response;

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

describe("fetchCurrentUser", () => {
  it("clears a token only after a confirmed 401", async () => {
    fetchMock.mockResolvedValue(response(401, { message: "Unauthorized" }));

    await expect(fetchCurrentUser()).resolves.toBeNull();
    expect(getSessionToken()).toBeNull();
  });

  it("clears a token when the API explicitly reports an unauthenticated session", async () => {
    fetchMock.mockResolvedValue(response(200, { authenticated: false, user: null }));

    await expect(fetchCurrentUser()).resolves.toBeNull();
    expect(getSessionToken()).toBeNull();
  });

  it("preserves the token and rejects when the API cannot be reached", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(fetchCurrentUser()).rejects.toThrow("Failed to fetch");
    expect(getSessionToken()).toBe("preview-test-session");
  });

  it("preserves the token and rejects on server errors", async () => {
    fetchMock.mockResolvedValue(response(503, { message: "Service unavailable" }));

    await expect(fetchCurrentUser()).rejects.toThrow("Service unavailable");
    expect(getSessionToken()).toBe("preview-test-session");
  });

  it("stores a rotated session token from the current-user response", async () => {
    fetchMock.mockResolvedValue(response(200, {
      authenticated: true,
      user: { id: 7, name: "Test User", email: "test@example.com" },
    }, { "X-Session-Token": "rotated-session" }));

    await expect(fetchCurrentUser()).resolves.toEqual({ id: 7, name: "Test User", email: "test@example.com" });
    expect(getSessionToken()).toBe("rotated-session");
  });

  it("preserves the token and rejects malformed session responses", async () => {
    fetchMock.mockResolvedValue(response(200, { authenticated: true }));

    await expect(fetchCurrentUser()).rejects.toThrow("Invalid session response");
    expect(getSessionToken()).toBe("preview-test-session");
  });

  it("preserves the token and rejects when the session check times out", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
    }));

    const check = fetchCurrentUser(100);
    const rejectedCheck = expect(check).rejects.toThrow("Session check timed out");
    await vi.advanceTimersByTimeAsync(100);

    await rejectedCheck;
    expect(getSessionToken()).toBe("preview-test-session");
  });
});

describe("numeric column coercion", () => {
  /**
   * The PHP API returns every non-JSON column as a string (`new mysqli(...)` without
   * MYSQLI_OPT_INT_AND_FLOAT_NATIVE, and hydrateRow() only decodes `*_json`). The client coerces
   * the known integer columns back to numbers so id comparisons such as
   * `row.id === selectedResultId` cannot silently fail and create duplicate records.
   */
  it("converts string ids and counts to numbers in list records", async () => {
    fetchMock.mockResolvedValue(response(200, {
      table: "test_results",
      data: [
        { id: "88", project_id: "42", user_id: "1", test_key: "grading", data_points: "7", name: "PSD", updated_at: "2026-06-12 10:00:00" },
        { id: "89", project_id: "42", test_key: "proctor", data_points: "0", name: "Proctor" },
      ],
      limit: 5000,
      offset: 0,
    }));

    const result = await listRecords<{ id: number; project_id: number; user_id: number; data_points: number }>("test_results");

    expect(result.data[0]).toMatchObject({ id: 88, project_id: 42, user_id: 1, data_points: 7 });
    // Non-numeric columns are left untouched.
    expect(result.data[0]).toMatchObject({ test_key: "grading", name: "PSD", updated_at: "2026-06-12 10:00:00" });
    expect(result.data[1]).toMatchObject({ id: 89, data_points: 0 });
  });

  it("leaves null ids and non-numeric values alone", async () => {
    fetchMock.mockResolvedValue(response(200, {
      table: "test_results",
      data: [
        { id: null, project_id: "abc", test_key: "grading", data_points: "" },
        { id: "5", project_id: "7" },
      ],
      limit: 10,
      offset: 0,
    }));

    const result = await listRecords<Record<string, unknown>>("test_results");

    expect(result.data[0]).toMatchObject({ id: null, project_id: "abc", data_points: "" });
    expect(result.data[1]).toMatchObject({ id: 5, project_id: 7 });
  });

  it("converts the id returned by a read and by a write", async () => {
    fetchMock.mockResolvedValueOnce(response(200, {
      table: "projects",
      data: { id: "42", name: "Project" },
    }));
    const read = await readRecord<{ id: number; name: string }>("projects", 42);
    expect(read.data).toMatchObject({ id: 42, name: "Project" });

    fetchMock.mockResolvedValueOnce(response(200, {
      table: "test_results",
      id: "99",
      data: { id: "99", project_id: "42" },
    }));
    const created = await createRecord<{ id: number }>("test_results", { test_key: "grading" });
    expect(created.id).toBe(99);
    expect(created.data).toMatchObject({ id: 99, project_id: 42 });
  });
});
