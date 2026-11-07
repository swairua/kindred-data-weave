import { jsPDF } from "jspdf";
import { fetchAdminImagesAsBase64, type AdminImages } from "./imageUtils";
import { imageParts } from "./pdfGenerator";

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
  coreId: string;
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
  cylinderToCube: string;
  caFactor: string;
  correctedStrength: string;
  excessVoidage: string;
  failureMode: string;
  comments: string;
  beforeImage?: string;
  afterImage?: string;
}

const PAGE_CENTER = 306;
const LEFT = 116.2;
const WIDTH = 404.6;
const COL_W = WIDTH / 3;
const FRAME = { x: 82.8, y: 71, w: 440.8, h: 489 };
const BANNER = { x: 120.4, y: 84, w: 386.1, h: 70.2 };
const BAND_H = 8.4;
const ROW_H = 9;
const CELL_H = 12.5;
const PHOTO_TOP = 320;
const PHOTO_H = 150;
const PHOTO_GAP = 10;
const PHOTO_W = (WIDTH - PHOTO_GAP) / 2;
const COMMENTS_TOP = PHOTO_TOP + PHOTO_H + 16;
const STAMP_AREA = 52;
const SIGNATURE_H = 17;

const drawFittedImage = (doc: jsPDF, dataUrl: string, x: number, y: number, w: number, h: number) => {
  try {
    const { base64, format } = imageParts(dataUrl);
    const props = doc.getImageProperties(dataUrl);
    const scale = Math.min(w / props.width, h / props.height);
    const dw = props.width * scale;
    const dh = props.height * scale;
    doc.addImage(base64, format, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh, undefined, "FAST");
  } catch (error) {
    console.warn("[CoringPDF] Could not place image:", error);
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

const drawCell = (doc: jsPDF, x: number, y: number, w: number, h: number, label: string, value: string) => {
  doc.setDrawColor(0);
  doc.setLineWidth(0.4);
  doc.rect(x, y, w, h);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(60);
  doc.text(label, x + 2, y + 3.5, { maxWidth: w - 4 });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(0);
  doc.text(value || "—", x + 2, y + h - 2, { maxWidth: w - 4 });
};

const drawInlineCell = (doc: jsPDF, x: number, y: number, w: number, label: string, value: string) => {
  doc.setDrawColor(0);
  doc.setLineWidth(0.4);
  doc.rect(x, y, w, ROW_H);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(60);
  doc.text(label, x + 2, y + 6);
  const labelW = doc.getTextWidth(label);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(0);
  doc.text(value || "—", x + labelW + 5, y + 6, { maxWidth: w - labelW - 7 });
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

  if (images.logo) drawFittedImage(doc, images.logo, BANNER.x, BANNER.y, BANNER.w, BANNER.h);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(0);
  const title = project.title.toUpperCase();
  doc.text(title, pageWidth / 2, 170, { align: "center" });
  const titleWidth = doc.getTextWidth(title);
  doc.setLineWidth(0.4);
  doc.line(pageWidth / 2 - titleWidth / 2, 172.2, pageWidth / 2 + titleWidth / 2, 172.2);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(`(${project.standard})`, pageWidth / 2, 180, { align: "center" });

  drawInlineCell(doc, LEFT, 186, WIDTH, "PROJECT NAME:", project.projectName);

  drawBand(doc, 195, "CORE DETAILS");
  drawInlineRow(doc, 203.4, [
    ["Sample No.:", project.sampleNo, 0.28],
    ["Depth (m):", core.depth, 0.2],
    ["Date:", core.dateOfTest, 0.2],
    ["Class of Concrete (N/mm²):", project.concreteClass, 0.32],
  ]);
  drawInlineRow(doc, 212.4, [
    ["Age of Concrete:", project.ageOfConcrete, 1 / 3],
    ["Location:", project.location, 1 / 3],
    ["Core ID:", core.coreId, 1 / 3],
  ]);

  drawBand(doc, 221.4, "TEST DETAILS");
  const testTop = 229.8;
  const testRows: [string, string][][] = [
    [["Core Diameter (mm)", core.diameter], ["Height Before Trimming (mm)", core.heightBefore], ["Height After Trimming (mm)", core.heightAfter]],
    [["Core Weight in Air (g)", core.weightInAir], ["Density (Kg/m³)", core.density], ["C(H/D)-correction factor for aspect ratio", core.cdFactor]],
    [["Area (m²)", core.area], ["Volume (m³)", core.volume], ["Cdc-correction factor for core diameter", ""]],
    [["Maximum Load (kN)", core.load], ["Actual Compressive Strength (N/mm²)", core.coreStrength], ["Cd-correction factor for core extraction accuracy", ""]],
    [["Length/Diameter ratio of core at preparations", core.ldRatio], ["Cylinder Strength to Cube Strength", core.cylinderToCube], ["Ca-correction factor for presence of steel", core.caFactor]],
    [["", ""], ["", ""], ["Corrected Insitu Cube Strength (N/mm²)", core.correctedStrength]],
  ];
  testRows.forEach((row, r) =>
    row.forEach(([label, value], c) => drawCell(doc, LEFT + c * COL_W, testTop + r * CELL_H, COL_W, CELL_H, label, value))
  );
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

  const commentLines = doc.splitTextToSize(core.comments || "—", WIDTH - 46);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(0);
  doc.text("Comments:", LEFT + 2, COMMENTS_TOP + 6);
  doc.setFont("helvetica", "normal");
  doc.text(commentLines, LEFT + 44, COMMENTS_TOP + 6);
  const voidageTop = COMMENTS_TOP + 6 + Math.max(commentLines.length, 1) * 9;
  doc.setFont("helvetica", "bold");
  doc.text("Excess Voidage:", LEFT + 2, voidageTop);
  doc.setFont("helvetica", "normal");
  doc.text(core.excessVoidage ? `${core.excessVoidage}%` : "—", LEFT + 44, voidageTop);

  const signatureTop = voidageTop + 6;
  const signatureCellW = (WIDTH - STAMP_AREA) / 3;
  drawCell(doc, LEFT, signatureTop, signatureCellW, SIGNATURE_H, "Tested by", project.testedBy);
  drawCell(doc, LEFT + signatureCellW, signatureTop, signatureCellW, SIGNATURE_H, "Date Reported", project.dateReported);
  drawCell(doc, LEFT + signatureCellW * 2, signatureTop, signatureCellW, SIGNATURE_H, "Checked by", project.checkedBy);

  if (images.stamp) {
    drawFittedImage(doc, images.stamp, LEFT + WIDTH - 50, signatureTop - 14, 48, 48);
  }
};

export const buildCoringReportPDF = async (project: CoringProjectInfo, cores: CoringCoreReport[]): Promise<jsPDF> => {
  let images: AdminImages = {};
  try {
    images = await fetchAdminImagesAsBase64();
  } catch (error) {
    console.warn("[CoringPDF] Could not load header/stamp images, exporting without them:", error);
  }

  const doc = new jsPDF({ unit: "pt", format: "letter" });
  cores.forEach((core, index) => {
    if (index > 0) doc.addPage();
    drawCorePage(doc, project, core, images);
  });
  return doc;
};
