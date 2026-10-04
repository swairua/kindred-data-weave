import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Check, ChevronDown, Download, FileDown, Loader2, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
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
import MoistureDensityChart from "@/components/soil/MoistureDensityChart";
import { useProject } from "@/context/ProjectContext";
import { useGridArrowNavigation } from "@/hooks/useGridArrowNavigation";
import { useTestData } from "@/context/TestDataContext";
import {
  airVoidsCurve,
  calculateProctor,
  calculateProctorPoint,
  createProctorPayload,
  emptyProctorRecord,
  getProctorRecord,
  sampleCompactionCurve,
  zeroAirVoidsCurve,
  type ProctorCurvePoint,
  type ProctorMethod,
  type ProctorPointCalculation,
  type ProctorRecord,
  type ProctorRow,
} from "@/lib/proctorRecords";
import type { McVoidLine } from "@/lib/mcChartGeometry";
import { clearProctorResults, loadProctorResult, saveProctorResult } from "@/lib/proctorPersistence";
import { toast } from "sonner";
import { useTestReport } from "@/hooks/useTestReport";
import { generateMoistureDensityPDF } from "@/lib/mcPdfGenerator";
import { captureChartAsBase64 } from "@/lib/chartCapture";

interface ProctorTestProps {
  testKey?: string;
}

type ProctorInputField = Exclude<keyof ProctorRow, "legacy">;

const POINT_LABELS = ["A", "B", "C", "D", "E", "F"];
/** BS 1377-4:1990, 3.3 is the 2.5 kg rammer method and 3.5 the 4.5 kg rammer method. */
const methodClause = (method: ProctorMethod) => method === "standard" ? "3.3" : "3.5";
const methodLabel = (method: ProctorMethod) => method === "standard" ? "Standard" : "Modified";
const MAX_POINTS = 10;
const displayValue = (value: number | null) => value === null ? "—" : value.toFixed(2);
const displayMoisture = (value: number | null) => value === null ? "—" : value.toFixed(1);
const displayDensity = (value: number | null) => value === null ? "—" : value.toFixed(0);
const hasValue = (value: string) => value.trim() !== "";
const optionalNumber = (value: string) => {
  const parsed = value.trim() === "" ? null : Number(value);
  return parsed === null || !Number.isFinite(parsed) ? null : parsed;
};
const isRowStarted = (row: ProctorRow) => {
  const { legacy, ...inputs } = row;
  return Object.values(inputs).some(hasValue) || (legacy !== undefined && Object.values(legacy).some(hasValue));
};
const pointLabel = (index: number) => POINT_LABELS[index] || String(index + 1);

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
  // Arrow keys walk the weighing grid instead of leaving the technician to drag
  // the pointer across a table this wide.
  const gridNav = useGridArrowNavigation<HTMLDivElement>();
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
  const optimum = useMemo(() => calculateProctor(rows, mouldVolume), [rows, mouldVolume]);
  const measuredPoints = useMemo(() => pointCalculations
    .filter((point): point is ProctorPointCalculation & { moistureContent: number; dryDensity: number } =>
      point.moistureContent !== null && point.dryDensity !== null)
    .map((point) => ({ moisture: point.moistureContent, dryDensity: point.dryDensity }))
    .sort((a, b) => a.moisture - b.moisture), [pointCalculations]);
  const specificGravity = optionalNumber(record.specificGravity);
  const airVoidsTarget = optionalNumber(record.airVoidsTarget);
  const hasAirVoidsLine = specificGravity !== null && airVoidsTarget !== null && airVoidsTarget > 0;
  // The fitted curve and the saturation lines are sampled over the measured range,
  // which is where the compaction graph is read from.
  const moistureRange = useMemo<[number, number] | null>(() => {
    if (measuredPoints.length === 0) return null;
    return [measuredPoints[0].moisture, measuredPoints[measuredPoints.length - 1].moisture];
  }, [measuredPoints]);
  const fittedPoints = useMemo<ProctorCurvePoint[]>(
    () => (optimum.curve && moistureRange ? sampleCompactionCurve(optimum.curve, moistureRange) : []),
    [optimum.curve, moistureRange],
  );
  // The printed sheet plots the 0 %, 5 % and 10 % air voids lines. The record's own
  // target is drawn too when it is not one of those, so the extra line is never lost.
  const voidLines = useMemo<McVoidLine[]>(() => {
    if (specificGravity === null || !moistureRange) return [];
    const percents = [0, 5, 10];
    if (hasAirVoidsLine && !percents.includes(airVoidsTarget!)) percents.push(airVoidsTarget!);
    return percents
      .map((percent) => ({
        percent,
        points: (percent === 0
          ? zeroAirVoidsCurve(specificGravity!, moistureRange)
          : airVoidsCurve(percent, specificGravity!, moistureRange)) as ProctorCurvePoint[],
      }))
      .filter((line) => line.points.length > 1);
  }, [specificGravity, moistureRange, hasAirVoidsLine, airVoidsTarget]);
  const summaries = useMemo(() => ({
    standard: calculateProctor(record.standardRows, record.standardMouldVolume),
    modified: calculateProctor(record.modifiedRows, record.modifiedMouldVolume),
  }), [record.standardRows, record.standardMouldVolume, record.modifiedRows, record.modifiedMouldVolume]);
  const resultFields = useMemo(() => [
    { label: "Standard OMC", value: summaries.standard.omc === null ? "" : `${displayMoisture(summaries.standard.omc)}%` },
    { label: "Standard MDD", value: summaries.standard.mdd === null ? "" : `${displayDensity(summaries.standard.mdd)} kg/m³` },
    { label: "Modified OMC", value: summaries.modified.omc === null ? "" : `${displayMoisture(summaries.modified.omc)}%` },
    { label: "Modified MDD", value: summaries.modified.mdd === null ? "" : `${displayDensity(summaries.modified.mdd)} kg/m³` },
  ], [summaries]);
  const totalPoints = [
    ...record.standardRows.map((row) => calculateProctorPoint(row, record.standardMouldVolume)),
    ...record.modifiedRows.map((row) => calculateProctorPoint(row, record.modifiedMouldVolume)),
  ].filter((point) => point.moistureContent !== null && point.dryDensity !== null).length;
  const startedPoints = record.standardRows.concat(record.modifiedRows).filter(isRowStarted).length;
  // Completion is judged on the method on screen, as in the other soil records, so a record that
  // only carries the standard test can still be reported as complete.
  const startedRows = rows.filter(isRowStarted).length;
  const filledRows = pointCalculations.filter((point) => point.moistureContent !== null && point.dryDensity !== null).length;
  const status = startedRows === 0 ? "No data" : filledRows < rows.length ? "In progress" : "Complete";
  useTestReport("proctor", totalPoints, resultFields, undefined, startedPoints);

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

  const updateRecordField = (field: "specificGravity" | "airVoidsTarget", value: string) => {
    setRecord((current) => ({ ...current, [field]: value }));
    setSaveStatus("idle");
  };

  const addRow = () => {
    setRecord((current) => ({
      ...current,
      [setRowsKey]: current[setRowsKey].length >= MAX_POINTS
        ? current[setRowsKey]
        : [...current[setRowsKey], {
            moistureAdded: "",
            mouldWetMass: "",
            mouldTare: "",
            containerNumber: "",
            containerWetMass: "",
            containerDryMass: "",
            containerTare: "",
          }],
    }));
    setSaveStatus("idle");
  };

  const save = async () => {
    if (!projectId) throw new Error("Select a project before saving this record");
    if (isLoading) throw new Error("Wait for this record to finish loading before saving");
    if (error) throw new Error("This record could not be loaded. Reload before saving to prevent duplicates.");
    setSaveStatus("saving");
    setError(null);
    // Completion follows the method on screen so a standard-only test is still reportable.
    const recordStatus = totalPoints === 0
      ? (startedPoints === 0 ? "not-started" : "in-progress")
      : filledRows < rows.length ? "in-progress" : "completed";
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
      data_points: totalPoints,
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

  const captureChart = async () => {
    if (measuredPoints.length < 2) return null;
    return captureChartAsBase64("proctor-chart");
  };

  const exportPDF = async () => {
    await generateMoistureDensityPDF({
      projectName: project.projectName,
      clientName: project.clientName,
      date: project.projectDate || project.date,
      // The record's own test date, not the project date, so the Date Tested row is truthful.
      dateTested: record.dateTested,
      labOrganization: project.labOrganization,
      dateReported: project.dateReported,
      checkedBy: project.checkedBy,
      // The record shows this as "TESTED BY"; without it the report printed a blank signature line.
      testedBy: record.sampledSubmittedBy,
      method: type,
      record: {
        label: record.label,
        sampleNumber: record.sampleNumber,
        sampleDepthFrom: record.sampleDepthFrom,
        sampleDepthTo: record.sampleDepthTo,
        sampledSubmittedBy: record.sampledSubmittedBy,
        dateSubmitted: record.dateSubmitted,
        dateTested: record.dateTested,
        mouldVolume,
        specificGravity: record.specificGravity,
        rows,
      },
      summary: optimum,
      points: measuredPoints,
      fitted: fittedPoints,
      voidLines,
      chartImage: await captureChart(),
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
        <div><h2 className="text-sm font-semibold">Record results — BS 1377 Part 4, {methodClause(type)}</h2><p className="text-[11px] text-muted-foreground">{methodLabel(type)} ({type === "standard" ? "2.5 kg" : "4.5 kg"} rammer). Enter readings for each moisture content point.</p></div>
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
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <span>Mould volume (cm³)</span>
              <Input aria-label={`${methodLabel(type)} mould volume`} type="number" min="0" step="any" value={mouldVolume} onChange={(event) => updateMouldVolume(event.target.value)} className="record-input h-7 w-24" placeholder="1000" />
            </label>
            <label className="flex items-center gap-2 text-[10px] text-muted-foreground" title="Particle density. Draws the zero air voids line on the curve.">
              <span>Specific gravity, Gs</span>
              <Input aria-label="Specific gravity" type="number" min="0" step="any" value={record.specificGravity} onChange={(event) => updateRecordField("specificGravity", event.target.value)} className="record-input h-7 w-20" placeholder="2.70" />
            </label>
            <label className="flex items-center gap-2 text-[10px] text-muted-foreground" title="Second saturation line plotted below the zero air voids line.">
              <span>Air voids (%)</span>
              <Input aria-label="Target air voids percentage" type="number" min="0" max="99" step="any" value={record.airVoidsTarget} onChange={(event) => updateRecordField("airVoidsTarget", event.target.value)} className="record-input h-7 w-16" placeholder="5" />
            </label>
            <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={addRow} disabled={rows.length >= MAX_POINTS}>Add point</Button>
          </div>
        </div>
        <div
          className="overflow-x-auto"
          ref={gridNav.ref}
          onKeyDown={gridNav.onKeyDown}
          data-testid="proctor-input-grid"
        >
          <table className="record-table min-w-[900px] table-fixed">
            <thead><tr><th className="w-[190px]" aria-label="Measurement"></th>{rows.map((_, index) => <th key={index} className="text-center">{pointLabel(index)}</th>)}</tr></thead>
            <tbody>
              <tr className="bg-muted/60"><td colSpan={rows.length + 1} className="py-1.5 font-semibold uppercase tracking-wide text-muted-foreground">Bulk density</td></tr>
              <ProctorInputRow label="Moisture addition (cc)" rows={rows} field="moistureAdded" onChange={updateRow} />
              <ProctorInputRow label="Wt of mould + wet material (g)" rows={rows} field="mouldWetMass" onChange={updateRow} />
              <ProctorInputRow label="Wt of mould (g)" rows={rows} field="mouldTare" onChange={updateRow} />
              <CalculatedRow label="Wt of wet material (g)" values={pointCalculations.map((point) => point.wetMaterialMass)} />
              <CalculatedRow label="Bulk density (kg/m³)" values={pointCalculations.map((point) => point.bulkDensity)} precision={0} />
              <tr className="bg-muted/60"><td colSpan={rows.length + 1} className="py-1.5 font-semibold uppercase tracking-wide text-muted-foreground">Moisture content &amp; dry density</td></tr>
              <ProctorInputRow label="Container No." rows={rows} field="containerNumber" onChange={updateRow} textInput />
              <ProctorInputRow label="Wt of container + wet material (g)" rows={rows} field="containerWetMass" onChange={updateRow} />
              <ProctorInputRow label="Wt of container + dry material (g)" rows={rows} field="containerDryMass" onChange={updateRow} />
              <CalculatedRow label="Wt of moisture (g)" values={pointCalculations.map((point) => point.waterMass)} />
              <ProctorInputRow label="Wt of container (g)" rows={rows} field="containerTare" onChange={updateRow} />
              <CalculatedRow label="Wt of dry soil (g)" values={pointCalculations.map((point) => point.drySoilMass)} />
              <CalculatedRow label="Moisture content (%)" values={pointCalculations.map((point) => point.moistureContent)} precision={1} />
              <CalculatedRow label="Dry density (kg/m³)" values={pointCalculations.map((point) => point.dryDensity)} precision={0} />
            </tbody>
          </table>
        </div>
      </section>

      <section className="record-card p-3">
        <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Proctor curve — {methodLabel(type)}</h3>
        {/* The chart is the sheet's own drawing: red curve, square measurement
            points, dashed air voids lines, so the export and the screen agree. */}
        <MoistureDensityChart
          id="proctor-chart"
          className="w-full"
          points={measuredPoints}
          fitted={fittedPoints}
          voidLines={voidLines}
        />
        <div className="mt-3 grid gap-px overflow-hidden rounded-md border sm:grid-cols-2 lg:grid-cols-4">
          <ResultField label="Maximum Dry Density (kg/m³)" value={displayDensity(optimum.mdd)} />
          <ResultField label="Bulk Density at OMC (kg/m³)" value={displayDensity(optimum.bulkDensity)} />
          <ResultField label="Optimum Moisture Content (%)" value={displayMoisture(optimum.omc)} />
          <ResultField label="Determined From" value={optimum.optimumSource === "curve" ? `Fitted curve (R2 ${optimum.rSquared === null ? "—" : optimum.rSquared.toFixed(3)})` : optimum.optimumSource === "peak-point" ? "Densest measured point" : "—"} />
        </div>
        {optimum.warnings.length > 0 && (
          <ul className="mt-2 list-disc space-y-0.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-[10px] text-amber-900 dark:text-amber-200">
            {optimum.warnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        )}
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
              {/* This report is issued as the printed sheet only; no spreadsheet formats. */}
              <DropdownMenuItem onSelect={() => void exportPDF()}><FileDown className="mr-2 h-4 w-4" />PDF</DropdownMenuItem>
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

const CalculatedRow = ({ label, values, precision = 2 }: { label: string; values: (number | null)[]; precision?: number }) => (
  <tr>
    <td className="bg-muted/30 font-medium">{label}</td>
    {values.map((value, index) => <td key={index} className="calculated-cell text-center font-mono">{value === null ? "auto" : value.toFixed(precision)}</td>)}
  </tr>
);

const ResultField = ({ label, value }: { label: string; value: string }) => (
  <div className="calculated-cell px-2.5 py-2">
    <span className="mb-1 block text-[10px] text-calculated-foreground/80">{label}</span>
    <strong className="font-mono text-xs text-calculated-foreground">{value}</strong>
  </div>
);

export default ProctorTest;
