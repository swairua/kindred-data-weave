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

const imagePathToBase64 = async (filePath: string): Promise<string | undefined> => {
  const imageUrl = getAdminImageUrl(filePath);
  const sessionToken = localStorage.getItem("lab_session_token");

  console.log("Converting image to base64:", {
    filePath,
    imageUrl,
    hasSessionToken: !!sessionToken,
    tokenLength: sessionToken?.length || 0
  });

  try {
    // Fetch with proper credentials and session token
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

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

      if (!response.ok) {
        console.warn("Failed to fetch image - server returned error:", {
          status: response.status,
          statusText: response.statusText,
          url: imageUrl,
          hasSessionToken: !!sessionToken
        });
        return undefined;
      }

      const blob = await response.blob();
      console.log("Image fetched as blob:", {
        size: blob.size,
        type: blob.type,
        filename: filePath
      });

      // Validate blob size
      if (blob.size === 0) {
        console.warn("Downloaded image is empty:", { filePath });
        return undefined;
      }

      // Convert blob to base64 data URL
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          console.log("Image converted to base64 data URL successfully:", {
            length: dataUrl.length,
            filename: filePath,
            isDataUrl: dataUrl.startsWith("data:")
          });
          resolve(dataUrl);
        };
        reader.onerror = (error) => {
          console.warn("Error reading blob as base64:", error);
          resolve(undefined);
        };
        reader.readAsDataURL(blob);
      });
    } catch (fetchError) {
      clearTimeout(timeoutId);

      if (fetchError instanceof DOMException && fetchError.name === "AbortError") {
        console.warn("Image fetch timed out (5s):", { filePath, imageUrl });
      } else if (fetchError instanceof TypeError && fetchError.message.includes("Failed to fetch")) {
        console.warn("Image fetch failed (network error, CORS, or invalid URL):", { filePath, imageUrl });
      } else {
        console.warn("Error fetching image:", {
          error: fetchError instanceof Error ? fetchError.message : fetchError,
          filePath,
          imageUrl
        });
      }
      return undefined;
    }
  } catch (error) {
    console.warn("Unexpected error in imagePathToBase64:", {
      error: error instanceof Error ? error.message : error,
      filePath,
      imageUrl
    });
    return undefined;
  }
};

/**
 * Fetches admin images (logo, contacts, stamp) from the admin_images API table.
 * Images are loaded through the same browser image URL flow as the admin preview,
 * then converted to base64 data URLs for embedding in documents.
 * Missing images are silently skipped.
 */
export async function fetchAdminImagesAsBase64(): Promise<AdminImages> {
  const images: AdminImages = {};

  try {
    console.log("[ImageFetch] Starting to fetch admin images for export...");
    const latest = await listAdminImagePaths();

    console.log("[ImageFetch] Admin image paths retrieved:", {
      hasLogo: !!latest.logo,
      hasContacts: !!latest.contacts,
      hasStamp: !!latest.stamp,
      paths: latest
    });

    // Log which images exist
    if (!latest.logo && !latest.contacts && !latest.stamp) {
      console.warn("⚠️ No admin images found in database. Please upload logo, contacts, and stamp from Admin > Media Library");
    }

    // Fetch images with individual error handling so one failure doesn't break all
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

    console.log("[ImageFetch] ✓ Admin images fetched successfully:", {
      hasLogo: !!logo,
      hasContacts: !!contacts,
      hasStamp: !!stamp,
      logoSize: logo?.length || 0,
      contactsSize: contacts?.length || 0,
      stampSize: stamp?.length || 0,
    });
  } catch (error) {
    console.error("[ImageFetch] Error in fetchAdminImagesAsBase64:", error);
    // Silently fail – images are optional
  }

  return images;
}

export async function fetchAdminImages(): Promise<AdminImages> {
  return fetchAdminImagesAsBase64();
}
