/**
 * Download the current letterhead artwork through the authenticated API.
 *
 * The server serves these images with `Content-Disposition: inline`, so a plain
 * link would open them in a tab instead of saving them. Fetching the bytes with
 * the session header and handing them to an object URL keeps the download
 * client-side and needs no api.php change.
 */
import { adminImagePreviewUrl } from "./imageUtils";
import type { AdminImageType } from "./adminImageUpload";

const extensionFor = (mime: string): string => {
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  return "jpg";
};

export const downloadAdminImage = async (
  imageType: AdminImageType,
  version: string,
  originalFilename?: string,
): Promise<string> => {
  const token = typeof window !== "undefined" ? localStorage.getItem("lab_session_token") : null;
  const response = await fetch(adminImagePreviewUrl(imageType, version), {
    headers: token ? { "X-Session-Token": token } : {},
    credentials: "include",
  });
  if (!response.ok) throw new Error(`Couldn't download ${imageType} image (HTTP ${response.status})`);

  const blob = await response.blob();
  const extension = extensionFor(blob.type || response.headers.get("content-type") || "");
  const cleaned = (originalFilename || "")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9_-]+/gi, "_")
    .slice(0, 60);
  const stem = cleaned && cleaned.toLowerCase() !== imageType ? `${cleaned}_${imageType}` : imageType;
  const filename = `${stem}.${extension}`;

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return filename;
};
