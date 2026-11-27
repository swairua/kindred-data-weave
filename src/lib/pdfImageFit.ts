/**
 * Fit letterhead artwork into a fixed box without distorting it.
 *
 * Reports reserve a fixed header band (e.g. 62 x 20 mm). Stretching whatever
 * aspect ratio was uploaded into that band squashes logos and stamps. The box
 * stays the same size — so every layout/test stays valid — but the image is
 * centred and scaled to its natural proportions inside it.
 */
import type { jsPDF } from "jspdf";

export const addFittedImage = (
  doc: jsPDF,
  dataUrl: string,
  format: "PNG" | "JPEG",
  x: number,
  y: number,
  boxW: number,
  boxH: number,
): boolean => {
  try {
    const props = doc.getImageProperties(dataUrl);
    if (!props || !props.width || !props.height) return false;
    const scale = Math.min(boxW / props.width, boxH / props.height);
    const width = props.width * scale;
    const height = props.height * scale;
    doc.addImage(dataUrl, format, x + (boxW - width) / 2, y + (boxH - height) / 2, width, height, undefined, "FAST");
    return true;
  } catch {
    // A corrupt/unsupported image must never stop a report.
    return false;
  }
};
