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
  console.log("Converting image to base64:", { filePath, imageUrl });

  try {
    // Try Fetch API approach first (works better with CORS)
    const response = await fetch(imageUrl, {
      headers: {
        "X-Session-Token": localStorage.getItem("lab_session_token") || "",
      },
    });

    if (!response.ok) {
      console.error("Failed to fetch image:", { status: response.status, statusText: response.statusText });
      return undefined;
    }

    const blob = await response.blob();
    console.log("Image fetched as blob:", { size: blob.size, type: blob.type });

    // Convert blob to base64 data URL
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        console.log("Image converted to base64 data URL successfully:", { length: dataUrl.length });
        resolve(dataUrl);
      };
      reader.onerror = (error) => {
        console.error("Error reading blob as base64:", error);
        resolve(undefined);
      };
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error("Error in imagePathToBase64:", error);
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
    const latest = await listAdminImagePaths();

    // Log which images exist
    if (!latest.logo && !latest.contacts && !latest.stamp) {
      console.warn("⚠️ No admin images found in database. Please upload logo, contacts, and stamp from Admin > Media Library");
    }

    const [logo, contacts, stamp] = await Promise.all([
      latest.logo ? imagePathToBase64(latest.logo) : Promise.resolve(undefined),
      latest.contacts ? imagePathToBase64(latest.contacts) : Promise.resolve(undefined),
      latest.stamp ? imagePathToBase64(latest.stamp) : Promise.resolve(undefined),
    ]);

    images.logo = logo;
    images.contacts = contacts;
    images.stamp = stamp;

    console.log("✓ Admin images fetched successfully:", {
      hasLogo: !!logo,
      hasContacts: !!contacts,
      hasStamp: !!stamp,
    });
  } catch (error) {
    console.error("Error in fetchAdminImagesAsBase64:", error);
    // Silently fail – images are optional
  }

  return images;
}

export async function fetchAdminImages(): Promise<AdminImages> {
  return fetchAdminImagesAsBase64();
}
