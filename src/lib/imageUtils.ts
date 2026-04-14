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
  console.log("Constructed image URL:", { path, apiOrigin: apiUrl.origin, fullUrl: imageUrl });
  return imageUrl;
};

const listAdminImagePaths = async (): Promise<AdminImagePaths> => {
  const latest: AdminImagePaths = {};

  try {
    const response = await listRecords<AdminImageRow>("admin_images");
    const rows: AdminImageRow[] = response.data || [];

    console.log("Admin images fetched from DB:", { rowCount: rows.length, rows });

    for (const row of rows) {
      if (row.image_type === "logo" || row.image_type === "contacts" || row.image_type === "stamp") {
        if (!latest[row.image_type]) {
          latest[row.image_type] = row.file_path;
        }
      }
    }
    console.log("Admin image paths extracted:", latest);
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
          console.log(`[ImageRetry] ✓ Successfully fetched image on attempt ${attempt}/${maxAttempts}`, { filePath });
          return response;
        }

        if (response.status === 401 || response.status === 403) {
          console.warn(`[ImageRetry] Authentication error (${response.status}) - not retrying`, { filePath });
          return null; // Don't retry auth errors
        }

        lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
        console.warn(`[ImageRetry] Server error on attempt ${attempt}/${maxAttempts}:`, {
          status: response.status,
          statusText: response.statusText,
          filePath
        });
      } catch (fetchError) {
        clearTimeout(timeoutId);
        lastError = fetchError instanceof Error ? fetchError : new Error(String(fetchError));
        console.warn(`[ImageRetry] Network/fetch error on attempt ${attempt}/${maxAttempts}:`, {
          error: lastError.message,
          filePath,
          isTimeout: lastError.name === "AbortError"
        });
      }

      // Wait before retrying (exponential backoff)
      if (attempt < maxAttempts) {
        const delayMs = initialDelayMs * Math.pow(2, attempt - 1);
        console.log(`[ImageRetry] Waiting ${delayMs}ms before retry ${attempt + 1}/${maxAttempts}...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    } catch (unexpectedError) {
      lastError = unexpectedError instanceof Error ? unexpectedError : new Error(String(unexpectedError));
      console.error(`[ImageRetry] Unexpected error on attempt ${attempt}/${maxAttempts}:`, lastError);
    }
  }

  console.error(`[ImageRetry] ✗ Failed to fetch image after ${maxAttempts} attempts:`, {
    filePath,
    lastError: lastError?.message || "Unknown error"
  });
  return null;
};

const imagePathToBase64 = async (filePath: string): Promise<string | undefined> => {
  const imageUrl = getAdminImageUrl(filePath);
  const sessionToken = localStorage.getItem("lab_session_token");

  console.log("[ImageConvert] Starting image conversion to base64:", {
    filePath,
    imageUrl,
    hasSessionToken: !!sessionToken,
  });

  try {
    // Retry fetch with exponential backoff
    const response = await retryImageFetch(filePath, imageUrl, sessionToken);

    if (!response) {
      console.warn("[ImageConvert] Image fetch failed (all retries exhausted), skipping image", { filePath });
      return undefined;
    }

    const blob = await response.blob();
    console.log("[ImageConvert] Image fetched as blob:", {
      size: blob.size,
      type: blob.type,
      filename: filePath
    });

    // Validate blob size
    if (blob.size === 0) {
      console.warn("[ImageConvert] Downloaded image is empty:", { filePath });
      return undefined;
    }

    // Convert blob to base64 data URL
    return new Promise((resolve) => {
      const reader = new FileReader();

      reader.onload = () => {
        const dataUrl = reader.result as string;
        console.log("[ImageConvert] ✓ Image converted to base64 successfully:", {
          length: dataUrl.length,
          filename: filePath,
          isDataUrl: dataUrl.startsWith("data:")
        });
        resolve(dataUrl);
      };

      reader.onerror = (error) => {
        console.error("[ImageConvert] Error reading blob as base64:", error);
        resolve(undefined);
      };

      reader.abort = () => {
        console.warn("[ImageConvert] Blob reading was aborted");
        resolve(undefined);
      };

      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error("[ImageConvert] Unexpected error in imagePathToBase64:", {
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
    console.log("[ImageFetch] ════════════════════════════════════════");
    console.log("[ImageFetch] Starting admin image fetch for export (with retry logic)...");
    console.log("[ImageFetch] ════════════════════════════════════════");

    const latest = await listAdminImagePaths();

    console.log("[ImageFetch] Admin image paths in database:", {
      hasLogo: !!latest.logo,
      hasContacts: !!latest.contacts,
      hasStamp: !!latest.stamp,
    });

    // If no images at all, still continue gracefully
    if (!latest.logo && !latest.contacts && !latest.stamp) {
      console.info("[ImageFetch] ℹ️ No admin images found in database - export will proceed without images");
      console.info("[ImageFetch] Tip: Upload images in Admin > Media Library to include them in exports");
      return images; // Return empty images object - not an error
    }

    // Fetch images in parallel with individual error handling
    // One failure won't break the others or the export
    console.log("[ImageFetch] Fetching images (with 3 retries, exponential backoff)...");
    const results = await Promise.allSettled([
      latest.logo ? imagePathToBase64(latest.logo) : Promise.resolve(undefined),
      latest.contacts ? imagePathToBase64(latest.contacts) : Promise.resolve(undefined),
      latest.stamp ? imagePathToBase64(latest.stamp) : Promise.resolve(undefined),
    ]);

    const logo = results[0].status === "fulfilled" ? results[0].value : undefined;
    const contacts = results[1].status === "fulfilled" ? results[1].value : undefined;
    const stamp = results[2].status === "fulfilled" ? results[2].value : undefined;

    // Log any failures
    if (results[0].status === "rejected") {
      console.warn("[ImageFetch] Logo fetch rejected:", results[0].reason);
    }
    if (results[1].status === "rejected") {
      console.warn("[ImageFetch] Contacts fetch rejected:", results[1].reason);
    }
    if (results[2].status === "rejected") {
      console.warn("[ImageFetch] Stamp fetch rejected:", results[2].reason);
    }

    images.logo = logo;
    images.contacts = contacts;
    images.stamp = stamp;

    const successCount = [logo, contacts, stamp].filter(Boolean).length;
    const attemptCount = [latest.logo, latest.contacts, latest.stamp].filter(Boolean).length;

    console.log("[ImageFetch] ════════════════════════════════════════");
    console.log(`[ImageFetch] ✓ Image fetch complete: ${successCount}/${attemptCount} loaded successfully`);
    console.log("[ImageFetch] Result summary:", {
      logo: logo ? `✓ loaded (${logo.length} bytes)` : "✗ not loaded",
      contacts: contacts ? `✓ loaded (${contacts.length} bytes)` : "✗ not loaded",
      stamp: stamp ? `✓ loaded (${stamp.length} bytes)` : "✗ not loaded",
    });
    console.log("[ImageFetch] ════════════════════════════════════════");
  } catch (error) {
    console.error("[ImageFetch] Unexpected error in fetchAdminImagesAsBase64:", error);
    console.warn("[ImageFetch] Export will proceed without images");
    // Continue anyway - images are optional
  }

  return images;
}

export async function fetchAdminImages(): Promise<AdminImages> {
  return fetchAdminImagesAsBase64();
}
