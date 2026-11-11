import { jsPDF } from "jspdf";
import { fetchAdminImagesAsBase64, type AdminImages } from "./imageUtils";
import { imageParts } from "./pdfGenerator";
import { getSessionToken } from "./api";

export interface CoringProjectInfo {
  title: string;
  standard: string;
  projectName: string;
  sampleNo: string;
  concreteClass: string;
  ageOfConcrete: string;
  location: string;
  testedBy: string;
  checkedBy: string;
  dateReported: string;
}

export interface CoringCoreReport {
  depth: string;
  dateOfTest: string;
  diameter: string;
  heightBefore: string;
  heightAfter: string;
  weightInAir: string;
  density: string;
  area: string;
  volume: string;
  load: string;
  coreStrength: string;
  ldRatio: string;
  cdFactor: string;
  cdcFactor: string;
  cdAccuracyFactor: string;
  cylinderToCube: string;
  caFactor: string;
  conversionRatio: string;
  correctedStrength: string;
  excessVoidage: string;
  failureMode: string;
  comments: string;
  beforeImage?: string;
  afterImage?: string;
}

const PAGE_CENTER = 306;
const FRAME_INSET = 8;
const LEFT = 82.8 + FRAME_INSET;
const WIDTH = 440.8 - FRAME_INSET * 2;
const COL_W = WIDTH / 3;
const DIVIDER_AT = COL_W * 0.78;
const FRAME = { x: 82.8, y: 71, w: 440.8, h: 489 };
const HEADER = { y: 84, w: 190, h: 70.2 };
const BAND_H = 8.4;
const ROW_H = 9;
const CELL_H = 14.5;
const PHOTO_TOP = 336;
const PHOTO_H = 120;
const PHOTO_GAP = 10;
const PHOTO_W = (WIDTH - PHOTO_GAP) / 2;
const COMMENTS_TOP = PHOTO_TOP + PHOTO_H + 16;
const STAMP_AREA = 52;
const SIGNATURE_H = 17;

const drawFittedImage = (doc: jsPDF, dataUrl: string, x: number, y: number, w: number, h: number, align: "left" | "center" | "right" = "center") => {
  try {
    const { base64, format } = imageParts(dataUrl);
    const props = doc.getImageProperties(dataUrl);
    const scale = Math.min(w / props.width, h / props.height);
    const dw = props.width * scale;
    const dh = props.height * scale;
    const dx = align === "left" ? x : align === "right" ? x + w - dw : x + (w - dw) / 2;
    doc.addImage(base64, format, dx, y + (h - dh) / 2, dw, dh, undefined, "FAST");
  } catch (error) {
    console.warn("[CoringPDF] Could not place image:", error);
  }
};

/** Build an authenticated serve-image URL for a coring image path. */
const coringImageServeUrl = (path: string): string => {
  let p = path.startsWith("/") ? path : "/" + path;
  if (p.startsWith("/uploads/") && !p.startsWith("/uploads/coring/")) {
    const afterUploads = p.slice("/uploads/".length);
    p = "/uploads/coring/" + afterUploads;
  }
  const apiUrl = new URL(buildApiUrl());
  apiUrl.searchParams.set("action", "serve-image");
  apiUrl.searchParams.set("file_path", p);
  return apiUrl.toString();
};

/** Fetch a remote image and convert it to a base64 data URL for embedding in the PDF. */
const fetchImageAsDataUrl = async (url: string): Promise<string | null> => {
  try {
    const sessionToken = getSessionToken();
    const response = await fetch(url, { 
      credentials: "include",
      headers: sessionToken ? { "X-Session-Token": sessionToken } : {} 
    });
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.warn("[CoringPDF] Could not fetch image:", url, error);
    return null;
  }
};

const drawBand = (doc: jsPDF, y: number, text: string) => {
  doc.setDrawColor(0);
  doc.setLineWidth(0.4);
  doc.rect(LEFT, y, WIDTH, BAND_H);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(0);
  doc.text(text, PAGE_CENTER, y + 6, { align: "center" });
};

const fitFontSize = (doc: jsPDF, text: string, maxW: number, size: number, min: number) => {
  doc.setFontSize(size);
  const textWidth = doc.getTextWidth(text);
  return textWidth <= maxW ? size : Math.max(min, (size * maxW) / textWidth);
};

const drawCell = (doc: jsPDF, x: number, y: number, w: number, h: number, label: string, value: string, dividerAt?: number) => {
  doc.setDrawColor(0);
  doc.setLineWidth(0.4);
  doc.rect(x, y, w, h);
  if (dividerAt !== undefined) doc.line(x + dividerAt, y, x + dividerAt, y + h);
  const text = value || "—";
  const mid = y + h / 2;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  const valueReserve = Math.min(doc.getTextWidth(text), w * 0.35);

  doc.setFont("helvetica", "normal");
  const labelMaxW = dividerAt !== undefined ? dividerAt - 6 : w - valueReserve - 14;
  const labelSize = fitFontSize(doc, label, labelMaxW, 6.5, 4.5);
  doc.setFontSize(labelSize);
  const labelW = doc.getTextWidth(label);
  doc.setTextColor(60);
  doc.text(label, x + 2, mid + labelSize * 0.35);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(0);
  const valueMaxW = dividerAt !== undefined ? w - dividerAt - 4 : w - labelW - 14;
  const valueSize = fitFontSize(doc, text, valueMaxW, 8, 6);
  doc.setFontSize(valueSize);
  doc.text(text, x + w - 2, mid + valueSize * 0.35, { align: "right" });
};

const drawInlineCell = (doc: jsPDF, x: number, y: number, w: number, label: string, value: string) => {
  doc.setDrawColor(0);
  doc.setLineWidth(0.4);
  doc.rect(x, y, w, ROW_H);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(60);
  let valueX = x + w / 2;
  let valueAlign: "left" | "center" = "center";
  let maxW = w - 4;
  if (label) {
    doc.text(label, x + 2, y + 6);
    const labelW = doc.getTextWidth(label);
    valueX = x + labelW + 5;
    valueAlign = "left";
    maxW = w - labelW - 7;
  }
  if (!value) return;
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0);
  doc.setFontSize(fitFontSize(doc, value, maxW, 8, 6));
  doc.text(value, valueX, y + 6, { align: valueAlign });
};

const splitSampleNo = (sampleNo: string): [string, string] => {
  const match = /^(.*?)\s+(BH\S*)$/i.exec(sampleNo.trim());
  return match ? [match[1], match[2]] : [sampleNo, ""];
};

const drawInlineRow = (doc: jsPDF, y: number, cells: [string, string, number][]) => {
  let x = LEFT;
  for (const [label, value, fraction] of cells) {
    const w = WIDTH * fraction;
    drawInlineCell(doc, x, y, w, label, value);
    x += w;
  }
};

const drawCorePage = (doc: jsPDF, project: CoringProjectInfo, core: CoringCoreReport, images: AdminImages) => {
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setDrawColor(0);
  doc.setLineWidth(0.6);
  doc.rect(FRAME.x, FRAME.y, FRAME.w, FRAME.h);

  if (images.logo) drawFittedImage(doc, images.logo, LEFT, HEADER.y, HEADER.w, HEADER.h, "left");
  if (images.contacts) drawFittedImage(doc, images.contacts, LEFT + WIDTH - HEADER.w, HEADER.y, HEADER.w, HEADER.h, "right");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(0);
  doc.text(project.title.toUpperCase(), pageWidth / 2, 170, { align: "center" });
  doc.setFontSize(9);
  const standard = `(${project.standard})`;
  doc.text(standard, pageWidth / 2, 181, { align: "center" });
  const standardWidth = doc.getTextWidth(standard);
  doc.setLineWidth(0.4);
  doc.line(pageWidth / 2 - standardWidth / 2, 182.2, pageWidth / 2 + standardWidth / 2, 182.2);

  drawInlineRow(doc, 186, [
    ["PROJECT NAME:", project.projectName, 0.765],
    ["", "", 0.235],
  ]);

  drawBand(doc, 195, "CORE DETAILS");
  const [samplePile, sampleBorehole] = splitSampleNo(project.sampleNo);
  drawInlineRow(doc, 203.4, [
    ["Sample No.:", samplePile, 0.19],
    ["", sampleBorehole, 0.075],
    ["Depth(m):", "", 0.08],
    ["", core.depth, 0.12],
    ["Date:", core.dateOfTest, 0.155],
    ["Class of Concrete (N/mm²):", "", 0.25],
    ["", project.concreteClass, 0.13],
  ]);
  drawInlineRow(doc, 212.4, [
    ["Age of Concrete:", "", 0.14],
    ["", project.ageOfConcrete, 0.15],
    ["Location:", "", 0.09],
    ["", project.location, 0.25],
    ["", "", 0.37],
  ]);

  drawBand(doc, 221.4, "TEST DETAILS");
  const testTop = 229.8;
  const testRows: ([string, string] | null)[][] = [
    [["Core Diameter (mm)", core.diameter], ["Height Before trimming (mm)", core.heightBefore], ["Height After trimming (mm)", core.heightAfter]],
    [["Core Weight in Air (g)", core.weightInAir], ["Density (Kg/m³)", core.density], ["C(H/D)-correction factor for aspect ratio", core.cdFactor]],
    [["Area (m²)", core.area], ["Volume (m³)", core.volume], ["Cdia-correction factors for core diameter", core.cdcFactor]],
    [["Maximum Load (kN)", core.load], ["Actual Compressive Strength (N/mm²)", core.coreStrength], ["Cd- correction factor for core extraction accuracy", core.cdAccuracyFactor]],
    [null, ["Cylinder Strength to Cube Strength", core.cylinderToCube], ["Ca-correction factors for the presence of steel", core.caFactor]],
    [null, ["Conversion Ratio", core.conversionRatio], ["L/D-Corrected Core Strength (N/mm²)", core.correctedStrength]],
  ];
  testRows.forEach((row, r) =>
    row.forEach((cell, c) => {
      if (cell) drawCell(doc, LEFT + c * COL_W, testTop + r * CELL_H, COL_W, CELL_H, cell[0], cell[1], DIVIDER_AT);
    })
  );
  drawCell(doc, LEFT, testTop + 4 * CELL_H, COL_W, 2 * CELL_H, "Length/ Diameter ratio of Core at preparations", core.ldRatio, DIVIDER_AT);
  drawCell(doc, LEFT, testTop + testRows.length * CELL_H, WIDTH, CELL_H, "Failure Mode", core.failureMode);

  const photos: [string, string | undefined, number][] = [
    ["BEFORE TEST", core.beforeImage, LEFT],
    ["AFTER TEST", core.afterImage, LEFT + PHOTO_W + PHOTO_GAP],
  ];
  for (const [label, image, x] of photos) {
    if (image) {
      drawFittedImage(doc, image, x, PHOTO_TOP, PHOTO_W, PHOTO_H);
    } else {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(120);
      doc.text("No photograph", x + PHOTO_W / 2, PHOTO_TOP + PHOTO_H / 2, { align: "center" });
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(0);
    doc.text(label, x + PHOTO_W / 2, PHOTO_TOP + PHOTO_H + 10, { align: "center" });
  }

  const commentLines = doc.splitTextToSize(core.comments || "—", WIDTH - 46).slice(0, 4);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(0);
  doc.text("Comments:", LEFT + 2, COMMENTS_TOP + 6);
  doc.setFont("helvetica", "normal");
  doc.text(commentLines, LEFT + 44, COMMENTS_TOP + 6);
  const voidageTop = COMMENTS_TOP + 6 + Math.max(commentLines.length, 1) * 11;
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "bold");
  const voidageLabel = "Excess Voidage:";
  doc.text(voidageLabel, LEFT + 2, voidageTop);
  const voidageLabelW = doc.getTextWidth(voidageLabel);
  doc.setFont("helvetica", "normal");
  doc.text(core.excessVoidage ? `${core.excessVoidage}%` : "—", LEFT + 2 + voidageLabelW + 6, voidageTop);

  const signatureTop = voidageTop + 8;
  const signatureCellW = WIDTH / 3;
  if (images.stamp) {
    drawFittedImage(doc, images.stamp, LEFT + WIDTH - 50, signatureTop - 14, 48, 48);
  }
  drawCell(doc, LEFT, signatureTop, signatureCellW, SIGNATURE_H, "Tested by", project.testedBy);
  drawCell(doc, LEFT + signatureCellW, signatureTop, signatureCellW, SIGNATURE_H, "Date Reported", project.dateReported);
  drawCell(doc, LEFT + signatureCellW * 2, signatureTop, signatureCellW, SIGNATURE_H, "Checked by", project.checkedBy);
};

export const buildCoringReportPDF = async (project: CoringProjectInfo, cores: CoringCoreReport[]): Promise<jsPDF> => {
  let images: AdminImages = {};
  try {
    images = await fetchAdminImagesAsBase64();
  } catch (error) {
    console.warn("[CoringPDF] Could not load header/stamp images, exporting without them:", error);
  }

  // Fetch core before/after images as base64 data URLs for PDF embedding.
  // beforeImage/afterImage are already base64 data URLs passed in from the
  // caller (CoringTestEnhanced.tsx calls loadImageAsDataUrl before this).
  const coresWithImages = cores.map((core) => ({
    ...core,
    beforeImage: core.beforeImage || null,
    afterImage: core.afterImage || null,
  }));

  const doc = new jsPDF({ unit: "pt", format: "letter" });
  coresWithImages.forEach((core, index) => {
    if (index > 0) doc.addPage();
    drawCorePage(doc, project, core, images);
  });
  return doc;
};
