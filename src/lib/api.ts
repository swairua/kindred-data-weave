const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();

export const API_BASE_URL = configuredApiBaseUrl || "https://lab.wayrus.co.ke/api.php";

// Store session ID for cross-origin authentication
let storedSessionId: string | null = null;

export const setStoredSessionId = (sessionId: string | null) => {
  storedSessionId = sessionId;
  if (sessionId) {
    console.log("[API] Stored session ID");
  } else {
    console.log("[API] Cleared session ID");
  }
};

export const getStoredSessionId = (): string | null => storedSessionId;

export interface ApiUser {
  id: number;
  email: string;
  name: string;
}

interface LoginResponse {
  message: string;
  user_id: number;
  user: ApiUser;
}

interface CurrentUserResponse {
  user: ApiUser | null;
  authenticated: boolean;
}

interface LogoutResponse {
  message: string;
}

export const buildApiUrl = (params?: Record<string, string | number | boolean | null | undefined>) => {
  const url = new URL(API_BASE_URL);

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

  // For cross-origin requests, browsers automatically handle cookies with credentials: "include"
  // Manual Cookie headers are blocked by browsers for security and won't be sent.
  // Logging the stored session ID for debugging purposes only.
  const sessionId = getStoredSessionId();
  if (sessionId) {
    console.debug(`[API] Session ID available: ${sessionId.substring(0, 8)}...`);
  }

  const url = buildApiUrl(params);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout (increased from 10s)

  try {
    const response = await fetch(url, {
      credentials: "include",
      ...init,
      headers,
      signal: controller.signal,
    });

    // Extract and store session ID from Set-Cookie header if present
    const setCookieHeader = response.headers.get("set-cookie");
    if (setCookieHeader) {
      const sessionMatch = setCookieHeader.match(/PHPSESSID=([^;]+)/);
      if (sessionMatch && sessionMatch[1]) {
        setStoredSessionId(sessionMatch[1]);
        console.log(`[API] Extracted and stored session ID from response`);
      }
    } else if (params?.action === "login" || params?.action === "me") {
      // For cross-origin requests, we may not be able to read Set-Cookie header
      // The browser still receives and stores it automatically with credentials: "include"
      console.log(`[API] No Set-Cookie header accessible (may be CORS-restricted, but browser is handling it)`);
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
        console.error(`[API] Request headers:`, Object.fromEntries(headers.entries()));

        // Log CORS-related headers for debugging
        console.error(`[API] Response CORS headers:`, {
          "Access-Control-Allow-Credentials": response.headers.get("access-control-allow-credentials"),
          "Access-Control-Allow-Origin": response.headers.get("access-control-allow-origin"),
        });
      }
      throw new Error(errorMessage);
    }

    return data as T;
  } catch (error) {
    // Handle abort errors with specific messaging
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Request timeout: The server took too long to respond. Please check your network connection and try again.");
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
  console.log("[API] Current stored session ID:", getStoredSessionId());

  try {
    const response = await apiRequest<LoginResponse>(
      {
        method: "POST",
        body: JSON.stringify({ email, password }),
      },
      { action: "login" },
    );

    console.log("[API] === LOGIN RESPONSE ===");
    console.log("[API] Login successful. Response:", response);
    console.log("[API] Stored session ID after login:", getStoredSessionId());
    console.log("[API] NOTE: Browser should have received and stored the PHPSESSID cookie");
    console.log("[API] Browser will automatically send it in future requests with credentials: 'include'");

    return response;
  } catch (error) {
    console.error("[API] Login failed:", error instanceof Error ? error.message : error);
    throw error;
  }
};

export const fetchCurrentUser = async () => {
  try {
    console.log("[API] === ME ENDPOINT REQUEST START ===");
    console.log("[API] API_BASE_URL:", API_BASE_URL);
    console.log("[API] Stored session ID:", getStoredSessionId());
    console.log("[API] NOTE: 401 response on initial load is expected - user not logged in yet");

    const data = await apiRequest<CurrentUserResponse>(undefined, { action: "me" });

    console.log("[API] === ME ENDPOINT RESPONSE ===");
    console.log("[API] Response data:", data);

    // If the response indicates not authenticated, return null
    if (data?.authenticated === false || !data?.user) {
      console.log("[API] User not authenticated (expected if not logged in)");
      return null;
    }

    console.log("[API] User authenticated as:", data.user);
    return data.user;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // 401 is expected when user is not authenticated - this is not an error condition
    if (errorMessage.includes("Unauthorized") || errorMessage.includes("401")) {
      console.log("[API] User not authenticated (401 response) - this is normal if not logged in yet");
      return null;
    }

    console.warn("[API] me endpoint error (non-401):", errorMessage);
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
    // Clear stored session ID on logout
    setStoredSessionId(null);
    console.log("[API] Session cleared on logout");
    return response;
  } catch (error) {
    // Clear session even if logout fails
    setStoredSessionId(null);
    throw error;
  }
};
