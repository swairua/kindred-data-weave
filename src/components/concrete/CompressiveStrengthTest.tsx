import { useState, useMemo } from "react";
import TestSection from "@/components/TestSection";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import CalculatedInput from "@/components/CalculatedInput";
import { Plus, X } from "lucide-react";
import { useProject } from "@/context/ProjectContext";
import { generateTestPDF } from "@/lib/pdfGenerator";
import { generateTestCSV } from "@/lib/csvExporter";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { Label } from "@/components/ui/label";
import { useTestReport } from "@/hooks/useTestReport";
import { captureChartAsBase64 } from "@/lib/chartCapture";

interface Row { cubeId: string; load: string; width: string; height: string }

const CompressiveStrengthTest = () => {
  const project = useProject();
  const defaultRows: Row[] = [
    { cubeId: "C1", load: "", width: "150", height: "150" },
    { cubeId: "C2", load: "", width: "150", height: "150" },
    { cubeId: "C3", load: "", width: "150", height: "150" },
  ];
  const [rows, setRows] = useState<Row[]>(project.currentProjectId ? defaultRows : []);
  const hasProjectSelected = !!project.currentProjectId;

  const getStrength = (row: Row) => {
    const load = parseFloat(row.load); const w = parseFloat(row.width); const h = parseFloat(row.height);
    if (!load || !w || !h) return "";
    return ((load * 1000) / (w * h)).toFixed(2);
  };

  const update = (i: number, field: keyof Row, val: string) => { const next = [...rows]; next[i] = { ...next[i], [field]: val }; setRows(next); };

  const chartData = useMemo(() =>
    rows
      .filter(r => getStrength(r))
      .map(r => ({ name: r.cubeId || "—", strength: parseFloat(getStrength(r)) })),
    [rows]
  );

  const chartConfig = { strength: { label: "Strength (MPa)", color: "hsl(var(--primary))" } };

  const strengths = rows.map(r => parseFloat(getStrength(r))).filter(Boolean);
  const avgStrength = strengths.length ? (strengths.reduce((a, b) => a + b, 0) / strengths.length).toFixed(2) : "";
  const compResults = useMemo(() => [
    { label: "Avg Strength", value: avgStrength ? `${avgStrength} MPa` : "" },
    { label: "Cubes Tested", value: strengths.length ? String(strengths.length) : "" },
  ], [avgStrength, strengths.length]);
  useTestReport("compressive", strengths.length, compResults);

  const exportPDF = async () => {
    let chartImages = {};
    if (chartData.length >= 1) {
      const chartBase64 = await captureChartAsBase64("compressive-chart");
      if (chartBase64) {
        chartImages = { "Cube Compressive Strengths": chartBase64 };
      }
    }

    generateTestPDF({ title: "Compressive Strength (Cube Test)", ...project, tables: [{ headers: ["Cube ID", "Load (kN)", "Width (mm)", "Height (mm)", "Strength (MPa)"], rows: rows.map(r => [r.cubeId, r.load || "—", r.width, r.height, getStrength(r) || "—"]) }], chartImages });
  };

  return (
    <TestSection title="Compressive Strength (Cube Test)" onSave={() => {}} onClear={() => setRows([{ cubeId: "", load: "", width: "150", height: "150" }])} onExportPDF={exportPDF}>
      {!hasProjectSelected && rows.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <p className="text-sm text-muted-foreground mb-2">No project selected</p>
            <p className="text-xs text-muted-foreground">Select an existing project or create a new one to begin testing</p>
          </div>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b"><th className="text-left py-2 px-2 font-medium text-muted-foreground">Cube ID</th><th className="text-left py-2 px-2 font-medium text-muted-foreground">Load (kN)</th><th className="text-left py-2 px-2 font-medium text-muted-foreground">Width (mm)</th><th className="text-left py-2 px-2 font-medium text-muted-foreground">Height (mm)</th><th className="text-left py-2 px-2 font-medium text-muted-foreground">Strength (MPa)</th><th className="w-10"></th></tr></thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} className="border-b border-border/50">
                    <td className="py-1.5 px-2"><Input value={row.cubeId} onChange={(e) => update(i, "cubeId", e.target.value)} className="h-8" /></td>
                    <td className="py-1.5 px-2"><Input type="number" value={row.load} onChange={(e) => update(i, "load", e.target.value)} className="h-8" placeholder="0" /></td>
                    <td className="py-1.5 px-2"><Input type="number" value={row.width} onChange={(e) => update(i, "width", e.target.value)} className="h-8" /></td>
                    <td className="py-1.5 px-2"><Input type="number" value={row.height} onChange={(e) => update(i, "height", e.target.value)} className="h-8" /></td>
                    <td className="py-1.5 px-2"><CalculatedInput value={getStrength(row)} /></td>
                    <td className="py-1.5 px-1"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setRows(rows.filter((_, j) => j !== i))}><X className="h-3.5 w-3.5" /></Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => setRows([...rows, { cubeId: `C${rows.length + 1}`, load: "", width: "150", height: "150" }])}><Plus className="h-3.5 w-3.5 mr-1" /> Add Row</Button>

          {chartData.length >= 1 && (
            <div className="mt-6">
              <Label className="text-xs text-muted-foreground mb-2 block">Cube Compressive Strengths</Label>
              <ChartContainer id="compressive-chart" config={chartConfig} className="h-[300px] w-full">
                <BarChart data={chartData} margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" label={{ value: "Cube ID", position: "insideBottom", offset: -10, className: "fill-muted-foreground text-xs" }} />
                  <YAxis domain={[0, "dataMax + 5"]} label={{ value: "Strength (MPa)", angle: -90, position: "insideLeft", offset: 5, className: "fill-muted-foreground text-xs" }} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="strength" name="strength" fill="var(--color-strength)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </div>
          )}
        </>
      )}
    </TestSection>
  );
};

export default CompressiveStrengthTest;
