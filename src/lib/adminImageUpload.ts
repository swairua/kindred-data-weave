/**
 * Single upload path for letterhead artwork (logo, contacts, stamp).
 *
 * Stamps must lose their white background before they are uploaded: otherwise
 * the artwork from one admin screen prints with a white box over the report.
 * Keeping the conversion here means Admin and Settings cannot drift apart.
 *
 * Large uploads are downscaled in the browser; PNG/WebP keep their alpha
 * channel so a transparent logo is not flattened onto a white JPEG canvas.
 */
import { uploadFile } from "./api";
import { makeStampTransparent } from "./stampUtils";
import { resizeImageForUpload } from "./resizeImage";
import { emitAdminImagesChanged } from "./adminImageEvents";
import { invalidateAdminImages } from "@/hooks/useAdminImages";
import { invalidateCompanyDetails } from "@/hooks/useCompanyDetails";

export type AdminImageType = "logo" | "contacts" | "stamp";

export interface AdminImageUploadResult {
  image_id?: number;
  id?: number;
  file_path?: string;
  image_type?: string;
  [key: string]: unknown;
}

export const uploadAdminImage = async (
  file: File,
  imageType: AdminImageType,
): Promise<AdminImageUploadResult> => {
  const alphaSafe = file.type === "image/png" || file.type === "image/webp" ? file.type : "image/jpeg";
  let prepared = await resizeImageForUpload(file, 1600, 0.85, alphaSafe);
  if (imageType === "stamp") {
    const transparent = await makeStampTransparent(prepared);
    prepared = new File([transparent], "stamp.png", { type: "image/png" });
  }
  const result = (await uploadFile(prepared, { image_type: imageType })) as AdminImageUploadResult;
  // Every open tab (and every shared hook) refetches from the same source.
  invalidateAdminImages();
  invalidateCompanyDetails();
  emitAdminImagesChanged();
  return result;
};

/** The API returns `image_id`; older/mocked responses may use `id`. */
export const adminImageId = (result: AdminImageUploadResult): number | null =>
  typeof result.image_id === "number"
    ? result.image_id
    : typeof result.id === "number"
      ? result.id
      : null;
