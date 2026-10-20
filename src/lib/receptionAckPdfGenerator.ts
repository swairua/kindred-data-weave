/**
 * Header helpers for the receipt acknowledgement PDF.
 */
import { jsPDF } from "jspdf";
import { isSampleOnHold } from "./reception";
import type { ReceptionConsignmentInput } from "./reception";
import { fetchAdminImagesAsBase64, type AdminImages } from "./imageUtils";

export interface ReceptionAckOptions extends ReceptionConsignmentInput {
  labName?: string;
  labAddress?: string;
  labPhone?: string;
  labEmail?: string;
  retentionNote?: string;
  skipDownload?: boolean;
}

export const RECEPTION_ACK_MARGIN = 14;
export const RECEPTION_ACK_PAGE_W = 210;

export const ackText = (value: string, fallback = "—"): string => {
  const trimmed = value.trim();
  return trimmed === "" ? fallback : trimmed;
};

export const drawAckHeader = (d: jsPDF, o: ReceptionAckOptions, images: AdminImages): number => {
  const MARGIN = RECEPTION_ACK_MARGIN;
  const PAGE_W = RECEPTION_ACK_PAGE_W;
  let y = MARGIN;
  if (images.logo) {
    try {
      const match = /^(data:image\/(\w+);base64,)(.+)$/.exec(images.logo);
      const format = (match?.[2]?.toUpperCase() === "JPG" ? "JPEG" : match?.[2]?.toUpperCase() ?? "PNG") as "PNG" | "JPEG";
      d.addImage(match?.[3] ?? images.logo, format, MARGIN, y - 2, 26, 16);
    } catch { /* logo optional */ }
  }
  d.setFont("times", "bold");
  d.setFontSize(13);
  d.text((o.labName || "CRANSFIELD MATERIALS TESTING CENTER").toUpperCase(), MARGIN + 30, y + 3);
  d.setFont("times", "normal");
  d.setFontSize(8);
  d.text(o.labAddress || "Ruiru Business Park, Kamiti Road · P.O. Box 59401-00200, Nairobi", MARGIN + 30, y + 8);
  d.text(`Tel ${o.labPhone || "[phone]"} · ${o.labEmail || "[email]"}`, MARGIN + 30, y + 12);
  y += 18;
  d.setDrawColor(0, 110, 110);
  d.setLineWidth(0.6);
  d.line(MARGIN, y, PAGE_W - MARGIN, y);
  return y + 7;
};

export const loadAckImages = async (): Promise<AdminImages> => {
  try {
    return await fetchAdminImagesAsBase64();
  } catch (error) {
    console.warn("[Reception PDF] Could not load header images:", error);
    return {};
  }
};

const MARGIN = RECEPTION_ACK_MARGIN;
const PAGE_W = RECEPTION_ACK_PAGE_W;

const drawIdBlock = (d: jsPDF, o: ReceptionAckOptions, y: number): number => {
  const block: Array<[string, string]> = [
    [`Client: ${ackText(o.client)}`, `Job no.: ${ackText(o.jobNo)}`],
    [`Project: ${ackText(o.project)}`, `Client request ref.: ${ackText(o.clientRef)}`],
    [`Received: ${ackText(o.receivedAt)}`, `Method set: ${ackText(o.methodSet)}`],
  ];
  const colW = (PAGE_W - MARGIN * 2) / 2;
  d.setFontSize(8.5);
  for (const [left, right] of block) {
    d.setFont("helvetica", "normal");
    d.setDrawColor(0, 0, 0);
    d.setLineWidth(0.2);
    d.rect(MARGIN, y, colW, 7);
    d.rect(MARGIN + colW, y, colW, 7);
    d.text(left, MARGIN + 2, y + 4.8);
    d.text(right, MARGIN + colW + 2, y + 4.8);
    y += 7;
  }
  return y + 4;
};

const drawSamplesTable = (d: jsPDF, o: ReceptionAckOptions, y: number): number => {
  const cols = [22, 22, 28, 42, 24, 44];
  const headers = ["Lab ID", "Client mark", "Location · depth (m)", "Sample type", "Condition", "Tests requested"];
  d.setFont("helvetica", "bold");
  d.setFontSize(8);
  let x = MARGIN;
  headers.forEach((h, i) => {
    d.rect(x, y, cols[i], 7);
    d.text(h, x + 1.5, y + 4.8);
    x += cols[i];
  });
  y += 7;
  d.setFont("helvetica", "normal");
  d.setFontSize(7.5);
  o.samples.forEach((sample) => {
    const cells = [
      sample.labId,
      sample.clientMark,
      `${sample.location}${sample.depthLabel ? ` · ${sample.depthLabel}` : ""}`,
      `${sample.sampleType}${sample.container ? `, ${sample.container}` : ""}${sample.massKg ? `, ${sample.massKg} kg` : ""}`,
      sample.condition,
      sample.tests.join(", "),
    ];
    const lines = cells.map((cell, i) => d.splitTextToSize(ackText(cell, ""), cols[i] - 3));
    const rowH = Math.max(7, ...lines.map((l) => l.length * 3.6 + 3));
    if (y + rowH > 270) {
      d.addPage();
      y = MARGIN;
    }
    x = MARGIN;
    lines.forEach((line, i) => {
      d.rect(x, y, cols[i], rowH);
      d.text(line, x + 1.5, y + 4.5);
      x += cols[i];
    });
    y += rowH;
  });
  return y + 4;
};

const drawHoldBox = (d: jsPDF, o: ReceptionAckOptions, tableW: number, y: number): number => {
  const held = o.samples.filter((s) => isSampleOnHold(s.condition));
  if (held.length === 0) return y;
  d.setDrawColor(150, 90, 20);
  const lines: string[] = ["Nonconformance on receipt"];
  for (const sample of held) {
    lines.push(
      `${sample.labId} (${sample.clientMark}, ${sample.sampleType} at ${sample.depthLabel || sample.location}): ` +
      `${sample.condition.toLowerCase()}. The ${sample.tests.join("/")} test${sample.tests.length === 1 ? " is" : "s are"} ` +
      "on hold until the client confirms in writing whether to test as received or to resample.",
    );
  }
  const wrapped = lines.flatMap((line) => d.splitTextToSize(line, tableW - 6));
  const boxH = wrapped.length * 4 + 5;
  if (y + boxH > 272) {
    d.addPage();
    y = MARGIN;
  }
  d.rect(MARGIN, y, tableW, boxH);
  d.setFont("helvetica", "bold");
  d.setFontSize(8);
  d.text(wrapped[0], MARGIN + 3, y + 5);
  d.setFont("helvetica", "normal");
  d.setFontSize(7.5);
  wrapped.slice(1).forEach((line, i) => d.text(line, MARGIN + 3, y + 9 + i * 4));
  return y + boxH + 4;
};

const drawNotesAndSignatures = (d: jsPDF, o: ReceptionAckOptions, tableW: number, y: number): void => {
  const notes = [
    "Notes",
    "1. Samples are tested as received. The laboratory is not responsible for sampling, sample selection or transport before receipt.",
    `2. Samples are retained for ${o.retentionNote || "[retention period]"} after the report is issued, then disposed of unless the client asks for their return in writing.`,
    "3. Please quote the receipt number and Lab IDs in all correspondence.",
  ];
  d.setFontSize(7.5);
  for (const note of notes) {
    const wrapped = d.splitTextToSize(note, tableW);
    if (y + wrapped.length * 4 > 272) {
      d.addPage();
      y = MARGIN;
    }
    d.setFont("helvetica", note === "Notes" ? "bold" : "normal");
    d.text(wrapped, MARGIN, y + 4);
    y += wrapped.length * 4 + 1;
  }
  y += 4;
  d.setFont("helvetica", "bold");
  d.text("Delivered by", MARGIN, y);
  d.text("Received for the laboratory", MARGIN + tableW / 2, y);
  d.setFont("helvetica", "normal");
  d.text(`Name: ${ackText(o.deliveredBy, "")}`, MARGIN, y + 5);
  d.text(`Name: ${ackText(o.receivedBy, "")}`, MARGIN + tableW / 2, y + 5);
  y += 12;
  d.line(MARGIN, y, MARGIN + tableW / 2 - 6, y);
  d.line(MARGIN + tableW / 2, y, MARGIN + tableW, y);
  d.setFontSize(7);
  d.text("Signature & date", MARGIN, y + 4);
  d.text("Signature & date", MARGIN + tableW / 2, y + 4);
  d.setFillColor(0, 95, 85);
  d.rect(0, 287, PAGE_W, 10, "F");
  d.setTextColor(255, 255, 255);
  d.setFontSize(6.5);
  d.text(
    "Specialists in: Geotechnical Investigations · Materials Testing · Non-Destructive Testing · Structural Audits",
    PAGE_W / 2,
    293,
    { align: "center" },
  );
  d.setTextColor(0, 0, 0);
};

export const generateReceptionAckPDF = async (options: ReceptionAckOptions): Promise<jsPDF> => {
  const images = await loadAckImages();
  const o = options;
  const d = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  let y = drawAckHeader(d, o, images);
  d.setFont("helvetica", "bold");
  d.setFontSize(12);
  d.text("SAMPLE RECEIPT ACKNOWLEDGEMENT", MARGIN, y);
  d.setFontSize(9);
  d.text(`No. ${o.rcNo}`, PAGE_W - MARGIN, y, { align: "right" });
  y += 6;
  const tableW = 182;
  y = drawIdBlock(d, o, y);
  y = drawSamplesTable(d, o, y);
  y = drawHoldBox(d, o, tableW, y);
  drawNotesAndSignatures(d, o, tableW, y);
  if (!o.skipDownload) {
    d.save(`${o.rcNo || "Receipt"}_Acknowledgement.pdf`);
  }
  return d;
};

