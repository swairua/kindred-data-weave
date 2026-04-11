const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();

export const API_BASE_URL = configuredApiBaseUrl || "https://lab.wayrus.co.ke/api.php";

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

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const errorMessage = data?.message || data?.error || `HTTP ${response.status}`;
      console.error(`[API] Request failed: ${params?.action || 'unknown'} - Status: ${response.status} - ${errorMessage}`);
      console.error(`[API] Response data:`, JSON.stringify(data, null, 2));
      console.error(`[API] Request URL:`, url);
      console.error(`[API] Request headers:`, Object.fromEntries(headers.entries()));
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
  console.log("[API] Attempting login for email:", email);
  try {
    const response = await apiRequest<LoginResponse>(
      {
        method: "POST",
        body: JSON.stringify({ email, password }),
      },
      { action: "login" },
    );
    console.log("[API] Login successful. Response:", response);
    return response;
  } catch (error) {
    console.error("[API] Login failed:", error instanceof Error ? error.message : error);
    throw error;
  }
};

export const fetchCurrentUser = async () => {
  try {
    console.log("[API] Calling me endpoint...");
    console.log("[API] API_BASE_URL:", API_BASE_URL);

    const url = buildApiUrl({ action: "me" });
    const response = await fetch(url, {
      credentials: "include",
      headers: {
        "Accept": "application/json",
      },
    });

    console.log("[API] me endpoint HTTP status:", response.status);

    const data = await response.json().catch(() => null);
    console.log("[API] me endpoint response data:", data);

    // 401 is expected when user is not authenticated - this is not an error condition
    if (response.status === 401) {
      console.log("[API] User not authenticated (401 response)");
      return null;
    }

    if (!response.ok) {
      const errorMessage = data?.message || data?.error || `HTTP ${response.status}`;
      console.error("[API] me endpoint failed with status ${response.status}:", errorMessage);
      throw new Error(errorMessage);
    }

    // If the response indicates not authenticated, return null
    if (data?.authenticated === false || !data?.user) {
      console.log("[API] User not authenticated (authenticated=false or no user)");
      return null;
    }

    console.log("[API] User authenticated as:", data.user);
    return data.user;
  } catch (error) {
    console.error("[API] me endpoint error - details:", {
      message: error instanceof Error ? error.message : String(error),
      error: error
    });
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

export const logoutUser = () => apiRequest<LogoutResponse>({ method: "POST" }, { action: "logout" });
