import { useState, useMemo } from "react";
import TestSection from "@/components/TestSection";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, X } from "lucide-react";
import { useProject } from "@/context/ProjectContext";
import { generateTestPDF } from "@/lib/pdfGenerator";
import { generateTestCSV } from "@/lib/csvExporter";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { LineChart, Line, XAxis, YAxis, CartesianGrid } from "recharts";
import { Label } from "@/components/ui/label";
import { useTestReport } from "@/hooks/useTestReport";
import { captureChartAsBase64 } from "@/lib/chartCapture";

interface Row { time: string; settlement: string }

interface ConsolidationTestProps {
  testKey?: string;
}

const ConsolidationTest = ({ testKey }: ConsolidationTestProps) => {
  const project = useProject();
  const defaultRows: Row[] = [{ time: "", settlement: "" },{ time: "", settlement: "" },{ time: "", settlement: "" }];
  const [rows, setRows] = useState<Row[]>(project.currentProjectId ? defaultRows : []);
  const hasProjectSelected = !!project.currentProjectId;
  const update = (i: number, field: keyof Row, val: string) => { const next = [...rows]; next[i] = { ...next[i], [field]: val }; setRows(next); };

  const chartData = useMemo(() =>
    rows
      .filter(r => r.time && r.settlement)
      .map(r => ({ time: parseFloat(r.time), settlement: parseFloat(r.settlement) }))
      .sort((a, b) => a.time - b.time),
    [rows]
  );

  const chartConfig = { settlement: { label: "Settlement (mm)", color: "hsl(var(--primary))" } };

  const filledConsol = rows.filter(r => r.time && r.settlement).length;
  const consolResults = useMemo(() => {
    const maxSettlement = chartData.length ? Math.max(...chartData.map(d => d.settlement)) : 0;
    return [{ label: "Max Settlement", value: maxSettlement ? `${maxSettlement.toFixed(2)} mm` : "" }];
  }, [chartData]);
  useTestReport("consolidation", filledConsol, consolResults);

  const exportPDF = async () => {
    let chartImages = {};
    if (chartData.length >= 2) {
      const chartBase64 = await captureChartAsBase64("consolidation-chart");
      if (chartBase64) {
        chartImages = { "Time–Settlement Curve": chartBase64 };
      }
    }

    generateTestPDF({ title: "Consolidation Test", ...project, tables: [{ headers: ["Time (min)", "Settlement (mm)"], rows: rows.map(r => [r.time || "—", r.settlement || "—"]) }], chartImages });
  };

  return (
    <TestSection title="Consolidation" testKey={testKey} onSave={() => {}} onClear={() => setRows([{ time: "", settlement: "" }])} onExportPDF={exportPDF}>
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
              <thead><tr className="border-b"><th className="text-left py-2 px-2 font-medium text-muted-foreground">Time (min)</th><th className="text-left py-2 px-2 font-medium text-muted-foreground">Settlement (mm)</th><th className="w-10"></th></tr></thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} className="border-b border-border/50">
                    <td className="py-1.5 px-2"><Input type="number" value={row.time} onChange={(e) => update(i, "time", e.target.value)} className="h-8" placeholder="0" /></td>
                    <td className="py-1.5 px-2"><Input type="number" value={row.settlement} onChange={(e) => update(i, "settlement", e.target.value)} className="h-8" placeholder="0" /></td>
                    <td className="py-1.5 px-1"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setRows(rows.filter((_, j) => j !== i))}><X className="h-3.5 w-3.5" /></Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => setRows([...rows, { time: "", settlement: "" }])}><Plus className="h-3.5 w-3.5 mr-1" /> Add Row</Button>

          {chartData.length >= 2 && (
            <div className="mt-6">
              <Label className="text-xs text-muted-foreground mb-2 block">Time–Settlement Curve</Label>
              <ChartContainer id="consolidation-chart" config={chartConfig} className="h-[300px] w-full">
                <LineChart data={chartData} margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" type="number" domain={["dataMin", "dataMax"]} label={{ value: "Time (min)", position: "insideBottom", offset: -10, className: "fill-muted-foreground text-xs" }} />
                  <YAxis type="number" reversed domain={[0, "dataMax"]} label={{ value: "Settlement (mm)", angle: -90, position: "insideLeft", offset: 5, className: "fill-muted-foreground text-xs" }} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line type="monotone" dataKey="settlement" name="settlement" stroke="var(--color-settlement)" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ChartContainer>
            </div>
          )}
        </>
      )}
    </TestSection>
  );
};

export default ConsolidationTest;
