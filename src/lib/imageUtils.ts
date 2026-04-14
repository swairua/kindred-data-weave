import { buildApiUrl, listRecords } from "./api";

export interface AdminImages {
  logo?: string; // base64 data URL
  contacts?: string;
  stamp?: string;
}

type AdminImageType = "logo" | "contacts" | "stamp";
type AdminImageRow = { image_type: string; file_path: string };
type AdminImagePaths = Partial<Record<AdminImageType, string>>;

const getAdminImageUrl = (path: string) => {
  const apiUrl = new URL(buildApiUrl());
  const imageUrl = new URL(path, apiUrl.origin).toString();
  console.debug("Constructed image URL:", { path, apiOrigin: apiUrl.origin, fullUrl: imageUrl });
  return imageUrl;
};

const listAdminImagePaths = async (): Promise<AdminImagePaths> => {
  const latest: AdminImagePaths = {};

  try {
    const response = await listRecords<AdminImageRow>("admin_images");
    const rows: AdminImageRow[] = response.data || [];

    console.debug("Admin images fetched from DB:", { rowCount: rows.length, rows });

    for (const row of rows) {
      if (row.image_type === "logo" || row.image_type === "contacts" || row.image_type === "stamp") {
        if (!latest[row.image_type]) {
          latest[row.image_type] = row.file_path;
        }
      }
    }
    console.debug("Admin image paths extracted:", latest);
  } catch (error) {
    console.error("Failed to fetch admin image paths:", error instanceof Error ? error.message : error);
    // Silently fail - images are optional
  }

  return latest;
};

// Retry logic with exponential backoff
const retryImageFetch = async (
  filePath: string,
  imageUrl: string,
  sessionToken: string | null,
  maxAttempts: number = 3,
  initialDelayMs: number = 500
): Promise<Response | null> => {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = Math.min(5000 * attempt, 30000); // Scale timeout by attempt
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(imageUrl, {
          method: "GET",
          headers: {
            "X-Session-Token": sessionToken || "",
            "Accept": "image/*",
          },
          credentials: "include",
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          console.debug(`[ImageRetry] Successfully fetched image on attempt ${attempt}/${maxAttempts}`, { filePath });
          return response;
        }

        if (response.status === 401 || response.status === 403) {
          console.debug(`[ImageRetry] Authentication error (${response.status}) - not retrying`, { filePath });
          return null; // Don't retry auth errors
        }

        lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
        console.debug(`[ImageRetry] Server error on attempt ${attempt}/${maxAttempts}:`, {
          status: response.status,
          statusText: response.statusText,
          filePath
        });
      } catch (fetchError) {
        clearTimeout(timeoutId);
        lastError = fetchError instanceof Error ? fetchError : new Error(String(fetchError));
        // Silently log - network errors are expected when images don't exist
        console.debug(`[ImageRetry] Network/fetch error on attempt ${attempt}/${maxAttempts}:`, {
          error: lastError.message,
          filePath,
          isTimeout: lastError.name === "AbortError"
        });
      }

      // Wait before retrying (exponential backoff)
      if (attempt < maxAttempts) {
        const delayMs = initialDelayMs * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    } catch (unexpectedError) {
      lastError = unexpectedError instanceof Error ? unexpectedError : new Error(String(unexpectedError));
      console.debug(`[ImageRetry] Error on attempt ${attempt}/${maxAttempts}:`, lastError);
    }
  }

  // Silently fail - images are optional for export
  // IMPORTANT: Don't throw errors here - images are completely optional
  console.debug(`[ImageRetry] Image fetch failed after ${maxAttempts} attempts (this is normal if image doesn't exist):`, {
    filePath,
    lastError: lastError?.message || "Unknown error"
  });
  return null;
};

const imagePathToBase64 = async (filePath: string): Promise<string | undefined> => {
  const imageUrl = getAdminImageUrl(filePath);
  const sessionToken = localStorage.getItem("lab_session_token");

  console.debug("[ImageConvert] Starting image conversion to base64:", {
    filePath,
    imageUrl,
    hasSessionToken: !!sessionToken,
  });

  try {
    // Retry fetch with exponential backoff
    const response = await retryImageFetch(filePath, imageUrl, sessionToken);

    if (!response) {
      console.debug("[ImageConvert] Image not available, skipping", { filePath });
      return undefined;
    }

    const blob = await response.blob();
    console.debug("[ImageConvert] Image fetched as blob:", {
      size: blob.size,
      type: blob.type,
      filename: filePath
    });

    // Validate blob size
    if (blob.size === 0) {
      console.debug("[ImageConvert] Downloaded image is empty:", { filePath });
      return undefined;
    }

    // Convert blob to base64 data URL
    return new Promise((resolve) => {
      const reader = new FileReader();

      reader.onload = () => {
        const dataUrl = reader.result as string;
        console.debug("[ImageConvert] Image converted to base64:", {
          length: dataUrl.length,
          filename: filePath,
          isDataUrl: dataUrl.startsWith("data:")
        });
        resolve(dataUrl);
      };

      reader.onerror = (error) => {
        console.debug("[ImageConvert] Error reading blob as base64:", error);
        resolve(undefined);
      };

      reader.abort = () => {
        console.debug("[ImageConvert] Blob reading was aborted");
        resolve(undefined);
      };

      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.debug("[ImageConvert] Error in imagePathToBase64 (images are optional):", {
      error: error instanceof Error ? error.message : error,
      filePath,
      imageUrl
    });
    return undefined;
  }
};

/**
 * Fetches admin images (logo, contacts, stamp) from the admin_images API table.
 * Images are loaded with retry logic (3 attempts with exponential backoff).
 * Images are converted to base64 data URLs for embedding in documents.
 * Missing images are silently skipped - export will proceed without them.
 */
export async function fetchAdminImagesAsBase64(): Promise<AdminImages> {
  const images: AdminImages = {};

  try {
    const latest = await listAdminImagePaths();

    // If no images at all, still continue gracefully
    if (!latest.logo && !latest.contacts && !latest.stamp) {
      console.debug("[ImageFetch] No admin images found in database - export will proceed without images");
      return images; // Return empty images object - not an error
    }

    // Fetch images in parallel with individual error handling
    // One failure won't break the others or the export
    const results = await Promise.allSettled([
      latest.logo ? imagePathToBase64(latest.logo) : Promise.resolve(undefined),
      latest.contacts ? imagePathToBase64(latest.contacts) : Promise.resolve(undefined),
      latest.stamp ? imagePathToBase64(latest.stamp) : Promise.resolve(undefined),
    ]);

    const logo = results[0].status === "fulfilled" ? results[0].value : undefined;
    const contacts = results[1].status === "fulfilled" ? results[1].value : undefined;
    const stamp = results[2].status === "fulfilled" ? results[2].value : undefined;

    images.logo = logo;
    images.contacts = contacts;
    images.stamp = stamp;
  } catch (error) {
    // Silently fail - images are optional
    console.debug("[ImageFetch] Error fetching admin images (export will continue without them):", error);
    // Continue anyway - images are optional
  }

  return images;
}

export async function fetchAdminImages(): Promise<AdminImages> {
  return fetchAdminImagesAsBase64();
}
