import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchCurrentUser, getSessionToken, setSessionToken } from "@/lib/api";

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
