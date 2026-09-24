import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Check, ChevronDown, Download, FileDown, FileText, Loader2, Save, Sheet, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts";
import { useProject } from "@/context/ProjectContext";
import { useTestData } from "@/context/TestDataContext";
import {
  calculateProctor,
  calculateProctorPoint,
  createProctorPayload,
  emptyProctorRecord,
  getProctorRecord,
  type ProctorMethod,
  type ProctorRecord,
  type ProctorRow,
} from "@/lib/proctorRecords";
import { clearProctorResults, loadProctorResult, saveProctorResult } from "@/lib/proctorPersistence";
import { toast } from "sonner";
import { useTestReport } from "@/hooks/useTestReport";
import { generateTestPDF } from "@/lib/pdfGenerator";
import { generateTestCSV } from "@/lib/csvExporter";
import { generateTestExcel } from "@/lib/genericExcelExporter";
import { captureChartAsBase64 } from "@/lib/chartCapture";

interface ProctorTestProps {
  testKey?: string;
}

type ProctorInputField = Exclude<keyof ProctorRow, "legacy">;

const POINT_LABELS = ["A", "B", "C", "D", "E", "F"];
const methodLabel = (method: ProctorMethod) => method === "standard" ? "Standard" : "Modified";
const displayValue = (value: number | null) => value === null ? "—" : value.toFixed(2);
const hasValue = (value: string) => value.trim() !== "";

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
  const [isDeleting, setIsDeleting] = useState(false);
  const type = record.type;
  const rows = type === "standard" ? record.standardRows : record.modifiedRows;
  const mouldVolume = type === "standard" ? record.standardMouldVolume : record.modifiedMouldVolume;
  const setRowsKey = type === "standard" ? "standardRows" : "modifiedRows";
  const setVolumeKey = type === "standard" ? "standardMouldVolume" : "modifiedMouldVolume";

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

  const pointCalculations = useMemo(() => rows.map((row) => calculateProctorPoint(row, mouldVolume)), [rows, mouldVolume]);
  const chartData = useMemo(() => pointCalculations
    .map((point) => ({ moisture: point.moistureContent, dryDensity: point.dryDensity }))
    .filter((point): point is { moisture: number; dryDensity: number } => point.moisture !== null && point.dryDensity !== null)
    .sort((a, b) => a.moisture - b.moisture), [pointCalculations]);
  const optimum = useMemo(() => calculateProctor(rows, mouldVolume), [rows, mouldVolume]);
  const summaries = useMemo(() => ({
    standard: calculateProctor(record.standardRows, record.standardMouldVolume),
    modified: calculateProctor(record.modifiedRows, record.modifiedMouldVolume),
  }), [record.standardRows, record.standardMouldVolume, record.modifiedRows, record.modifiedMouldVolume]);
  const resultFields = useMemo(() => [
    { label: "Standard OMC", value: summaries.standard.omc === null ? "" : `${displayValue(summaries.standard.omc)}%` },
    { label: "Standard MDD", value: summaries.standard.mdd === null ? "" : `${displayValue(summaries.standard.mdd)} kg/m³` },
    { label: "Modified OMC", value: summaries.modified.omc === null ? "" : `${displayValue(summaries.modified.omc)}%` },
    { label: "Modified MDD", value: summaries.modified.mdd === null ? "" : `${displayValue(summaries.modified.mdd)} kg/m³` },
  ], [summaries]);
  const completedRows = [
    ...record.standardRows.map((row) => calculateProctorPoint(row, record.standardMouldVolume)),
    ...record.modifiedRows.map((row) => calculateProctorPoint(row, record.modifiedMouldVolume)),
  ].filter((point) => point.moistureContent !== null && point.dryDensity !== null).length;
  const startedRows = record.standardRows.concat(record.modifiedRows).filter((row) => {
    const { legacy, ...inputs } = row;
    return Object.values(inputs).some(hasValue) || (legacy !== undefined && Object.values(legacy).some(hasValue));
  }).length;
  const totalRows = record.standardRows.length + record.modifiedRows.length;
  const filledRows = pointCalculations.filter((point) => point.moistureContent !== null && point.dryDensity !== null).length;
  const status = startedRows === 0 ? "No data" : completedRows < totalRows ? "In progress" : "Complete";
  useTestReport("proctor", completedRows, resultFields, undefined, startedRows);

  const updateRow = (index: number, field: ProctorInputField, value: string) => {
    setRecord((current) => ({
      ...current,
      [setRowsKey]: current[setRowsKey].map((row, rowIndex) => rowIndex === index ? { ...row, [field]: value } : row),
    }));
    setSaveStatus("idle");
  };

  const updateMouldVolume = (value: string) => {
    setRecord((current) => ({ ...current, [setVolumeKey]: value }));
    setSaveStatus("idle");
  };

  const updateMethod = (value: string) => {
    setRecord((current) => ({ ...current, type: value === "modified" ? "modified" : "standard" }));
    setSaveStatus("idle");
  };

  const save = async () => {
    if (!projectId) throw new Error("Select a project before saving this record");
    if (isLoading) throw new Error("Wait for this record to finish loading before saving");
    if (error) throw new Error("This record could not be loaded. Reload before saving to prevent duplicates.");
    setSaveStatus("saving");
    setError(null);
    const recordStatus = completedRows === 0 ? (startedRows === 0 ? "not-started" : "in-progress") : completedRows < totalRows ? "in-progress" : "completed";
    const payload = createProctorPayload({
      title: project.projectName,
      clientName: project.clientName,
      date: project.projectDate || project.date,
    }, record, summaries.standard, summaries.modified);
    const data = {
      test_key: "proctor",
      name: "Density/Moisture Content Relationship",
      category: "soil",
      status: recordStatus,
      data_points: completedRows,
      key_results_json: resultFields.filter((result) => result.value),
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
      toast.success("Density/Moisture Content Relationship saved");
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
    setIsDeleting(false);
    toast.success("Proctor record deleted");
  };

  const handleSave = () => {
    void save().catch((saveError) => toast.error(saveError instanceof Error ? saveError.message : "Unable to save this record"));
  };

  const handleDelete = () => {
    void clear().catch((clearError) => {
      const message = clearError instanceof Error ? clearError.message : "Unable to delete this record";
      setError(message);
      setIsDeleting(false);
      toast.error(message);
    });
  };

  const exportTables = () => {
    const calculated = rows.map((row) => calculateProctorPoint(row, mouldVolume));
    const headers = ["Measurement", ...POINT_LABELS.slice(0, rows.length)];
    const values = (getValue: (row: ProctorRow, index: number) => string) => rows.map(getValue);
    return [{
      title: `${methodLabel(type)} Proctor measurements`,
      headers,
      rows: [
        ["BULK DENSITY", ...values(() => "")],
        ["Moisture addition (cc)", ...values((row) => row.moistureAdded || "—")],
        ["Wt of mould + wet material (g)", ...values((row) => row.mouldWetMass || "—")],
        ["Wt of mould (g)", ...values((row) => row.mouldTare || "—")],
        ["Wt of wet material (g)", ...values((_, index) => displayValue(calculated[index]?.wetMaterialMass ?? null))],
        ["Bulk density (kg/m³)", ...values((_, index) => displayValue(calculated[index]?.bulkDensity ?? null))],
        ["MOISTURE CONTENT & DRY DENSITY", ...values(() => "")],
        ["Container No.", ...values((row) => row.containerNumber || "—")],
        ["Wt of container + wet material (g)", ...values((row) => row.containerWetMass || "—")],
        ["Wt of container + dry material (g)", ...values((row) => row.containerDryMass || "—")],
        ["Wt of moisture (g)", ...values((_, index) => displayValue(calculated[index]?.waterMass ?? null))],
        ["Wt of container (g)", ...values((row) => row.containerTare || "—")],
        ["Wt of dry soil (g)", ...values((_, index) => displayValue(calculated[index]?.drySoilMass ?? null))],
        ["Moisture content (%)", ...values((_, index) => displayValue(calculated[index]?.moistureContent ?? null))],
        ["Dry density (kg/m³)", ...values((_, index) => displayValue(calculated[index]?.dryDensity ?? null))],
      ],
    }];
  };

  const captureChart = async () => {
    if (chartData.length < 2) return {};
    const chart = await captureChartAsBase64("proctor-chart");
    return chart ? { "Proctor Curve": chart } : {};
  };

  const exportPDF = async () => {
    generateTestPDF({
      title: `Density/Moisture Content Relationship (${methodLabel(type)})`,
      projectName: project.projectName,
      clientName: project.clientName,
      date: project.projectDate || project.date,
      labOrganization: project.labOrganization,
      dateReported: project.dateReported,
      checkedBy: project.checkedBy,
      fields: [
        { label: "Optimum Moisture Content", value: optimum.omc === null ? "—" : `${displayValue(optimum.omc)}%` },
        { label: "Maximum Dry Density", value: optimum.mdd === null ? "—" : `${displayValue(optimum.mdd)} kg/m³` },
        { label: "Bulk Density at MDD", value: optimum.bulkDensity === null ? "—" : `${displayValue(optimum.bulkDensity)} kg/m³` },
      ],
      tables: exportTables(),
      chartImages: await captureChart(),
    });
  };

  const exportCSV = async () => {
    generateTestCSV({
      title: `Density/Moisture Content Relationship (${methodLabel(type)})`,
      projectName: project.projectName,
      clientName: project.clientName,
      date: project.projectDate || project.date,
      labOrganization: project.labOrganization,
      dateReported: project.dateReported,
      checkedBy: project.checkedBy,
      fields: [
        { label: "Optimum Moisture Content", value: optimum.omc === null ? "—" : `${displayValue(optimum.omc)}%` },
        { label: "Maximum Dry Density", value: optimum.mdd === null ? "—" : `${displayValue(optimum.mdd)} kg/m³` },
        { label: "Bulk Density at MDD", value: optimum.bulkDensity === null ? "—" : `${displayValue(optimum.bulkDensity)} kg/m³` },
      ],
      tables: exportTables(),
    });
  };

  const exportXLSX = async () => {
    generateTestExcel({
      data: {
        title: `Density/Moisture Content Relationship (${methodLabel(type)})`,
        fields: [
          { label: "Test Type", value: `${methodLabel(type)} Proctor` },
          { label: "Optimum Moisture Content", value: optimum.omc === null ? "—" : `${displayValue(optimum.omc)}%` },
          { label: "Maximum Dry Density", value: optimum.mdd === null ? "—" : `${displayValue(optimum.mdd)} kg/m³` },
          { label: "Bulk Density at MDD", value: optimum.bulkDensity === null ? "—" : `${displayValue(optimum.bulkDensity)} kg/m³` },
        ],
        tables: exportTables(),
        chartImages: await captureChart(),
      },
      projectName: project.projectName,
      clientName: project.clientName,
      date: project.projectDate || project.date,
      labOrganization: project.labOrganization,
      dateReported: project.dateReported,
      checkedBy: project.checkedBy,
    });
  };

  if (isLoading) {
    return <div className="flex min-h-[360px] items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading Proctor record...</div>;
  }

  if (!projectId) {
    return <div className="rounded-xl border bg-card p-10 text-center"><p className="font-medium">No project selected</p><p className="mt-1 text-sm text-muted-foreground">Start a Proctor record from the test wizard.</p></div>;
  }

  return (
    <div className="proctor-record space-y-3 pb-20" data-test-key={testKey || "proctor"}>
      {error && <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</div>}

      <section className="record-card record-identity">
        <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
          <div className="min-w-0"><h1 className="text-sm font-semibold">{project.projectName || "Record test"}</h1><p className="text-[11px] text-muted-foreground">{project.labOrganization || project.clientName || "Geotechnical Laboratory"}</p></div>
          <Button variant="outline" size="sm" className="h-7 shrink-0 text-[11px]" onClick={() => navigate(`/record?material=soil&test=proctor&projectId=${projectId}`)}>Change <ChevronDown className="ml-1 h-3 w-3" /></Button>
        </div>
        <div className="flex flex-wrap gap-x-2 gap-y-1 px-4 py-2 text-[10px] text-muted-foreground">
          <span>Material: <strong className="text-foreground">Soil</strong></span><span>·</span>
          <span>Test type: <strong className="text-foreground">Density/Moisture Content Relationship</strong></span><span>·</span>
          <span>Sample ID: <strong className="text-foreground">{record.label || "—"}</strong></span><span>·</span>
          <span>Sample No.: <strong className="text-foreground">{record.sampleNumber || "—"}</strong></span><span>·</span>
          <span>Sample Depth From (m): <strong className="text-foreground">{record.sampleDepthFrom || "—"}</strong></span><span>·</span>
          <span>Sample Depth To (m): <strong className="text-foreground">{record.sampleDepthTo || "—"}</strong></span>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div><h2 className="text-sm font-semibold">Record results — BS 1377 Part 4, 3.3</h2><p className="text-[11px] text-muted-foreground">Enter readings for each moisture content point.</p></div>
        <Tabs value={type} onValueChange={updateMethod}>
          <TabsList className="h-8">
            <TabsTrigger value="standard" className="h-6 px-3 text-xs">Standard</TabsTrigger>
            <TabsTrigger value="modified" className="h-6 px-3 text-xs">Modified</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <section className="record-card overflow-hidden">
        <div className="flex flex-col gap-2 border-b px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{methodLabel(type)} Proctor readings</div>
          <label className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <span>Mould volume (cm³)</span>
            <Input aria-label={`${methodLabel(type)} mould volume`} type="number" min="0" step="any" value={mouldVolume} onChange={(event) => updateMouldVolume(event.target.value)} className="record-input h-7 w-28" placeholder="e.g. 1000" />
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="record-table min-w-[900px] table-fixed">
            <thead><tr><th className="w-[190px]" aria-label="Measurement"></th>{rows.map((_, index) => <th key={index} className="text-center">{POINT_LABELS[index] || String(index + 1)}</th>)}</tr></thead>
            <tbody>
              <tr className="bg-muted/60"><td colSpan={rows.length + 1} className="py-1.5 font-semibold uppercase tracking-wide text-muted-foreground">Bulk density</td></tr>
              <ProctorInputRow label="Moisture addition (cc)" rows={rows} field="moistureAdded" onChange={updateRow} />
              <ProctorInputRow label="Wt of mould + wet material (g)" rows={rows} field="mouldWetMass" onChange={updateRow} />
              <ProctorInputRow label="Wt of mould (g)" rows={rows} field="mouldTare" onChange={updateRow} />
              <CalculatedRow label="Wt of wet material (g)" values={pointCalculations.map((point) => point.wetMaterialMass)} />
              <CalculatedRow label="Bulk density (kg/m³)" values={pointCalculations.map((point) => point.bulkDensity)} />
              <tr className="bg-muted/60"><td colSpan={rows.length + 1} className="py-1.5 font-semibold uppercase tracking-wide text-muted-foreground">Moisture content &amp; dry density</td></tr>
              <ProctorInputRow label="Container No." rows={rows} field="containerNumber" onChange={updateRow} textInput />
              <ProctorInputRow label="Wt of container + wet material (g)" rows={rows} field="containerWetMass" onChange={updateRow} />
              <ProctorInputRow label="Wt of container + dry material (g)" rows={rows} field="containerDryMass" onChange={updateRow} />
              <CalculatedRow label="Wt of moisture (g)" values={pointCalculations.map((point) => point.waterMass)} />
              <ProctorInputRow label="Wt of container (g)" rows={rows} field="containerTare" onChange={updateRow} />
              <CalculatedRow label="Wt of dry soil (g)" values={pointCalculations.map((point) => point.drySoilMass)} />
              <CalculatedRow label="Moisture content (%)" values={pointCalculations.map((point) => point.moistureContent)} />
              <CalculatedRow label="Dry density (kg/m³)" values={pointCalculations.map((point) => point.dryDensity)} />
            </tbody>
          </table>
        </div>
      </section>

      <section className="record-card p-3">
        <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Proctor curve — {methodLabel(type)}</h3>
        <ChartContainer id="proctor-chart" config={{ dryDensity: { label: "Dry Density (kg/m³)", color: "hsl(var(--primary))" } }} className="h-[280px] w-full">
          <LineChart data={chartData} margin={{ top: 12, right: 18, bottom: 28, left: 16 }}>
            <CartesianGrid strokeDasharray="2 2" />
            <XAxis dataKey="moisture" type="number" domain={chartData.length ? ["dataMin - 2", "dataMax + 2"] : [8, 22]} label={{ value: "Moisture Content (%)", position: "insideBottom", offset: -18, className: "fill-muted-foreground text-[10px]" }} />
            <YAxis type="number" domain={chartData.length ? ["dataMin - 100", "dataMax + 100"] : [1500, 1800]} label={{ value: "Dry Density (kg/m³)", angle: -90, position: "insideLeft", offset: 0, className: "fill-muted-foreground text-[10px]" }} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Line type="monotone" dataKey="dryDensity" name="dryDensity" stroke="var(--color-dryDensity)" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
            {optimum.omc !== null && <ReferenceLine x={optimum.omc} stroke="hsl(var(--destructive))" strokeDasharray="5 5" label={{ value: `OMC: ${displayValue(optimum.omc)}%`, position: "top", className: "fill-destructive text-[10px]" }} />}
          </LineChart>
        </ChartContainer>
        <div className="mt-3 grid gap-px overflow-hidden rounded-md border sm:grid-cols-3">
          <ResultField label="Maximum Dry Density (kg/m³)" value={displayValue(optimum.mdd)} />
          <ResultField label="Bulk Density (kg/m³)" value={displayValue(optimum.bulkDensity)} />
          <ResultField label="Optimum Moisture Content (%)" value={displayValue(optimum.omc)} />
        </div>
      </section>

      <section className="record-card flex flex-col gap-2 px-3 py-2 text-[10px] sm:flex-row sm:items-center sm:justify-between">
        <div><span className="text-muted-foreground">TESTED BY</span><div className="font-semibold uppercase">{record.sampledSubmittedBy || "—"}</div></div>
        <div className="sm:text-right"><span className="text-muted-foreground">STATUS</span><div className="font-semibold">{status} · {filledRows}/{rows.length} {type} points</div></div>
      </section>

      <div className="sticky bottom-0 z-20 -mx-3 flex items-center justify-between gap-2 border-t bg-background/95 px-3 py-2 backdrop-blur print:hidden">
        <AlertDialog open={isDeleting} onOpenChange={setIsDeleting}>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" className="border-destructive/30 text-destructive hover:bg-destructive/10"><Trash2 className="mr-1.5 h-3.5 w-3.5" />Delete</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this Proctor record?</AlertDialogTitle>
              <AlertDialogDescription>This removes the saved Proctor result for this project and clears the current readings.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete record</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <div className="flex items-center justify-end gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="outline" size="sm"><Download className="h-3.5 w-3.5" />Export<ChevronDown className="h-3 w-3" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => void exportPDF()}><FileDown className="mr-2 h-4 w-4" />PDF</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void exportCSV()}><FileText className="mr-2 h-4 w-4" />CSV</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void exportXLSX()}><Sheet className="mr-2 h-4 w-4" />Excel</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" className="min-w-20" onClick={handleSave} disabled={saveStatus === "saving" || isLoading}>
            {saveStatus === "saving" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : saveStatus === "saved" ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
            {saveStatus === "saving" ? "Saving..." : saveStatus === "saved" ? "Saved" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
};

const ProctorInputRow = ({ label, rows, field, onChange, textInput = false }: {
  label: string;
  rows: ProctorRow[];
  field: ProctorInputField;
  onChange: (index: number, field: ProctorInputField, value: string) => void;
  textInput?: boolean;
}) => (
  <tr>
    <td className="bg-muted/30 font-medium">{label}</td>
    {rows.map((row, index) => (
      <td key={index} className="p-1">
        <Input
          aria-label={`${label}, point ${POINT_LABELS[index] || index + 1}`}
          type={textInput ? "text" : "number"}
          min={textInput ? undefined : "0"}
          step={textInput ? undefined : "any"}
          value={row[field] as string}
          onChange={(event) => onChange(index, field, event.target.value)}
          placeholder="—"
          className="record-input w-full min-w-[82px] text-center"
        />
      </td>
    ))}
  </tr>
);

const CalculatedRow = ({ label, values }: { label: string; values: (number | null)[] }) => (
  <tr>
    <td className="bg-muted/30 font-medium">{label}</td>
    {values.map((value, index) => <td key={index} className="calculated-cell text-center font-mono">{value === null ? "auto" : value.toFixed(2)}</td>)}
  </tr>
);

const ResultField = ({ label, value }: { label: string; value: string }) => (
  <div className="calculated-cell px-2.5 py-2">
    <span className="mb-1 block text-[10px] text-calculated-foreground/80">{label}</span>
    <strong className="font-mono text-xs text-calculated-foreground">{value}</strong>
  </div>
);

export default ProctorTest;
