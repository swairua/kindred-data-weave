import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { TestSummary, TestStatus } from "@/context/TestDataContext";

interface ProjectInfo {
  projectName: string;
  clientName: string;
  date: string;
}

const COLORS = {
  primary: [41, 98, 163] as [number, number, number],
  dark: [30, 30, 30] as [number, number, number],
  muted: [120, 120, 120] as [number, number, number],
  success: [34, 139, 34] as [number, number, number],
  warning: [200, 150, 0] as [number, number, number],
  border: [200, 200, 200] as [number, number, number],
  lightBg: [245, 247, 250] as [number, number, number],
};

const statusLabels: Record<TestStatus, string> = {
  "not-started": "Not Started",
  "in-progress": "In Progress",
  "completed": "Completed",
};

const escapeCSV = (value: string) => {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
};

function addHeader(doc: jsPDF, title: string, project: ProjectInfo) {
  const pw = doc.internal.pageSize.getWidth();
  let y = 15;

  // Title bar
  doc.setFillColor(...COLORS.primary);
  doc.rect(0, 0, pw, 35, "F");
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text("Engineering Material Testing", pw / 2, y, { align: "center" });
  y += 8;
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(title, pw / 2, y, { align: "center" });
  y = 42;

  // Project info row
  doc.setTextColor(...COLORS.dark);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  const col1 = 14, col2 = pw / 3 + 5, col3 = (pw / 3) * 2 + 5;
  doc.text("Project:", col1, y);
  doc.text("Client:", col2, y);
  doc.text("Date:", col3, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.text(project.projectName || "—", col1, y);
  doc.text(project.clientName || "—", col2, y);
  doc.text(project.date || new Date().toISOString().split("T")[0], col3, y);
  y += 3;
  doc.setDrawColor(...COLORS.border);
  doc.line(14, y, pw - 14, y);

  return y + 5;
}

function addFooter(doc: jsPDF) {
  const pageCount = doc.getNumberOfPages();
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.muted);
    doc.text(`Page ${i} of ${pageCount}`, pw / 2, ph - 8, { align: "center" });
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, ph - 8);
  }
}

// ──────────── PROJECT SUMMARY REPORT ────────────
export function generateProjectSummaryReport(
  project: ProjectInfo,
  tests: Record<string, TestSummary>
) {
  const doc = new jsPDF();
  const pw = doc.internal.pageSize.getWidth();
  let y = addHeader(doc, "Project Summary Report", project);

  const testList = Object.values(tests);
  const total = testList.length;
  const completed = testList.filter(t => t.status === "completed").length;
  const inProgress = testList.filter(t => t.status === "in-progress").length;
  const notStarted = testList.filter(t => t.status === "not-started").length;

  // Summary stats
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLORS.dark);
  doc.text("Overview", 14, y);
  y += 7;

  // Stats boxes
  const boxW = (pw - 28 - 12) / 4;
  const statsData = [
    { label: "Total", value: total, color: COLORS.primary },
    { label: "Completed", value: completed, color: COLORS.success },
    { label: "In Progress", value: inProgress, color: COLORS.warning },
    { label: "Not Started", value: notStarted, color: COLORS.muted },
  ];
  statsData.forEach((s, i) => {
    const x = 14 + i * (boxW + 4);
    doc.setFillColor(...COLORS.lightBg);
    doc.roundedRect(x, y, boxW, 18, 2, 2, "F");
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...s.color);
    doc.text(String(s.value), x + boxW / 2, y + 10, { align: "center" });
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...COLORS.muted);
    doc.text(s.label, x + boxW / 2, y + 15, { align: "center" });
  });
  y += 25;

  // Progress bar
  const progressPct = total ? Math.round((completed / total) * 100) : 0;
  doc.setFillColor(...COLORS.border);
  doc.roundedRect(14, y, pw - 28, 5, 2, 2, "F");
  if (progressPct > 0) {
    doc.setFillColor(...COLORS.primary);
    doc.roundedRect(14, y, (pw - 28) * progressPct / 100, 5, 2, 2, "F");
  }
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.dark);
  doc.text(`${progressPct}% Complete`, pw / 2, y + 11, { align: "center" });
  y += 17;

  // Category breakdown
  const categories = [
    { key: "soil", label: "Soil Tests" },
    { key: "concrete", label: "Concrete Tests" },
    { key: "rock", label: "Rock Tests" },
    { key: "special", label: "Special Tests" },
  ] as const;

  for (const cat of categories) {
    const catTests = testList.filter(t => t.category === cat.key);
    if (catTests.length === 0) continue;

    if (y > 250) { doc.addPage(); y = 20; }

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...COLORS.primary);
    doc.text(cat.label, 14, y);
    y += 2;

    const tableRows = catTests.map(t => [
      t.name,
      statusLabels[t.status],
      String(t.dataPoints),
      t.keyResults.map(r => `${r.label}: ${r.value}`).join("; ") || "—",
    ]);

    autoTable(doc, {
      startY: y,
      head: [["Test", "Status", "Data Points", "Key Results"]],
      body: tableRows,
      theme: "grid",
      headStyles: { fillColor: COLORS.primary, textColor: 255, fontStyle: "bold", fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 40 },
        1: { cellWidth: 25 },
        2: { cellWidth: 22 },
        3: { cellWidth: "auto" },
      },
      margin: { left: 14, right: 14 },
      styles: { cellPadding: 2.5 },
    });
    y = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 10 : y + 10;
  }

  addFooter(doc);
  doc.save(`Project_Summary_Report.pdf`);
}

// ──────────── DASHBOARD EXPORT ────────────
export function generateDashboardReport(
  project: ProjectInfo,
  tests: Record<string, TestSummary>
) {
  const doc = new jsPDF();
  let y = addHeader(doc, "Dashboard Export", project);

  const testList = Object.values(tests);
  const allRows = testList.map(t => [
    t.name,
    t.category.charAt(0).toUpperCase() + t.category.slice(1),
    statusLabels[t.status],
    String(t.dataPoints),
    t.keyResults.map(r => `${r.label}: ${r.value}`).join("; ") || "—",
  ]);

  autoTable(doc, {
    startY: y,
    head: [["Test Name", "Category", "Status", "Points", "Results"]],
    body: allRows,
    theme: "striped",
    headStyles: { fillColor: COLORS.primary, textColor: 255, fontStyle: "bold", fontSize: 8 },
    bodyStyles: { fontSize: 7.5 },
    columnStyles: {
      0: { cellWidth: 38 },
      1: { cellWidth: 22 },
      2: { cellWidth: 22 },
      3: { cellWidth: 16 },
      4: { cellWidth: "auto" },
    },
    margin: { left: 14, right: 14 },
    styles: { cellPadding: 2 },
  });

  addFooter(doc);
  doc.save(`Dashboard_Export.pdf`);
}

// ──────────── CSV EXPORTS ────────────
export function generateProjectSummaryCSV(
  project: ProjectInfo,
  tests: Record<string, TestSummary>
) {
  const testList = Object.values(tests);
  const lines: string[] = [
    "Engineering Material Testing - Project Summary",
    "",
    `Project,${escapeCSV(project.projectName || "—")}`,
    `Client,${escapeCSV(project.clientName || "—")}`,
    `Date,${escapeCSV(project.date || "—")}`,
    "",
    "Test Name,Category,Status,Data Points,Key Results",
  ];

  for (const t of testList) {
    const results = t.keyResults.map(r => `${r.label}: ${r.value}`).join("; ") || "—";
    lines.push(
      [
        t.name,
        t.category,
        statusLabels[t.status],
        String(t.dataPoints),
        results,
      ].map(escapeCSV).join(",")
    );
  }

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "Project_Summary.csv";
  a.click();
  URL.revokeObjectURL(url);
}
