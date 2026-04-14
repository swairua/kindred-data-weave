import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type {
  AtterbergProjectState,
  AtterbergRecord,
  LiquidLimitTrial,
  PlasticLimitTrial,
  ShrinkageLimitTrial,
} from "@/context/TestDataContext";
import { calculateMoistureFromMass } from "./atterbergCalculations";
import { fetchAdminImagesAsBase64, type AdminImages } from "./imageUtils";

// Helper to extract base64 string from data URL
const extractBase64FromDataUrl = (dataUrl: string): string => {
  if (!dataUrl) {
    console.warn("Empty dataUrl passed to extractBase64FromDataUrl");
    return "";
  }
  const match = dataUrl.match(/^data:image\/\w+;base64,(.+)$/);
  const result = match ? match[1] : dataUrl;
  console.log("Extracted base64 for PDF:", {
    dataUrlLength: dataUrl.length,
    isDataUrl: dataUrl.startsWith("data:"),
    resultLength: result.length,
    extracted: match ? "yes" : "no (using as-is)"
  });
  return result;
};

interface AtterbergPDFOptions {
  projectName?: string;
  clientName?: string;
  date?: string;
  projectState: AtterbergProjectState;
  records: AtterbergRecord[];
  skipDownload?: boolean;
}

const COLORS = {
  primary: [41, 98, 163] as [number, number, number],
  dark: [30, 30, 30] as [number, number, number],
  muted: [120, 120, 120] as [number, number, number],
  border: [180, 180, 180] as [number, number, number],
  lightBg: [245, 247, 250] as [number, number, number],
  headerBg: [220, 230, 245] as [number, number, number],
};

const num = (v: string | undefined): number | null => {
  if (!v || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const fmt = (v: number | string | null | undefined): string =>
  v === null || v === undefined ? "-" : typeof v === "number" ? String(round2(v)) : v;

// ── Draw the cone penetration / moisture graph (BS 1377 style) with logarithmic scaling ──
function drawConeGraph(
  doc: jsPDF,
  llTrials: LiquidLimitTrial[],
  liquidLimit: number | undefined,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const margin = { top: 14, bottom: 20, left: 28, right: 8 };
  const plotX = x + margin.left;
  const plotY = y + margin.top;
  const plotW = w - margin.left - margin.right;
  const plotH = h - margin.top - margin.bottom;

  // Title
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLORS.primary);
  doc.text("CONE PENETRATION vs MOISTURE CONTENT (Log Scale)", x + w / 2, y + 8, { align: "center" });

  // Axes
  doc.setDrawColor(...COLORS.dark);
  doc.setLineWidth(0.3);
  doc.line(plotX, plotY, plotX, plotY + plotH); // Y axis
  doc.line(plotX, plotY + plotH, plotX + plotW, plotY + plotH); // X axis

  // FIRST: Gather and process data points (calculate first)
  const points: Array<{ pen: number; mc: number }> = [];
  for (const trial of llTrials) {
    const pen = num(trial.penetration);
    const mcStr = calculateMoistureFromMass(trial.containerWetMass, trial.containerDryMass, trial.containerMass);
    const mc = mcStr ? Number(mcStr) : num(trial.moisture);
    if (pen !== null && mc !== null && pen > 0 && mc > 0) {
      points.push({ pen, mc });
    }
  }

  if (points.length === 0) {
    doc.setFontSize(7);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(...COLORS.muted);
    doc.text("No data", x + w / 2, y + h / 2, { align: "center" });
    return;
  }

  // Determine ranges using logarithmic values
  const logMcValues = points.map((p) => Math.log10(p.mc));
  const logPenValues = points.map((p) => Math.log10(p.pen));
  const logMcMin = Math.min(...logMcValues);
  const logMcMax = Math.max(...logMcValues);
  const logPenMin = Math.min(...logPenValues);
  const logPenMax = Math.max(...logPenValues);

  // Add 10% padding to ranges
  const logMcPadding = (logMcMax - logMcMin) * 0.1;
  const logPenPadding = (logPenMax - logPenMin) * 0.1;
  const mcMinLog = logMcMin - logMcPadding;
  const mcMaxLog = logMcMax + logMcPadding;
  const penMinLog = logPenMin - logPenPadding;
  const penMaxLog = logPenMax + logPenPadding;

  // Logarithmic scale functions
  const scaleX = (mc: number) => plotX + ((Math.log10(mc) - mcMinLog) / (mcMaxLog - mcMinLog)) * plotW;
  const scaleY = (pen: number) => plotY + plotH - ((Math.log10(pen) - penMinLog) / (penMaxLog - penMinLog)) * plotH;

  // Grid lines and tick marks
  doc.setFontSize(5.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COLORS.muted);
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.15);

  // X-axis ticks (moisture content - logarithmic)
  const mcTickValues = [10, 15, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  for (const mc of mcTickValues) {
    if (mc >= Math.pow(10, mcMinLog) && mc <= Math.pow(10, mcMaxLog)) {
      const px = scaleX(mc);
      doc.line(px, plotY, px, plotY + plotH);
      doc.text(String(mc), px, plotY + plotH + 5, { align: "center" });
    }
  }

  // Y-axis ticks (penetration - logarithmic)
  const penTickValues = [5, 10, 15, 20, 25, 30, 35, 40];
  for (const pen of penTickValues) {
    if (pen >= Math.pow(10, penMinLog) && pen <= Math.pow(10, penMaxLog)) {
      const py = scaleY(pen);
      doc.line(plotX, py, plotX + plotW, py);
      doc.text(String(pen), plotX - 3, py + 1.5, { align: "right" });
    }
  }

  // 20mm reference line
  doc.setDrawColor(200, 50, 50);
  doc.setLineWidth(0.3);
  doc.setLineDashPattern([2, 2], 0);
  const y20 = scaleY(20);
  doc.line(plotX, y20, plotX + plotW, y20);
  doc.setFontSize(5);
  doc.setTextColor(200, 50, 50);
  doc.text("20mm", plotX + plotW + 1, y20 + 1.5);
  doc.setLineDashPattern([], 0);

  // Sort points by moisture content for line drawing (data processing before rendering)
  const sorted = [...points].sort((a, b) => a.mc - b.mc);

  // Draw data line with logarithmic scaling
  doc.setDrawColor(...COLORS.primary);
  doc.setLineWidth(0.5);
  for (let i = 1; i < sorted.length; i++) {
    doc.line(
      scaleX(sorted[i - 1].mc),
      scaleY(sorted[i - 1].pen),
      scaleX(sorted[i].mc),
      scaleY(sorted[i].pen),
    );
  }

  // Draw data points with logarithmic scaling
  for (const pt of sorted) {
    const cx = scaleX(pt.mc);
    const cy = scaleY(pt.pen);
    doc.setFillColor(...COLORS.primary);
    doc.circle(cx, cy, 1.2, "F");
  }

  // Mark LL at 20mm if available with logarithmic positioning
  if (liquidLimit !== undefined && liquidLimit > 0) {
    const llX = scaleX(liquidLimit);
    doc.setDrawColor(200, 50, 50);
    doc.setLineDashPattern([1, 1], 0);
    doc.setLineWidth(0.3);
    doc.line(llX, plotY, llX, plotY + plotH);
    doc.setLineDashPattern([], 0);
    doc.setFontSize(5.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(200, 50, 50);
    doc.text(`LL=${round2(liquidLimit)}%`, llX, plotY - 2, { align: "center" });
  }

  // Axis labels
  doc.setFontSize(6);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLORS.dark);
  doc.text("Moisture Content (%) - Log Scale", x + w / 2, y + h - 2, { align: "center" });

  // Rotated Y label
  doc.saveGraphicsState();
  const yLabelX = x + 4;
  const yLabelY = y + h / 2;
  doc.text("Penetration (mm) - Log Scale", yLabelX, yLabelY, { angle: 90 });
  doc.restoreGraphicsState();
}

function drawRecordPage(
  doc: jsPDF,
  record: AtterbergRecord,
  options: AtterbergPDFOptions,
  images: AdminImages,
) {
  const { projectName, clientName, projectState } = options;
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentW = pw - margin * 2;

  let y = 10;

  // ── Header images: logo (left) + contacts (right) ──
  const headerH = 24;
  if (images.logo || images.contacts) {
    if (images.logo) {
      try {
        console.log("Adding logo image to PDF");
        const base64String = extractBase64FromDataUrl(images.logo);
        doc.addImage(base64String, "PNG", margin, y, contentW * 0.35, headerH);
        console.log("Logo image added successfully");
      } catch (error) {
        console.error("Failed to add logo image:", error instanceof Error ? error.message : error);
      }
    }
    if (images.contacts) {
      try {
        console.log("Adding contacts image to PDF");
        const contactsW = contentW * 0.35;
        const base64String = extractBase64FromDataUrl(images.contacts);
        doc.addImage(base64String, "PNG", pw - margin - contactsW, y, contactsW, headerH);
        console.log("Contacts image added successfully");
      } catch (error) {
        console.error("Failed to add contacts image:", error instanceof Error ? error.message : error);
      }
    }
    y += headerH + 3;
  }

  // ── Title bar ──
  doc.setFillColor(...COLORS.primary);
  doc.roundedRect(margin, y, contentW, 12, 2, 2, "F");
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text("ATTERBERG LIMITS (BS 1377 PART 2, 4.3 : 1990)", pw / 2, y + 8, { align: "center" });
  y += 16;

  // ── Metadata section ──
  const metaRows = [
    [{ label: "Client name:", value: clientName || projectState.clientName || "-" }],
    [{ label: "Project/Site name:", value: projectName || projectState.projectName || "-" }],
    [
      { label: "Sampled by:", value: projectState.labOrganization || "-" },
      { label: "Date submitted:", value: record.dateSubmitted || "-" },
      { label: "Date tested:", value: record.dateTested || "-" },
    ],
    [
      { label: "Sample ID:", value: record.label || "-" },
      { label: "Sample depth:", value: (record as any).sampleDepth || "-" },
      { label: "Sample No:", value: record.sampleNumber || "-" },
    ],
  ];

  doc.setFontSize(7.5);
  for (const row of metaRows) {
    const colW = contentW / row.length;
    row.forEach((item, i) => {
      const x = margin + i * colW;
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...COLORS.primary);
      doc.text(item.label, x + 2, y + 4);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...COLORS.dark);
      doc.text(item.value, x + 2, y + 8.5);
      doc.setDrawColor(...COLORS.border);
      doc.rect(x, y, colW, 11);
    });
    y += 11;
  }

  y += 3;

  // ── Record notes (if present) ──
  if (record.note && record.note.trim()) {
    doc.setFillColor(...COLORS.headerBg);
    doc.roundedRect(margin, y, contentW, 8, 1, 1, "F");
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...COLORS.primary);
    doc.text("Notes", margin + 2, y + 5);
    y += 9;

    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...COLORS.dark);
    const splitNote = doc.splitTextToSize(record.note, contentW - 4);
    doc.text(splitNote, margin + 2, y);
    y += Math.max(splitNote.length * 3, 8) + 3;
  }

  // ── Find tests ──
  const llTest = record.tests.find((t) => t.type === "liquidLimit");
  const plTest = record.tests.find((t) => t.type === "plasticLimit");
  const slTest = record.tests.find((t) => t.type === "shrinkageLimit");

  const llTrials = (llTest?.type === "liquidLimit" ? llTest.trials : []) as LiquidLimitTrial[];
  const plTrials = (plTest?.type === "plasticLimit" ? plTest.trials : []) as PlasticLimitTrial[];
  const slTrials = (slTest?.type === "shrinkageLimit" ? slTest.trials : []) as ShrinkageLimitTrial[];

  // ── Data table - handle unlimited trials with pagination ──
  const dataLabels = [
    "Container No",
    "Penetration (mm)",
    "Cont + Wet Soil (g)",
    "Cont + Dry Soil (g)",
    "Container (g)",
    "Wt Moisture (g)",
    "Wt Dry Soil (g)",
    "Moisture Content (%)",
  ];

  const trialsPerTable = 6; // Trials to show per table

  // Create tables for LL trials
  let tableCount = 0;
  for (let startIdx = 0; startIdx < llTrials.length; startIdx += trialsPerTable) {
    const endIdx = Math.min(startIdx + trialsPerTable, llTrials.length);
    const trialsInThisTable = llTrials.slice(startIdx, endIdx);

    // Check if we need a page break
    if (tableCount > 0 && y > ph - 80) {
      doc.addPage();
      y = 20;
    }

    // Table header
    const colHeaders = [""];
    for (let i = 0; i < trialsInThisTable.length; i++) colHeaders.push(`LL ${startIdx + i + 1}`);

    const dataRows: string[][] = dataLabels.map((label, i) => {
      const row = [label];
      for (const trial of trialsInThisTable) {
        const wet = num(trial.containerWetMass);
        const dry = num(trial.containerDryMass);
        const cont = num(trial.containerMass);
        switch (i) {
          case 0: row.push(trial.containerNo || "-"); break;
          case 1: row.push(fmt(num(trial.penetration))); break;
          case 2: row.push(fmt(wet)); break;
          case 3: row.push(fmt(dry)); break;
          case 4: row.push(fmt(cont)); break;
          case 5: row.push(wet !== null && dry !== null ? fmt(round2(wet - dry)) : "-"); break;
          case 6: row.push(dry !== null && cont !== null ? fmt(round2(dry - cont)) : "-"); break;
          case 7: {
            const mc = calculateMoistureFromMass(trial.containerWetMass, trial.containerDryMass, trial.containerMass);
            row.push(mc ? String(round2(Number(mc))) : "-");
            break;
          }
        }
      }
      return row;
    });

    autoTable(doc, {
      startY: y,
      head: [colHeaders],
      body: dataRows,
      theme: "grid",
      headStyles: {
        fillColor: COLORS.headerBg,
        textColor: COLORS.dark,
        fontStyle: "bold",
        fontSize: 6.5,
        cellPadding: 1.5,
        halign: "center",
      },
      bodyStyles: { fontSize: 7, cellPadding: 1.5, halign: "center" },
      columnStyles: {
        0: { cellWidth: 36, halign: "left", fontStyle: "bold", fontSize: 7 },
      },
      alternateRowStyles: { fillColor: COLORS.lightBg },
      margin: { left: margin, right: margin },
      styles: { overflow: "linebreak" as const, lineColor: COLORS.border, lineWidth: 0.3 },
      didParseCell: (data: any) => {
        if (data.section === "body" && data.row.index === 7) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fillColor = [235, 242, 250];
        }
      },
    });

    y = (doc as any).lastAutoTable.finalY + 2;
    tableCount++;
  }

  // Create tables for PL trials
  for (let startIdx = 0; startIdx < plTrials.length; startIdx += trialsPerTable) {
    const endIdx = Math.min(startIdx + trialsPerTable, plTrials.length);
    const trialsInThisTable = plTrials.slice(startIdx, endIdx);

    // Check if we need a page break
    if (y > ph - 80) {
      doc.addPage();
      y = 20;
    }

    // Table header
    const colHeaders = [""];
    for (let i = 0; i < trialsInThisTable.length; i++) colHeaders.push(`PL ${startIdx + i + 1}`);

    const dataRows: string[][] = dataLabels.map((label, i) => {
      const row = [label];
      for (const trial of trialsInThisTable) {
        const wet = num(trial.containerWetMass);
        const dry = num(trial.containerDryMass);
        const cont = num(trial.containerMass);
        switch (i) {
          case 0: row.push(trial.containerNo || "-"); break;
          case 1: row.push("-"); break;
          case 2: row.push(fmt(wet)); break;
          case 3: row.push(fmt(dry)); break;
          case 4: row.push(fmt(cont)); break;
          case 5: row.push(wet !== null && dry !== null ? fmt(round2(wet - dry)) : "-"); break;
          case 6: row.push(dry !== null && cont !== null ? fmt(round2(dry - cont)) : "-"); break;
          case 7: {
            const mc = calculateMoistureFromMass(trial.containerWetMass, trial.containerDryMass, trial.containerMass);
            row.push(mc ? String(round2(Number(mc))) : "-");
            break;
          }
        }
      }
      return row;
    });

    autoTable(doc, {
      startY: y,
      head: [colHeaders],
      body: dataRows,
      theme: "grid",
      headStyles: {
        fillColor: COLORS.headerBg,
        textColor: COLORS.dark,
        fontStyle: "bold",
        fontSize: 6.5,
        cellPadding: 1.5,
        halign: "center",
      },
      bodyStyles: { fontSize: 7, cellPadding: 1.5, halign: "center" },
      columnStyles: {
        0: { cellWidth: 36, halign: "left", fontStyle: "bold", fontSize: 7 },
      },
      alternateRowStyles: { fillColor: COLORS.lightBg },
      margin: { left: margin, right: margin },
      styles: { overflow: "linebreak" as const, lineColor: COLORS.border, lineWidth: 0.3 },
      didParseCell: (data: any) => {
        if (data.section === "body" && data.row.index === 7) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fillColor = [235, 242, 250];
        }
      },
    });

    y = (doc as any).lastAutoTable.finalY + 2;
  }

  // ── Plastic Limit result row ──
  doc.setDrawColor(...COLORS.border);
  doc.setFillColor(...COLORS.headerBg);
  doc.rect(margin, y, contentW, 7, "FD");
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLORS.primary);
  doc.text("PLASTIC LIMIT", margin + contentW * 0.55, y + 5);
  doc.setTextColor(...COLORS.dark);
  doc.text(fmt(record.results.plasticLimit), margin + contentW * 0.85, y + 5);
  y += 9;

  // ── Layout: Left side = charts, Right side = LS + Results + Classification ──
  const leftW = contentW * 0.48;
  const rightW = contentW * 0.5;
  const rightX = margin + contentW * 0.5;
  const sectionStartY = y;

  // ── LEFT: Cone Graph ──
  const chartH = 50;
  drawConeGraph(doc, llTrials, record.results.liquidLimit, margin, y, leftW, chartH);

  // ── RIGHT: Linear Shrinkage ──
  let ry = sectionStartY;
  const slTrial = slTrials[0];
  const lsData = [
    ["Initial length (mm)", fmt(slTrial ? num(slTrial.initialLength) ?? 140 : 140)],
    ["Final length (mm)", fmt(slTrial ? num(slTrial.finalLength) : null)],
    ["Shrinkage (%)", fmt(record.results.linearShrinkage)],
  ];

  doc.setFillColor(...COLORS.primary);
  doc.roundedRect(rightX, ry, rightW, 7, 1, 1, "F");
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text("LINEAR SHRINKAGE", rightX + rightW / 2, ry + 5, { align: "center" });
  ry += 8;

  doc.setFontSize(7);
  for (const [label, value] of lsData) {
    doc.setDrawColor(...COLORS.border);
    doc.rect(rightX, ry, rightW * 0.7, 6);
    doc.rect(rightX + rightW * 0.7, ry, rightW * 0.3, 6);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...COLORS.dark);
    doc.text(label, rightX + 2, ry + 4.5);
    doc.setFont("helvetica", "normal");
    doc.text(value, rightX + rightW * 0.7 + 2, ry + 4.5);
    ry += 6;
  }
  ry += 4;

  // ── RIGHT: Results Summary ──
  const summaryData: [string, string][] = [
    ["LIQUID LIMIT (%)", fmt(record.results.liquidLimit)],
    ["PLASTIC LIMIT (%)", fmt(record.results.plasticLimit)],
    ["PLASTICITY INDEX (%)", fmt(record.results.plasticityIndex)],
    ["Passing 425 µm (%)", fmt(num(record.passing425um))],
    ["MODULUS OF PLASTICITY", fmt(record.results.modulusOfPlasticity)],
    ["LINEAR SHRINKAGE (%)", fmt(record.results.linearShrinkage)],
  ];

  doc.setFillColor(...COLORS.primary);
  doc.roundedRect(rightX, ry, rightW, 7, 1, 1, "F");
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text("RESULTS SUMMARY", rightX + rightW / 2, ry + 5, { align: "center" });
  ry += 8;

  doc.setFontSize(7);
  for (const [label, value] of summaryData) {
    doc.setDrawColor(...COLORS.border);
    doc.rect(rightX, ry, rightW * 0.7, 6);
    doc.rect(rightX + rightW * 0.7, ry, rightW * 0.3, 6);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...COLORS.dark);
    doc.text(label, rightX + 2, ry + 4.5);
    doc.setFont("helvetica", "normal");
    doc.text(value, rightX + rightW * 0.7 + 2, ry + 4.5);
    ry += 6;
  }
  ry += 4;

  // ── RIGHT: Soil Classification ──
  const ll = record.results.liquidLimit;
  const pi = record.results.plasticityIndex ?? 0;
  let uscsCode = "";
  let uscsDesc = "";
  if (ll !== undefined && record.results.plasticLimit !== undefined) {
    if (pi < 4) {
      uscsCode = ll < 50 ? "ML" : "MH";
      uscsDesc = ll < 50 ? "SILT OF LOW PLASTICITY" : "SILT OF HIGH PLASTICITY";
    } else if (pi < 7) {
      uscsCode = "CL-ML";
      uscsDesc = "SILTY CLAY OF LOW PLASTICITY";
    } else {
      uscsCode = ll < 50 ? "CL" : "CH";
      uscsDesc = ll < 50 ? "CLAY OF LOW PLASTICITY" : "CLAY OF HIGH PLASTICITY";
    }
  }

  doc.setFillColor(...COLORS.headerBg);
  doc.rect(rightX, ry, rightW, 7, "F");
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLORS.primary);
  doc.text("SOIL CLASSIFICATION", rightX + rightW / 2, ry + 5, { align: "center" });
  ry += 8;

  doc.setFontSize(7);
  // USCS row
  doc.setDrawColor(...COLORS.border);
  doc.rect(rightX, ry, rightW * 0.2, 6);
  doc.rect(rightX + rightW * 0.2, ry, rightW * 0.6, 6);
  doc.rect(rightX + rightW * 0.8, ry, rightW * 0.2, 6);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLORS.primary);
  doc.text("USCS", rightX + 2, ry + 4.5);
  doc.setTextColor(...COLORS.dark);
  doc.setFont("helvetica", "normal");
  doc.text(uscsDesc, rightX + rightW * 0.2 + 2, ry + 4.5);
  doc.setFont("helvetica", "bold");
  doc.text(uscsCode, rightX + rightW * 0.8 + 2, ry + 4.5);
  ry += 6;

  // AASHTO row
  doc.rect(rightX, ry, rightW * 0.2, 6);
  doc.rect(rightX + rightW * 0.2, ry, rightW * 0.8, 6);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLORS.primary);
  doc.text("AASHTO", rightX + 2, ry + 4.5);
  ry += 10;

  // ── Footer: Tested by / Date / Checked by ──
  const footerY = Math.max(ry, sectionStartY + chartH + 10) + 4;
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLORS.dark);
  doc.text(`Tested by: ${record.testedBy || "____________"}`, margin, footerY);
  doc.text(`Date reported: ${projectState.dateReported || "____________"}`, margin + contentW * 0.35, footerY);
  doc.text(`Checked by: ${projectState.checkedBy || "____________"}`, margin + contentW * 0.7, footerY);

  // ── Stamp image at bottom ──
  if (images.stamp) {
    try {
      console.log("Adding stamp image to PDF");
      const stampW = 35;
      const stampH = 35;
      const stampX = pw - margin - stampW;
      const stampY = ph - margin - stampH - 8;
      const base64String = extractBase64FromDataUrl(images.stamp);
      doc.addImage(base64String, "PNG", stampX, stampY, stampW, stampH);
      console.log("Stamp image added successfully");
    } catch (error) {
      console.error("Failed to add stamp image:", error instanceof Error ? error.message : error);
    }
  }
}

export const generateAtterbergPDF = async (
  options: AtterbergPDFOptions
): Promise<Blob | void> => {
  // Fetch images in parallel with PDF setup
  let images = { logo: undefined, contacts: undefined, stamp: undefined };
  try {
    images = await fetchAdminImagesAsBase64();
  } catch (error) {
    console.warn("Failed to fetch admin images for PDF, continuing without them:", error instanceof Error ? error.message : error);
    // Continue with empty images object - images are optional
  }

  const doc = new jsPDF();

  for (let i = 0; i < options.records.length; i++) {
    if (i > 0) doc.addPage();
    drawRecordPage(doc, options.records[i], options, images);
  }

  // Page numbers
  const pageCount = doc.getNumberOfPages();
  const pageHeight = doc.internal.pageSize.getHeight();
  const pw = doc.internal.pageSize.getWidth();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.muted);
    doc.setFont("helvetica", "normal");
    doc.text(`Page ${i} of ${pageCount}`, pw / 2, pageHeight - 6, { align: "center" });
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, pageHeight - 6);
  }

  const fileName = `Atterberg_Limits_${(options.projectName || "export").replace(/\s+/g, "_")}.pdf`;

  if (options.skipDownload) {
    return doc.output("blob");
  }

  doc.save(fileName);
};
