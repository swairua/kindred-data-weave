import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { fetchAdminImagesAsBase64, type AdminImages } from "./imageUtils";

interface PDFData {
  title: string;
  /** Standard the test method is performed to, e.g. "BS EN 206:2013". */
  standard?: string;
  projectName?: string;
  clientName?: string;
  date?: string;
  labOrganization?: string;
  dateReported?: string;
  checkedBy?: string;
  testedBy?: string;
  fields?: { label: string; value: string }[];
  tables?: {
    title?: string;
    headers: string[];
    rows: string[][];
  }[];
  chartImages?: { [key: string]: string }; // Base64 encoded chart images
}

const COLORS = {
  primary: [41, 98, 163] as [number, number, number],
  lightPrimary: [200, 215, 235] as [number, number, number],
  dark: [30, 30, 30] as [number, number, number],
  muted: [120, 120, 120] as [number, number, number],
  border: [200, 200, 200] as [number, number, number],
  lightBg: [245, 247, 250] as [number, number, number],
};

const PAGE_MARGIN = 10;
const BLANK = "___________";
/** Reserve this much space at the foot of every page for the signature line. */
const FOOTER_ZONE = 22;

/** Pull the raw base64 out of a data URL and report the image type. */
const imageParts = (dataUrl: string): { base64: string; format: "PNG" | "JPEG" } => {
  const match = /^(data:image\/(\w+);base64,)(.+)$/.exec(dataUrl);
  if (!match) return { base64: dataUrl, format: "PNG" };
  const mime = match[2].toLowerCase();
  const format = mime === "jpeg" || mime === "jpg" ? "JPEG" : "PNG";
  return { base64: match[3], format };
};

/**
 * Draws the report header in the same house style as the Atterberg report:
 * report label top-left, logo and contacts either side of a rule, then a
 * centred underlined title carrying the test standard.
 *
 * Returns the y coordinate where body content may begin. The value is
 * deterministic for a given PDFData, which is what lets the table margin below
 * reserve exactly the right amount of space on continuation pages.
 */
function addProfessionalHeader(doc: jsPDF, data: PDFData, images: AdminImages): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentW = pageWidth - PAGE_MARGIN * 2;

  // Report label, top-left
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COLORS.dark);
  doc.text(`${data.title} Report`, PAGE_MARGIN, 9);

  let y = 13;

  // Logo left / contacts right
  const headerH = 20;
  if (images.logo || images.contacts) {
    const imgW = 62;
    if (images.logo) {
      try {
        const { base64, format } = imageParts(images.logo);
        doc.addImage(base64, format, PAGE_MARGIN, y, imgW, headerH, undefined, "FAST");
      } catch { /* logo is optional */ }
    }
    if (images.contacts) {
      try {
        const { base64, format } = imageParts(images.contacts);
        doc.addImage(base64, format, pageWidth - PAGE_MARGIN - imgW, y, imgW, headerH, undefined, "FAST");
      } catch { /* contacts artwork is optional */ }
    }
    y += headerH + 2;
  }

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.5);
  doc.line(PAGE_MARGIN, y, PAGE_MARGIN + contentW, y);
  y += 3;

  // Centred, underlined title
  const title = data.title.toUpperCase();
  doc.setFontSize(10.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLORS.dark);
  doc.text(title, pageWidth / 2, y + 3, { align: "center" });
  const titleWidth = doc.getTextWidth(title);
  doc.setLineWidth(0.4);
  doc.line(pageWidth / 2 - titleWidth / 2, y + 4.2, pageWidth / 2 + titleWidth / 2, y + 4.2);
  y += 8;

  if (data.standard) {
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...COLORS.dark);
    doc.text(`Test performed to ${data.standard}`, pageWidth / 2, y + 2, { align: "center" });
    y += 6;
  }
  // Metadata in two columns. An unrecorded date shows a dash rather than
  // today's date: a report must not assert a test date that was never captured.
  const metadata = [
    { label: "Project", value: data.projectName || "—" },
    { label: "Client", value: data.clientName || "—" },
    { label: "Lab Organization", value: data.labOrganization || "—" },
    { label: "Date Tested", value: data.date || "—" },
    { label: "Date Reported", value: data.dateReported || "—" },
    { label: "Checked By", value: data.checkedBy || "—" },
  ];
  const col1 = PAGE_MARGIN;
  const col2 = pageWidth / 2;
  y += 2;
  for (let i = 0; i < metadata.length; i += 2) {
    const left = metadata[i];
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...COLORS.primary);
    doc.text(left.label + ":", col1, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...COLORS.dark);
    doc.text(left.value, col1 + 30, y);

    if (i + 1 < metadata.length) {
      const right = metadata[i + 1];
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...COLORS.primary);
      doc.text(right.label + ":", col2, y);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...COLORS.dark);
      doc.text(right.value, col2 + 30, y);
    }
    y += 6;
  }

  y += 2;
  doc.setDrawColor(...COLORS.border);
  doc.setLineWidth(0.4);
  doc.line(PAGE_MARGIN, y, PAGE_MARGIN + contentW, y);

  return y + 5;
}

/** Signature line, stamp and page numbering, drawn on every page. */
function addFooter(doc: jsPDF, data: PDFData, images: AdminImages): void {
  const pageCount = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentW = pageWidth - PAGE_MARGIN * 2;
  const signatureY = pageHeight - 14;

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const ruleY = signatureY - 6;
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.5);
    doc.line(PAGE_MARGIN, ruleY, PAGE_MARGIN + contentW, ruleY);

    if (images.stamp) {
      try {
        const { base64, format } = imageParts(images.stamp);
        const size = 18;
        doc.addImage(base64, format, PAGE_MARGIN + contentW - size, ruleY + 1, size, size, undefined, "FAST");
      } catch { /* stamp is optional */ }
    }

    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...COLORS.dark);
    // Leave room for the stamp so the third signature column cannot sit under it.
    const usable = images.stamp ? contentW - 24 : contentW;
    const col = usable / 3;
    doc.text(`Tested by ${data.testedBy || BLANK}`, PAGE_MARGIN, signatureY);
    doc.text(`Date reported ${data.dateReported || BLANK}`, PAGE_MARGIN + col, signatureY);
    doc.text(`Checked by ${data.checkedBy || BLANK}`, PAGE_MARGIN + col * 2, signatureY);

    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...COLORS.muted);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth / 2, pageHeight - 6, { align: "center" });
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, PAGE_MARGIN, pageHeight - 6);
  }
}

export const generateTestPDF = async (data: PDFData) => {
  // Images are optional: a missing logo must never stop a report being produced.
  let images: AdminImages = {};
  try {
    images = await fetchAdminImagesAsBase64();
  } catch (error) {
    console.warn("[PDF] Could not load header/footer images, exporting without them:", error);
  }

  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  /** Lowest y that still leaves the signature line clear. */
  const contentBottom = () => pageHeight - FOOTER_ZONE;

  // The header is a fixed height for a given PDFData, so measuring it once on
  // page 1 gives the exact top margin continuation pages need.
  const headerY = addProfessionalHeader(doc, data, images);
  let y = headerY;

  /** Start a new page and redraw the header on it. */
  const newPage = () => {
    doc.addPage();
    return addProfessionalHeader(doc, data, images);
  };

  // Results summary section
  if (data.fields && data.fields.length > 0) {
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...COLORS.primary);
    doc.text("Test Results Summary", PAGE_MARGIN, y);
    y += 7;

    doc.setFontSize(9);
    const colWidth = (pageWidth - PAGE_MARGIN * 2 - 8) / 2;
    let currentY = y;
    let colIndex = 0;

    for (let i = 0; i < data.fields.length; i++) {
      const field = data.fields[i];
      // Only break between pairs, so a box is never orphaned from its partner.
      if (colIndex === 0 && currentY + 16 > contentBottom()) currentY = newPage() + 20;
      const xPos = PAGE_MARGIN + colIndex * (colWidth + 8);

      doc.setFillColor(...COLORS.lightBg);
      doc.rect(xPos, currentY, colWidth, 16, "F");
      doc.setDrawColor(...COLORS.border);
      doc.rect(xPos, currentY, colWidth, 16);

      doc.setFont("helvetica", "bold");
      doc.setTextColor(...COLORS.primary);
      doc.text(field.label, xPos + 3, currentY + 5);

      doc.setFont("helvetica", "normal");
      doc.setTextColor(...COLORS.dark);
      doc.text(field.value || "-", xPos + 3, currentY + 12);

      colIndex = (colIndex + 1) % 2;
      if (colIndex === 0 || i === data.fields.length - 1) {
        currentY += 20;
      }
    }

    y = currentY + 5;
  }

  // Data tables section
  if (data.tables && data.tables.length > 0) {
    doc.setDrawColor(...COLORS.border);
    doc.setLineWidth(0.4);
    doc.line(PAGE_MARGIN, y, pageWidth - PAGE_MARGIN, y);
    y += 8;

    for (const table of data.tables) {
      if (y + 30 > contentBottom()) y = newPage() + 4;

      if (table.title) {
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...COLORS.primary);
        doc.text(table.title, PAGE_MARGIN, y);
        y += 7;
      }

      autoTable(doc, {
        startY: y,
        head: [table.headers],
        body: table.rows,
        theme: "grid",
        headStyles: {
          fillColor: COLORS.primary,
          textColor: 255,
          fontStyle: "bold",
          fontSize: 8,
          cellPadding: 3,
        },
        bodyStyles: { fontSize: 8, cellPadding: 2.5 },
        alternateRowStyles: { fillColor: COLORS.lightBg },
        // The header is redrawn in willDrawPage, which autoTable calls *after*
        // starting a new page but *before* laying out that page's rows. The old
        // didDrawPage hook ran after the rows were drawn, so any table spilling
        // onto a second page had the header overprinted across its rows.
        willDrawPage: () => {
          if (doc.getCurrentPageInfo().pageNumber > 1) {
            addProfessionalHeader(doc, data, images);
          }
        },
        margin: { top: headerY, left: PAGE_MARGIN + 4, right: PAGE_MARGIN + 4, bottom: FOOTER_ZONE },
        styles: { overflow: "linebreak" as const },
      });

      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
    }
  }

  // Chart images section
  if (data.chartImages && Object.keys(data.chartImages).length > 0) {
    if (y + 30 > contentBottom()) y = newPage() + 4;

    doc.setDrawColor(...COLORS.border);
    doc.setLineWidth(0.4);
    doc.line(PAGE_MARGIN, y, pageWidth - PAGE_MARGIN, y);
    y += 8;

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...COLORS.primary);
    doc.text("Charts & Graphs", PAGE_MARGIN, y);
    y += 10;

    for (const [chartName, chartBase64] of Object.entries(data.chartImages)) {
      if (!chartBase64) continue;
      try {
        if (y + 60 > contentBottom()) y = newPage() + 4;

        const { base64, format } = imageParts(chartBase64);
        const imgWidth = pageWidth - PAGE_MARGIN * 2;
        // Keep the chart at its natural 4:3 ratio, but never taller than the
        // space left on the page, so it is never split across a page break.
        const naturalHeight = (imgWidth * 3) / 4;
        const imgHeight = Math.min(naturalHeight, contentBottom() - y);

        doc.addImage(base64, format, PAGE_MARGIN, y, imgWidth, imgHeight);
        y += imgHeight + 8;
      } catch (error) {
        console.error(`Failed to add chart image (${chartName}):`, error);
      }
    }
  }

  addFooter(doc, data, images);
  doc.save(`${data.title.replace(/\s+/g, "_")}_Report.pdf`);
};
