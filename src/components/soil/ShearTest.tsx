import { useState, useMemo } from "react";
import TestSection from "@/components/TestSection";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Plus, X } from "lucide-react";
import { useProject } from "@/context/ProjectContext";
import { generateTestPDF } from "@/lib/pdfGenerator";
import { generateTestExcel } from "@/lib/genericExcelExporter";
import { generateTestCSV } from "@/lib/csvExporter";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Line } from "recharts";
import { Label } from "@/components/ui/label";
import { useTestReport } from "@/hooks/useTestReport";
import { captureChartAsBase64 } from "@/lib/chartCapture";

interface Row { normalStress: string; shearStress: string }

interface ShearTestProps {
  testKey?: string;
}

const ShearTest = ({ testKey }: ShearTestProps) => {
  const project = useProject();
  const defaultRows: Row[] = [{ normalStress: "", shearStress: "" },{ normalStress: "", shearStress: "" },{ normalStress: "", shearStress: "" }];
  const [rows, setRows] = useState<Row[]>(project.currentProjectId ? defaultRows : []);
  const hasProjectSelected = !!project.currentProjectId;
  const update = (i: number, field: keyof Row, val: string) => { const next = [...rows]; next[i] = { ...next[i], [field]: val }; setRows(next); };

  const chartData = useMemo(() =>
    rows
      .filter(r => r.normalStress && r.shearStress)
      .map(r => ({ normalStress: parseFloat(r.normalStress), shearStress: parseFloat(r.shearStress) }))
      .sort((a, b) => a.normalStress - b.normalStress),
    [rows]
  );

  // Linear regression for failure envelope
  const envelope = useMemo(() => {
    if (chartData.length < 2) return null;
    const n = chartData.length;
    const sumX = chartData.reduce((s, p) => s + p.normalStress, 0);
    const sumY = chartData.reduce((s, p) => s + p.shearStress, 0);
    const sumXY = chartData.reduce((s, p) => s + p.normalStress * p.shearStress, 0);
    const sumX2 = chartData.reduce((s, p) => s + p.normalStress * p.normalStress, 0);
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    const phi = Math.atan(slope) * (180 / Math.PI);
    return { cohesion: intercept, phi, slope, intercept };
  }, [chartData]);

  const envelopeLine = useMemo(() => {
    if (!envelope || chartData.length < 2) return [];
    const minX = Math.min(...chartData.map(d => d.normalStress));
    const maxX = Math.max(...chartData.map(d => d.normalStress));
    return [
      { normalStress: minX, shearStress: envelope.intercept + envelope.slope * minX },
      { normalStress: maxX, shearStress: envelope.intercept + envelope.slope * maxX },
    ];
  }, [envelope, chartData]);

  const chartConfig = {
    shearStress: { label: "Shear Stress (kPa)", color: "hsl(var(--primary))" },
    envelope: { label: "Failure Envelope", color: "hsl(var(--destructive))" },
  };

  const filledShear = chartData.length;
  const shearResults = useMemo(() => [
    { label: "Cohesion (c)", value: envelope ? `${envelope.cohesion.toFixed(1)} kPa` : "" },
    { label: "Friction (φ)", value: envelope ? `${envelope.phi.toFixed(1)}°` : "" },
  ], [envelope]);
  useTestReport("shear", filledShear, shearResults);

  const exportPDF = async () => {
    let chartImages = {};
    if (chartData.length >= 2) {
      const chartBase64 = await captureChartAsBase64("shear-chart");
      if (chartBase64) {
        chartImages = { "Mohr-Coulomb Failure Envelope": chartBase64 };
      }
    }

    generateTestPDF({ title: "Shear Test", ...project, tables: [{ headers: ["Normal Stress (kPa)", "Shear Stress (kPa)"], rows: rows.map(r => [r.normalStress || "—", r.shearStress || "—"]) }], chartImages });
  };

  const exportXLSX = async () => {
    await generateTestExcel({ data: { title: "Shear Test", ...project, tables: [{ headers: ["Normal Stress (kPa)", "Shear Stress (kPa)"], rows: rows.map(r => [r.normalStress || "—", r.shearStress || "—"]) }] } });
  };

  const status = filledShear === 0 ? "No data" : filledShear < rows.length ? "In progress" : "Complete";

  return (
    <TestSection title="Shear Test" testKey={testKey} onSave={() => {}} onClear={() => setRows([{ normalStress: "", shearStress: "" }])} onExportPDF={exportPDF} onExportXLSX={exportXLSX}>
      <div className="space-y-4">
        {/* Overview metrics card */}
        <Card className="border bg-muted/20 shadow-none">
          <CardContent className="grid gap-2 p-3 sm:p-4 grid-cols-2 sm:grid-cols-2 md:grid-cols-4">
            <OverviewMetric label="Project" value={project.projectName || "Current project"} />
            <OverviewMetric label="Cohesion (c)" value={envelope ? `${envelope.cohesion.toFixed(1)} kPa` : "—"} />
            <OverviewMetric label="Friction (φ)" value={envelope ? `${envelope.phi.toFixed(1)}°` : "—"} />
            <OverviewMetric label="Status" value={status} className="capitalize" />
          </CardContent>
        </Card>

        {!hasProjectSelected && rows.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-2">No project selected</p>
              <p className="text-xs text-muted-foreground">Select an existing project or create a new one to begin testing</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Data input section */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-3">
                <h3 className="text-sm font-semibold">Shear Test Data</h3>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b"><th className="text-left py-2 px-2 font-medium text-muted-foreground">Normal Stress (kPa)</th><th className="text-left py-2 px-2 font-medium text-muted-foreground">Shear Stress (kPa)</th><th className="w-10"></th></tr></thead>
                    <tbody>
                      {rows.map((row, i) => (
                        <tr key={i} className="border-b border-border/50">
                          <td className="py-1.5 px-2"><Input type="number" value={row.normalStress} onChange={(e) => update(i, "normalStress", e.target.value)} className="h-8" placeholder="0" /></td>
                          <td className="py-1.5 px-2"><Input type="number" value={row.shearStress} onChange={(e) => update(i, "shearStress", e.target.value)} className="h-8" placeholder="0" /></td>
                          <td className="py-1.5 px-1"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setRows(rows.filter((_, j) => j !== i))}><X className="h-3.5 w-3.5" /></Button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Button variant="outline" size="sm" className="mt-3" onClick={() => setRows([...rows, { normalStress: "", shearStress: "" }])}><Plus className="h-3.5 w-3.5 mr-1" /> Add Row</Button>
              </CardContent>
            </Card>

            {/* Chart section */}
            {chartData.length >= 2 && (
              <Card className="border shadow-sm">
                <CardHeader className="pb-3">
                  <h3 className="text-sm font-semibold">Mohr-Coulomb Failure Envelope</h3>
                </CardHeader>
                <CardContent className="pt-0">
                  <ChartContainer id="shear-chart" config={chartConfig} className="h-[300px] w-full">
                    <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="normalStress" type="number" name="Normal Stress" domain={[0, "dataMax + 20"]} label={{ value: "Normal Stress (kPa)", position: "insideBottom", offset: -10, className: "fill-muted-foreground text-xs" }} />
                      <YAxis dataKey="shearStress" type="number" name="Shear Stress" domain={[0, "dataMax + 20"]} label={{ value: "Shear Stress (kPa)", angle: -90, position: "insideLeft", offset: 5, className: "fill-muted-foreground text-xs" }} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Scatter data={chartData} fill="var(--color-shearStress)" name="shearStress" />
                      {envelopeLine.length === 2 && (
                        <Scatter data={envelopeLine} fill="none" line={{ stroke: "hsl(var(--destructive))", strokeWidth: 2, strokeDasharray: "5 5" }} legendType="none" name="envelope" />
                      )}
                    </ScatterChart>
                  </ChartContainer>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </TestSection>
  );
};

interface OverviewMetricProps {
  label: string;
  value: string;
  className?: string;
}

const OverviewMetric = ({ label, value, className }: OverviewMetricProps) => (
  <div className="rounded-lg border bg-card px-2 sm:px-3 py-1.5 sm:py-2">
    <div className="text-xs font-medium text-muted-foreground truncate">{label}</div>
    <div className={`mt-0.5 sm:mt-1 text-xs sm:text-sm font-semibold text-foreground truncate ${className || ""}`}>{value || "—"}</div>
  </div>
);

export default ShearTest;
