import { useState, useMemo } from "react";
import TestSection from "@/components/TestSection";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import CalculatedInput from "@/components/CalculatedInput";
import { Plus, X } from "lucide-react";
import { useProject } from "@/context/ProjectContext";
import { generateTestPDF } from "@/lib/pdfGenerator";
import { generateTestCSV } from "@/lib/csvExporter";
import { generateTestExcel } from "@/lib/genericExcelExporter";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { Label } from "@/components/ui/label";
import { useTestReport } from "@/hooks/useTestReport";
import { captureChartAsBase64 } from "@/lib/chartCapture";

interface Row { coreId: string; diameter: string; length: string; load: string }

const CoringTest = () => {
  const project = useProject();
  const [rows, setRows] = useState<Row[]>([
    { coreId: "CR1", diameter: "75", length: "", load: "" },
    { coreId: "CR2", diameter: "75", length: "", load: "" },
  ]);

  const getLDRatio = (row: Row) => {
    const d = parseFloat(row.diameter); const l = parseFloat(row.length);
    if (!d || !l) return "";
    return (l / d).toFixed(2);
  };

  const getCoreStrength = (row: Row) => {
    const d = parseFloat(row.diameter); const load = parseFloat(row.load);
    if (!d || !load) return "";
    const area = Math.PI * (d / 2) ** 2;
    return ((load * 1000) / area).toFixed(2);
  };

  // Correction factor for L/D ratio (BS EN 12504-1)
  const getCorrectedStrength = (row: Row) => {
    const strength = parseFloat(getCoreStrength(row));
    const ld = parseFloat(getLDRatio(row));
    if (!strength || !ld) return "";
    let factor = 1.0;
    if (ld < 2.0) factor = 0.87 + 0.065 * ld;
    return (strength * factor).toFixed(2);
  };

  const update = (i: number, field: keyof Row, val: string) => {
    const next = [...rows]; next[i] = { ...next[i], [field]: val }; setRows(next);
  };

  const strengths = rows.map(r => parseFloat(getCorrectedStrength(r))).filter(Boolean);
  const avgStrength = strengths.length ? (strengths.reduce((a, b) => a + b, 0) / strengths.length).toFixed(2) : "";

  const chartData = useMemo(() =>
    rows.filter(r => getCorrectedStrength(r)).map(r => ({ name: r.coreId || "—", strength: parseFloat(getCorrectedStrength(r)) })),
    [rows]
  );
  const chartConfig = { strength: { label: "Corrected Strength (MPa)", color: "hsl(var(--primary))" } };

  const results = useMemo(() => [
    { label: "Avg Corrected Strength", value: avgStrength ? `${avgStrength} MPa` : "" },
    { label: "Cores Tested", value: strengths.length ? String(strengths.length) : "" },
  ], [avgStrength, strengths.length]);
  useTestReport("coring", strengths.length, results);

  const tableData = { headers: ["Core ID", "Diameter (mm)", "Length (mm)", "L/D", "Load (kN)", "Core Strength (MPa)", "Corrected (MPa)"], rows: rows.map(r => [r.coreId, r.diameter, r.length || "—", getLDRatio(r) || "—", r.load || "—", getCoreStrength(r) || "—", getCorrectedStrength(r) || "—"]) };

  const exportPDF = async () => {
    let chartImages = {};
    if (chartData.length >= 1) {
      const chartBase64 = await captureChartAsBase64("coring-chart");
      if (chartBase64) {
        chartImages = { "Corrected Core Strengths": chartBase64 };
      }
    }

    generateTestPDF({ title: "Coring Test", ...project, tables: [tableData], chartImages });
  };

  const exportXLSX = async () => {
    let chartImages = {};
    if (chartData.length >= 1) {
      const chartBase64 = await captureChartAsBase64("coring-chart");
      if (chartBase64) {
        chartImages = { "Corrected Core Strengths": chartBase64 };
      }
    }

    generateTestExcel({
      data: {
        title: "Coring Test",
        fields: [
          { label: "Avg Corrected Strength", value: avgStrength ? `${avgStrength} MPa` : "—" },
          { label: "Cores Tested", value: strengths.length ? String(strengths.length) : "—" },
        ],
        tables: [tableData],
        chartImages,
      },
      projectName: project.projectName,
      clientName: project.clientName,
      date: project.date,
      labOrganization: project.labOrganization,
      dateReported: project.dateReported,
      checkedBy: project.checkedBy,
    });
  };

  return (
    <TestSection title="Coring Test" onSave={() => {}} onClear={() => setRows([{ coreId: "CR1", diameter: "75", length: "", load: "" }])} onExportPDF={exportPDF} onExportXLSX={exportXLSX}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b"><th className="text-left py-2 px-2 font-medium text-muted-foreground">Core ID</th><th className="text-left py-2 px-2 font-medium text-muted-foreground">Dia (mm)</th><th className="text-left py-2 px-2 font-medium text-muted-foreground">Length (mm)</th><th className="text-left py-2 px-2 font-medium text-muted-foreground">L/D</th><th className="text-left py-2 px-2 font-medium text-muted-foreground">Load (kN)</th><th className="text-left py-2 px-2 font-medium text-muted-foreground">Strength</th><th className="text-left py-2 px-2 font-medium text-muted-foreground">Corrected</th><th className="w-10"></th></tr></thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-border/50">
                <td className="py-1.5 px-2"><Input value={row.coreId} onChange={(e) => update(i, "coreId", e.target.value)} className="h-8" /></td>
                <td className="py-1.5 px-2"><Input type="number" value={row.diameter} onChange={(e) => update(i, "diameter", e.target.value)} className="h-8 w-20" /></td>
                <td className="py-1.5 px-2"><Input type="number" value={row.length} onChange={(e) => update(i, "length", e.target.value)} className="h-8 w-20" placeholder="0" /></td>
                <td className="py-1.5 px-2"><CalculatedInput value={getLDRatio(row)} /></td>
                <td className="py-1.5 px-2"><Input type="number" value={row.load} onChange={(e) => update(i, "load", e.target.value)} className="h-8 w-20" placeholder="0" /></td>
                <td className="py-1.5 px-2"><CalculatedInput value={getCoreStrength(row)} /></td>
                <td className="py-1.5 px-2"><CalculatedInput value={getCorrectedStrength(row)} /></td>
                <td className="py-1.5 px-1"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setRows(rows.filter((_, j) => j !== i))}><X className="h-3.5 w-3.5" /></Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button variant="outline" size="sm" className="mt-3" onClick={() => setRows([...rows, { coreId: `CR${rows.length + 1}`, diameter: "75", length: "", load: "" }])}><Plus className="h-3.5 w-3.5 mr-1" /> Add Row</Button>

      {chartData.length >= 1 && (
        <div className="mt-6">
          <Label className="text-xs text-muted-foreground mb-2 block">Corrected Core Strengths</Label>
          <ChartContainer id="coring-chart" config={chartConfig} className="h-[300px] w-full">
            <BarChart data={chartData} margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" label={{ value: "Core ID", position: "insideBottom", offset: -10, className: "fill-muted-foreground text-xs" }} />
              <YAxis domain={[0, "dataMax + 5"]} label={{ value: "Strength (MPa)", angle: -90, position: "insideLeft", offset: 5, className: "fill-muted-foreground text-xs" }} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="strength" name="strength" fill="var(--color-strength)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </div>
      )}
    </TestSection>
  );
};

export default CoringTest;
