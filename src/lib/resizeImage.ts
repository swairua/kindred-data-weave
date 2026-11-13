/**
 * Lightweight client-side image resize for reception photo uploads.
 *
 * Reason: 5–10 MB JPEGs from a phone camera are fine for the admin to see once, but they
 * make the upload slow, the API's PHP memory_limit uncomfortable and the mobile hotspot
 * bill unpredictable. Downscaling to a useful print size (long edge ≈ 1600 px, JPEG q=0.85)
 * shrinks every upload by an order of magnitude with no visible loss on inspection sheets.
 *
 * Returns a File so the caller can use the same FormData/append path as before.
 */

export const resizeImageForUpload = async (
  file: File,
  maxLongEdge = 1600,
  quality = 0.85,
): Promise<File> => {
  // Fast path: small files are already good enough.
  if (file.size < 400 * 1024 && /image\/(jpeg|jpg|png)/i.test(file.type)) return file;

  const bitmap = await createImageBitmap(file);
  try {
    const longEdge = Math.max(bitmap.width, bitmap.height);
    const scale = longEdge > maxLongEdge ? maxLongEdge / longEdge : 1;
    if (scale >= 1) return file;

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const blob: Blob = await new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Image resize produced no output"))), "image/jpeg", quality),
    );
    const name = file.name.replace(/\.(heic|heif|tiff|bmp|png|webp)$/i, ".jpg");
    return new File([blob], name, { type: "image/jpeg", lastModified: Date.now() });
  } finally {
    // Free the ImageBitmap resources as soon as possible.
    bitmap.close();
  }
};
