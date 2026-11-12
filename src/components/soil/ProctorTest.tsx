import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Check, ChevronDown, FileDown, Loader2, Plus, Printer, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import MoistureDensityChart from "@/components/soil/MoistureDensityChart";
import { useProject } from "@/context/ProjectContext";
import { useGridArrowNavigation } from "@/hooks/useGridArrowNavigation";
import { useTestData } from "@/context/TestDataContext";
import {
  airVoidsCurve,
  assessFieldCompaction,
  calculateProctor,
  applyReportedOptimum,
  calculateProctorPoint,
  compactionEnergy,
  correctForOversize,
  createProctorPayload,
  emptyProctorRecord,
  getProctorRecords,
  isReportableOptimum,
  parseAirVoidsTargets,
  sampleCompactionCurve,
  zeroAirVoidsCurve,
  type FieldAcceptance,
  type ProctorCurvePoint,
  type ProctorEffort,
  type ProctorMethod,
  type ProctorPointCalculation,
  type ProctorRecord,
  type ProctorRow,
} from "@/lib/proctorRecords";
import type { McVoidLine } from "@/lib/mcChartGeometry";
import { loadProctorResult, saveProctorResult } from "@/lib/proctorPersistence";
import { toast } from "sonner";
import { useTestReport } from "@/hooks/useTestReport";
import { generateMoistureDensityPDF } from "@/lib/mcPdfGenerator";
import { captureChartAsBase64 } from "@/lib/chartCapture";

interface ProctorTestProps {
  testKey?: string;
}

type ProctorInputField = Exclude<keyof ProctorRow, "legacy">;
type ProctorRecordTextField =
  | "label"
  | "sampleNumber"
  | "sampleDepthFrom"
  | "sampleDepthTo"
  | "testedBy"
  | "specificGravity"
  | "airVoidsTarget"
  | "oversizePercent"
  | "oversizeSpecificGravity"
  | "fieldDryDensity"
  | "requiredRelativeCompaction"
  | "reportedOmc"
  | "reportedMdd"
  | "reportedBulkDensity";

const POINT_LABELS = ["A", "B", "C", "D", "E", "F"];
const methodClause = (method: ProctorMethod) => method === "standard" ? "3.3" : "3.5";
const methodLabel = (method: ProctorMethod) => method === "standard" ? "Standard" : "Modified";
const MAX_POINTS = 10;
const displayValue = (value: number | null) => value === null ? "—" : value.toFixed(2);
const displayMoisture = (value: number | null) => value === null ? "—" : value.toFixed(1);
const displayDensity = (value: number | null) => value === null ? "—" : value.toFixed(0);
const hasValue = (value: string) => value.trim() !== "";
const optionalNumber = (value: string | null | undefined) => {
  if (value == null) return null;
  const parsed = value.trim() === "" ? null : Number(value);
  return parsed === null || !Number.isFinite(parsed) ? null : parsed;
};
const isRowStarted = (row: ProctorRow) => {
  const { legacy, ...inputs } = row;
  return Object.values(inputs).some(hasValue) || (legacy !== undefined && Object.values(legacy).some(hasValue));
};
const savedMethod = (record: ProctorRecord): ProctorMethod => {
  const hasStandardReadings = record.standardRows.some(isRowStarted);
  const hasModifiedReadings = record.modifiedRows.some(isRowStarted);
  if (hasStandardReadings !== hasModifiedReadings) return hasStandardReadings ? "standard" : "modified";
  return record.type;
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
  const [records, setRecords] = useState<ProctorRecord[]>(() => [emptyProctorRecord(metadata)]);
  const [activeSampleIndex, setActiveSampleIndex] = useState(0);
  const record = records[activeSampleIndex] ?? records[0] ?? emptyProctorRecord(metadata);
  const setRecord = (update: (current: ProctorRecord) => ProctorRecord) => {
    setRecords((current) => current.map((item, index) => index === activeSampleIndex ? update(item) : item));
  };
  const [recordId, setRecordId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(projectId));
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportSelection, setExportSelection] = useState<Set<number>>(new Set([0]));
  const [exportAction, setExportAction] = useState<"print" | "download">("print");
  // Optional manual window for the vertical axis, e.g. 1300-1500 for a narrow
  // band; both limits required and ordered, or the axis auto-fits.
  const [yAxisMin, setYAxisMin] = useState("");
  const [yAxisMax, setYAxisMax] = useState("");
  // Arrow keys walk the weighing grid instead of leaving the technician to drag
  // the pointer across a table this wide.
  const gridNav = useGridArrowNavigation<HTMLDivElement>();
  const type = savedMethod(record);
  const rows = type === "standard" ? record.standardRows : record.modifiedRows;
  const mouldVolume = type === "standard" ? record.standardMouldVolume : record.modifiedMouldVolume;
  const rowsKey = type === "standard" ? "standardRows" : "modifiedRows";
  const volumeKey = type === "standard" ? "standardMouldVolume" : "modifiedMouldVolume";
  const effort = type === "standard" ? record.standardEffort : record.modifiedEffort;
  const effortKey = type === "standard" ? "standardEffort" : "modifiedEffort";
  const displayedBulkDensity = optionalNumber(record.reportedBulkDensity);
  const energy = compactionEnergy(effort, mouldVolume);

  useEffect(() => {
    // A record started from an existing project (?newRecord=1) opens blank with no row id,
    // so the first save creates a fresh row instead of overwriting the stored record.
    const isNewRecordLaunch = new URLSearchParams(location.search).get("newRecord") === "1";
    if (!projectId || isNewRecordLaunch) {
      setRecords([emptyProctorRecord(metadata)]);
      setActiveSampleIndex(0);
      setRecordId(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    let active = true;
    setRecords([{ ...emptyProctorRecord(metadata), type: "modified" }]);
    setActiveSampleIndex(0);
    setRecordId(null);
    setIsLoading(true);
    setError(null);
    loadProctorResult(projectId)
      .then((result) => {
        if (!active) return;
        setRecordId(result?.id ?? null);
        setRecords(getProctorRecords(result?.payload_json, metadata));
        setActiveSampleIndex(0);
      })
      .catch((loadError) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "Unable to load this record");
      })
      .finally(() => active && setIsLoading(false));
    return () => { active = false; };
  }, [projectId, location.search, metadataKey, metadata]);

  const pointCalculations = useMemo(() => rows.map((row) => calculateProctorPoint(row, mouldVolume)), [rows, mouldVolume]);
  const measuredPoints = useMemo(() => pointCalculations
    .filter((point): point is ProctorPointCalculation & { moistureContent: number; dryDensity: number } =>
      point.moistureContent !== null && point.dryDensity !== null)
    .map((point) => ({ moisture: point.moistureContent, dryDensity: point.dryDensity }))
    .sort((a, b) => a.moisture - b.moisture), [pointCalculations]);
  const specificGravity = optionalNumber(record.specificGravity);
  const axisY = useMemo(() => {
    const min = optionalNumber(yAxisMin);
    const max = optionalNumber(yAxisMax);
    return min !== null && Number.isFinite(min) && max !== null && Number.isFinite(max) && max > min
      ? { min, max }
      : undefined;
  }, [yAxisMin, yAxisMax]);
  const airVoidsTargets = useMemo(() => parseAirVoidsTargets(record.airVoidsTarget), [record.airVoidsTarget]);
  const optimum = useMemo(() => calculateProctor(rows, mouldVolume, specificGravity), [rows, mouldVolume, specificGravity]);
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
  // The zero air voids line is always drawn; each entered air voids percentage adds a line below it.
  const voidLines = useMemo<McVoidLine[]>(() => {
    if (specificGravity === null || !moistureRange) return [];
    return [0, ...airVoidsTargets]
      .map((percent) => ({
        percent,
        points: (percent === 0
          ? zeroAirVoidsCurve(specificGravity!, moistureRange)
          : airVoidsCurve(percent, specificGravity!, moistureRange)) as ProctorCurvePoint[],
      }))
      .filter((line) => line.points.length > 1);
  }, [specificGravity, moistureRange, airVoidsTargets]);
  const summaries = useMemo(() => {
    const standard = calculateProctor(record.standardRows, record.standardMouldVolume, specificGravity);
    const modified = calculateProctor(record.modifiedRows, record.modifiedMouldVolume, specificGravity);
    return type === "standard"
      ? { standard: applyReportedOptimum(standard, record.reportedOmc, record.reportedMdd), modified }
      : { standard, modified: applyReportedOptimum(modified, record.reportedOmc, record.reportedMdd) };
  }, [record.standardRows, record.standardMouldVolume, record.modifiedRows, record.modifiedMouldVolume, record.reportedOmc, record.reportedMdd, specificGravity, type]);
  const displayedOptimum = type === "standard" ? summaries.standard : summaries.modified;
  const reportedSummary = { ...displayedOptimum, bulkDensity: displayedOptimum.bulkDensity };
  const oversizeRemoved = optionalNumber(record.oversizePercent);
  const oversizeGs = optionalNumber(record.oversizeSpecificGravity);
  const oversizeInputs = oversizeRemoved !== null && oversizeRemoved > 0 && oversizeRemoved < 100 && oversizeGs !== null && oversizeGs > 0
    ? { percent: oversizeRemoved, specificGravity: oversizeGs }
    : null;
  const oversizeCorrected = oversizeInputs && displayedOptimum.mdd !== null && displayedOptimum.omc !== null
    ? correctForOversize(displayedOptimum.mdd, displayedOptimum.omc, oversizeInputs.percent, oversizeInputs.specificGravity)
    : null;
  const fieldDryDensity = optionalNumber(record.fieldDryDensity);
  const requiredCompaction = optionalNumber(record.requiredRelativeCompaction);
  const fieldAssessment = assessFieldCompaction(fieldDryDensity, oversizeCorrected?.mdd ?? displayedOptimum.mdd, requiredCompaction);
  const resultFields = useMemo(() => [
    { label: "Standard OMC", value: summaries.standard.omc === null ? "" : `${displayMoisture(summaries.standard.omc)}%` },
    { label: "Standard MDD", value: summaries.standard.mdd === null ? "" : `${displayDensity(summaries.standard.mdd)} kg/m³` },
    { label: "Modified OMC", value: summaries.modified.omc === null ? "" : `${displayMoisture(summaries.modified.omc)}%` },
    { label: "Modified MDD", value: summaries.modified.mdd === null ? "" : `${displayDensity(summaries.modified.mdd)} kg/m³` },
  ], [summaries]);
  const totalPoints = records.reduce((total, sample) => {
    const sampleType = savedMethod(sample);
    const sampleRows = sampleType === "standard" ? sample.standardRows : sample.modifiedRows;
    const sampleVolume = sampleType === "standard" ? sample.standardMouldVolume : sample.modifiedMouldVolume;
    return total + sampleRows.map((row) => calculateProctorPoint(row, sampleVolume))
      .filter((point) => point.moistureContent !== null && point.dryDensity !== null).length;
  }, 0);
  const startedPoints = records.reduce((total, sample) => {
    const sampleType = savedMethod(sample);
    const sampleRows = sampleType === "standard" ? sample.standardRows : sample.modifiedRows;
    return total + sampleRows.filter(isRowStarted).length;
  }, 0);
  const startedRows = rows.filter(isRowStarted).length;
  const isPointComplete = (point: ProctorPointCalculation, row: ProctorRow) => point.moistureContent !== null
    && point.dryDensity !== null
    && hasValue(row.moistureAdded)
    && hasValue(row.containerNumber);
  const filledRows = pointCalculations.filter((point, index) => isPointComplete(point, rows[index])).length;
  const everyStartedRowComplete = rows.every((row, index) => !isRowStarted(row) || isPointComplete(pointCalculations[index], row));
  const isComplete = startedRows > 0 && everyStartedRowComplete && isReportableOptimum(optimum);
  const status = startedRows === 0 ? "No data" : isComplete ? "Complete" : "In progress";
  useTestReport("proctor", totalPoints, resultFields, undefined, startedPoints);

  const updateRow = (index: number, field: ProctorInputField, value: string) => {
    setRecord((current) => ({
      ...current,
      [rowsKey]: current[rowsKey].map((row, rowIndex) => rowIndex === index ? { ...row, [field]: value } : row),
    }));
    setSaveStatus("idle");
  };

  const updateMouldVolume = (value: string) => {
    setRecord((current) => ({ ...current, [volumeKey]: value }));
    setSaveStatus("idle");
  };

  const updateEffort = (field: keyof ProctorEffort, value: string) => {
    setRecord((current) => ({ ...current, [effortKey]: { ...current[effortKey], [field]: value } }));
    setSaveStatus("idle");
  };

  const updateRecordField = (field: ProctorRecordTextField, value: string) => {
    setRecord((current) => ({ ...current, [field]: value }));
    setSaveStatus("idle");
  };

  const addSample = () => {
    const nextNumber = String(records.length + 1);
    const nextRecord = { ...emptyProctorRecord(), label: `Sample ${nextNumber}`, type };
    setRecords((current) => [...current, nextRecord]);
    setActiveSampleIndex(records.length);
    setSaveStatus("idle");
  };

  const addRow = () => {
    setRecord((current) => ({
      ...current,
      [rowsKey]: current[rowsKey].length >= MAX_POINTS
        ? current[rowsKey]
        : [...current[rowsKey], {
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
    const sampleStatuses = records.map((sample) => {
      const sampleType = savedMethod(sample);
      const sampleRows = sampleType === "standard" ? sample.standardRows : sample.modifiedRows;
      const sampleVolume = sampleType === "standard" ? sample.standardMouldVolume : sample.modifiedMouldVolume;
      const samplePoints = sampleRows.map((row) => calculateProctorPoint(row, sampleVolume));
      const sampleStartedRows = sampleRows.filter(isRowStarted).length;
      const sampleComplete = sampleStartedRows > 0
        && sampleRows.every((row, index) => !isRowStarted(row) || isPointComplete(samplePoints[index], row))
        && isReportableOptimum(calculateProctor(sampleRows, sampleVolume, optionalNumber(sample.specificGravity)));
      return { started: sampleStartedRows > 0, complete: sampleComplete };
    });
    const recordStatus = !sampleStatuses.some((sample) => sample.started)
      ? "not-started"
      : sampleStatuses.every((sample) => sample.complete) ? "completed" : "in-progress";
    const payload = createProctorPayload({
      title: project.projectName,
      clientName: project.clientName,
      date: project.projectDate || project.date,
    }, record, summaries.standard, summaries.modified, records.map((sample) => ({ ...sample, type: savedMethod(sample) })));
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

  const handleSave = () => {
    void save().catch((saveError) => toast.error(saveError instanceof Error ? saveError.message : "Unable to save this record"));
  };


  const captureChart = async () => {
    if (measuredPoints.length < 2) return null;
    return captureChartAsBase64("proctor-chart");
  };

  const createPdfOptions = async (sample: ProctorRecord, includeChart: boolean) => {
    const sampleType = savedMethod(sample);
    const sampleRows = sampleType === "standard" ? sample.standardRows : sample.modifiedRows;
    const sampleMouldVolume = sampleType === "standard" ? sample.standardMouldVolume : sample.modifiedMouldVolume;
    const samplePoints = sampleRows
      .map((row) => calculateProctorPoint(row, sampleMouldVolume))
      .filter((point): point is ProctorPointCalculation & { moistureContent: number; dryDensity: number } =>
        point.moistureContent !== null && point.dryDensity !== null)
      .map((point) => ({ moisture: point.moistureContent, dryDensity: point.dryDensity }))
      .sort((a, b) => a.moisture - b.moisture);
    const sampleSpecificGravity = optionalNumber(sample.specificGravity);
    const sampleSummary = applyReportedOptimum(
      calculateProctor(sampleRows, sampleMouldVolume, sampleSpecificGravity),
      sample.reportedOmc,
      sample.reportedMdd,
    );
    const sampleRange: [number, number] | null = samplePoints.length > 0
      ? [samplePoints[0].moisture, samplePoints[samplePoints.length - 1].moisture]
      : null;
    const sampleFitted = sampleSummary.curve && sampleRange ? sampleCompactionCurve(sampleSummary.curve, sampleRange) : [];
    const sampleVoidLines = sampleSpecificGravity === null || !sampleRange
      ? []
      : [0, ...parseAirVoidsTargets(sample.airVoidsTarget)]
        .map((percent) => ({
          percent,
          points: (percent === 0
            ? zeroAirVoidsCurve(sampleSpecificGravity, sampleRange)
            : airVoidsCurve(percent, sampleSpecificGravity, sampleRange)) as ProctorCurvePoint[],
        }))
        .filter((line) => line.points.length > 1);

    return {
      projectName: project.projectName,
      clientName: project.clientName,
      date: project.projectDate || project.date,
      dateTested: sample.dateTested,
      labOrganization: project.labOrganization,
      dateReported: project.dateReported,
      checkedBy: project.checkedBy,
      testedBy: sample.testedBy,
      method: sampleType,
      record: {
        label: sample.label,
        sampleNumber: sample.sampleNumber,
        sampleDepthFrom: sample.sampleDepthFrom,
        sampleDepthTo: sample.sampleDepthTo,
        sampledSubmittedBy: sample.sampledSubmittedBy,
        dateSubmitted: sample.dateSubmitted,
        dateTested: sample.dateTested,
        mouldVolume: sampleMouldVolume,
        specificGravity: sample.specificGravity,
        rows: sampleRows,
      },
      summary: sampleSummary,
      points: samplePoints,
      fitted: sampleFitted,
      voidLines: sampleVoidLines,
      // The manual Y window is an on-screen zoom of the active sample; other samples in the export keep auto-fit.
      axisLimits: includeChart && axisY ? { y: axisY } : undefined,
      chartImage: includeChart ? await captureChart() : null,
      skipDownload: true,
    };
  };

  const exportPDF = async (action: "print" | "download", selectedRecords: ProctorRecord[] = [record]) => {
    const [firstRecord, ...additionalRecords] = selectedRecords;
    const [firstOptions, ...additionalOptions] = await Promise.all([
      createPdfOptions(firstRecord, selectedRecords.length === 1 && firstRecord === record),
      ...additionalRecords.map((sample) => createPdfOptions(sample, false)),
    ]);
    const doc = await generateMoistureDensityPDF({
      ...firstOptions,
      samples: additionalOptions,
      skipDownload: action === "print",
    });
    if (action === "print") {
      doc.autoPrint();
      const printWindow = window.open(doc.output("bloburl"), "_blank");
      if (printWindow) printWindow.onload = () => printWindow.print();
    }
  };

  const openExportDialog = (action: "print" | "download") => {
    setExportAction(action);
    setExportSelection(new Set(records.map((_, index) => index)));
    setExportDialogOpen(true);
  };

  const confirmExportSelection = () => {
    const selectedRecords = records.filter((_, index) => exportSelection.has(index));
    setExportDialogOpen(false);
    void exportPDF(exportAction, selectedRecords).catch(() =>
      toast.error(exportAction === "print" ? "Proctor report print failed" : "Proctor report download failed"),
    );
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
          <span>Test type: <strong className="text-foreground">Density/Moisture Content Relationship</strong></span>
        </div>
      </section>

      <div className="space-y-2 px-1">
        <div><h2 className="text-sm font-semibold">Record results — BS 1377 Part 4, {methodClause(type)}</h2><p className="text-[11px] text-muted-foreground">{methodLabel(type)} ({type === "standard" ? "2.5 kg" : "4.5 kg"} rammer). Enter readings for each moisture content point.</p></div>
        <div className="flex items-center gap-2 print:hidden" data-testid="proctor-sample-strip">
          <span className="shrink-0 text-xs text-muted-foreground">Sample {activeSampleIndex + 1} of {records.length}</span>
          <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto pb-1">
            {records.map((sample, index) => {
              const isActive = index === activeSampleIndex;
              const sampleType = savedMethod(sample);
              const sampleMethodRows = sampleType === "standard" ? sample.standardRows : sample.modifiedRows;
              const sampleMethodVolume = sampleType === "standard" ? sample.standardMouldVolume : sample.modifiedMouldVolume;
              const sampleSummary = calculateProctor(sampleMethodRows, sampleMethodVolume);
              const sampleName = sample.label || sample.sampleNumber || `Sample ${index + 1}`;
              return (
                <button
                  key={`${sampleName}-${index}`}
                  type="button"
                  onClick={() => setActiveSampleIndex(index)}
                  aria-current={isActive}
                  title={sampleName}
                  data-testid={`proctor-sample-${index + 1}`}
                  data-active={isActive ? "true" : "false"}
                  className={`shrink-0 whitespace-nowrap rounded-md border px-2.5 py-1 text-left text-[11px] leading-tight transition-colors ${isActive ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:bg-muted/40"}`}
                >
                  <span className="font-medium">{index + 1}. {sampleName}</span>
                  {sampleSummary.mdd !== null && <span className="ml-1.5 text-[10px] opacity-80">{displayDensity(sampleSummary.mdd)} kg/m³</span>}
                </button>
              );
            })}
            <Button type="button" onClick={addSample} size="sm" variant="outline" className="h-7 shrink-0 gap-1.5 text-[11px]" data-testid="proctor-add-sample">
              <Plus className="h-3.5 w-3.5" /> Add sample
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 px-1 sm:grid-cols-4">
        <label className="space-y-1 text-[10px] text-muted-foreground">
          <span>Sample ID</span>
          <Input aria-label="Sample ID" value={record.label} onChange={(event) => updateRecordField("label", event.target.value)} className="record-input h-7" />
        </label>
        <label className="space-y-1 text-[10px] text-muted-foreground">
          <span>Sample No.</span>
          <Input aria-label="Sample number" value={record.sampleNumber} onChange={(event) => updateRecordField("sampleNumber", event.target.value)} className="record-input h-7" />
        </label>
        <label className="space-y-1 text-[10px] text-muted-foreground">
          <span>Depth From (m)</span>
          <Input aria-label="Sample depth from" type="number" min="0" step="any" value={record.sampleDepthFrom} onChange={(event) => updateRecordField("sampleDepthFrom", event.target.value)} className="record-input h-7" />
        </label>
        <label className="space-y-1 text-[10px] text-muted-foreground">
          <span>Depth To (m)</span>
          <Input aria-label="Sample depth to" type="number" min="0" step="any" value={record.sampleDepthTo} onChange={(event) => updateRecordField("sampleDepthTo", event.target.value)} className="record-input h-7" />
        </label>
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
            <label className="flex items-center gap-2 text-[10px] text-muted-foreground" title="Air voids lines plotted below the zero air voids line, as a comma separated list.">
              <span>Air voids lines (%)</span>
              <Input aria-label="Target air voids percentage" type="text" value={record.airVoidsTarget} onChange={(event) => updateRecordField("airVoidsTarget", event.target.value)} className="record-input h-7 w-24" placeholder="5, 10" />
            </label>
            <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={addRow} disabled={rows.length >= MAX_POINTS}>Add point</Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 border-b px-3 py-2 text-[10px] text-muted-foreground">
          <label className="flex items-center gap-2"><span>Layers</span><Input aria-label={`${methodLabel(type)} layers`} type="number" min="1" step="1" value={effort.layers} onChange={(event) => updateEffort("layers", event.target.value)} className="record-input h-7 w-16" /></label>
          <label className="flex items-center gap-2"><span>Blows per layer</span><Input aria-label={`${methodLabel(type)} blows per layer`} type="number" min="1" step="1" value={effort.blowsPerLayer} onChange={(event) => updateEffort("blowsPerLayer", event.target.value)} className="record-input h-7 w-16" /></label>
          <label className="flex items-center gap-2"><span>Rammer mass (kg)</span><Input aria-label={`${methodLabel(type)} rammer mass`} type="number" min="0" step="any" value={effort.rammerMass} onChange={(event) => updateEffort("rammerMass", event.target.value)} className="record-input h-7 w-20" /></label>
          <label className="flex items-center gap-2"><span>Drop height (mm)</span><Input aria-label={`${methodLabel(type)} drop height`} type="number" min="0" step="any" value={effort.dropHeight} onChange={(event) => updateEffort("dropHeight", event.target.value)} className="record-input h-7 w-20" /></label>
          <span className="ml-auto">Compaction energy <strong className="font-mono text-foreground">{energy === null ? "—" : energy.toFixed(0)} kJ/m³</strong></span>
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
        <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Proctor curve — Modified</h3>
        {/* The chart is the sheet's own drawing: red curve, square measurement
            points, dashed air voids lines, so the export and the screen agree. */}
        <MoistureDensityChart
          id="proctor-chart"
          className="w-full"
          points={measuredPoints}
          fitted={fittedPoints}
          voidLines={voidLines}
          axisLimits={axisY ? { y: axisY } : undefined}
        />
        {specificGravity === null && <p className="mt-2 text-[10px] text-muted-foreground">Enter specific gravity to draw the zero air voids line.</p>}
        {/* Manual window for the vertical axis, e.g. 1300-1500 to focus on a narrow band; blank auto-fits to the measured readings. */}
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t pt-2 text-[10px] text-muted-foreground">
          <span className="font-medium">Y axis (kg/m³):</span>
          <Input type="number" inputMode="numeric" min={0} value={yAxisMin} onChange={(event) => setYAxisMin(event.target.value)} aria-label="Y axis minimum dry density" placeholder="min" className="record-input h-7 w-20" />
          <Input type="number" inputMode="numeric" min={0} value={yAxisMax} onChange={(event) => setYAxisMax(event.target.value)} aria-label="Y axis maximum dry density" placeholder="max" className="record-input h-7 w-20" />
          <span>leave blank to auto-fit</span>
        </div>
        <table className="mt-3 w-full border-collapse overflow-hidden rounded-md border text-xs">
          <tbody>
            <tr className="border-b">
              <th scope="row" className="w-[28%] bg-muted/60 px-2.5 py-2 text-left font-semibold text-muted-foreground">Maximum Dry Density (kg/m³)</th>
              <td className="w-[22%] px-2.5 py-2 text-right font-mono font-semibold">{displayDensity(displayedOptimum.mdd)}</td>
              <th scope="row" className="w-[28%] border-l bg-muted/60 px-2.5 py-2 text-left font-semibold text-muted-foreground">Optimum Moisture Content (%)</th>
              <td className="w-[22%] px-2.5 py-2 text-right font-mono font-semibold">{displayMoisture(displayedOptimum.omc)}</td>
            </tr>
            <tr>
              <th scope="row" className="bg-muted/60 px-2.5 py-2 text-left font-semibold text-muted-foreground">Bulk Density (kg/m³)</th>
              <td className="px-2.5 py-2 text-right font-mono font-semibold">{displayDensity(reportedSummary.bulkDensity)}</td>
              <td colSpan={2}></td>
            </tr>
          </tbody>
        </table>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
          <label className="flex items-center gap-2" title="Maximum dry density printed on the source test sheet.">
            <span>Reported MDD (kg/m³)</span>
            <Input aria-label="Reported maximum dry density" type="number" min="0" step="any" value={record.reportedMdd} onChange={(event) => updateRecordField("reportedMdd", event.target.value)} className="record-input h-7 w-24" />
          </label>
          <label className="flex items-center gap-2" title="Optimum moisture content printed on the source test sheet.">
            <span>Reported OMC (%)</span>
            <Input aria-label="Reported optimum moisture content" type="number" min="0" step="any" value={record.reportedOmc} onChange={(event) => updateRecordField("reportedOmc", event.target.value)} className="record-input h-7 w-20" />
          </label>
          <label className="flex items-center gap-2" title="Bulk density at the optimum printed on the source test sheet.">
            <span>Reported bulk density (kg/m³)</span>
            <Input aria-label="Reported bulk density" type="number" min="0" step="any" value={record.reportedBulkDensity} onChange={(event) => updateRecordField("reportedBulkDensity", event.target.value)} className="record-input h-7 w-24" />
          </label>
        </div>
        {optimum.warnings.length > 0 && (
          <ul className="mt-2 list-disc space-y-0.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-[10px] text-amber-900 dark:text-amber-200">
            {optimum.warnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        )}
      </section>

      <section className="record-card p-3">
        <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Oversize and field compaction</h3>
        <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
          <label className="flex items-center gap-2" title="Share of the sample by dry mass removed before compaction (ASTM D4718).">
            <span>Oversize removed (%)</span>
            <Input aria-label="Oversize removed percentage" type="number" min="0" max="99" step="any" value={record.oversizePercent} onChange={(event) => updateRecordField("oversizePercent", event.target.value)} className="record-input h-7 w-20" placeholder="0" />
          </label>
          <label className="flex items-center gap-2" title="Oven-dried relative density of the oversize particles.">
            <span>Oversize Gs</span>
            <Input aria-label="Oversize specific gravity" type="number" min="0" step="any" value={record.oversizeSpecificGravity} onChange={(event) => updateRecordField("oversizeSpecificGravity", event.target.value)} className="record-input h-7 w-20" placeholder="2.65" />
          </label>
          <label className="flex items-center gap-2">
            <span>Field dry density (kg/m³)</span>
            <Input aria-label="Field dry density" type="number" min="0" step="any" value={record.fieldDryDensity} onChange={(event) => updateRecordField("fieldDryDensity", event.target.value)} className="record-input h-7 w-24" />
          </label>
          <label className="flex items-center gap-2">
            <span>Required relative compaction (%)</span>
            <Input aria-label="Required relative compaction" type="number" min="0" step="any" value={record.requiredRelativeCompaction} onChange={(event) => updateRecordField("requiredRelativeCompaction", event.target.value)} className="record-input h-7 w-20" />
          </label>
        </div>
        {oversizeRemoved !== null && oversizeRemoved > 0 && oversizeGs === null && <p className="mt-2 text-[10px] text-muted-foreground">Enter the oversize relative density to correct the MDD and OMC.</p>}
        {oversizeRemoved !== null && oversizeRemoved > 30 && <p className="mt-2 text-[10px] text-amber-700 dark:text-amber-300">The ASTM D4718 correction is valid up to 30% oversize.</p>}
        <div className="mt-3 grid gap-px overflow-hidden rounded-md border sm:grid-cols-2 lg:grid-cols-4">
          <ResultField label="Total-sample MDD (kg/m³)" value={oversizeCorrected ? displayDensity(oversizeCorrected.mdd) : "—"} />
          <ResultField label="Total-sample OMC (%)" value={oversizeCorrected ? displayMoisture(oversizeCorrected.omc) : "—"} />
          <ResultField label="Relative compaction (%)" value={displayMoisture(fieldAssessment.relativeCompaction)} />
          <ResultField label="Acceptance" value={acceptanceLabel(fieldAssessment.acceptance, requiredCompaction)} />
        </div>
      </section>

      <section className="record-card flex flex-col gap-2 px-3 py-2 text-[10px] sm:flex-row sm:items-center sm:justify-between">
        <label className="flex items-center gap-2"><span className="text-muted-foreground">TESTED BY</span><Input aria-label="Tested by" value={record.testedBy} onChange={(event) => updateRecordField("testedBy", event.target.value)} className="record-input h-7 w-40" /></label>
        <div className="sm:text-right"><span className="text-muted-foreground">STATUS</span><div className="font-semibold">{status} · {filledRows}/{rows.length} {type} points</div></div>
      </section>

      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{exportAction === "print" ? "Print samples" : "Download Proctor PDF"}</DialogTitle>
            <DialogDescription>Select which Proctor samples to include in the {exportAction === "print" ? "printout" : "PDF"}.</DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-between text-xs">
            <button type="button" className="text-primary hover:underline" onClick={() => setExportSelection(new Set(records.map((_, index) => index)))}>Select all</button>
            <button type="button" className="text-primary hover:underline" onClick={() => setExportSelection(new Set())}>Clear</button>
          </div>
          <div className="max-h-72 space-y-2 overflow-y-auto">
            {records.map((sample, index) => (
              <label key={`${sample.label}-${index}`} className="flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm">
                <Checkbox
                  checked={exportSelection.has(index)}
                  onCheckedChange={(checked) => setExportSelection((current) => {
                    const next = new Set(current);
                    if (checked === true) next.add(index);
                    else next.delete(index);
                    return next;
                  })}
                />
                <span className="font-medium">{index + 1}. {sample.label || sample.sampleNumber || `Sample ${index + 1}`}</span>
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExportDialogOpen(false)}>Cancel</Button>
            <Button disabled={exportSelection.size === 0} onClick={confirmExportSelection}>
              {exportAction === "print"
                ? exportSelection.size === records.length ? `Print all (${exportSelection.size})` : `Print ${exportSelection.size} selected`
                : exportSelection.size === records.length ? `Download all (${exportSelection.size})` : `Download ${exportSelection.size} selected`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="sticky bottom-0 z-20 -mx-3 flex items-center justify-end gap-2 border-t bg-background/95 px-3 py-2 backdrop-blur print:hidden">
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => openExportDialog("download")}><FileDown className="mr-1.5 h-3.5 w-3.5" />PDF</Button>
          <Button variant="outline" size="sm" onClick={() => openExportDialog("print")}><Printer className="mr-1.5 h-3.5 w-3.5" />Print</Button>
          <Button size="sm" className="min-w-20" onClick={handleSave} disabled={saveStatus === "saving" || isLoading}>
            {saveStatus === "saving" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : saveStatus === "saved" ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
            {saveStatus === "saving" ? "Saving..." : saveStatus === "saved" ? "Saved" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
};

const acceptanceLabel = (acceptance: FieldAcceptance, requiredPercent: number | null): string => {
  if (acceptance === "pass") return `Pass (min. ${requiredPercent}%)`;
  if (acceptance === "fail") return `Fail (min. ${requiredPercent}%)`;
  if (acceptance === "no-limit") return "No limit set";
  return "—";
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
