const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();

// In development, use the proxied path to bypass CORS. In production, use the full URL.
export const API_BASE_URL = configuredApiBaseUrl || (import.meta.env.DEV ? "/api.php" : "https://lab.wayrus.co.ke/api.php");

// Log API configuration on module load
console.log("[API] === CONFIGURATION ===");
console.log("[API] VITE_API_BASE_URL env:", configuredApiBaseUrl ? `"${configuredApiBaseUrl}"` : "(not set)");
console.log("[API] Development mode:", import.meta.env.DEV);
console.log("[API] Final API_BASE_URL:", API_BASE_URL);
console.log("[API] window.location.origin:", window.location.origin);

const SESSION_STORAGE_KEY = "lab_session_token";

// Session token management (stored in localStorage for persistence)
// Falls back to memory storage if localStorage is unavailable (e.g., in sandboxed environments)
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

// Initialize on module load: restore token from localStorage if available
const initializeTokenFromStorage = (): string | null => {
  try {
    const storedToken = localStorage.getItem(SESSION_STORAGE_KEY);
    if (storedToken) {
      sessionTokenMemory = storedToken;
      console.debug(`[API] ✓ Session token restored from localStorage on module load (${storedToken.substring(0, 20)}...)`);
      return storedToken;
    }
  } catch (e) {
    console.debug(`[API] Could not read token from localStorage on init:`, e instanceof Error ? e.message : e);
  }
  return null;
};

// Initialize token from storage immediately
initializeTokenFromStorage();

export const setSessionToken = (token: string | null) => {
  const timestamp = new Date().toISOString();
  if (token) {
    // Always try to save to localStorage first
    let savedToStorage = false;
    try {
      localStorage.setItem(SESSION_STORAGE_KEY, token);
      savedToStorage = true;
    } catch (e) {
      console.warn(`[API] Could not save token to localStorage:`, e instanceof Error ? e.message : e);
    }

    // Always keep in memory as fallback
    sessionTokenMemory = token;
    console.log(`[API] ${timestamp} ✓ Session token STORED (${token.substring(0, 20)}...) [localStorage: ${savedToStorage ? "✓" : "✗"}, memory: ✓]`);
  } else {
    // Clear from both storage locations
    let clearedFromStorage = false;
    let previousToken: string | null = null;
    try {
      previousToken = localStorage.getItem(SESSION_STORAGE_KEY);
      localStorage.removeItem(SESSION_STORAGE_KEY);
      clearedFromStorage = true;
    } catch (e) {
      console.warn(`[API] Could not clear token from localStorage:`, e instanceof Error ? e.message : e);
    }
    sessionTokenMemory = null;
    console.log(`[API] ${timestamp} ✗ Session token CLEARED${previousToken ? ` (was: ${previousToken.substring(0, 20)}...)` : ""} [localStorage: ${clearedFromStorage ? "✓" : "✗"}, memory: ✓]`);
  }
};

export const getSessionToken = (): string | null => {
  // Try localStorage first, then fall back to memory
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

  // Fall back to memory storage
  if (sessionTokenMemory) {
    console.debug(`[API] Using token from memory (localStorage unavailable)`);
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

    // Store session token from response if provided
    if (response.session_token) {
      setSessionToken(response.session_token);
      console.log("[API] ✓ Session token received in response body and stored");
      console.log("[API] Token:", response.session_token.substring(0, 20) + "...");
    } else {
      console.log("[API] ⚠️ Server did NOT return session_token in response body");
      console.log("[API] Check if backend is returning: { \"session_token\": \"...\" }");
    }

    const storedToken = getSessionToken();
    console.log("[API] Stored session token available:", storedToken ? `✓ Yes (${storedToken.substring(0, 20)}...)` : "✗ No");
    console.log("[API] This token will be sent as X-Session-Token header in future requests");

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

export const fetchCurrentUser = async (timeoutMs: number = 8000) => {
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
      controller.abort(new Error("Session check timeout"));
    }, timeoutMs);

    const response = await fetch(url, {
      method: "GET",
      headers,
      signal: controller.signal,
    });

    // Clear timeout on successful response
    if (timeoutHandle) clearTimeout(timeoutHandle);

    console.log(`[API] ${timestamp} === ME ENDPOINT RESPONSE ===`);

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      const errorMessage = data?.message || data?.error || `HTTP ${response.status}`;

      // 401 is expected when user is not authenticated
      if (response.status === 401) {
        console.log(`[API] ${timestamp} User not authenticated (401 response - session expired or not logged in)`);
        return null;
      }

      throw new Error(errorMessage);
    }

    const data = await response.json().catch(() => ({})) as CurrentUserResponse;

    // If the response indicates not authenticated, return null
    if (data?.authenticated === false || !data?.user) {
      console.log(`[API] ${timestamp} User not authenticated (response indicated unauthenticated)`);
      return null;
    }

    console.log(`[API] ${timestamp} ✓ User authenticated as: ${data.user.name} (${data.user.email})`);
    return data.user;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorTimestamp = new Date().toISOString();

    // Check if it's an abort (timeout)
    if (error instanceof DOMException && error.name === "AbortError") {
      console.warn(`[API] ${errorTimestamp} Session check timed out or was aborted after ${timeoutMs}ms`);
      return null;
    }

    // 401 is expected when user is not authenticated - this is not an error condition
    if (errorMessage.includes("Unauthorized") || errorMessage.includes("401")) {
      console.log(`[API] ${errorTimestamp} User not authenticated (401 response - session expired or not logged in)`);
      return null;
    }

    console.warn(`[API] ${errorTimestamp} ⚠️ ME endpoint error (will return null and keep local session):`, errorMessage);
    // API unavailable, network error - return null gracefully so we don't log users out unnecessarily
    return null;
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

export interface ApiWriteResponse<T> {
  message: string;
  table: string;
  id?: number;
  data: T | null;
  deleted?: boolean;
  last_saved_at?: string;
}

export const listRecords = async <T>(table: string, params?: Record<string, string | number | boolean | null | undefined>) => {
  const timestamp = new Date().toISOString();
  console.log(`[API] ${timestamp} Starting list request for table: ${table} with params:`, params);
  try {
    const response = await apiRequest<ApiListResponse<T>>(undefined, { action: "list", table, ...params });
    console.log(`[API] ${timestamp} Successfully loaded ${response.data.length} records from ${table}`);
    return response;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[API] ${timestamp} Failed to load records from ${table}:`, errorMsg);
    throw error;
  }
};

export const readRecord = async <T>(table: string, id: string | number) =>
  apiRequest<ApiReadResponse<T>>(undefined, { action: "read", table, id });

export const createRecord = async <T>(table: string, data: Record<string, unknown>) =>
  apiRequest<ApiWriteResponse<T>>({ method: "POST", body: JSON.stringify({ table, data }) }, { action: "create" });

export const updateRecord = async <T>(table: string, id: string | number, data: Record<string, unknown>) =>
  apiRequest<ApiWriteResponse<T>>({ method: "PUT", body: JSON.stringify({ table, id, data }) }, { action: "update" });

export const deleteRecord = async <T>(table: string, id: string | number) =>
  apiRequest<ApiWriteResponse<T>>({ method: "DELETE", body: JSON.stringify({ table, id }) }, { action: "delete" });

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
