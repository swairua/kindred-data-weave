const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();

// In development, use the proxied path to bypass CORS. In production, use the full URL.
export const API_BASE_URL = configuredApiBaseUrl || (import.meta.env.DEV ? "/api.php" : "https://lab.wayrus.co.ke/api.php");

const SESSION_STORAGE_KEY = "lab_session_token";

// Session token management (stored in localStorage for persistence)
export const setSessionToken = (token: string | null) => {
  if (token) {
    localStorage.setItem(SESSION_STORAGE_KEY, token);
    console.log("[API] Session token stored");
  } else {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    console.log("[API] Session token cleared");
  }
};

export const getSessionToken = (): string | null => {
  return localStorage.getItem(SESSION_STORAGE_KEY);
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
  console.log("[API] Session token stored:", token ? `✓ Yes` : "✗ No");
  if (token) {
    console.log("[API] Token value:", token);
    console.log("[API] Token length:", token.length);
  }
  console.log("[API] API Base URL:", API_BASE_URL);
  console.log("[API] localStorage contents:", {
    [SESSION_STORAGE_KEY]: localStorage.getItem(SESSION_STORAGE_KEY) || "(empty)",
  });
  console.log("[API] For next request, header will be:", token ? `X-Session-Token: ${token}` : "X-Session-Token: (not sent)");
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
};

export const apiRequest = async <T>(
  init?: RequestInit,
  params?: Record<string, string | number | boolean | null | undefined>,
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
  const REQUEST_TIMEOUT = 30000; // 30 second timeout (increased from 8s for reliability)
  const timeoutId = setTimeout(() => {
    console.warn(`[API] Request timeout after ${REQUEST_TIMEOUT}ms for action: ${params?.action || 'unknown'}`);
    controller.abort();
  }, REQUEST_TIMEOUT);

  try {
    const response = await fetch(url, {
      ...init,
      headers,
      signal: controller.signal,
    });

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
    clearTimeout(timeoutId);

    // Handle abort errors with specific messaging
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`Request timeout: The server took too long to respond (>${REQUEST_TIMEOUT / 1000}s). Please check your network connection and try again.`);
    }

    if (error instanceof TypeError && error.message.includes("Failed to fetch")) {
      // Network error - provide helpful debugging info
      console.warn(`Network error connecting to API at ${url}. Please check if the API server is reachable.`);
      throw new Error(`Unable to reach API server. Please ensure you have a valid internet connection and the API server is running.`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};

export const loginUser = async (email: string, password: string) => {
  console.log("[API] === LOGIN REQUEST START ===");
  console.log("[API] Attempting login for email:", email);

  try {
    const response = await apiRequest<LoginResponse>(
      {
        method: "POST",
        body: JSON.stringify({ email, password }),
      },
      { action: "login" },
    );

    console.log("[API] === LOGIN RESPONSE ===");
    console.log("[API] Login successful. User:", response.user.name);
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
    console.error("[API] Login failed:", error instanceof Error ? error.message : error);
    throw error;
  }
};

export const fetchCurrentUser = async () => {
  try {
    console.log("[API] === ME ENDPOINT REQUEST START ===");
    console.log("[API] Session token available:", getSessionToken() ? "✓ Yes" : "✗ No");

    const data = await apiRequest<CurrentUserResponse>(undefined, { action: "me" });

    console.log("[API] === ME ENDPOINT RESPONSE ===");

    // If the response indicates not authenticated, return null
    if (data?.authenticated === false || !data?.user) {
      console.log("[API] User not authenticated");
      return null;
    }

    console.log("[API] User authenticated as:", data.user.name);
    return data.user;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // 401 is expected when user is not authenticated - this is not an error condition
    if (errorMessage.includes("Unauthorized") || errorMessage.includes("401")) {
      console.log("[API] User not authenticated (401 response)");
      return null;
    }

    console.warn("[API] me endpoint error:", errorMessage);
    // API unavailable, network error - return null gracefully
    return null;
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

export const listRecords = async <T>(table: string, params?: Record<string, string | number | boolean | null | undefined>) =>
  apiRequest<ApiListResponse<T>>(undefined, { action: "list", table, ...params });

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
  try {
    const response = await apiRequest<LogoutResponse>({ method: "POST" }, { action: "logout" });
    // Clear session token on logout
    setSessionToken(null);
    console.log("[API] Session token cleared on logout");
    return response;
  } catch (error) {
    // Clear session even if logout fails
    setSessionToken(null);
    throw error;
  }
};
