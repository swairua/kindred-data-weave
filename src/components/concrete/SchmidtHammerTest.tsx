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

interface Row { location: string; r1: string; r2: string; r3: string; r4: string; r5: string }

const SchmidtHammerTest = () => {
  const project = useProject();
  const [rows, setRows] = useState<Row[]>([
    { location: "L1", r1: "", r2: "", r3: "", r4: "", r5: "" },
    { location: "L2", r1: "", r2: "", r3: "", r4: "", r5: "" },
  ]);

  const getAvgRebound = (row: Row) => {
    const vals = [row.r1, row.r2, row.r3, row.r4, row.r5].map(Number).filter(Boolean);
    if (vals.length === 0) return "";
    return (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1);
  };

  // Approximate compressive strength from rebound number (empirical: ~1.2 * R - 13.5 MPa)
  const getEstStrength = (avgR: string) => {
    const r = parseFloat(avgR);
    if (!r) return "";
    return Math.max(0, 1.2 * r - 13.5).toFixed(1);
  };

  const update = (i: number, field: keyof Row, val: string) => {
    const next = [...rows]; next[i] = { ...next[i], [field]: val }; setRows(next);
  };

  const rebounds = rows.map(r => parseFloat(getAvgRebound(r))).filter(Boolean);
  const avgRebound = rebounds.length ? (rebounds.reduce((a, b) => a + b, 0) / rebounds.length).toFixed(1) : "";

  const chartData = useMemo(() =>
    rows.filter(r => getAvgRebound(r)).map(r => ({ name: r.location || "—", rebound: parseFloat(getAvgRebound(r)), strength: parseFloat(getEstStrength(getAvgRebound(r))) })),
    [rows]
  );
  const chartConfig = { rebound: { label: "Avg Rebound", color: "hsl(var(--primary))" }, strength: { label: "Est. Strength (MPa)", color: "hsl(var(--accent-foreground))" } };

  const results = useMemo(() => [
    { label: "Avg Rebound", value: avgRebound || "" },
    { label: "Est. Strength", value: avgRebound ? `${getEstStrength(avgRebound)} MPa` : "" },
  ], [avgRebound]);
  useTestReport("schmidt", rebounds.length, results);

  const tableData = { headers: ["Location", "R1", "R2", "R3", "R4", "R5", "Avg Rebound", "Est. Strength (MPa)"], rows: rows.map(r => { const avg = getAvgRebound(r); return [r.location, r.r1 || "—", r.r2 || "—", r.r3 || "—", r.r4 || "—", r.r5 || "—", avg || "—", avg ? getEstStrength(avg) : "—"]; }) };

  const exportPDF = async () => {
    let chartImages = {};
    if (chartData.length >= 1) {
      const chartBase64 = await captureChartAsBase64("schmidt-chart");
      if (chartBase64) {
        chartImages = { "Rebound & Estimated Strength": chartBase64 };
      }
    }

    generateTestPDF({ title: "Schmidt Hammer Test", ...project, tables: [tableData], chartImages });
  };

  return (
    <TestSection title="Schmidt Hammer (Rebound) Test" onSave={() => {}} onClear={() => setRows([{ location: "L1", r1: "", r2: "", r3: "", r4: "", r5: "" }])} onExportPDF={exportPDF}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b"><th className="text-left py-2 px-2 font-medium text-muted-foreground">Location</th><th className="text-left py-2 px-2 font-medium text-muted-foreground">R1</th><th className="text-left py-2 px-2 font-medium text-muted-foreground">R2</th><th className="text-left py-2 px-2 font-medium text-muted-foreground">R3</th><th className="text-left py-2 px-2 font-medium text-muted-foreground">R4</th><th className="text-left py-2 px-2 font-medium text-muted-foreground">R5</th><th className="text-left py-2 px-2 font-medium text-muted-foreground">Avg R</th><th className="text-left py-2 px-2 font-medium text-muted-foreground">Est. MPa</th><th className="w-10"></th></tr></thead>
          <tbody>
            {rows.map((row, i) => {
              const avg = getAvgRebound(row);
              return (
                <tr key={i} className="border-b border-border/50">
                  <td className="py-1.5 px-2"><Input value={row.location} onChange={(e) => update(i, "location", e.target.value)} className="h-8" /></td>
                  {(["r1","r2","r3","r4","r5"] as const).map(f => (
                    <td key={f} className="py-1.5 px-2"><Input type="number" value={row[f]} onChange={(e) => update(i, f, e.target.value)} className="h-8 w-16" placeholder="0" /></td>
                  ))}
                  <td className="py-1.5 px-2"><CalculatedInput value={avg} /></td>
                  <td className="py-1.5 px-2"><CalculatedInput value={avg ? getEstStrength(avg) : ""} /></td>
                  <td className="py-1.5 px-1"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setRows(rows.filter((_, j) => j !== i))}><X className="h-3.5 w-3.5" /></Button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Button variant="outline" size="sm" className="mt-3" onClick={() => setRows([...rows, { location: `L${rows.length + 1}`, r1: "", r2: "", r3: "", r4: "", r5: "" }])}><Plus className="h-3.5 w-3.5 mr-1" /> Add Row</Button>

      {chartData.length >= 1 && (
        <div className="mt-6">
          <Label className="text-xs text-muted-foreground mb-2 block">Rebound & Estimated Strength</Label>
          <ChartContainer id="schmidt-chart" config={chartConfig} className="h-[300px] w-full">
            <BarChart data={chartData} margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" label={{ value: "Location", position: "insideBottom", offset: -10, className: "fill-muted-foreground text-xs" }} />
              <YAxis label={{ value: "Value", angle: -90, position: "insideLeft", offset: 5, className: "fill-muted-foreground text-xs" }} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="rebound" name="rebound" fill="var(--color-rebound)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="strength" name="strength" fill="var(--color-strength)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </div>
      )}
    </TestSection>
  );
};

export default SchmidtHammerTest;
