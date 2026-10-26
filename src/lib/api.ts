import type { ReceptionConsignmentInput, ReceptionFieldArea, ReceptionFieldDefinition, ReceptionPhoto } from "@/lib/reception";
import { consignmentIsOnHold, getPrimaryTestTypeFromConsignment, type ReceptionSampleInput } from "@/lib/reception";
import { type ApiCompressiveTestRow } from "@/types/api";

const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();

// In development (localhost), use the proxied path to bypass CORS
// In production, use the full URL to the actual API server
// If VITE_API_BASE_URL is set, always use that
export const API_BASE_URL = configuredApiBaseUrl ||
  (import.meta.env.DEV ? "/api.php" : "https://lab.wayrus.co.ke/api.php");

// Log API configuration on module load
console.log("[API] === CONFIGURATION ===");
console.log("[API] VITE_API_BASE_URL env:", configuredApiBaseUrl ? `"${configuredApiBaseUrl}"` : "(not set)");
console.log("[API] Development mode:", import.meta.env.DEV);
console.log("[API] Final API_BASE_URL:", API_BASE_URL);
console.log("[API] window.location.origin:", window.location.origin);

const SESSION_STORAGE_KEY = "lab_session_token";
const SESSION_STORAGE_SESSION_KEY = "lab_session_token_session"; // Fallback for sandboxed environments

// Session token management (stored in localStorage for persistence)
// Falls back to sessionStorage, then memory storage if localStorage is unavailable (e.g., in sandboxed environments)
let sessionTokenMemory: string | null = null;

const isLocalStorageAvailable = (): boolean => {
  try {
    const test = "__localStorage_test__";
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return true;
  } catch (e) {
    return false;
  }
};

const isSessionStorageAvailable = (): boolean => {
  try {
    const test = "__sessionStorage_test__";
    sessionStorage.setItem(test, test);
    sessionStorage.removeItem(test);
    return true;
  } catch (e) {
    return false;
  }
};

// Initialize on module load: restore token from localStorage/sessionStorage if available
const initializeTokenFromStorage = (): string | null => {
  try {
    // Try localStorage first (most persistent)
    const storedToken = localStorage.getItem(SESSION_STORAGE_KEY);
    if (storedToken) {
      sessionTokenMemory = storedToken;
      console.debug(`[API] ✓ Session token restored from localStorage on module load (${storedToken.substring(0, 20)}...)`);
      return storedToken;
    }
  } catch (e) {
    console.debug(`[API] Could not read token from localStorage on init:`, e instanceof Error ? e.message : e);
  }

  // Fallback to sessionStorage (works in sandboxed environments)
  try {
    const sessionToken = sessionStorage.getItem(SESSION_STORAGE_SESSION_KEY);
    if (sessionToken) {
      sessionTokenMemory = sessionToken;
      console.debug(`[API] ✓ Session token restored from sessionStorage on module load (${sessionToken.substring(0, 20)}...)`);
      return sessionToken;
    }
  } catch (e) {
    console.debug(`[API] Could not read token from sessionStorage on init:`, e instanceof Error ? e.message : e);
  }

  return null;
};

// Initialize token from storage immediately
initializeTokenFromStorage();

export const setSessionToken = (token: string | null) => {
  const timestamp = new Date().toISOString();
  if (token) {
    // Try to save to localStorage first (most persistent)
    let savedToLocalStorage = false;
    try {
      localStorage.setItem(SESSION_STORAGE_KEY, token);
      savedToLocalStorage = true;
    } catch (e) {
      console.debug(`[API] Could not save token to localStorage (may be sandboxed):`, e instanceof Error ? e.message : e);
    }

    // Fallback to sessionStorage if localStorage failed
    let savedToSessionStorage = false;
    if (!savedToLocalStorage) {
      try {
        sessionStorage.setItem(SESSION_STORAGE_SESSION_KEY, token);
        savedToSessionStorage = true;
      } catch (e) {
        console.warn(`[API] Could not save token to sessionStorage either:`, e instanceof Error ? e.message : e);
      }
    }

    // Always keep in memory as ultimate fallback
    sessionTokenMemory = token;
    console.log(`[API] ${timestamp} ✓ Session token STORED (${token.substring(0, 20)}...) [localStorage: ${savedToLocalStorage ? "✓" : "✗"}, sessionStorage: ${savedToSessionStorage ? "✓" : "✗"}, memory: ✓]`);
  } else {
    // Clear from all storage locations
    let clearedFromStorage = false;
    let previousToken: string | null = null;
    try {
      previousToken = localStorage.getItem(SESSION_STORAGE_KEY);
      localStorage.removeItem(SESSION_STORAGE_KEY);
      clearedFromStorage = true;
    } catch (e) {
      console.debug(`[API] Could not clear from localStorage:`, e instanceof Error ? e.message : e);
    }

    // Also clear from sessionStorage
    try {
      sessionStorage.removeItem(SESSION_STORAGE_SESSION_KEY);
    } catch (e) {
      console.debug(`[API] Could not clear from sessionStorage:`, e instanceof Error ? e.message : e);
    }

    sessionTokenMemory = null;
    console.log(`[API] ${timestamp} ✗ Session token CLEARED${previousToken ? ` (was: ${previousToken.substring(0, 20)}...)` : ""} [localStorage: ${clearedFromStorage ? "✓" : "✗"}, sessionStorage: cleared, memory: ✓]`);
  }
};

export const getSessionToken = (): string | null => {
  // Try localStorage first (most persistent)
  try {
    const token = localStorage.getItem(SESSION_STORAGE_KEY);
    if (token) {
      // Sync memory storage with localStorage
      if (sessionTokenMemory !== token) {
        console.debug(`[API] Token mismatch: localStorage has token but memory doesn't - syncing`);
        sessionTokenMemory = token;
      }
      return token;
    }
  } catch (e) {
    console.debug(`[API] Could not read token from localStorage:`, e instanceof Error ? e.message : e);
  }

  // Fall back to sessionStorage (works in sandboxed environments)
  try {
    const token = sessionStorage.getItem(SESSION_STORAGE_SESSION_KEY);
    if (token) {
      // Sync memory storage with sessionStorage
      if (sessionTokenMemory !== token) {
        console.debug(`[API] Token mismatch: sessionStorage has token but memory doesn't - syncing`);
        sessionTokenMemory = token;
      }
      return token;
    }
  } catch (e) {
    console.debug(`[API] Could not read token from sessionStorage:`, e instanceof Error ? e.message : e);
  }

  // Fall back to memory storage
  if (sessionTokenMemory) {
    console.debug(`[API] Using token from memory (storage unavailable)`);
  }
  return sessionTokenMemory;
};

// Backward compatibility
export const setStoredSessionId = (sessionId: string | null) => {
  setSessionToken(sessionId);
};

export const getStoredSessionId = (): string | null => {
  return getSessionToken();
};

// Debug function - can be called from browser console
export const debugAuthState = () => {
  const token = getSessionToken();
  console.log("[API] === AUTH STATE DEBUG ===");
  console.log("[API] Session token available:", token ? `✓ Yes` : "✗ No");
  if (token) {
    console.log("[API] Token value (first 50 chars):", token.substring(0, 50));
    console.log("[API] Token length:", token.length);
  }
  console.log("[API] API Base URL:", API_BASE_URL);

  let localStorageToken: string | null = null;
  try {
    localStorageToken = localStorage.getItem(SESSION_STORAGE_KEY);
  } catch (e) {
    console.warn("[API] Could not access localStorage:", e instanceof Error ? e.message : e);
  }

  console.log("[API] Storage status:");
  console.log("[API]   - localStorage token:", localStorageToken ? `✓ Present (${localStorageToken.substring(0, 20)}...)` : "✗ Empty");
  console.log("[API]   - memory token:", (window as any).__sessionTokenMemory ? `✓ Present` : "✗ Empty");
  console.log("[API] For next request, X-Session-Token will be:", token ? `✓ Sent (${token.substring(0, 20)}...)` : "✗ Not sent");
  console.log("[API] If you see '✗ Not sent', the token was lost. Try logging in again.");
};

// Make debug auth available globally on window
(window as any).__debugAuth = debugAuthState;

// Debug function to check API connectivity - can be called from browser console
// Connectivity check utility
export const checkApiConnectivity = async (): Promise<boolean> => {
  try {
    const url = buildApiUrl({ action: "me" });
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout for connectivity check

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Accept": "application/json",
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    // Any response (even 401) means server is reachable
    return true;
  } catch (error) {
    return false;
  }
};

export const debugApiConnectivity = async () => {
  console.log("[API] === API CONNECTIVITY DEBUG ===");
  console.log("[API] Checking API configuration...");
  console.log("[API] VITE_API_BASE_URL env:", configuredApiBaseUrl ? `"${configuredApiBaseUrl}"` : "(not set)");
  console.log("[API] Development mode:", import.meta.env.DEV);
  console.log("[API] API_BASE_URL:", API_BASE_URL);
  console.log("[API] window.location.origin:", window.location.origin);

  console.log("[API] Attempting test request to API...");
  try {
    const url = buildApiUrl({ action: "me" });
    console.log("[API] Test URL:", url);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Accept": "application/json",
      },
    });

    console.log("[API] ✓ Connected to API server!");
    console.log("[API] Response status:", response.status);
    console.log("[API] Response headers:", {
      "Content-Type": response.headers.get("Content-Type"),
      "Access-Control-Allow-Origin": response.headers.get("Access-Control-Allow-Origin"),
    });

  } catch (error) {
    console.error("[API] ✗ Failed to connect to API server");
    console.error("[API] Error:", error instanceof Error ? error.message : String(error));
    console.error("[API] Troubleshooting steps:");
    console.error("[API] 1. Check if lab.wayrus.co.ke is reachable (try in a new tab)");
    console.error("[API] 2. Verify VITE_API_BASE_URL environment variable is set correctly");
    console.error("[API] 3. Check browser network tab (F12 > Network) for CORS errors");
    console.error("[API] 4. Ensure the API server at https://lab.wayrus.co.ke is running");
    console.error("[API] 5. Check your internet connection and firewall settings");
  }
};

export interface ApiUser {
  id: number;
  email: string;
  name: string;
}

interface LoginResponse {
  message: string;
  user_id: number;
  user: ApiUser;
  session_token?: string; // Optional session token if backend provides it in response body
}

interface CurrentUserResponse {
  user: ApiUser | null;
  authenticated: boolean;
}

interface LogoutResponse {
  message: string;
}

export const buildApiUrl = (params?: Record<string, string | number | boolean | null | undefined>) => {
  // Validate API_BASE_URL before constructing
  if (!API_BASE_URL) {
    const errorMsg = "[API] FATAL: API_BASE_URL is not configured. Check VITE_API_BASE_URL environment variable.";
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  try {
    // Handle relative URLs (e.g., /api.php) by providing the base origin
    const url = new URL(API_BASE_URL, window.location.origin);

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value === undefined || value === null || value === "") return;
        url.searchParams.set(key, String(value));
      });
    }

    const finalUrl = url.toString();
    console.debug("[API] Built URL:", finalUrl);
    return finalUrl;
  } catch (error) {
    const errorMsg = `[API] Failed to construct URL: ${error instanceof Error ? error.message : String(error)}. API_BASE_URL="${API_BASE_URL}", window.location.origin="${window.location.origin}"`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }
};

export const apiRequest = async <T>(
  init?: RequestInit,
  params?: Record<string, string | number | boolean | null | undefined>,
  timeoutMs: number = 30000, // Make timeout configurable, default 30 seconds
): Promise<T> => {
  const headers = new Headers(init?.headers);

  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }

  if (init?.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  // Add session token as header if available
  const sessionToken = getSessionToken();
  if (sessionToken && !headers.has("X-Session-Token")) {
    headers.set("X-Session-Token", sessionToken);
    console.debug(`[API] Session token added to X-Session-Token header`);
  } else if (!sessionToken) {
    console.debug(`[API] No session token available - request will not have X-Session-Token header`);
  }

  const url = buildApiUrl(params);
  const controller = new AbortController();
  let timeoutId: NodeJS.Timeout | null = null;
  let isAborted = false;

  timeoutId = setTimeout(() => {
    console.warn(`[API] Request timeout after ${timeoutMs}ms for action: ${params?.action || 'unknown'}`);
    isAborted = true;
    controller.abort(new Error("Request timeout"));
  }, timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      headers,
      signal: controller.signal,
    });

    // Clear timeout on successful response
    if (timeoutId) clearTimeout(timeoutId);

    // Check for session token in response headers
    const responseSessionToken = response.headers.get("X-Session-Token");
    if (responseSessionToken && responseSessionToken !== sessionToken) {
      setSessionToken(responseSessionToken);
      console.log(`[API] Received new session token from server`);
    }

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const errorMessage = data?.message || data?.error || `HTTP ${response.status}`;

      // 401 on "me" endpoint on initial load is expected when user is not logged in
      // Only log as error if it's unexpected (not the "me" action or status is not 401)
      if (response.status === 401 && params?.action === "me") {
        console.debug(`[API] Expected 401 on me endpoint - user not authenticated yet`);
      } else if (response.status === 401) {
        // Stale/expired token — clear it so the rest of the app stops re-sending it
        if (sessionToken) {
          console.warn(`[API] Clearing stale session token after 401 on action: ${params?.action || 'unknown'}`);
          setSessionToken(null);
        }
        const tokenStatus = headers.get("X-Session-Token");
        console.error(`[API] ⚠️ 401 UNAUTHORIZED on action: ${params?.action || 'unknown'}`);
        console.error(`[API] This may cause unexpected logout if the user's session expired`);
        console.error(`[API] Token was ${tokenStatus ? "present" : "MISSING"}`);

        // Diagnostic info for debugging token issues
        if (!tokenStatus) {
          console.error(`[API] 🔍 DIAGNOSTIC: Token is missing! Checking storage...`);
          try {
            const localStorageToken = localStorage.getItem(SESSION_STORAGE_KEY);
            console.error(`[API]   - localStorage has token: ${localStorageToken ? `✓ Yes (${localStorageToken.substring(0, 20)}...)` : "✗ No"}`);
          } catch (e) {
            console.error(`[API]   - localStorage inaccessible:`, e instanceof Error ? e.message : e);
          }
          console.error(`[API]   - Try calling 'window.__debugAuth()' in console for full auth state`);
        }

        console.error(`[API] Response data:`, JSON.stringify(data, null, 2));
        console.error(`[API] Request URL:`, url);
        console.error(`[API] Request headers sent:`, Object.fromEntries(headers.entries()));

        // Log CORS-related headers for debugging
        console.error(`[API] Response headers:`, {
          "Access-Control-Allow-Credentials": response.headers.get("access-control-allow-credentials"),
          "Access-Control-Allow-Origin": response.headers.get("access-control-allow-origin"),
          "X-Session-Token": response.headers.get("X-Session-Token"),
        });
      } else {
        console.error(`[API] Request failed: ${params?.action || 'unknown'} - Status: ${response.status} - ${errorMessage}`);
        console.error(`[API] Response data:`, JSON.stringify(data, null, 2));
        console.error(`[API] Request URL:`, url);
        console.error(`[API] Request headers sent:`, Object.fromEntries(headers.entries()));
        console.error(`[API] X-Session-Token header:`, headers.get("X-Session-Token") ? "✓ Present" : "✗ Not sent");

        // Log CORS-related headers for debugging
        console.error(`[API] Response headers:`, {
          "Access-Control-Allow-Credentials": response.headers.get("access-control-allow-credentials"),
          "Access-Control-Allow-Origin": response.headers.get("access-control-allow-origin"),
          "X-Session-Token": response.headers.get("X-Session-Token"),
        });
      }
      throw new Error(errorMessage);
    }

    return data as T;
  } catch (error) {
    // Ensure timeout cleanup
    if (timeoutId) clearTimeout(timeoutId);

    // Handle abort errors with specific messaging
    if (error instanceof DOMException && error.name === "AbortError") {
      const reason = (error as any).reason?.message || "Request timeout";
      if (isAborted) {
        console.warn(`[API] Request timeout for action: ${params?.action || 'unknown'}`);
        throw new Error(`Request timeout: The server took too long to respond (>${timeoutMs / 1000}s). Please check your network connection and try again.`);
      }
      throw new Error(`Request was aborted: ${reason}`);
    }

    if (error instanceof TypeError && error.message.includes("Failed to fetch")) {
      // Network error - provide helpful debugging info
      const action = params?.action || 'unknown';
      console.warn(`[API] Failed to fetch for action: ${action}`);
      console.warn(`[API] URL attempted: ${url}`);
      console.warn(`[API] This typically means:`);
      console.warn(`[API]   1. The API server is unreachable`);
      console.warn(`[API]   2. Network connectivity issue`);
      console.warn(`[API]   3. CORS or proxy configuration issue`);
      console.warn(`[API]   4. API_BASE_URL is incorrect`);

      // For background tasks (like project loading), be less verbose
      const isBackgroundTask = ['list', 'me', 'logout'].includes(String(action));
      if (!isBackgroundTask) {
        throw new Error(`Unable to reach API server at ${url}. Please ensure you have a valid internet connection and the API server is running.`);
      } else {
        throw new Error(`Unable to reach API server. Please check your connection and try again.`);
      }
    }

    throw error;
  }
};

export const loginUser = async (email: string, password: string) => {
  const timestamp = new Date().toISOString();
  console.log(`[API] ${timestamp} === LOGIN REQUEST START ===`);
  console.log("[API] Attempting login for email:", email);
  console.log("[API] API endpoint:", buildApiUrl({ action: "login" }));

  try {
    const response = await apiRequest<LoginResponse>(
      {
        method: "POST",
        body: JSON.stringify({ email, password }),
      },
      { action: "login" },
    );

    const loginTimestamp = new Date().toISOString();
    console.log(`[API] ${loginTimestamp} === LOGIN RESPONSE ===`);
    console.log("[API] Login successful. User:", response.user.name, "User ID:", response.user_id);
    console.log("[API] Full response:", JSON.stringify(response, null, 2));

    // Store session token from response body if provided
    // Note: apiRequest already checks response headers for X-Session-Token and calls setSessionToken if found
    if (response.session_token) {
      setSessionToken(response.session_token);
      console.log("[API] ✓ Session token received in response body and stored");
      console.log("[API] Token:", response.session_token.substring(0, 20) + "...");
    } else {
      console.log("[API] ℹ️ No session_token in response body (may be in response headers via apiRequest)");
      console.log("[API] Check if backend is returning: { \"session_token\": \"...\" } in response body");
    }

    const storedToken = getSessionToken();
    if (storedToken) {
      console.log("[API] ✓ Stored session token available:", `✓ Yes (${storedToken.substring(0, 20)}...)`);
      console.log("[API] This token will be sent as X-Session-Token header in future requests");
    } else {
      console.warn("[API] ⚠️ WARNING: No session token found after login!");
      console.warn("[API] - Response body token:", response.session_token ? "✓ Present" : "✗ Missing");
      console.warn("[API] - Check that backend is returning session_token in response body or X-Session-Token header");
      console.warn("[API] - Also check that localStorage is available (not blocked by browser/sandbox)");
    }

    return response;
  } catch (error) {
    const errorTimestamp = new Date().toISOString();
    console.error(`[API] ${errorTimestamp} Login failed:`, error instanceof Error ? error.message : error);
    if (error instanceof Error) {
      console.error("[API] Error stack:", error.stack);
    }
    throw error;
  }
};

export const fetchCurrentUser = async (timeoutMs: number = 15000) => {
  const timestamp = new Date().toISOString();
  const controller = new AbortController();
  let timeoutHandle: NodeJS.Timeout | null = null;

  try {
    console.log(`[API] ${timestamp} === ME ENDPOINT REQUEST START (timeout: ${timeoutMs}ms) ===`);
    console.log("[API] Session token available:", getSessionToken() ? "✓ Yes" : "✗ No");

    const url = buildApiUrl({ action: "me" });
    const sessionToken = getSessionToken();
    const headers: HeadersInit = {
      "Accept": "application/json",
    };

    if (sessionToken) {
      headers["X-Session-Token"] = sessionToken;
    }

    timeoutHandle = setTimeout(() => {
      console.warn(`[API] ${timestamp} Session check timeout triggered after ${timeoutMs}ms`);
      console.warn(`[API] This typically indicates:`);
      console.warn(`[API]   - API server is slow to respond`);
      console.warn(`[API]   - Network connectivity issue`);
      console.warn(`[API]   - API endpoint is unresponsive`);
      controller.abort(new Error("Session check timeout"));
    }, timeoutMs);

    const response = await fetch(url, {
      method: "GET",
      headers,
      signal: controller.signal,
    });

    // Clear timeout on successful response
    if (timeoutHandle) clearTimeout(timeoutHandle);

    const rotatedToken = response.headers.get("X-Session-Token");
    if (rotatedToken && rotatedToken !== sessionToken) setSessionToken(rotatedToken);

    console.log(`[API] ${timestamp} === ME ENDPOINT RESPONSE ===`);

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      const errorMessage = data?.message || data?.error || `HTTP ${response.status}`;

      // 401 is expected when user is not authenticated
      if (response.status === 401) {
        console.log(`[API] ${timestamp} User not authenticated (401 response - session expired or not logged in)`);
        // Clear stale token so we stop sending it on subsequent requests
        if (getSessionToken()) {
          setSessionToken(null);
        }
        return null;
      }

      throw new Error(errorMessage);
    }

    const data = await response.json().catch(() => ({})) as CurrentUserResponse;

    // If the response indicates not authenticated, return null
    if (data?.authenticated === false || data?.user === null) {
      console.log(`[API] ${timestamp} User not authenticated (response indicated unauthenticated)`);
      if (getSessionToken()) setSessionToken(null);
      return null;
    }
    if (!data?.user) throw new Error("Invalid session response");

    console.log(`[API] ${timestamp} ✓ User authenticated as: ${data.user.name} (${data.user.email})`);
    return data.user;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorTimestamp = new Date().toISOString();

    if (controller.signal.aborted) {
      console.warn(`[API] ${errorTimestamp} Session check timed out after ${timeoutMs}ms`);
      throw new Error("Session check timed out");
    }

    console.warn(`[API] ${errorTimestamp} ME endpoint error:`, errorMessage);
    throw error;
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
};

export interface ApiListResponse<T> {
  table: string;
  data: T[];
  limit: number;
  offset: number;
}

export interface ApiReadResponse<T> {
  table: string;
  data: T;
}

/**
 * The `read` endpoint answers 404 with `Record not found` when the row does
 * not exist (or belongs to another user); callers use this to branch into
 * their recovery path instead of showing a generic failure toast.
 */
export const isRecordNotFoundError = (error: unknown): boolean =>
  error instanceof Error && /record not found/i.test(error.message);

export interface ApiWriteResponse<T> {
  message: string;
  table: string;
  id?: number;
  data: T | null;
  deleted?: boolean;
  last_saved_at?: string;
}

/**
 * Integer columns that the PHP API hands back as strings.
 *
 * `api.php` opens the connection with a plain `new mysqli(...)` (no
 * `MYSQLI_OPT_INT_AND_FLOAT_NATIVE`) and `hydrateRow()` only JSON-decodes `*_json` columns, so every
 * other column reaches the browser as a string. Coercing them here makes the declared `number` types
 * true and stops `row.id === someNumber` comparisons from silently failing, which is what caused
 * duplicate `test_results` rows when a test result was edited from the Test results page.
 */
const NUMERIC_COLUMNS = new Set([
  "id",
  "user_id",
  "project_id",
  "test_id",
  "parent_id",
  "company_id",
  "record_id",
  "test_result_id",
  "data_points",
  "sort_order",
]);

const coerceNumericColumns = (row: unknown): unknown => {
  if (typeof row !== "object" || row === null || Array.isArray(row)) return row;
  const source = row as Record<string, unknown>;
  const result: Record<string, unknown> = { ...source };
  for (const key of Object.keys(result)) {
    if (!NUMERIC_COLUMNS.has(key)) continue;
    const value = result[key];
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed === "" || !Number.isFinite(Number(trimmed))) continue;
    result[key] = Number(trimmed);
  }
  return result;
};

const coerceWriteResponse = <T>(response: ApiWriteResponse<T>): ApiWriteResponse<T> => ({
  ...response,
  id: typeof response.id === "string" ? Number(response.id) : response.id,
  data: coerceNumericColumns(response.data) as T | null,
});

export const listRecords = async <T>(table: string, params?: Record<string, string | number | boolean | null | undefined>) => {
  const timestamp = new Date().toISOString();
  console.log(`[API] ${timestamp} Starting list request for table: ${table} with params:`, params);
  try {
    const response = await apiRequest<ApiListResponse<T>>(undefined, { action: "list", table, ...params });
    response.data = (response.data || []).map((row) => coerceNumericColumns(row) as T);
    console.log(`[API] ${timestamp} Successfully loaded ${response.data.length} records from ${table}`);
    return response;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[API] ${timestamp} Failed to load records from ${table}:`, errorMsg);
    throw error;
  }
};

/** Reception consignments persist server-side once the table ships, localStorage until then. */
const RECEPTION_STORAGE_KEY = "cransfield_reception_consignments_v1";

export const listReceptionConsignments = async (): Promise<ReceptionConsignmentInput[]> => {
  try {
    const stored = await listRecords<{ id?: number; rc_no?: string; job_no?: string; status?: string; project_id?: number | null; payload_json?: unknown; processed_at?: string | null }>("reception_consignments", { limit: 500 });
    const rows = stored.data || [];
    if (rows.length > 0) {
      const consignments: ReceptionConsignmentInput[] = [];
      for (const row of rows) {
        const payload = row.payload_json;
        const parsed = typeof payload === "string" ? JSON.parse(payload) as unknown : payload;
        if (parsed && typeof parsed === "object" && "rcNo" in (parsed as Record<string, unknown>)) {
          const c = parsed as ReceptionConsignmentInput;
          if (row.project_id !== undefined && row.project_id !== null) c.projectId = row.project_id;
          else if ((c as any).project_id !== undefined) c.projectId = (c as any).project_id;
          if (row.processed_at) c.processedAt = row.processed_at;
          consignments.push(c);
        } else if (parsed && typeof parsed === "object") {
          const c = parsed as any;
          c.rcNo = c.rcNo || row.rc_no;
          c.jobNo = c.jobNo || row.job_no;
          c.status = c.status || row.status;
          if (row.project_id) c.projectId = row.project_id;
          if (row.processed_at) c.processedAt = row.processed_at;
          consignments.push(c);
        }
      }
      if (consignments.length > 0) return consignments;
    }
  } catch {
    // Backend table not provisioned yet — fall through to localStorage.
  }
  try {
    const raw = localStorage.getItem(RECEPTION_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as ReceptionConsignmentInput[]) : [];
  } catch {
    return [];
  }
};

export const saveReceptionConsignment = async (consignment: ReceptionConsignmentInput): Promise<void> => {
  try {
    const stored = await listRecords<{ id: number; rc_no?: string; payload_json?: unknown }>("reception_consignments", { limit: 500 });
    const match = (stored.data || []).find((row) => {
      const payload = row.payload_json;
      const parsed = typeof payload === "string" ? JSON.parse(payload) as unknown : payload;
      return (!!parsed && typeof parsed === "object" && (parsed as ReceptionConsignmentInput).rcNo === consignment.rcNo) || row.rc_no === consignment.rcNo;
    });
    if (match) {
      await updateRecord("reception_consignments", match.id, { 
        rc_no: consignment.rcNo,
        job_no: consignment.jobNo,
        status: consignment.status,
        project_id: consignment.projectId ?? (consignment as any).project_id ?? null,
        processed_at: consignment.processedAt ?? null,
        payload_json: JSON.stringify(consignment) 
      });
    } else {
      await createRecord("reception_consignments", {
        rc_no: consignment.rcNo,
        job_no: consignment.jobNo,
        status: consignment.status,
        project_id: consignment.projectId ?? null,
        processed_at: consignment.processedAt ?? null,
        payload_json: JSON.stringify(consignment),
      });
    }
    return;
  } catch {
    // Backend table not provisioned yet — persist locally so reception keeps working.
  }
  let existing: ReceptionConsignmentInput[] = [];
  try {
    const raw = localStorage.getItem(RECEPTION_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) existing = parsed as ReceptionConsignmentInput[];
    }
  } catch {
    existing = [];
  }
  const next = [...existing.filter((c) => c.rcNo !== consignment.rcNo), consignment];
  try {
    localStorage.setItem(RECEPTION_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage full/blocked: reception still works for the session.
  }
};

/** Reception custom-field definitions helpers. */

const mapReceptionFieldDefinition = (value: unknown): ReceptionFieldDefinition => {
  const row = value as Record<string, unknown>;
  const rawOptions = row.options ?? row.options_json;
  let options = rawOptions;
  if (typeof rawOptions === "string") {
    try {
      options = JSON.parse(rawOptions) as unknown;
    } catch {
      options = [];
    }
  }
  return {
    id: Number(row.id),
    area: (row.area ?? "consignment") as ReceptionFieldArea,
    fieldKey: String(row.field_key ?? row.fieldKey ?? ""),
    label: String(row.label ?? ""),
    valueType: (row.value_type ?? row.valueType ?? "text") as ReceptionFieldDefinition["valueType"],
    options: Array.isArray(options) ? options.map(String) : [],
    sortOrder: Number(row.sort_order ?? row.sortOrder ?? 0),
    isRequired: [row.is_required, row.isRequired].some((value) => value === 1 || value === true || value === "1"),
    isActive: [row.is_active, row.isActive].some((value) => value === 1 || value === true || value === "1"),
  };
};

const mapReceptionPhoto = (value: unknown): ReceptionPhoto => {
  const row = value as Record<string, unknown>;
  return {
    id: Number(row.id),
    rcNo: String(row.rc_no ?? row.rcNo ?? ""),
    filePath: new URL(String(row.file_path ?? row.filePath ?? ""), new URL(API_BASE_URL, window.location.origin)).toString(),
    originalFilename: (row.original_filename ?? row.originalFilename) as string | undefined,
    fileSize: Number(row.file_size ?? row.fileSize) || undefined,
    mimeType: (row.mime_type ?? row.mimeType) as string | undefined,
    caption: row.caption as string | undefined,
    uploadedBy: Number(row.uploaded_by ?? row.uploadedBy) || undefined,
    createdAt: (row.created_at ?? row.createdAt) as string | undefined,
  };
};

export const listReceptionFieldDefinitions = async (
  area?: ReceptionFieldArea
): Promise<ReceptionFieldDefinition[]> => {
  try {
    const response = await listRecords<ReceptionFieldDefinition>("reception_field_definitions", {
      action: "list",
      table: "reception_field_definitions",
      limit: "500",
      ...(area ? { area } : {}),
    });
    return (response.data || []).map(mapReceptionFieldDefinition);
  } catch {
    return [];
  }
};

export const createReceptionFieldDefinition = async (
  def: Omit<ReceptionFieldDefinition, "id">
): Promise<ReceptionFieldDefinition | null> => {
  try {
    const response = await createRecord<ReceptionFieldDefinition>(
      "reception_field_definitions",
      {
        area: def.area,
        field_key: def.fieldKey,
        label: def.label,
        value_type: def.valueType,
        options: def.options ? JSON.stringify(def.options) : null,
        sort_order: def.sortOrder,
        is_required: def.isRequired ? 1 : 0,
        is_active: def.isActive ? 1 : 0,
      }
    );
    return response.data ? mapReceptionFieldDefinition(response.data) : null;
  } catch {
    return null;
  }
};

export const updateReceptionFieldDefinition = async (
  id: number | string,
  def: Partial<Omit<ReceptionFieldDefinition, "id">>
): Promise<ReceptionFieldDefinition | null> => {
  try {
    const data: Record<string, unknown> = {};
    if (def.area !== undefined) data.area = def.area;
    if (def.fieldKey !== undefined) data.field_key = def.fieldKey;
    if (def.label !== undefined) data.label = def.label;
    if (def.valueType !== undefined) data.value_type = def.valueType;
    if (def.options !== undefined) data.options = JSON.stringify(def.options);
    if (def.sortOrder !== undefined) data.sort_order = def.sortOrder;
    if (def.isRequired !== undefined) data.is_required = def.isRequired ? 1 : 0;
    if (def.isActive !== undefined) data.is_active = def.isActive ? 1 : 0;
    const response = await updateRecord<ReceptionFieldDefinition>(
      "reception_field_definitions",
      id,
      data
    );
    return response.data ? mapReceptionFieldDefinition(response.data) : null;
  } catch {
    return null;
  }
};

export const deleteReceptionFieldDefinition = async (id: number | string): Promise<boolean> => {
  try {
    await deleteRecord<ReceptionFieldDefinition>("reception_field_definitions", id);
    return true;
  } catch {
    return false;
  }
};

/** Reception photo helpers. */

export const listReceptionPhotos = async (rcNo: string): Promise<ReceptionPhoto[]> => {
  try {
    const response = await listRecords<ReceptionPhoto>("reception_photos", {
      action: "list",
      table: "reception_photos",
      filter: `rc_no=${rcNo}`,
      limit: "500",
    });
    return (response.data || []).map(mapReceptionPhoto);
  } catch {
    return [];
  }
};

export const uploadReceptionPhoto = async (
  file: File,
  rcNo: string
): Promise<ReceptionPhoto | null> => {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("rc_no", rcNo);

  const url = buildApiUrl({ action: "upload-reception-photo" });
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minute timeout for uploads

  try {
    // Send session token so requireAuth() on the server can restore the session
    const headers: HeadersInit = {};
    const sessionToken = getSessionToken();
    if (sessionToken) {
      headers["X-Session-Token"] = sessionToken;
    }

    const response = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers,
      body: formData,
      signal: controller.signal,
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const errorMessage = data?.message || data?.error || `HTTP ${response.status}`;
      console.error("[API] Reception photo upload failed -", errorMessage);
      throw new Error(errorMessage);
    }

    // Capture rotated session token from response header
    const responseSessionToken = response.headers.get("X-Session-Token");
    if (responseSessionToken) {
      setSessionToken(responseSessionToken);
    }

    return mapReceptionPhoto({
      ...data,
      rc_no: data?.rc_no ?? rcNo,
      file_path: data?.file_path ?? "",
      original_filename: data?.original_filename ?? file.name,
      file_size: data?.file_size ?? file.size,
      mime_type: data?.mime_type ?? file.type,
    });
  } catch (error) {
    console.error("[API] Reception photo upload error:", error);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
};

export const deleteReceptionPhoto = async (id: number | string): Promise<boolean> => {
  try {
    await apiRequest<ApiWriteResponse<null>>(
      { method: "DELETE", body: JSON.stringify({ id }) },
      { action: "delete-reception-photo" }
    );
    return true;
  } catch {
    return false;
  }
};

export const readRecord = async <T>(table: string, id: string | number): Promise<ApiReadResponse<T>> => {
  const response = await apiRequest<ApiReadResponse<T>>(undefined, { action: "read", table, id });
  return { ...response, data: coerceNumericColumns(response.data) as T };
};

/**
 * Fetch a complete project record with all fields including advanced metadata.
 * Used for preloading project data when user selects a project from the dropdown.
 */
export const fetchFullProject = async (projectId: string | number) => {
  const timestamp = new Date().toISOString();
  console.log(`[API] ${timestamp} Fetching full project data for ID: ${projectId}`);
  try {
    const response = await readRecord<{
      id: number;
      name: string;
      client_name: string | null;
      project_date: string | null;
      lab_organization?: string;
      date_reported?: string;
      checked_by?: string;
      contractor?: string;
      county?: string;
      submitted_by?: string;
      date_submitted?: string;
      custom_fields?: Array<{ name: string; value: string }>;
      [key: string]: unknown;
    }>("projects", projectId);
    console.log(`[API] ${timestamp} Successfully fetched full project data`);
    return response.data;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[API] ${timestamp} Failed to fetch full project data:`, errorMsg);
    throw error;
  }
};

export const createRecord = async <T>(table: string, data: Record<string, unknown>) =>
  coerceWriteResponse(await apiRequest<ApiWriteResponse<T>>({ method: "POST", body: JSON.stringify({ table, data }) }, { action: "create" }));

export const updateRecord = async <T>(table: string, id: string | number, data: Record<string, unknown>) =>
  coerceWriteResponse(await apiRequest<ApiWriteResponse<T>>({ method: "PUT", body: JSON.stringify({ table, id, data }) }, { action: "update" }));

export const deleteRecord = async <T>(table: string, id: string | number) =>
  apiRequest<ApiWriteResponse<T>>({ method: "DELETE", body: JSON.stringify({ table, id }) }, { action: "delete" });

export const updateTestDefinitions = async (definitions: Partial<TestDefinition>[]): Promise<TestDefinition[] | null> => {
  try {
    const response = await apiRequest<ApiWriteResponse<TestDefinition[]>>(
      { method: "PUT", body: JSON.stringify({ table: "test_definitions", data: definitions }) },
      { action: "bulkUpdate", table: "test_definitions" }
    );
    return response.data ? response.data.map(row => coerceNumericColumns(row) as TestDefinition) : null;
  } catch {
    return null;
  }
};

export const uploadFile = async (file: File, metadata?: Record<string, string>) => {
  const formData = new FormData();
  formData.append("file", file);

  if (metadata) {
    Object.entries(metadata).forEach(([key, value]) => {
      formData.append(key, value);
    });
  }

  const url = buildApiUrl({ action: "upload" });
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minute timeout for uploads

  try {
    const sessionId = getStoredSessionId();
    if (sessionId) {
      console.debug(`[API] Upload request with session ID: ${sessionId.substring(0, 8)}...`);
    }

    const response = await fetch(url, {
      method: "POST",
      credentials: "include",
      body: formData,
      signal: controller.signal,
    });

    // Extract and store session ID from Set-Cookie header if present
    const setCookieHeader = response.headers.get("set-cookie");
    if (setCookieHeader) {
      const sessionMatch = setCookieHeader.match(/PHPSESSID=([^;]+)/);
      if (sessionMatch && sessionMatch[1]) {
        setStoredSessionId(sessionMatch[1]);
        console.debug(`[API] Extracted session ID from upload response`);
      }
    }

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const errorMessage = data?.message || data?.error || `HTTP ${response.status}`;
      console.error(`[API] Upload failed - Status: ${response.status} - ${errorMessage}`);
      console.error(`[API] Upload response data:`, JSON.stringify(data, null, 2));
      throw new Error(errorMessage);
    }

    return data;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Upload timeout: The server took too long to respond. Please try again.");
    }

    if (error instanceof TypeError && error.message.includes("Failed to fetch")) {
      console.warn(`Network error connecting to API at ${url}. Please check if the API server is reachable.`);
      throw new Error(`Unable to reach API server. Please ensure you have a valid internet connection.`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};

export const processReceptionToProject = async (consignment: ReceptionConsignmentInput, overrideTestType?: string): Promise<{
  projectId: number;
  testResultIds: Record<string, number>;
}> => {
  if (!consignment) throw new Error("No consignment provided");
  if (consignment.projectId || (consignment as any).processedAt) {
    throw new Error("This consignment has already been processed into a project");
  }

  const testType = overrideTestType || getPrimaryTestTypeFromConsignment(consignment);
  const projectPayload: Record<string, unknown> = {
    name: consignment.project || consignment.jobNo || consignment.rcNo,
    client_name: consignment.client || "",
    project_date: consignment.receivedAt ? consignment.receivedAt.slice(0, 10) : null,
    test_type: testType,
    contractor: consignment.deliveredBy || "",
    county: "",
    submitted_by: consignment.receivedBy || "",
    date_submitted: consignment.receivedAt ? consignment.receivedAt.slice(0, 10) : null,
  };

  const projectResp = await createRecord<{ id: number }>("projects", projectPayload);
  const projectId = projectResp.data?.id;
  if (!projectId) throw new Error("Failed to create project from reception");

  const testResultIds: Record<string, number> = {};
  for (const sample of consignment.samples || []) {
    if (!sample.tests || sample.tests.length === 0) continue;
    try {
      const tr = await createRecord<{ id: number }>("test_results", {
        project_id: projectId,
        test_key: testType,
        sample_key: sample.labId,
        sample_label: sample.clientMark,
        sample_depth: sample.depthLabel,
        name: `${testType} - ${sample.labId}`,
        category: testType === "compressive" ? "concrete" : "soil",
        status: "in-progress",
        data_points: 0,
      });
      if (tr.data?.id) testResultIds[sample.labId] = tr.data.id;
    } catch (e) {
      console.warn("[API] Failed to create test_result for sample", sample.labId, e);
    }
  }

  if (testType === "compressive") {
    try {
      const ct = await createRecord<{ id: number }>("compressive_tests", {
        project_id: projectId,
        test_key: "compressive",
        date_received: consignment.receivedAt ? consignment.receivedAt.slice(0, 10) : null,
        lab_ref: consignment.rcNo,
        status: "not-started",
      });
      (consignment as any)._compressiveTestId = ct.data?.id;
    } catch (e) {
      console.warn("[API] Failed to create compressive_tests", e);
    }
  }

  const processedConsignment: ReceptionConsignmentInput = {
    ...consignment,
    projectId,
    projectIds: [projectId],
    status: "processed" as any,
    processedAt: new Date().toISOString(),
  };

  await saveReceptionConsignment(processedConsignment);
  return { projectId, testResultIds };
};

export const logoutUser = async () => {
  const timestamp = new Date().toISOString();
  console.log(`[API] ${timestamp} === LOGOUT REQUEST START ===`);
  console.log("[API] Current session token:", getSessionToken() ? "✓ Present" : "✗ Not found");

  try {
    const response = await apiRequest<LogoutResponse>({ method: "POST" }, { action: "logout" });
    // Clear session token on logout
    const logoutTimestamp = new Date().toISOString();
    console.log(`[API] ${logoutTimestamp} Logout successful (server responded OK)`);
    setSessionToken(null);
    console.log(`[API] ${logoutTimestamp} Session token cleared on logout`);
    return response;
  } catch (error) {
    // Clear session even if logout fails
    const errorTimestamp = new Date().toISOString();
    console.warn(`[API] ${errorTimestamp} Logout API call failed, but clearing token anyway:`, error instanceof Error ? error.message : error);
    setSessionToken(null);
    throw error;
  }
};

export const logout = async () => {
  const response = await apiRequest<LogoutResponse>({ method: "POST" }, { action: "logout" });
  setSessionToken(null);
  return response;
};

// Compressive Strength Test API helpers
export interface CompressiveCubeApiRow {
  id: number;
  test_id: number;
  cube_mark: string | null;
  date_of_cast: string | null;
  date_of_test: string | null;
  load_kn: number | null;
  width_mm: number | null;
  height_mm: number | null;
  depth_mm: number | null;
  mass_g: number | null;
  density_kg_m3: number | null;
  calculated_strength_mpa: number | null;
  remarks: string | null;
}

/**
 * Read the cubes belonging to one compressive test.
 * Filtered server-side: pulling every cube in the database and discarding most of them
 * client-side does not scale past a few thousand rows.
 */
export const listCompressiveCubes = async (testId: number) => {
  try {
    const response = await listRecords<CompressiveCubeApiRow>("compressive_cubes", {
      filter: `test_id=${testId}`,
      limit: 5000,
      orderBy: "id",
      direction: "ASC",
    });
    return response;
  } catch (error) {
    console.error("[API] Failed to list compressive cubes:", error);
    throw error;
  }
};

export const saveCompressiveTest = async ({
  projectId,
  testData,
  cubes,
  testId: existingTestId,
}: {
  projectId: number;
  testData: Record<string, unknown>;
  cubes: Array<Record<string, unknown> & { id?: number | null }>;
  /** Id of the test being edited. When given it is updated in place instead of re-matched. */
  testId?: number | null;
}): Promise<{ testId: number; cubeIds: number[] }> => {
  try {
    const testPayload = {
      project_id: projectId,
      test_key: "compressive",
      ...testData,
    };

    // Create or find test record. Reusing the existing row is what stops a re-save from adding a
    // second compressive test for the same project.
    const existingTests = await listRecords<{ id: number; project_id: number; test_key: string }>("compressive_tests", {
      limit: 5000,
      orderBy: "updated_at",
      direction: "DESC",
    });
    const existingRow = (existingTests.data || []).find(
      (row) => Number(row.project_id) === Number(projectId) && row.test_key === "compressive",
    );
    const targetRow = existingRow
      ?? (existingTests.data || []).find((row) => Number(row.id) === Number(existingTestId));

    let testId: number | null = targetRow ? Number(targetRow.id) : null;
    if (testId === null) {
      const created = await createRecord<{ id: number }>("compressive_tests", testPayload);
      testId = created.data?.id ?? null;
    } else {
      await updateRecord<{ id: number }>("compressive_tests", testId, testPayload);
    }

    if (testId === null) {
      throw new Error("Failed to save compressive test record");
    }
    const resolvedTestId = testId;

    // Diff the submitted cubes against what is already stored rather than deleting the whole
    // set and re-inserting it. Rows carrying an `id` are updated in place, rows without one are
    // created, and only ids the caller actually removed are deleted. Blanking the form and
    // saving can no longer destroy results the user never intended to touch.
    // The client-side filter below mirrors the server-side `filter` param so this stays
    // scoped to this test even against an older api.php that ignores `filter`.
    const existingCubes = await listRecords<{ id: number; test_id?: number | string }>("compressive_cubes", {
      filter: `test_id=${resolvedTestId}`,
      limit: 5000,
    });
    const storedIds = new Set(
      (existingCubes.data || [])
        .filter((row) => row.test_id === undefined || Number(row.test_id) === Number(resolvedTestId))
        .map((row) => Number(row.id)),
    );
    const keptIds = new Set<number>();
    const cubeIds: number[] = [];

    for (const cube of cubes) {
      const { id, ...fields } = cube;
      const numericId = typeof id === "number" && id > 0 ? id : null;
      // Only trust an id that genuinely belongs to this test, otherwise fall back to a create.
      const isStored = numericId !== null && storedIds.has(numericId);

      if (isStored) {
        await updateRecord<{ id: number }>("compressive_cubes", numericId, fields);
        keptIds.add(numericId);
        cubeIds.push(numericId);
        continue;
      }

      const created = await createRecord<{ id: number }>("compressive_cubes", {
        test_id: resolvedTestId,
        ...fields,
      });
      if (created.data?.id) {
        keptIds.add(created.data.id);
        cubeIds.push(created.data.id);
      }
    }

    // Deletions run only after every write has succeeded, so a failure part-way through the
    // loop leaves the previous cubes intact instead of leaving the test half written.
    const removedIds = [...storedIds].filter((id) => !keptIds.has(id));
    await Promise.all(
      removedIds.map((id) =>
        deleteRecord("compressive_cubes", id).catch((deleteError) => {
          console.error(`[API] Failed to delete compressive cube ${id}:`, deleteError);
          return null;
        }),
      ),
    );

    // Mirror the save into test_results so Test Results / Project Overview list
    // the compressive test. Without this the cubes are only reachable by direct
    // ?testId= link and never surface in reports.
    try {
      const testedCount = cubeIds.length;
      const existingResults = await listRecords<{ id: number; project_id: number | string; test_key: string; payload_json?: unknown }>(
        "test_results",
        { limit: 5000, orderBy: "updated_at", direction: "DESC" },
      );
      const idInPayload = (payload: unknown): number | null => {
        let parsed: unknown = payload;
        if (typeof parsed === "string") {
          const text = parsed.trim();
          if (!text) return null;
          try { parsed = JSON.parse(text) as unknown; } catch { return null; }
        }
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
        const scopes = [parsed as Record<string, unknown>];
        const nested = (parsed as Record<string, unknown>).test;
        if (nested && typeof nested === "object" && !Array.isArray(nested)) scopes.push(nested as Record<string, unknown>);
        for (const scope of scopes) {
          for (const key of ["compressiveTestId", "compressive_test_id", "compressiveId", "compressive_id", "testId", "test_id"]) {
            const raw = scope[key];
            const id = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : NaN;
            if (Number.isInteger(id) && id > 0) return id;
          }
        }
        return null;
      };
      const match = (existingResults.data || []).find((row) =>
        Number(row.project_id) === Number(projectId)
        && row.test_key === "compressive"
        && idInPayload(row.payload_json) === resolvedTestId,
      );
      const sampleId = typeof testData.lab_ref === "string" && testData.lab_ref.trim() !== ""
        ? testData.lab_ref.trim()
        : typeof testData.client_ref === "string" && testData.client_ref.trim() !== ""
          ? testData.client_ref.trim()
          : `Cubes ${resolvedTestId}`;
      const fields = {
        name: "Compressive Strength Test",
        category: "concrete",
        status: testedCount > 0 ? "completed" : "in-progress",
        sample_label: sampleId,
        payload_json: JSON.stringify({
          test: { testKey: "compressive", compressiveTestId: resolvedTestId, dataPoints: testedCount },
        }),
      };
      if (match) await updateRecord("test_results", match.id, fields);
      else await createRecord("test_results", { project_id: projectId, test_key: "compressive", ...fields });
    } catch (mirrorError) {
      // The cubes themselves saved; a failed mirror must not fail the whole save.
      console.warn("[API] Compressive test_results mirror failed:", mirrorError);
    }

    return { testId: resolvedTestId, cubeIds };
  } catch (error) {
    console.error("[API] Failed to save compressive test:", error);
    throw error;
  }
};

export const getCompressiveTest = async (testId: number) => {
  try {
    const response = await readRecord("compressive_tests", testId);
    return response;
  } catch (error) {
    console.error("[API] Failed to fetch compressive test:", error);
    throw error;
  }
};

/** Payload keys inside a test_results row that may hold the compressive test id. */
const COMPRESSIVE_ID_KEYS = [
  "compressiveTestId",
  "compressive_test_id",
  "compressiveId",
  "compressive_id",
  // Live rows store the bare link (e.g. payload {"test_id":2} on a
  // test_key='compressive' row). The membership check in
  // resolveCompressiveTestId only accepts ids that genuinely belong to this
  // project, so these generic keys cannot hijack the form.
  "testId",
  "test_id",
];

/**
 * Pull a compressive_tests.id out of a test_results payload blob. Only keys
 * that explicitly name a compressive test count: grading payloads carry
 * unrelated numeric-looking ids (record/test/sample keys) that must never
 * resolve to the wrong concrete test.
 */
const compressiveIdFromPayload = (value: unknown): number | null => {
  let parsed: unknown = value;
  if (typeof parsed === "string") {
    const text = parsed.trim();
    if (!text) return null;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const root = parsed as Record<string, unknown>;
  const scopes = [root, root.project, root.test, root.record].filter(
    (entry): entry is Record<string, unknown> =>
      !!entry && typeof entry === "object" && !Array.isArray(entry),
  );
  for (const scope of scopes) {
    for (const key of COMPRESSIVE_ID_KEYS) {
      const raw = scope[key];
      const id = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : NaN;
      if (Number.isInteger(id) && id > 0) return id;
    }
  }
  return null;
};

/**
 * Resolve a compressive_tests.id from a test_results row id (the `resultId`
 * the project overview and test-results pages navigate with, which the cube
 * grid does not understand on its own).
 *
 * First honors an explicit compressive id stored in the result payload, but
 * only when that id genuinely belongs to this project. Otherwise falls back
 * to the newest compressive test for the project — the same latest-wins
 * convention the save path uses when matching existing rows. Returns null
 * when there is nothing to open, so callers keep a blank form instead of
 * loading another test's cubes.
 */
export const resolveCompressiveTestId = async (resultId: number, projectId: number): Promise<number | null> => {
  let tests: ApiCompressiveTestRow[] = [];
  try {
    const listed = await listCompressiveTests(projectId);
    tests = (listed.data || []).filter((row) => Number(row.project_id) === Number(projectId));
  } catch (error) {
    console.error("[API] Failed to list compressive tests for resolution:", error);
    return null;
  }
  if (tests.length === 0) return null;

  try {
    const record = await readRecord("test_results", resultId);
    const row = (record as { data?: unknown }).data;
    if (row && typeof row === "object") {
      const source = row as Record<string, unknown>;
      for (const key of ["payload_json", "key_results_json"]) {
        const id = compressiveIdFromPayload(source[key]);
        if (id !== null && tests.some((test) => Number(test.id) === id)) return id;
      }
    }
  } catch (error) {
    console.error("[API] Failed to read test_results row for compressive resolution:", error);
  }

  const newest = [...tests].sort((a, b) =>
    String(b.updated_at || b.created_at || "").localeCompare(String(a.updated_at || a.created_at || "")),
  )[0];
  return newest ? Number(newest.id) : null;
};

export const listCompressiveTests = async (projectId?: number) => {
  try {
    const params = projectId ? { filter: `project_id=${projectId}` } : undefined;
    // Typed so callers get the row shape instead of unknown[], which is what the wizard
    // renders in the existing-test list.
    const response = await listRecords<ApiCompressiveTestRow>("compressive_tests", params);
    if (projectId) {
      // Mirror the server-side `filter` client-side: an older api.php ignores
      // `filter` and returns every test, so scope the result here as well.
      response.data = (response.data || []).filter(
        (row) => Number((row as ApiCompressiveTestRow).project_id) === Number(projectId),
      );
    }
    return response;
  } catch (error) {
    console.error("[API] Failed to list compressive tests:", error);
    throw error;
  }
};

export const updateCompressiveTest = async (testId: number, data: Record<string, unknown>) => {
  try {
    const response = await updateRecord("compressive_tests", testId, data);
    return response;
  } catch (error) {
    console.error("[API] Failed to update compressive test:", error);
    throw error;
  }
};

export const deleteCompressiveTest = async (testId: number) => {
  try {
    await deleteRecord("compressive_tests", testId);
  } catch (error) {
    console.error("[API] Failed to delete compressive test:", error);
    throw error;
  }
};

export const addCompressiveCube = async (testId: number, cubeData: Record<string, unknown>) => {
  try {
    const payload = { test_id: testId, ...cubeData };
    const response = await createRecord<{ id: number }>("compressive_cubes", payload);
    return response;
  } catch (error) {
    console.error("[API] Failed to add compressive cube:", error);
    throw error;
  }
};

export const updateCompressiveCube = async (cubeId: number, data: Record<string, unknown>) => {
  try {
    const response = await updateRecord("compressive_cubes", cubeId, data);
    return response;
  } catch (error) {
    console.error("[API] Failed to update compressive cube:", error);
    throw error;
  }
};

export const deleteCompressiveCube = async (cubeId: number) => {
  try {
    await deleteRecord("compressive_cubes", cubeId);
  } catch (error) {
    console.error("[API] Failed to delete compressive cube:", error);
    throw error;
  }
};
