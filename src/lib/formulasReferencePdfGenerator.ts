/**
 * Calculations & Formulas Reference - portrait A4 document listing every
 * formula the app applies in the Grading, Atterberg, Proctor and
 * Compressive sections, with the standard behind each one and the variable
 * meanings a technician needs to read a result sheet.
 *
 * Content comes from `formulasReference.ts` (data only); this module owns
 * the layout - flowing text with section bands, courier formula lines and
 * footers - following the house jsPDF conventions (helvetica/courier,
 * millimetres, downloadable file, `skipDownload` for tests).
 */

import { jsPDF } from "jspdf";
import {
  FORMULAS_REFERENCE_TITLE,
  FORMULAS_REFERENCE_VERSION,
  FORMULA_SECTIONS,
} from "./formulasReference";

export interface FormulasReferencePdfOptions {
  labOrganization?: string;
  /** ISO date printed on the cover line; defaults to today. */
  dateIssued?: string;
  skipDownload?: boolean;
}

export const FORMULAS_REFERENCE_FILENAME = "Calculations_and_Formulas_Reference.pdf";

const MARGIN = 15;
const CONTENT_W = 180; // 210 - 2 * 15
const FOOTER_Y = 287;
const BOTTOM_LIMIT = 272;

const INK: [number, number, number] = [31, 41, 55];
const MUTED: [number, number, number] = [100, 116, 139];
const BAND: [number, number, number] = [30, 58, 95];
const BAND_TEXT: [number, number, number] = [255, 255, 255];
const FORMULA_BG: [number, number, number] = [241, 245, 249];

const todayIso = (): string => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

const wrapped = (d: jsPDF, text: string, maxWidth: number): string[] => {
  try {
    return d.splitTextToSize(text, maxWidth) as string[];
  } catch {
    return [text];
  }
};

export const generateFormulasReferencePDF = async (options: FormulasReferencePdfOptions = {}) => {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  // Footer pass runs after layout, once the page count is known.
  let y = MARGIN;

  const ensureSpace = (needed: number) => {
    if (y + needed > BOTTOM_LIMIT) {
      doc.addPage();
      y = MARGIN;
    }
  };

  // ---- Cover header ----
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.setTextColor(...INK);
  doc.text(FORMULAS_REFERENCE_TITLE, MARGIN, y);
  y += 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(...MUTED);
  const coverSub = [
    `Version ${FORMULAS_REFERENCE_VERSION}`,
    `Issued ${options.dateIssued ?? todayIso()}`,
    options.labOrganization ?? "",
  ].filter(Boolean).join("  |  ");
  for (const line of wrapped(doc, coverSub, CONTENT_W)) {
    doc.text(line, MARGIN, y);
    y += 4.5;
  }
  y += 1;
  doc.setDrawColor(...MUTED);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, y, MARGIN + CONTENT_W, y);
  y += 6;

  // ---- Sections ----
  for (const section of FORMULA_SECTIONS) {
    ensureSpace(26);
    doc.setFillColor(...BAND);
    doc.rect(MARGIN, y - 4.5, CONTENT_W, 8, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...BAND_TEXT);
    doc.text(section.title, MARGIN + 3, y + 1);
    y += 7;
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(section.standard, MARGIN, y);
    y += 6;

    for (const entry of section.entries) {
      ensureSpace(20);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.5);
      doc.setTextColor(...INK);
      for (const line of wrapped(doc, entry.heading, CONTENT_W)) {
        ensureSpace(5);
        doc.text(line, MARGIN, y);
        y += 5;
      }
      y += 1;

      doc.setFont("courier", "normal");
      doc.setFontSize(9);
      for (const formula of entry.formulas) {
        const lines = wrapped(doc, formula, CONTENT_W - 8);
        ensureSpace(lines.length * 4.2 + 3);
        const boxH = lines.length * 4.2 + 2.5;
        doc.setFillColor(...FORMULA_BG);
        doc.rect(MARGIN + 2, y - 3.5, CONTENT_W - 2, boxH, "F");
        doc.setTextColor(...INK);
        for (const line of lines) {
          doc.text(line, MARGIN + 5, y);
          y += 4.2;
        }
        y += 2.5;
      }

      if (entry.variables.length > 0) {
        ensureSpace(5);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(...INK);
        doc.text("Where:", MARGIN + 2, y);
        y += 4.5;
        doc.setFont("helvetica", "normal");
        for (const variable of entry.variables) {
          const lines = wrapped(doc, `${variable.symbol} -- ${variable.meaning}`, CONTENT_W - 8);
          ensureSpace(lines.length * 4.2);
          doc.setTextColor(...INK);
          lines.forEach((line, index) => {
            doc.text(index === 0 ? `\u2022 ${line}` : `  ${line}`, MARGIN + 4, y);
            y += 4.2;
          });
        }
        y += 1;
      }

      for (const note of entry.notes) {
        const lines = wrapped(doc, `Note: ${note}`, CONTENT_W - 4);
        ensureSpace(lines.length * 4.2);
        doc.setFont("helvetica", "italic");
        doc.setFontSize(8.5);
        doc.setTextColor(...MUTED);
        for (const line of lines) {
          doc.text(line, MARGIN + 2, y);
          y += 4.2;
        }
        y += 1;
      }

      ensureSpace(4.5);
      doc.setFont("courier", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...MUTED);
      const sourceLine = `Implemented in ${entry.sourceModule}: ${entry.sourceFunctions.join(", ")}`;
      for (const line of wrapped(doc, sourceLine, CONTENT_W)) {
        doc.text(line, MARGIN, y);
        y += 3.8;
      }
      y += 5;
    }
  }

  // ---- Footers (page i of N) ----
  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(
      `${FORMULAS_REFERENCE_TITLE} v${FORMULAS_REFERENCE_VERSION}  |  Page ${page} of ${totalPages}`,
      MARGIN + CONTENT_W / 2,
      FOOTER_Y,
      { align: "center" },
    );
  }

  if (!options.skipDownload) {
    doc.save(FORMULAS_REFERENCE_FILENAME);
  }
  return doc;
};
