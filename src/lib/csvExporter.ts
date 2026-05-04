interface CSVData {
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
}

const normalizeCSVText = (val: string) =>
  val
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[—–]/g, "-")
    .replace(/°/g, " deg")
    .replace(/φ/g, "phi")
    .replace(/³/g, "3")
    .replace(/µ/g, "u")
    .replace(/[^\x20-\x7E]/g, "");

const escapeCSV = (val: string) => {
  const normalized = normalizeCSVText(val);
  if (normalized.includes(",") || normalized.includes('"') || normalized.includes("\n")) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }
  return normalized;
};

export const generateTestCSV = (data: CSVData) => {
  const lines: string[] = [];

  // Title and metadata section
  lines.push(escapeCSV(data.title));
  lines.push("");

  // Header information - organized as key-value pairs
  const metadata = [
    { key: "Project", value: data.projectName },
    { key: "Client", value: data.clientName },
    { key: "Lab Organization", value: data.labOrganization },
    { key: "Date Tested", value: data.date || new Date().toISOString().split("T")[0] },
    { key: "Date Reported", value: data.dateReported },
    { key: "Checked By", value: data.checkedBy },
  ];

  for (const { key, value } of metadata) {
    if (value) {
      lines.push(`${escapeCSV(key)},${escapeCSV(value)}`);
    }
  }
  lines.push("");

  // Results summary section
  if (data.fields && data.fields.length > 0) {
    lines.push("TEST RESULTS SUMMARY");
    lines.push("");
    for (const field of data.fields) {
      lines.push(`${escapeCSV(field.label)},${escapeCSV(field.value || "-")}`);
    }
    lines.push("");
    lines.push(""); // Extra blank line for separation
  }

  // Detailed measurement data section
  if (data.tables && data.tables.length > 0) {
    lines.push("DETAILED MEASUREMENT DATA");
    lines.push("");

    for (const table of data.tables) {
      if (table.title) {
        lines.push(escapeCSV(table.title));
        lines.push(""); // Blank line before headers
      }

      // Table headers
      lines.push(table.headers.map(escapeCSV).join(","));

      // Table rows
      for (const row of table.rows) {
        lines.push(row.map((cell) => escapeCSV(cell || "-")).join(","));
      }

      // Section separator
      lines.push("");
      lines.push("");
    }
  }

  // Add metadata footer
  lines.push("---");
  lines.push(`Generated: ${new Date().toLocaleString()}`);

  const csvContent = `\uFEFF${lines.join("\r\n")}`;
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${data.title.replace(/\s+/g, "_")}_Report.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
};
