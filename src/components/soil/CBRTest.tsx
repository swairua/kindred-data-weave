import { useState, useMemo, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import TestSection from "@/components/TestSection";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import CalculatedInput from "@/components/CalculatedInput";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Plus, X } from "lucide-react";
import { useProject } from "@/context/ProjectContext";
import { generateTestPDF } from "@/lib/pdfGenerator";
import { generateTestCSV } from "@/lib/csvExporter";
import { generateTestExcel } from "@/lib/genericExcelExporter";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { LineChart, Line, XAxis, YAxis, CartesianGrid } from "recharts";
import { Label } from "@/components/ui/label";
import { useTestReport } from "@/hooks/useTestReport";
import { captureChartAsBase64 } from "@/lib/chartCapture";

const STANDARD_LOAD_2_5 = 13.24;
const STANDARD_LOAD_5_0 = 19.96;

interface Row { penetration: string; load: string }

interface CBRTestProps {
  testKey?: string;
}

const CBRTest = ({ testKey }: CBRTestProps) => {
  const navigate = useNavigate();
  const project = useProject();
  const defaultRows: Row[] = [
    { penetration: "0.5", load: "" },{ penetration: "1.0", load: "" },{ penetration: "1.5", load: "" },{ penetration: "2.0", load: "" },
    { penetration: "2.5", load: "" },{ penetration: "3.0", load: "" },{ penetration: "4.0", load: "" },{ penetration: "5.0", load: "" },
  ];
  const [rows, setRows] = useState<Row[]>(project.currentProjectId ? defaultRows : []);
  const hasProjectSelected = !!project.currentProjectId;

  const getCBR = (pen: string, load: string) => {
    const p = parseFloat(pen); const l = parseFloat(load);
    if (!p || !l) return "";
    if (p === 2.5) return ((l / STANDARD_LOAD_2_5) * 100).toFixed(1);
    if (p === 5.0) return ((l / STANDARD_LOAD_5_0) * 100).toFixed(1);
    return "";
  };

  const update = (i: number, field: keyof Row, val: string) => { const next = [...rows]; next[i] = { ...next[i], [field]: val }; setRows(next); };

  const chartData = useMemo(() =>
    rows
      .filter(r => r.penetration && r.load)
      .map(r => ({ penetration: parseFloat(r.penetration), load: parseFloat(r.load) }))
      .sort((a, b) => a.penetration - b.penetration),
    [rows]
  );

  const cbr25 = getCBR("2.5", rows.find(r => r.penetration === "2.5")?.load || "");
  const cbr50 = getCBR("5.0", rows.find(r => r.penetration === "5.0")?.load || "");
  const filledCBR = rows.filter(r => r.load).length;
  const cbrResults = useMemo(() => [
    { label: "CBR @ 2.5mm", value: cbr25 ? `${cbr25}%` : "" },
    { label: "CBR @ 5.0mm", value: cbr50 ? `${cbr50}%` : "" },
  ], [cbr25, cbr50]);
  useTestReport("cbr", filledCBR, cbrResults);

  const chartConfig = { load: { label: "Load (kN)", color: "hsl(var(--primary))" } };

  const exportPDF = async () => {
    let chartImages = {};
    if (chartData.length >= 2) {
      const chartBase64 = await captureChartAsBase64("cbr-chart");
      if (chartBase64) {
        chartImages = { "Penetration vs Load Curve": chartBase64 };
      }
    }

    generateTestPDF({
      title: "CBR (California Bearing Ratio)", ...project,
      tables: [{ headers: ["Penetration (mm)", "Load (kN)", "CBR (%)"], rows: rows.map(r => [r.penetration, r.load || "—", getCBR(r.penetration, r.load) || "—"]) }],
      chartImages,
    });
  };

  const exportXLSX = async () => {
    let chartImages = {};
    if (chartData.length >= 2) {
      const chartBase64 = await captureChartAsBase64("cbr-chart");
      if (chartBase64) {
        chartImages = { "Penetration vs Load Curve": chartBase64 };
      }
    }

    generateTestExcel({
      data: {
        title: "CBR (California Bearing Ratio)",
        fields: [
          { label: "CBR @ 2.5mm", value: cbr25 ? `${cbr25}%` : "—" },
          { label: "CBR @ 5.0mm", value: cbr50 ? `${cbr50}%` : "—" },
        ],
        tables: [{ headers: ["Penetration (mm)", "Load (kN)", "CBR (%)"], rows: rows.map(r => [r.penetration, r.load || "—", getCBR(r.penetration, r.load) || "—"]) }],
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

  const status = filledCBR === 0 ? "No data" : filledCBR < rows.length ? "In progress" : "Complete";

  return (
    <TestSection title="CBR (California Bearing Ratio)" testKey={testKey} onSave={() => {}} onClear={() => setRows([{ penetration: "", load: "" }])} onExportPDF={exportPDF} onExportXLSX={exportXLSX}>
      <div className="space-y-4">
        {/* Overview metrics card */}
        <Card className="border bg-muted/20 shadow-none">
          <CardContent className="grid gap-2 p-3 sm:p-4 grid-cols-2 sm:grid-cols-2 md:grid-cols-4">
            <OverviewMetric label="Project" value={project.projectName || "Current project"} />
            <OverviewMetric label="CBR @ 2.5mm" value={cbr25 ? `${cbr25}%` : "—"} />
            <OverviewMetric label="CBR @ 5.0mm" value={cbr50 ? `${cbr50}%` : "—"} />
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
                <h3 className="text-sm font-semibold">CBR Test Data</h3>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b"><th className="text-left py-2 px-2 font-medium text-muted-foreground">Penetration (mm)</th><th className="text-left py-2 px-2 font-medium text-muted-foreground">Load (kN)</th><th className="text-left py-2 px-2 font-medium text-muted-foreground">CBR (%)</th><th className="w-10"></th></tr></thead>
                    <tbody>
                      {rows.map((row, i) => (
                        <tr key={i} className="border-b border-border/50">
                          <td className="py-1.5 px-2"><Input value={row.penetration} onChange={(e) => update(i, "penetration", e.target.value)} className="h-8" /></td>
                          <td className="py-1.5 px-2"><Input type="number" value={row.load} onChange={(e) => update(i, "load", e.target.value)} className="h-8" placeholder="0" /></td>
                          <td className="py-1.5 px-2"><CalculatedInput value={getCBR(row.penetration, row.load)} /></td>
                          <td className="py-1.5 px-1"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setRows(rows.filter((_, j) => j !== i))}><X className="h-3.5 w-3.5" /></Button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Button variant="outline" size="sm" className="mt-3" onClick={() => setRows([...rows, { penetration: "", load: "" }])}><Plus className="h-3.5 w-3.5 mr-1" /> Add Row</Button>
              </CardContent>
            </Card>

            {/* Chart section */}
            {chartData.length >= 2 && (
              <Card className="border shadow-sm">
                <CardHeader className="pb-3">
                  <h3 className="text-sm font-semibold">Penetration vs Load Curve</h3>
                </CardHeader>
                <CardContent className="pt-0">
                  <ChartContainer id="cbr-chart" config={chartConfig} className="h-[300px] w-full">
                    <LineChart data={chartData} margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="penetration" type="number" domain={["dataMin", "dataMax"]} label={{ value: "Penetration (mm)", position: "insideBottom", offset: -10, className: "fill-muted-foreground text-xs" }} />
                      <YAxis type="number" domain={[0, "dataMax + 1"]} label={{ value: "Load (kN)", angle: -90, position: "insideLeft", offset: 5, className: "fill-muted-foreground text-xs" }} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Line type="monotone" dataKey="load" name="load" stroke="var(--color-load)" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                    </LineChart>
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

export default CBRTest;
