import { useState, useMemo, useEffect, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import TestSection from "@/components/TestSection";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Loader2, Plus, X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useProject } from "@/context/ProjectContext";
import { useTestData } from "@/context/TestDataContext";
import { calculateProctor, createProctorPayload, emptyProctorRecord, getProctorRecord, type ProctorRecord, type ProctorRow } from "@/lib/proctorRecords";
import { clearProctorResults, loadProctorResult, saveProctorResult } from "@/lib/proctorPersistence";
import { toast } from "sonner";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ReferenceLine } from "recharts";
import { useTestReport } from "@/hooks/useTestReport";
import { generateTestPDF } from "@/lib/pdfGenerator";
import { generateTestCSV } from "@/lib/csvExporter";
import { generateTestExcel } from "@/lib/genericExcelExporter";
import { captureChartAsBase64 } from "@/lib/chartCapture";

interface ProctorTestProps {
  testKey?: string;
}

const ProctorTest = ({ testKey }: ProctorTestProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const project = useProject();
  const testData = useTestData();
  const projectId = project.currentProjectId ?? null;
  const metadata = useMemo(() => testData.recordMetadata.proctor || {}, [testData.recordMetadata.proctor]);
  const metadataKey = JSON.stringify(metadata);
  const [record, setRecord] = useState<ProctorRecord>(() => emptyProctorRecord(metadata));
  const [recordId, setRecordId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(projectId));
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const type = record.type;
  const rows = type === "standard" ? record.standardRows : record.modifiedRows;
  const hasProjectSelected = projectId !== null;

  useEffect(() => {
    if (!projectId) {
      setRecord(emptyProctorRecord(metadata));
      setRecordId(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    let active = true;
    setRecord(emptyProctorRecord(metadata));
    setRecordId(null);
    setIsLoading(true);
    setError(null);
    loadProctorResult(projectId)
      .then((result) => {
        if (!active) return;
        setRecordId(result?.id ?? null);
        setRecord(getProctorRecord(result?.payload_json, metadata));
      })
      .catch((loadError) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "Unable to load this record");
      })
      .finally(() => active && setIsLoading(false));
    return () => { active = false; };
  }, [projectId, metadataKey, metadata]);

  const chartData = useMemo(() =>
    rows
      .map((row) => ({ moisture: Number.parseFloat(row.moisture), dryDensity: Number.parseFloat(row.dryDensity) }))
      .filter((point) => Number.isFinite(point.moisture) && Number.isFinite(point.dryDensity))
      .sort((a, b) => a.moisture - b.moisture),
    [rows],
  );

  const optimum = useMemo(() => calculateProctor(rows), [rows]);
  const summaries = useMemo(() => ({
    standard: calculateProctor(record.standardRows),
    modified: calculateProctor(record.modifiedRows),
  }), [record.standardRows, record.modifiedRows]);
  const chartConfig = { dryDensity: { label: "Dry Density (kg/m³)", color: "hsl(var(--primary))" } };

  const handleStartRecording = useCallback(() => {
    navigate("/record?material=soil&test=proctor");
  }, [navigate]);

  const filledRows = rows.filter((row) => row.moisture.trim() && row.dryDensity.trim()).length;
  const totalFilledRows = record.standardRows.concat(record.modifiedRows).filter((row) => row.moisture.trim() && row.dryDensity.trim()).length;
  const totalRows = record.standardRows.length + record.modifiedRows.length;
  const proctorResults = useMemo(() => [
    { label: "Standard OMC", value: summaries.standard.omc === null ? "" : `${summaries.standard.omc}%` },
    { label: "Standard MDD", value: summaries.standard.mdd === null ? "" : `${summaries.standard.mdd} kg/m³` },
    { label: "Modified OMC", value: summaries.modified.omc === null ? "" : `${summaries.modified.omc}%` },
    { label: "Modified MDD", value: summaries.modified.mdd === null ? "" : `${summaries.modified.mdd} kg/m³` },
  ], [summaries]);
  useTestReport("proctor", totalFilledRows, proctorResults);

  const update = (index: number, field: keyof ProctorRow, value: string) => {
    const fieldName = type === "standard" ? "standardRows" : "modifiedRows";
    setRecord((current) => ({
      ...current,
      [fieldName]: current[fieldName].map((row, rowIndex) => rowIndex === index ? { ...row, [field]: value } : row),
    }));
    setSaveStatus("idle");
  };

  const setRows = (nextRows: ProctorRow[]) => {
    setRecord((current) => ({ ...current, [type === "standard" ? "standardRows" : "modifiedRows"]: nextRows }));
    setSaveStatus("idle");
  };

  const save = async () => {
    if (!projectId) throw new Error("Select a project before saving this record");
    if (isLoading) throw new Error("Wait for this record to finish loading before saving");
    if (error) throw new Error("This record could not be loaded. Reload before saving to prevent duplicates.");
    setSaveStatus("saving");
    setError(null);
    const status = totalFilledRows === 0 ? "not-started" : totalFilledRows < totalRows ? "in-progress" : "completed";
    const payload = createProctorPayload({
      title: project.projectName,
      clientName: project.clientName,
      date: project.projectDate || project.date,
    }, record, summaries.standard, summaries.modified);
    const data = {
      test_key: "proctor",
      name: "Density/Moisture Content Relationship",
      category: "soil",
      status,
      data_points: totalFilledRows,
      key_results_json: proctorResults.filter((result) => result.value),
      payload_json: payload,
    };

    try {
      const savedId = await saveProctorResult(projectId, recordId, data);
      setRecordId(savedId);
      setSaveStatus("saved");
      if (new URLSearchParams(location.search).get("newRecord") === "1") {
        const params = new URLSearchParams(location.search);
        params.delete("newRecord");
        params.delete("fromProject");
        navigate({ pathname: location.pathname, search: params.toString() ? `?${params.toString()}` : "", hash: location.hash }, { replace: true });
      }
    } catch (saveError) {
      setSaveStatus("error");
      setError(saveError instanceof Error ? saveError.message : "Unable to save this record");
      throw saveError;
    }
  };

  const clear = async () => {
    if (!projectId) return;
    await clearProctorResults(projectId);
    setRecord(emptyProctorRecord(metadata));
    setRecordId(null);
    setSaveStatus("idle");
    setError(null);
    toast.success("Proctor record cleared");
  };

  const handleClear = () => {
    void clear().catch((clearError) => {
      const message = clearError instanceof Error ? clearError.message : "Unable to delete this record";
      setError(message);
      toast.error(message);
    });
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
          { label: "Optimum Moisture Content", value: optimum.omc === null ? "—" : `${optimum.omc}%` },
          { label: "Maximum Dry Density", value: optimum.mdd === null ? "—" : `${optimum.mdd} kg/m³` },
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
    <TestSection title="Proctor Test" testKey={testKey} onSave={save} onClear={handleClear} saveStatus={saveStatus} lastSaveError={error} onExportPDF={exportPDF} onExportXLSX={exportXLSX} recordButtonLabel="Start Recording" onRecordClick={handleStartRecording}>
      <div className="space-y-4">
        {error && <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</div>}
        {isLoading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading Proctor record…</div>}
        <Card className="border shadow-none">
          <CardHeader className="pb-2">
            <h3 className="text-sm font-semibold">Sample details</h3>
          </CardHeader>
          <CardContent className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-4">
            <OverviewMetric label="Sample ID" value={record.label} />
            <OverviewMetric label="Sample No." value={record.sampleNumber} />
            <OverviewMetric label="Depth From (m)" value={record.sampleDepthFrom} />
            <OverviewMetric label="Depth To (m)" value={record.sampleDepthTo} />
            <OverviewMetric label="Sampled & Submitted By" value={record.sampledSubmittedBy} />
            <OverviewMetric label="Date Submitted" value={record.dateSubmitted} />
            <OverviewMetric label="Date Tested" value={record.dateTested} />
            <OverviewMetric label="Notes" value={record.sampleNotes} />
          </CardContent>
        </Card>
        {/* Overview metrics card */}
        <Card className="border bg-muted/20 shadow-none">
          <CardContent className="grid gap-2 p-3 sm:p-4 grid-cols-2 sm:grid-cols-2 md:grid-cols-4">
            <OverviewMetric label="Project" value={project.projectName || "Current project"} />
            <OverviewMetric label="Test Type" value={type === "standard" ? "Standard" : "Modified"} />
            <OverviewMetric label="Filled Points" value={`${filledRows}/${rows.length}`} />
            <OverviewMetric label="Status" value={status} className="capitalize" />
          </CardContent>
        </Card>

        {!hasProjectSelected ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-2">No project selected</p>
              <p className="text-xs text-muted-foreground">Select an existing project or create a new one to begin testing</p>
            </div>
          </div>
        ) : isLoading ? null : (
          <div className="space-y-4">
            {/* Settings and data input section */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-3">
                <h3 className="text-sm font-semibold">Test Configuration</h3>
              </CardHeader>
              <CardContent className="pt-0 space-y-4">
                <div className="max-w-full sm:max-w-xs">
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Test Type</Label>
                  <Select value={type} onValueChange={(value) => {
                    setRecord((current) => ({ ...current, type: value === "modified" ? "modified" : "standard" }));
                    setSaveStatus("idle");
                  }}>
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
                      {optimum.omc !== null && (
                        <ReferenceLine x={optimum.omc} stroke="hsl(var(--destructive))" strokeDasharray="5 5" label={{ value: `OMC: ${optimum.omc}%`, position: "top", className: "fill-destructive text-xs" }} />
                      )}
                    </LineChart>
                  </ChartContainer>
                  {optimum.omc !== null && optimum.mdd !== null && (
                    <div className="mt-4 grid gap-2 sm:gap-3 grid-cols-2">
                      <OverviewMetric label="OMC" value={`${optimum.omc}%`} />
                      <OverviewMetric label="Max Dry Density" value={`${optimum.mdd} kg/m³`} />
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
