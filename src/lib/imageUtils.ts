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
  return new URL(path, apiUrl.origin).toString();
};

const listAdminImagePaths = async (): Promise<AdminImagePaths> => {
  const latest: AdminImagePaths = {};

  try {
    const response = await listRecords<AdminImageRow>("admin_images");
    const rows: AdminImageRow[] = response.data || [];

    for (const row of rows) {
      if (row.image_type === "logo" || row.image_type === "contacts" || row.image_type === "stamp") {
        if (!latest[row.image_type]) {
          latest[row.image_type] = row.file_path;
        }
      }
    }
  } catch (error) {
    console.debug("Failed to fetch admin image paths:", error instanceof Error ? error.message : error);
    // Silently fail - images are optional
  }

  return latest;
};

const imagePathToBase64 = async (filePath: string): Promise<string | undefined> => {
  if (typeof document === "undefined") {
    return undefined;
  }

  const imageUrl = getAdminImageUrl(filePath);

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";

    img.onload = () => {
      try {
        const width = img.naturalWidth || img.width;
        const height = img.naturalHeight || img.height;

        if (!width || !height) {
          resolve(undefined);
          return;
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(undefined);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/png"));
      } catch {
        resolve(undefined);
      }
    };

    img.onerror = () => resolve(undefined);
    img.src = imageUrl;
  });
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
    const [logo, contacts, stamp] = await Promise.all([
      latest.logo ? imagePathToBase64(latest.logo) : Promise.resolve(undefined),
      latest.contacts ? imagePathToBase64(latest.contacts) : Promise.resolve(undefined),
      latest.stamp ? imagePathToBase64(latest.stamp) : Promise.resolve(undefined),
    ]);

    images.logo = logo;
    images.contacts = contacts;
    images.stamp = stamp;
  } catch {
    // Silently fail – images are optional
  }

  return images;
}

export async function fetchAdminImages(): Promise<AdminImages> {
  return fetchAdminImagesAsBase64();
}
