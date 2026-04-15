import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

interface PDFData {
  title: string;
  projectName?: string;
  clientName?: string;
  date?: string;
  labOrganization?: string;
  dateReported?: string;
  checkedBy?: string;
  fields?: { label: string; value: string }[];
  tables?: {
    title?: string;
    headers: string[];
    rows: string[][];
  }[];
  chartImages?: { [key: string]: string }; // Base64 encoded chart images
  logoImage?: string; // Base64 encoded logo
  stampImage?: string; // Base64 encoded stamp
}

const COLORS = {
  primary: [41, 98, 163] as [number, number, number],
  lightPrimary: [200, 215, 235] as [number, number, number],
  dark: [30, 30, 30] as [number, number, number],
  muted: [120, 120, 120] as [number, number, number],
  border: [200, 200, 200] as [number, number, number],
  lightBg: [245, 247, 250] as [number, number, number],
};

function addProfessionalHeader(
  doc: jsPDF,
  data: PDFData
): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 10;

  // Header bar with primary color
  doc.setFillColor(...COLORS.primary);
  doc.rect(0, 0, pageWidth, 45, "F");

  // Main title
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text("Engineering Material Testing", pageWidth / 2, y + 8, { align: "center" });

  // Subtitle
  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.text(data.title, pageWidth / 2, y + 16, { align: "center" });

  y = 50;

  // Metadata section - in 2-3 column layout
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLORS.primary);

  const col1 = 14;
  const col2 = pageWidth / 2;
  const metadata = [
    { label: "Project", value: data.projectName || "—" },
    { label: "Client", value: data.clientName || "—" },
    { label: "Lab Organization", value: data.labOrganization || "—" },
    { label: "Date Tested", value: data.date || new Date().toISOString().split("T")[0] },
    { label: "Date Reported", value: data.dateReported || "—" },
    { label: "Checked By", value: data.checkedBy || "—" },
  ];

  // Draw metadata in two columns
  for (let i = 0; i < metadata.length; i += 2) {
    const item1 = metadata[i];
    doc.text(item1.label + ":", col1, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...COLORS.dark);
    doc.text(item1.value, col1 + 35, y);

    if (i + 1 < metadata.length) {
      const item2 = metadata[i + 1];
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...COLORS.primary);
      doc.text(item2.label + ":", col2, y);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...COLORS.dark);
      doc.text(item2.value, col2 + 35, y);
    }
    y += 6;
  }

  y += 3;
  doc.setDrawColor(...COLORS.border);
  doc.line(14, y, pageWidth - 14, y);

  return y + 8;
}

function addFooter(doc: jsPDF): void {
  const pageCount = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.muted);
    doc.setFont("helvetica", "normal");
    doc.text(`Page ${i} of ${pageCount}`, pageWidth / 2, pageHeight - 8, { align: "center" });
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, pageHeight - 8);
  }
}

export const generateTestPDF = (data: PDFData) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = addProfessionalHeader(doc, data);

  // Results summary section
  if (data.fields && data.fields.length > 0) {
    // Section title
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...COLORS.primary);
    doc.text("Test Results Summary", 14, y);
    y += 7;

    // Results in grid format (2-3 columns)
    doc.setFontSize(9);
    const colWidth = (pageWidth - 28) / 2;
    let currentY = y;
    let colIndex = 0;

    for (let i = 0; i < data.fields.length; i++) {
      const field = data.fields[i];
      const xPos = 14 + colIndex * (colWidth + 8);

      // Field box
      doc.setFillColor(...COLORS.lightBg);
      doc.rect(xPos, currentY, colWidth, 16, "F");
      doc.setDrawColor(...COLORS.border);
      doc.rect(xPos, currentY, colWidth, 16);

      // Label
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...COLORS.primary);
      doc.text(field.label, xPos + 3, currentY + 5);

      // Value
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
    doc.line(14, y, pageWidth - 14, y);
    y += 8;

    for (const table of data.tables) {
      // Check if we need a new page
      if (y > 220) {
        doc.addPage();
        y = addProfessionalHeader(doc, data);
      }

      if (table.title) {
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...COLORS.primary);
        doc.text(table.title, 14, y);
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
        alternateRowStyles: {
          fillColor: COLORS.lightBg,
        },
        margin: { left: 14, right: 14 },
        styles: { overflow: "linebreak" as const },
        didDrawPage: (hookData: any) => {
          if (hookData.pageNumber > 1) {
            addProfessionalHeader(doc, data);
          }
        },
      });

      y = (doc as any).lastAutoTable.finalY + 10;
    }
  }

  // Chart images section
  if (data.chartImages && Object.keys(data.chartImages).length > 0) {
    // Add new page if not enough space
    if (y > 200) {
      doc.addPage();
      y = addProfessionalHeader(doc, data);
    }

    doc.setDrawColor(...COLORS.border);
    doc.line(14, y, pageWidth - 14, y);
    y += 8;

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...COLORS.primary);
    doc.text("Charts & Graphs", 14, y);
    y += 10;

    for (const [chartName, chartBase64] of Object.entries(data.chartImages)) {
      if (chartBase64) {
        try {
          // Check if we need a new page for this chart
          if (y > 180) {
            doc.addPage();
            y = addProfessionalHeader(doc, data);
          }

          // Convert base64 to image data if needed
          const imageData = chartBase64.startsWith("data:") ? chartBase64 : `data:image/png;base64,${chartBase64}`;
          const imgWidth = pageWidth - 28; // Leave margins
          const imgHeight = (imgWidth * 3) / 4; // 4:3 aspect ratio

          doc.addImage(imageData, "PNG", 14, y, imgWidth, imgHeight);
          y += imgHeight + 8;
        } catch (error) {
          console.error(`Failed to add chart image (${chartName}):`, error);
        }
      }
    }
  }

  addFooter(doc);
  doc.save(`${data.title.replace(/\s+/g, "_")}_Report.pdf`);
};
