import { useState, useMemo } from "react";
import TestSection from "@/components/TestSection";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Plus, X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useProject } from "@/context/ProjectContext";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ReferenceLine } from "recharts";
import { useTestReport } from "@/hooks/useTestReport";
import { generateTestPDF } from "@/lib/pdfGenerator";
import { generateTestCSV } from "@/lib/csvExporter";
import { generateTestExcel } from "@/lib/genericExcelExporter";
import { captureChartAsBase64 } from "@/lib/chartCapture";

interface Row { moisture: string; dryDensity: string }

const ProctorTest = () => {
  const project = useProject();
  const [type, setType] = useState("standard");
  const [rows, setRows] = useState<Row[]>([
    { moisture: "", dryDensity: "" },{ moisture: "", dryDensity: "" },{ moisture: "", dryDensity: "" },{ moisture: "", dryDensity: "" },{ moisture: "", dryDensity: "" },
  ]);

  const chartData = useMemo(() =>
    rows
      .filter(r => r.moisture && r.dryDensity)
      .map(r => ({ moisture: parseFloat(r.moisture), dryDensity: parseFloat(r.dryDensity) }))
      .sort((a, b) => a.moisture - b.moisture),
    [rows]
  );

  const optimum = useMemo(() => {
    if (!chartData.length) return null;
    return chartData.reduce((max, pt) => pt.dryDensity > max.dryDensity ? pt : max, chartData[0]);
  }, [chartData]);

  const chartConfig = { dryDensity: { label: "Dry Density (kg/m³)", color: "hsl(var(--primary))" } };

  const filledRows = rows.filter(r => r.moisture && r.dryDensity).length;
  const proctorResults = useMemo(() => [
    { label: "OMC", value: optimum ? `${optimum.moisture}%` : "" },
    { label: "MDD", value: optimum ? `${optimum.dryDensity} kg/m³` : "" },
  ], [optimum]);
  useTestReport("proctor", filledRows, proctorResults);

  const update = (i: number, field: keyof Row, val: string) => {
    const next = [...rows]; next[i] = { ...next[i], [field]: val }; setRows(next);
  };

  const exportPDF = async () => {
    let chartImages = {};
    if (chartData.length >= 2) {
      const chartBase64 = await captureChartAsBase64("proctor-chart");
      if (chartBase64) {
        chartImages = { "Proctor Curve": chartBase64 };
      }
    }

    generateTestPDF({
      title: `Proctor Test (${type === "standard" ? "Standard" : "Modified"})`,
      ...project,
      tables: [{
        headers: ["Point", "Moisture Content (%)", "Dry Density (kg/m³)"],
        rows: rows.map((r, i) => [String(i + 1), r.moisture || "—", r.dryDensity || "—"]),
      }],
      chartImages,
    });
  };

  return (
    <TestSection title="Proctor Test" onSave={() => {}} onClear={() => setRows([{ moisture: "", dryDensity: "" }])} onExportPDF={exportPDF}>
      <div className="mb-4 max-w-xs">
        <Label className="text-xs text-muted-foreground mb-1.5 block">Test Type</Label>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="standard">Standard Proctor</SelectItem>
            <SelectItem value="modified">Modified Proctor</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b"><th className="text-left py-2 px-2 font-medium text-muted-foreground">Point</th><th className="text-left py-2 px-2 font-medium text-muted-foreground">Moisture Content (%)</th><th className="text-left py-2 px-2 font-medium text-muted-foreground">Dry Density (kg/m³)</th><th className="w-10"></th></tr></thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-border/50">
                <td className="py-1.5 px-2 text-muted-foreground font-mono text-xs">{i + 1}</td>
                <td className="py-1.5 px-2"><Input type="number" value={row.moisture} onChange={(e) => update(i, "moisture", e.target.value)} className="h-8" placeholder="0" /></td>
                <td className="py-1.5 px-2"><Input type="number" value={row.dryDensity} onChange={(e) => update(i, "dryDensity", e.target.value)} className="h-8" placeholder="0" /></td>
                <td className="py-1.5 px-1"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setRows(rows.filter((_, j) => j !== i))}><X className="h-3.5 w-3.5" /></Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button variant="outline" size="sm" className="mt-3" onClick={() => setRows([...rows, { moisture: "", dryDensity: "" }])}><Plus className="h-3.5 w-3.5 mr-1" /> Add Point</Button>

      {chartData.length >= 2 && (
        <div className="mt-6">
          <Label className="text-xs text-muted-foreground mb-2 block">Proctor Curve</Label>
          <ChartContainer id="proctor-chart" config={chartConfig} className="h-[300px] w-full">
            <LineChart data={chartData} margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="moisture" type="number" domain={["dataMin - 1", "dataMax + 1"]} label={{ value: "Moisture Content (%)", position: "insideBottom", offset: -10, className: "fill-muted-foreground text-xs" }} />
              <YAxis type="number" domain={["dataMin - 20", "dataMax + 20"]} label={{ value: "Dry Density (kg/m³)", angle: -90, position: "insideLeft", offset: 5, className: "fill-muted-foreground text-xs" }} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line type="monotone" dataKey="dryDensity" name="dryDensity" stroke="var(--color-dryDensity)" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
              {optimum && (
                <ReferenceLine x={optimum.moisture} stroke="hsl(var(--destructive))" strokeDasharray="5 5" label={{ value: `OMC: ${optimum.moisture}%`, position: "top", className: "fill-destructive text-xs" }} />
              )}
            </LineChart>
          </ChartContainer>
          {optimum && (
            <div className="mt-2 flex gap-4 text-sm">
              <span className="text-muted-foreground">Optimum Moisture Content: <strong className="text-foreground">{optimum.moisture}%</strong></span>
              <span className="text-muted-foreground">Max Dry Density: <strong className="text-foreground">{optimum.dryDensity} kg/m³</strong></span>
            </div>
          )}
        </div>
      )}
    </TestSection>
  );
};

export default ProctorTest;
