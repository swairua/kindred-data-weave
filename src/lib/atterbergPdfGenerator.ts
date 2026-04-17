import { jsPDF } from "jspdf";
import type {
  AtterbergProjectState,
  AtterbergRecord,
  LiquidLimitTrial,
  PlasticLimitTrial,
  ShrinkageLimitTrial,
} from "@/context/TestDataContext";
import { calculateMoistureFromMass, getTrialMoisture, calculateLogLinearRegression } from "./atterbergCalculations";
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
  chartImages?: { [key: string]: string }; // recordId -> base64 image data URL
}

const COLORS = {
  primary: [41, 98, 163] as [number, number, number], // #2962A3
  dark: [30, 30, 30] as [number, number, number],
  muted: [120, 120, 120] as [number, number, number],
  border: [180, 180, 180] as [number, number, number],
  lightBg: [245, 247, 250] as [number, number, number],
  headerBg: [220, 230, 245] as [number, number, number], // #DCE6F5 (light blue from Excel)
  plHighlight: [255, 235, 153] as [number, number, number], // #FFEB99 (light yellow from Excel)
};

const num = (v: string | undefined): number | null => {
  if (!v || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const fmt = (v: number | string | null | undefined): string =>
  v === null || v === undefined ? "-" : typeof v === "number" ? String(round2(v)) : v;

// ── Table drawing helper ──
interface TableConfig {
  doc: jsPDF;
  x: number;
  y: number;
  width: number;
  colWidths: number[]; // Proportional column widths
  rowHeight: number;
  headers: string[];
  rows: string[][];
  isPLSection?: boolean;
  plTrialStartIndex?: number;
  plTrialEndIndex?: number;
  fontSize?: number;
}

function drawTable(config: TableConfig): number {
  const { doc, x, y, width, colWidths, rowHeight, headers, rows, isPLSection = false, plTrialStartIndex = -1, plTrialEndIndex = -1, fontSize = 6.5 } = config;

  let currentY = y;
  const headerBgColor = COLORS.headerBg;
  const plHeaderColor = COLORS.plHighlight;
  const moistureRowColor = COLORS.headerBg; // Light blue tint for moisture row like Excel

  // Normalize column widths to actual pixel widths
  const totalProportional = colWidths.reduce((a, b) => a + b, 0);
  const actualColWidths = colWidths.map((w) => (w / totalProportional) * width);

  // Draw header row
  let currentX = x;
  doc.setDrawColor(...COLORS.border);
  doc.setLineWidth(0.3);
  for (let i = 0; i < headers.length; i++) {
    const colW = actualColWidths[i];

    // Determine header background color
    let headerColor = headerBgColor;
    if (i > 0 && i >= plTrialStartIndex && i <= plTrialEndIndex) {
      headerColor = plHeaderColor;
    }

    doc.setFillColor(...headerColor);
    doc.rect(currentX, currentY, colW, rowHeight, "FD");

    doc.setFontSize(6);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...COLORS.dark);

    const headerText = headers[i];
    doc.text(headerText, currentX + colW / 2, currentY + rowHeight / 2 + 1, {
      align: "center",
      baseline: "middle",
    });
    currentX += colW;
  }
  currentY += rowHeight;

  // Draw data rows
  for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx];
    currentX = x;

    const isMoistureRow = rowIdx === rows.length - 1; // Last row is moisture content

    for (let cellIdx = 0; cellIdx < row.length; cellIdx++) {
      const colW = actualColWidths[cellIdx];
      const cellText = row[cellIdx];

      // Determine cell background color
      let bgColor = [255, 255, 255] as [number, number, number];
      if (isMoistureRow) {
        bgColor = moistureRowColor;
      }
      if (cellIdx > 0 && cellIdx >= plTrialStartIndex && cellIdx <= plTrialEndIndex) {
        bgColor = plHeaderColor;
      }

      doc.setFillColor(...bgColor);
      doc.setDrawColor(...COLORS.border);
      doc.setLineWidth(0.3);
      doc.rect(currentX, currentY, colW, rowHeight, "FD");

      // Draw cell text
      doc.setFontSize(fontSize);
      const isBold = cellIdx === 0 || isMoistureRow;
      doc.setFont("helvetica", isBold ? "bold" : "normal");
      doc.setTextColor(...COLORS.dark);

      const textX = cellIdx === 0 ? currentX + 1 : currentX + colW / 2;
      const align = cellIdx === 0 ? "left" : "center";
      doc.text(cellText, textX, currentY + rowHeight / 2 + 1, {
        align: align as "left" | "center" | "right",
        baseline: "middle",
      });

      currentX += colW;
    }
    currentY += rowHeight;
  }

  return currentY;
}

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
  doc.text("CONE PENETRATION vs MOISTURE CONTENT (Semi-Log, ASTM D4318)", x + w / 2, y + 8, { align: "center" });

  // Axes
  doc.setDrawColor(...COLORS.dark);
  doc.setLineWidth(0.3);
  doc.line(plotX, plotY, plotX, plotY + plotH); // Y axis
  doc.line(plotX, plotY + plotH, plotX + plotW, plotY + plotH); // X axis

  // FIRST: Gather and process data points (calculate first)
  const points: Array<{ pen: number; mc: number }> = [];
  for (const trial of llTrials) {
    const pen = num(trial.penetration);
    const mcStr = getTrialMoisture(trial);
    const mc = mcStr ? Number(mcStr) : null;
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

  // Determine ranges using linear moisture and logarithmic penetration (semi-log plot per ASTM D4318)
  const mcValues = points.map((p) => p.mc);
  const logPenValues = points.map((p) => Math.log10(p.pen));
  const mcMin = Math.min(...mcValues);
  const mcMax = Math.max(...mcValues);
  const logPenMin = Math.min(...logPenValues);
  const logPenMax = Math.max(...logPenValues);

  // Add 10% padding to ranges
  const mcPadding = (mcMax - mcMin) * 0.1;
  const logPenPadding = (logPenMax - logPenMin) * 0.1;
  const mcMinVal = mcMin - mcPadding;
  const mcMaxVal = mcMax + mcPadding;
  const penMinLog = logPenMin - logPenPadding;
  const penMaxLog = logPenMax + logPenPadding;

  // Semi-log scale functions: X axis is log penetration, Y axis is linear moisture
  const scaleX = (pen: number) => plotX + ((Math.log10(pen) - penMinLog) / (penMaxLog - penMinLog)) * plotW;
  const scaleY = (mc: number) => plotY + plotH - ((mc - mcMinVal) / (mcMaxVal - mcMinVal)) * plotH;

  // Grid lines and tick marks
  doc.setFontSize(5.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COLORS.muted);
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.15);

  // X-axis ticks (penetration - logarithmic)
  const penTickValues = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50];
  for (const pen of penTickValues) {
    if (pen >= Math.pow(10, penMinLog) && pen <= Math.pow(10, penMaxLog)) {
      const px = scaleX(pen);
      doc.line(px, plotY, px, plotY + plotH);
      doc.text(String(pen), px, plotY + plotH + 5, { align: "center" });
    }
  }

  // Y-axis ticks (moisture content - linear)
  const mcTickValues = [10, 15, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  for (const mc of mcTickValues) {
    if (mc >= mcMinVal && mc <= mcMaxVal) {
      const py = scaleY(mc);
      doc.line(plotX, py, plotX + plotW, py);
      doc.text(String(mc), plotX - 3, py + 1.5, { align: "right" });
    }
  }

  // 20mm reference line (vertical at penetration = 20mm on log scale)
  doc.setDrawColor(200, 50, 50);
  doc.setLineWidth(0.3);
  doc.setLineDashPattern([2, 2], 0);
  const x20 = scaleX(20);
  doc.line(x20, plotY, x20, plotY + plotH);
  doc.setFontSize(5);
  doc.setTextColor(200, 50, 50);
  doc.text("20mm", x20, plotY - 2, { align: "center" });
  doc.setLineDashPattern([], 0);

  // Sort points by moisture content for line drawing (data processing before rendering)
  const sorted = [...points].sort((a, b) => a.mc - b.mc);

  // Calculate log-linear regression (ASTM D4318 compliant): penetration = m·log₁₀(moisture) + b
  // Transform to { x: moisture, y: penetration } for regression
  const regressionResult = calculateLogLinearRegression(
    points.map(p => ({ x: p.mc, y: p.pen }))
  );

  const slope = regressionResult?.slope ?? 0;
  const intercept = regressionResult?.intercept ?? 0;

  // Draw data line with semi-log scaling (RED for trial data)
  doc.setDrawColor(200, 50, 50);
  doc.setLineWidth(0.5);
  for (let i = 1; i < sorted.length; i++) {
    doc.line(
      scaleX(sorted[i - 1].pen),
      scaleY(sorted[i - 1].mc),
      scaleX(sorted[i].pen),
      scaleY(sorted[i].mc),
    );
  }

  // Draw regression line in BLACK
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.6);
  // Calculate two points on the regression line spanning the plot area
  // Using log-linear equation: moisture = m·log₁₀(penetration) + b
  const penMin = Math.pow(10, penMinLog);
  const penMax = Math.pow(10, penMaxLog);
  const mcStart = slope * Math.log10(penMin) + intercept;
  const mcEnd = slope * Math.log10(penMax) + intercept;

  doc.line(
    scaleX(penMin),
    scaleY(mcStart),
    scaleX(penMax),
    scaleY(mcEnd),
  );

  // Draw data points with semi-log scaling (RED for trial data)
  for (const pt of sorted) {
    const cx = scaleX(pt.pen);
    const cy = scaleY(pt.mc);
    doc.setFillColor(200, 50, 50);
    doc.circle(cx, cy, 1.2, "F");
  }

  // Mark LL at 20mm if available (horizontal line at LL moisture value)
  if (liquidLimit !== undefined && liquidLimit > 0) {
    const llY = scaleY(liquidLimit);
    doc.setDrawColor(200, 50, 50);
    doc.setLineDashPattern([1, 1], 0);
    doc.setLineWidth(0.3);
    doc.line(plotX, llY, plotX + plotW, llY);
    doc.setLineDashPattern([], 0);
    doc.setFontSize(5.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(200, 50, 50);
    doc.text(`LL=${round2(liquidLimit)}%`, plotX + plotW + 1, llY + 1.5, { align: "left" });
  }

  // Axis labels
  doc.setFontSize(6);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLORS.dark);
  doc.text("Penetration (mm) - Log Scale", x + w / 2, y + h - 2, { align: "center" });

  // Rotated Y label
  doc.saveGraphicsState();
  const yLabelX = x + 4;
  const yLabelY = y + h / 2;
  doc.text("Moisture Content (%) - Linear Scale", yLabelX, yLabelY, { angle: 90 });
  doc.restoreGraphicsState();
}

function drawRecordPage(
  doc: jsPDF,
  record: AtterbergRecord,
  options: AtterbergPDFOptions,
  images: AdminImages,
) {
  const { projectName, clientName, projectState, chartImages } = options;
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentW = pw - margin * 2;

  let y = 10;

  // ── Header images: logo (left) + contacts (right) — compact, aligned to page margins ──
  const headerH = 22;
  if (images.logo || images.contacts) {
    const imgW = contentW * 0.32;
    if (images.logo) {
      try {
        console.log("Adding logo image to PDF");
        const base64String = extractBase64FromDataUrl(images.logo);
        doc.addImage(base64String, "PNG", margin, y, imgW, headerH, undefined, "NONE");
        console.log("Logo image added successfully");
      } catch (error) {
        console.error("Failed to add logo image:", error instanceof Error ? error.message : error);
      }
    }
    if (images.contacts) {
      try {
        console.log("Adding contacts image to PDF");
        const base64String = extractBase64FromDataUrl(images.contacts);
        doc.addImage(base64String, "PNG", pw - margin - imgW, y, imgW, headerH, undefined, "NONE");
        console.log("Contacts image added successfully");
      } catch (error) {
        console.error("Failed to add contacts image:", error instanceof Error ? error.message : error);
      }
    }
    y += headerH + 2;
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

  // ── Data table: Combined LL and PL trials into single unified table ──
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

  // Check if we need a page break before the combined table
  if ((llTrials.length > 0 || plTrials.length > 0) && y > ph - 85) {
    doc.addPage();
    y = 20;
  }

  // ── COMBINED ATTERBERG LIMITS TABLE ──
  if (llTrials.length > 0 || plTrials.length > 0) {
    // Add section header
    doc.setFillColor(...COLORS.headerBg);
    doc.rect(margin, y, contentW, 7, "F");
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...COLORS.primary);
    doc.text("ATTERBERG LIMITS TEST", margin + 2, y + 5);
    y += 9;

    // Calculate column widths: label column (12 units) + equal distribution for all trials
    const totalTrials = llTrials.length + plTrials.length;
    const labelW = 12;
    const remainingW = contentW - labelW;
    const perColW = totalTrials > 0 ? remainingW / totalTrials : 0;

    // Build combined headers
    const colHeaders = [""];
    const colWidths = [labelW];

    // Add LL trial headers
    for (let i = 0; i < llTrials.length; i++) {
      const trial = llTrials[i];
      const containerInfo = trial.containerNo ? ` (${trial.containerNo})` : "";
      colHeaders.push(`Trial ${i + 1} (LL)${containerInfo}`);
      colWidths.push(perColW);
    }

    // Add PL trial headers
    for (let i = 0; i < plTrials.length; i++) {
      const trial = plTrials[i];
      const containerInfo = trial.containerNo ? ` (${trial.containerNo})` : "";
      colHeaders.push(`Trial ${i + 1} (PL)${containerInfo}`);
      colWidths.push(perColW);
    }

    // Build combined data rows
    const combinedDataRows: string[][] = dataLabels.map((label, rowIdx) => {
      const row = [label];

      // Add LL trial data
      for (const trial of llTrials) {
        const wet = num(trial.containerWetMass);
        const dry = num(trial.containerDryMass);
        const cont = num(trial.containerMass);
        switch (rowIdx) {
          case 0: row.push(trial.containerNo || "-"); break;
          case 1: row.push(fmt(num(trial.penetration))); break;
          case 2: row.push(fmt(wet)); break;
          case 3: row.push(fmt(dry)); break;
          case 4: row.push(fmt(cont)); break;
          case 5: row.push(wet !== null && dry !== null ? fmt(round2(wet - dry)) : "-"); break;
          case 6: row.push(dry !== null && cont !== null ? fmt(round2(dry - cont)) : "-"); break;
          case 7: {
            const mc = getTrialMoisture(trial);
            row.push(mc ? String(round2(Number(mc))) : "-");
            break;
          }
        }
      }

      // Add PL trial data
      for (const trial of plTrials) {
        const wet = num(trial.containerWetMass);
        const dry = num(trial.containerDryMass);
        const cont = num(trial.containerMass);
        const mc = getTrialMoisture(trial);
        const mcNum = mc ? Number(mc) : null;

        const drySoilMass = dry !== null && cont !== null ? round2(dry - cont) : null;
        let waterMass = wet !== null && dry !== null ? round2(wet - dry) : null;
        let wetCalc = wet;

        if (waterMass === null && drySoilMass !== null && drySoilMass > 0 && mcNum !== null) {
          waterMass = round2((drySoilMass * mcNum) / 100);
        }
        if (wetCalc === null && dry !== null && waterMass !== null) {
          wetCalc = round2(dry + waterMass);
        }

        switch (rowIdx) {
          case 0: row.push(trial.containerNo || "-"); break;
          case 1: row.push("-"); break;
          case 2: row.push(fmt(wetCalc ?? wet)); break;
          case 3: row.push(fmt(dry)); break;
          case 4: row.push(fmt(cont)); break;
          case 5: row.push(waterMass !== null ? fmt(waterMass) : "-"); break;
          case 6: row.push(drySoilMass !== null ? fmt(drySoilMass) : "-"); break;
          case 7: row.push(mcNum !== null ? fmt(round2(mcNum)) : "-"); break;
        }
      }

      return row;
    });

    // Draw the combined table with reduced row height and font size
    y = drawTable({
      doc,
      x: margin,
      y: y,
      width: contentW,
      colWidths,
      rowHeight: 5, // Reduced from 6 to 5
      headers: colHeaders,
      rows: combinedDataRows,
      plTrialStartIndex: llTrials.length > 0 ? llTrials.length + 1 : -1,
      plTrialEndIndex: totalTrials,
      fontSize: 5.5, // Reduced from 6.5 to 5.5
    });

    y += 3;
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

  // Check if we need a page break for the right-side sections (approx 75-85 units total)
  if (sectionStartY + 85 > ph - 15) {
    doc.addPage();
    y = 20;
  }

  const sectionStartY2 = y;

  // ── LEFT: Cone Graph (use captured linear chart image) ──
  const chartH = 110;
  const llChartImageKey = `${record.id}-liquidLimit`;
  const hasChartImage = chartImages && chartImages[llChartImageKey];

  if (hasChartImage) {
    try {
      const base64String = extractBase64FromDataUrl(hasChartImage);
      // Lossless embedding: pass "NONE" compression so jsPDF doesn't recompress the high-res capture
      doc.addImage(base64String, "PNG", margin, y, leftW, chartH, undefined, "NONE");
      console.log("Captured liquid limit chart image added successfully to PDF");
    } catch (error) {
      console.error("Failed to add captured chart image:", error instanceof Error ? error.message : error);
      // No fallback - log error and continue with empty space
      doc.setFontSize(10);
      doc.setTextColor(...COLORS.muted);
      doc.text("Chart image could not be embedded", margin + leftW / 2, y + chartH / 2, { align: "center" });
    }
  } else {
    console.warn("No chart image captured for record", record.id, "- displaying placeholder");
    // Display placeholder message instead of drawing fallback graph
    doc.setFillColor(...COLORS.lightBg);
    doc.rect(margin, y, leftW, chartH, "F");
    doc.setFontSize(10);
    doc.setTextColor(...COLORS.muted);
    doc.text("Chart image not captured", margin + leftW / 2, y + chartH / 2, { align: "center" });
  }

  // ── RIGHT: Linear Shrinkage ──
  let ry = sectionStartY2;
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

  // ── Calculate footer position early (needed for stamp positioning before classification) ──
  const footerY = Math.max(ry, sectionStartY2 + chartH + 10) + 4;

  // ── Stamp image as background (drawn BEFORE classification for proper z-order) ──
  // Positioned as background behind the "Checked by" text and classification table
  if (images.stamp) {
    try {
      console.log("Adding stamp image to PDF as background");
      const stampW = 35; // mm - reduced from 45 for less visual overlap
      const stampH = 35; // mm - reduced from 45 for less visual overlap
      const pageHeight = ph; // A4 page height
      const pageBottomMargin = 5; // 5mm safety margin from bottom

      // Center stamp horizontally within the "Checked by" field
      const checkedByFieldX = margin + contentW * 0.7;
      const checkedByFieldW = contentW * 0.3;
      const stampX = checkedByFieldX + (checkedByFieldW / 2) - (stampW / 2);

      // Position stamp vertically behind/centered with the "Checked by" text
      // Offset so the stamp acts as a background watermark, centered with the text
      let stampY = footerY - stampH / 2 + 2; // Center vertically with text, slight downward adjustment

      // Ensure stamp doesn't overflow the page bottom
      if (stampY + stampH > pageHeight - pageBottomMargin) {
        stampY = pageHeight - pageBottomMargin - stampH;
        console.log("Stamp position adjusted to fit within page bounds", { adjustedStampY: stampY, maxY: pageHeight - pageBottomMargin });
      }

      const base64String = extractBase64FromDataUrl(images.stamp);
      doc.addImage(base64String, "PNG", stampX, stampY, stampW, stampH);
      console.log("Stamp image added successfully as background watermark", { stampW, stampH, stampX, stampY, pageHeight });
    } catch (error) {
      console.error("Failed to add stamp image:", error instanceof Error ? error.message : error);
    }
  }

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
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLORS.dark);
  doc.text(`Tested by: ${record.testedBy || "____________"}`, margin, footerY);
  doc.text(`Date reported: ${projectState.dateReported || "____________"}`, margin + contentW * 0.35, footerY);
  doc.text(`Checked by: ${projectState.checkedBy || "____________"}`, margin + contentW * 0.7, footerY);
}

export const generateAtterbergPDF = async (
  options: AtterbergPDFOptions
): Promise<Blob | void> => {
  // Fetch images in parallel with PDF setup
  let images: Partial<Awaited<ReturnType<typeof fetchAdminImagesAsBase64>>> = {};
  try {
    console.log("[PDF] Fetching admin images for export...");
    images = await fetchAdminImagesAsBase64();
    console.log("[PDF] Admin images fetch result:", {
      hasLogo: !!images.logo,
      hasContacts: !!images.contacts,
      hasStamp: !!images.stamp,
      logoSize: images.logo ? images.logo.length : 0,
      contactsSize: images.contacts ? images.contacts.length : 0,
      stampSize: images.stamp ? images.stamp.length : 0,
    });
  } catch (error) {
    console.warn("[PDF] Failed to fetch admin images for PDF, continuing without them:", error instanceof Error ? error.message : error);
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
