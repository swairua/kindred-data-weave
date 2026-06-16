import { useState, useMemo, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import TestSection from "@/components/TestSection";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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

interface ProctorTestProps {
  testKey?: string;
}

const ProctorTest = ({ testKey }: ProctorTestProps) => {
  const navigate = useNavigate();
  const project = useProject();
  const [type, setType] = useState("standard");
  const defaultRows: Row[] = [
    { moisture: "", dryDensity: "" },{ moisture: "", dryDensity: "" },{ moisture: "", dryDensity: "" },{ moisture: "", dryDensity: "" },{ moisture: "", dryDensity: "" },
  ];
  const [rows, setRows] = useState<Row[]>(project.currentProjectId ? defaultRows : []);
  const hasProjectSelected = !!project.currentProjectId;

  useEffect(() => {
    if (project.currentProjectId) {
      setRows(defaultRows);
    } else {
      setRows([]);
    }
  }, [project.currentProjectId]);

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

  const handleStartRecording = useCallback(() => {
    navigate("/record?material=soil&test=proctor");
  }, [navigate]);

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

  const exportXLSX = async () => {
    let chartImages = {};
    if (chartData.length >= 2) {
      const chartBase64 = await captureChartAsBase64("proctor-chart");
      if (chartBase64) {
        chartImages = { "Proctor Curve": chartBase64 };
      }
    }

    generateTestExcel({
      data: {
        title: `Proctor Test (${type === "standard" ? "Standard" : "Modified"})`,
        fields: [
          { label: "Test Type", value: type === "standard" ? "Standard Proctor" : "Modified Proctor" },
          { label: "Optimum Moisture Content", value: optimum ? `${optimum.moisture}%` : "—" },
          { label: "Maximum Dry Density", value: optimum ? `${optimum.dryDensity} kg/m³` : "—" },
        ],
        tables: [{
          headers: ["Point", "Moisture Content (%)", "Dry Density (kg/m³)"],
          rows: rows.map((r, i) => [String(i + 1), r.moisture || "—", r.dryDensity || "—"]),
        }],
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

  const status = filledRows === 0 ? "No data" : filledRows < rows.length ? "In progress" : "Complete";

  return (
    <TestSection title="Proctor Test" testKey={testKey} onSave={() => {}} onClear={() => setRows([{ moisture: "", dryDensity: "" }])} onExportPDF={exportPDF} onExportXLSX={exportXLSX} recordButtonLabel="Start Recording" onRecordClick={handleStartRecording}>
      <div className="space-y-4">
        {/* Overview metrics card */}
        <Card className="border bg-muted/20 shadow-none">
          <CardContent className="grid gap-2 p-3 sm:p-4 grid-cols-2 sm:grid-cols-2 md:grid-cols-4">
            <OverviewMetric label="Project" value={project.projectName || "Current project"} />
            <OverviewMetric label="Test Type" value={type === "standard" ? "Standard" : "Modified"} />
            <OverviewMetric label="Filled Points" value={`${filledRows}/${rows.length}`} />
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
            {/* Settings and data input section */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-3">
                <h3 className="text-sm font-semibold">Test Configuration</h3>
              </CardHeader>
              <CardContent className="pt-0 space-y-4">
                <div className="max-w-full sm:max-w-xs">
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Test Type</Label>
                  <Select value={type} onValueChange={setType}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="standard">Standard Proctor</SelectItem>
                      <SelectItem value="modified">Modified Proctor</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Data entry section */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-3">
                <h3 className="text-sm font-semibold">Proctor Data</h3>
              </CardHeader>
              <CardContent className="pt-0">
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
              </CardContent>
            </Card>

            {/* Chart and results section */}
            {chartData.length >= 2 && (
              <Card className="border shadow-sm">
                <CardHeader className="pb-3">
                  <h3 className="text-sm font-semibold">Proctor Curve</h3>
                </CardHeader>
                <CardContent className="pt-0">
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
                    <div className="mt-4 grid gap-2 sm:gap-3 grid-cols-2">
                      <OverviewMetric label="OMC" value={`${optimum.moisture}%`} />
                      <OverviewMetric label="Max Dry Density" value={`${optimum.dryDensity} kg/m³`} />
                    </div>
                  )}
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

export default ProctorTest;
