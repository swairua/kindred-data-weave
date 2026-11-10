import { useState, useMemo } from "react";
import TestSection from "@/components/TestSection";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Plus, X } from "lucide-react";
import { useProject } from "@/context/ProjectContext";
import { generateTestPDF } from "@/lib/pdfGenerator";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { LineChart, Line, XAxis, YAxis, CartesianGrid } from "recharts";
import { Label } from "@/components/ui/label";
import { useTestReport } from "@/hooks/useTestReport";
import { captureChartAsBase64 } from "@/lib/chartCapture";
import { loadTestResult, saveTestResult } from "@/lib/testResultPersistence";

interface Row { time: string; settlement: string }

interface ConsolidationTestProps {
  testKey?: string;
}

const ConsolidationTest = ({ testKey }: ConsolidationTestProps) => {
  const project = useProject();
  const defaultRows: Row[] = [{ time: "", settlement: "" },{ time: "", settlement: "" },{ time: "", settlement: "" }];
  const [rows, setRows] = useState<Row[]>(project.currentProjectId ? defaultRows : []);
  const projectId = project.currentProjectId ?? null;
  const [recordId, setRecordId] = useState<number | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const update = (i: number, field: keyof Row, val: string) => { const next = [...rows]; next[i] = { ...next[i], [field]: val }; setRows(next); };

  const chartData = useMemo(() =>
    rows
      .filter(r => r.time && r.settlement)
      .map(r => ({ time: parseFloat(r.time), settlement: parseFloat(r.settlement) }))
      .sort((a, b) => a.time - b.time),
    [rows]
  );

  // Consolidation calculations (simplified)
  // Cc = -Δe / Δlog(σ') - requires void ratio vs log pressure data
  // cv = 0.197 * H^2 / t50 (log time) or 0.848 * H^2 / t90 (root time)
  // σ'_p = preconsolidation pressure (Casagrande method)
  // These are simplified calculations - full implementation requires more input parameters
  const maxSettlement = useMemo(() => 
    chartData.length ? Math.max(...chartData.map(d => d.settlement)) : 0, [chartData]);

  // Load saved consolidation data so deep links (resultId + #consolidation) 
  // show recorded data instead of an empty form.
  useEffect(() => {
    if (!projectId) return;
    let active = true;
    loadTestResult(projectId, "consolidation")
      .then((result) => {
        if (!active || !result) return;
        setRecordId(result.id);
        setIsSaved(true);
        setRows(result.payload_json?.rows ?? defaultRows);
        if (result.payload_json?.testedBy) setTestedBy(result.payload_json.testedBy);
        if (result.payload_json?.dateTested) setDateTested(result.payload_json.dateTested);
      })
      .catch((error) => console.error("Failed to load consolidation result", error));
    return () => { active = false; };
  }, [projectId]);

  const save = async () => {
    if (!projectId) throw new Error("Select a project before saving this consolidation test");
    await saveTestResult(projectId, recordId, {
      test_key: "consolidation",
      name: "Consolidation Test",
      category: "soil",
      status: rows.length > 0 ? "completed" : "not-started",
      data_points: rows.length,
      key_results_json: [{ label: "Max Settlement", value: rows.length > 0 ? `${maxSettlement?.toFixed(2) ?? "0"}` : "" }],
      payload_json: { rows, testedBy, dateTested },
    });
    setRecordId(recordId + 1);
    setIsSaved(true);
  };

  const chartConfig = { settlement: { label: "Settlement (mm)", color: "hsl(var(--primary))" } };

  const filledConsol = rows.filter(r => r.time && r.settlement).length;
  const consolResults = useMemo(() => {
    const maxS = maxSettlement > 0 ? `${maxSettlement.toFixed(2)} mm` : "";
    return [{ label: "Max Settlement", value: maxS }];
  }, [maxSettlement]);
  useTestReport("consolidation", filledConsol, consolResults);

  const exportPDF = async () => {
    let chartImages = {};
    if (chartData.length >= 2) {
      const chartBase64 = await captureChartAsBase64("consolidation-chart");
      if (chartBase64) {
        chartImages = { "Time–Settlement Curve": chartBase64 };
      }
    }

    const maxSettlementVal = chartData.length ? Math.max(...chartData.map(d => d.settlement)) : 0;
    const fields = maxSettlementVal > 0 ? [
      { label: "Max Settlement", value: `${maxSettlementVal.toFixed(2)} mm` },
      { label: "Note", value: "Cc, cv, σ'_p require e-log p curve data" },
    ] : [];

    generateTestPDF({ 
      title: "Consolidation Test", 
      standard: "BS 1377-6:1990 / ASTM D2435",
      ...project, 
      fields,
      tables: [{ headers: ["Time (min)", "Settlement (mm)"], rows: rows.map(r => [r.time || "—", r.settlement || "—"]) }], 
      chartImages 
    });
  };

  const status = filledConsol === 0 ? "No data" : filledConsol < rows.length ? "In progress" : "Complete";

  const canExport = !!project.currentProjectId || isSaved;

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

  return (
    <TestSection title="Consolidation" testKey={testKey} onSave={save} onClear={() => setRows([{ time: "", settlement: "" }])} onExportPDF={exportPDF}>
      <div className="space-y-4">
        {/* Overview metrics card */}
        <Card className="border bg-muted/20 shadow-none">
          <CardContent className="grid gap-2 p-3 sm:p-4 grid-cols-2 sm:grid-cols-2 md:grid-cols-4">
            <OverviewMetric label="Project" value={project.projectName || "Current project"} />
            <OverviewMetric label="Max Settlement" value={maxSettlement ? `${maxSettlement.toFixed(2)} mm` : "—"} />
            <OverviewMetric label="Data Points" value={String(filledConsol)} />
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
                <h3 className="text-sm font-semibold">Consolidation Test Data</h3>
              </CardHeader>
              <CardContent className="pt-0">
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
              </CardContent>
            </Card>

            {/* Chart section */}
            {chartData.length >= 2 && (
              <Card className="border shadow-sm">
                <CardHeader className="pb-3">
                  <h3 className="text-sm font-semibold">Time–Settlement Curve</h3>
                </CardHeader>
                <CardContent className="pt-0">
                  <ChartContainer id="consolidation-chart" config={chartConfig} className="h-[300px] w-full">
                    <LineChart data={chartData} margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="time" type="number" domain={["dataMin", "dataMax"]} label={{ value: "Time (min)", position: "insideBottom", offset: -10, className: "fill-muted-foreground text-xs" }} />
                      <YAxis type="number" reversed domain={[0, "dataMax"]} label={{ value: "Settlement (mm)", angle: -90, position: "insideLeft", offset: 5, className: "fill-muted-foreground text-xs" }} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Line type="monotone" dataKey="settlement" name="settlement" stroke="var(--color-settlement)" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
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

export default ConsolidationTest;
