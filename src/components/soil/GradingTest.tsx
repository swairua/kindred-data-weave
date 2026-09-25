import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Check, ChevronDown, FileDown, FileText, HelpCircle, Loader2, Save, Sheet, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { useProject } from "@/context/ProjectContext";
import { type RecordMetadata, useTestData } from "@/context/TestDataContext";
import { captureChartAsBase64 } from "@/lib/chartCapture";
import { createRecord, deleteRecord, listRecords, updateRecord } from "@/lib/api";
import { generateTestCSV } from "@/lib/csvExporter";
import { generateTestExcel } from "@/lib/genericExcelExporter";
import { generateTestPDF } from "@/lib/pdfGenerator";
import { calculateGrading, calculateMoisture, type GradingRow } from "@/lib/gradingCalculations";
import { toast } from "sonner";

interface GradingTestProps {
  testKey?: string;
}

interface SamplePreparation {
  initialDryMass: string;
  washedOvenDryMass: string;
}

interface MoistureSection {
  wetMass: string;
  dryMass: string;
}

interface ClassificationSection {
  uscs: string;
  aashtoGroup: string;
  aashtoRating: string;
  liquidLimit: string;
  plasticLimit: string;
  plasticityIndex: string;
  nonPlastic: boolean;
  suspectedOrganic: boolean;
  ovenDriedLiquidLimit: string;
}

interface HydrometerRow {
  time: string;
  actualHydrometer: string;
  adjustedHydrometer: string;
  compositeCorrection: string;
  correctedHydrometer: string;
  effectiveDepth: string;
  particleDiameter: string;
  finesInSuspension: string;
  finesByHydrometer: string;
}

interface GradingRecord {
  label: string;
  sampleNumber: string;
  sampleDepthFrom: string;
  sampleDepthTo: string;
  sampledSubmittedBy: string;
  dateSubmitted: string;
  dateTested: string;
  sampleNotes: string;
  samplePreparation: SamplePreparation;
  moisture: MoistureSection;
  classification: ClassificationSection;
  sieveRows: GradingRow[];
  hydrometerRows: HydrometerRow[];
  hydrometerInputs: Record<string, string>;
}

interface GradingPayload {
  version: string;
  project: {
    title: string;
    clientName: string;
    date: string;
    records: GradingRecord[];
  };
  calculations: ReturnType<typeof calculateGrading> & ReturnType<typeof calculateMoisture> & {
    fineMass: number | null;
    finesPercentage: number | null;
    gravelPercentage: number | null;
    sandPercentage: number | null;
    sieveFinesPercentage: number | null;
    plasticityIndex: number | null;
  };
}

interface ApiTestResultRow {
  id: number;
  project_id: number;
  test_key: string;
  payload_json?: unknown;
  created_at?: string;
  updated_at?: string;
}

const SIEVE_SIZES = [
  "75", "63", "50", "37.5", "28", "20", "14", "10", "6.3", "5", "4.75 (No. 4)", "3.35", "2.36", "2.00 (No. 10)", "1.18", "0.6", "0.425", "0.3", "0.15", "0.075", "0.063", "<0.063",
];
const HYDROMETER_TIMES = ["0.25", "0.50", "1", "2", "4", "8", "15", "30", "60", "120", "240", "480", "1440"];
const EMPTY_SIEVE_ROWS: GradingRow[] = SIEVE_SIZES.map((sieveSize) => ({ sieveSize, weightRetained: "" }));
const EMPTY_HYDROMETER_ROWS: HydrometerRow[] = HYDROMETER_TIMES.map((time) => ({
  time,
  actualHydrometer: "",
  adjustedHydrometer: "auto",
  compositeCorrection: "auto",
  correctedHydrometer: "auto",
  effectiveDepth: "auto",
  particleDiameter: "auto",
  finesInSuspension: "auto",
  finesByHydrometer: "auto",
}));

const DEFAULT_CLASSIFICATION: ClassificationSection = {
  uscs: "auto",
  aashtoGroup: "auto",
  aashtoRating: "auto",
  liquidLimit: "",
  plasticLimit: "",
  plasticityIndex: "auto",
  nonPlastic: false,
  suspectedOrganic: false,
  ovenDriedLiquidLimit: "Required for OL/OH",
};

const DEFAULT_HYDROMETER_INPUTS = {
  dryWeight: "",
  sG: "",
  temperature: "",
  kFactor: "",
  hydrometerType: "",
  zeroCorrection: "",
  meniscusCorrection: "",
  temperatureCorrection: "",
};

const emptyRecord = (metadata: RecordMetadata): GradingRecord => ({
  label: metadata.sampleId || "",
  sampleNumber: metadata.sampleNumber || "",
  sampleDepthFrom: metadata.sampleDepthFrom || "",
  sampleDepthTo: metadata.sampleDepthTo || "",
  sampledSubmittedBy: metadata.sampledSubmittedBy || metadata.testedBy || "",
  dateSubmitted: metadata.dateSubmitted || "",
  dateTested: metadata.dateTested || "",
  sampleNotes: metadata.sampleNotes || "",
  samplePreparation: { initialDryMass: "", washedOvenDryMass: "" },
  moisture: { wetMass: "", dryMass: "" },
  classification: { ...DEFAULT_CLASSIFICATION },
  sieveRows: EMPTY_SIEVE_ROWS.map((row) => ({ ...row })),
  hydrometerRows: EMPTY_HYDROMETER_ROWS.map((row) => ({ ...row })),
  hydrometerInputs: { ...DEFAULT_HYDROMETER_INPUTS },
});

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const readString = (value: unknown) => typeof value === "string" ? value : value == null ? "" : String(value);
const readBoolean = (value: unknown) => value === true;

const normalizeRecord = (value: unknown, metadata: RecordMetadata): GradingRecord => {
  const source = isObject(value) ? value : {};
  const fallback = emptyRecord(metadata);
  const preparation = isObject(source.samplePreparation) ? source.samplePreparation : {};
  const moisture = isObject(source.moisture) ? source.moisture : {};
  const classification = isObject(source.classification) ? source.classification : {};
  const inputs = isObject(source.hydrometerInputs) ? source.hydrometerInputs : {};
  const sieveRows = Array.isArray(source.sieveRows) ? source.sieveRows : fallback.sieveRows;
  const hydrometerRows = Array.isArray(source.hydrometerRows) ? source.hydrometerRows : fallback.hydrometerRows;

  return {
    ...fallback,
    label: readString(source.label) || fallback.label,
    sampleNumber: readString(source.sampleNumber) || fallback.sampleNumber,
    sampleDepthFrom: readString(source.sampleDepthFrom) || fallback.sampleDepthFrom,
    sampleDepthTo: readString(source.sampleDepthTo) || fallback.sampleDepthTo,
    sampledSubmittedBy: readString(source.sampledSubmittedBy) || fallback.sampledSubmittedBy,
    dateSubmitted: readString(source.dateSubmitted) || fallback.dateSubmitted,
    dateTested: readString(source.dateTested) || fallback.dateTested,
    sampleNotes: readString(source.sampleNotes) || fallback.sampleNotes,
    samplePreparation: {
      initialDryMass: readString(preparation.initialDryMass),
      washedOvenDryMass: readString(preparation.washedOvenDryMass),
    },
    moisture: { wetMass: readString(moisture.wetMass), dryMass: readString(moisture.dryMass) },
    classification: {
      uscs: readString(classification.uscs) || DEFAULT_CLASSIFICATION.uscs,
      aashtoGroup: readString(classification.aashtoGroup) || DEFAULT_CLASSIFICATION.aashtoGroup,
      aashtoRating: readString(classification.aashtoRating) || DEFAULT_CLASSIFICATION.aashtoRating,
      liquidLimit: readString(classification.liquidLimit),
      plasticLimit: readString(classification.plasticLimit),
      plasticityIndex: readString(classification.plasticityIndex) || DEFAULT_CLASSIFICATION.plasticityIndex,
      nonPlastic: readBoolean(classification.nonPlastic),
      suspectedOrganic: readBoolean(classification.suspectedOrganic),
      ovenDriedLiquidLimit: readString(classification.ovenDriedLiquidLimit) || DEFAULT_CLASSIFICATION.ovenDriedLiquidLimit,
    },
    sieveRows: sieveRows.map((row, index) => ({
      sieveSize: readString(isObject(row) ? row.sieveSize : "") || fallback.sieveRows[index]?.sieveSize || "",
      weightRetained: readString(isObject(row) ? row.weightRetained : ""),
    })),
    hydrometerRows: hydrometerRows.map((row, index) => {
      const item = isObject(row) ? row : {};
      const fallbackRow = fallback.hydrometerRows[index] || EMPTY_HYDROMETER_ROWS[0];
      return {
        time: readString(item.time) || fallbackRow.time,
        actualHydrometer: readString(item.actualHydrometer),
        adjustedHydrometer: readString(item.adjustedHydrometer) || "auto",
        compositeCorrection: readString(item.compositeCorrection) || "auto",
        correctedHydrometer: readString(item.correctedHydrometer) || "auto",
        effectiveDepth: readString(item.effectiveDepth) || "auto",
        particleDiameter: readString(item.particleDiameter) || "auto",
        finesInSuspension: readString(item.finesInSuspension) || "auto",
        finesByHydrometer: readString(item.finesByHydrometer) || "auto",
      };
    }),
    hydrometerInputs: Object.fromEntries(Object.keys(DEFAULT_HYDROMETER_INPUTS).map((key) => [key, readString(inputs[key])])),
  };
};

const getPayloadRecord = (payload: unknown, metadata: RecordMetadata) => {
  let parsedPayload = payload;
  if (typeof payload === "string") {
    try {
      parsedPayload = JSON.parse(payload) as unknown;
    } catch {
      return emptyRecord(metadata);
    }
  }
  if (!isObject(parsedPayload)) return emptyRecord(metadata);
  const project = isObject(parsedPayload.project) ? parsedPayload.project : parsedPayload;
  const records = Array.isArray(project.records) ? project.records : [];
  return normalizeRecord(records[0], metadata);
};

const formatValue = (value: number | null, decimals = 2) => value === null ? "auto" : value.toFixed(decimals);
const parseNumber = (value: string) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const GradingTest = ({ testKey }: GradingTestProps) => {
  const project = useProject();
  const testData = useTestData();
  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const isNewRecord = searchParams.get("newRecord") === "1";
  const sourceProjectIdValue = Number.parseInt(searchParams.get("sourceProjectId") || "", 10);
  const sourceProjectId = Number.isInteger(sourceProjectIdValue) && sourceProjectIdValue > 0 ? sourceProjectIdValue : null;
  const resultIdValue = Number.parseInt(searchParams.get("resultId") || "", 10);
  const selectedResultId = Number.isInteger(resultIdValue) && resultIdValue > 0 ? resultIdValue : null;
  const projectId = project.currentProjectId ?? null;
  const metadata = useMemo(() => testData.recordMetadata.grading || {}, [testData.recordMetadata.grading]);
  const metadataKey = JSON.stringify(metadata);
  const [record, setRecord] = useState<GradingRecord>(() => emptyRecord(metadata));
  const [recordId, setRecordId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(projectId) && (!isNewRecord || sourceProjectId !== null));
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const calculations = useMemo(() => calculateGrading(record.sieveRows), [record.sieveRows]);
  const moisture = useMemo(() => calculateMoisture(record.moisture.wetMass, record.moisture.dryMass), [record.moisture]);
  const fineMass = useMemo(() => {
    const initial = parseNumber(record.samplePreparation.initialDryMass);
    const washed = parseNumber(record.samplePreparation.washedOvenDryMass);
    return initial !== null && washed !== null ? Math.max(initial - washed, 0) : null;
  }, [record.samplePreparation]);
  const finesPercentage = useMemo(() => {
    const initial = parseNumber(record.samplePreparation.initialDryMass);
    return initial && fineMass !== null ? (fineMass / initial) * 100 : null;
  }, [record.samplePreparation, fineMass]);
  const chartData = useMemo(() => record.sieveRows
    .map((row, index) => ({ size: Number.parseFloat(row.sieveSize), passing: calculations.cumulativePassing[index] }))
    .filter((point): point is { size: number; passing: number } => point.size > 0 && point.passing !== null)
    .sort((a, b) => a.size - b.size), [record.sieveRows, calculations.cumulativePassing]);
  const classificationValues = useMemo(() => {
    const passingAt = (matcher: (size: string) => boolean) => {
      const index = record.sieveRows.findIndex((row) => matcher(row.sieveSize));
      return index >= 0 ? calculations.cumulativePassing[index] : null;
    };
    const gravelPassing = passingAt((size) => Number.parseFloat(size) === 4.75 || size.includes("No. 4"));
    const finesPassing = passingAt((size) => Number.parseFloat(size) === 0.075 || size.includes("0.075"));
    const liquidLimit = parseNumber(record.classification.liquidLimit);
    const plasticLimit = parseNumber(record.classification.plasticLimit);
    return {
      gravel: gravelPassing === null ? null : 100 - gravelPassing,
      sand: gravelPassing !== null && finesPassing !== null ? gravelPassing - finesPassing : null,
      fines: finesPassing,
      plasticityIndex: liquidLimit !== null && plasticLimit !== null ? liquidLimit - plasticLimit : null,
    };
  }, [record.sieveRows, record.classification.liquidLimit, record.classification.plasticLimit, calculations.cumulativePassing]);

  useEffect(() => {
    if (!projectId) {
      setRecord(emptyRecord(metadata));
      setRecordId(null);
      setIsLoading(false);
      return;
    }
    if (isNewRecord && sourceProjectId === null) {
      setRecord(emptyRecord(metadata));
      setRecordId(null);
      setIsLoading(false);
      return;
    }

    const loadProjectId = isNewRecord ? sourceProjectId : projectId;
    if (loadProjectId === null) return;

    let active = true;
    setIsLoading(true);
    setError(null);
    listRecords<ApiTestResultRow>("test_results", { limit: 5000, orderBy: "updated_at", direction: "DESC" })
      .then((response) => {
        if (!active) return;
        const result = (response.data || []).find((row) => Number(row.project_id) === loadProjectId && row.test_key === "grading" && (!selectedResultId || row.id === selectedResultId) && row.payload_json);
        const loadedRecord = getPayloadRecord(result?.payload_json, metadata);
        setRecordId(isNewRecord ? null : result?.id ?? null);
        setRecord(isNewRecord ? {
          ...loadedRecord,
          label: metadata.sampleId || loadedRecord.label,
          sampleNumber: metadata.sampleNumber || loadedRecord.sampleNumber,
          sampleDepthFrom: metadata.sampleDepthFrom || loadedRecord.sampleDepthFrom,
          sampleDepthTo: metadata.sampleDepthTo || loadedRecord.sampleDepthTo,
          sampledSubmittedBy: metadata.sampledSubmittedBy || loadedRecord.sampledSubmittedBy,
          dateSubmitted: metadata.dateSubmitted || loadedRecord.dateSubmitted,
          dateTested: metadata.dateTested || loadedRecord.dateTested,
          sampleNotes: metadata.sampleNotes || loadedRecord.sampleNotes,
        } : loadedRecord);
      })
      .catch((loadError) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "Unable to load this record");
      })
      .finally(() => active && setIsLoading(false));
    return () => { active = false; };
  }, [projectId, isNewRecord, sourceProjectId, selectedResultId, metadataKey, metadata]);

  const updateRecordField = <K extends keyof GradingRecord>(field: K, value: GradingRecord[K]) => {
    setRecord((current) => ({ ...current, [field]: value }));
    setSaveStatus("idle");
  };

  const updateNested = <K extends keyof GradingRecord, N extends keyof NonNullable<GradingRecord[K]>>(field: K, nested: N, value: string | boolean) => {
    setRecord((current) => ({ ...current, [field]: { ...(current[field] as object), [nested]: value } }));
    setSaveStatus("idle");
  };

  const updateSieve = (index: number, value: string) => {
    updateRecordField("sieveRows", record.sieveRows.map((row, rowIndex) => rowIndex === index ? { ...row, weightRetained: value } : row));
  };

  const updateHydrometer = (index: number, field: keyof HydrometerRow, value: string) => {
    updateRecordField("hydrometerRows", record.hydrometerRows.map((row, rowIndex) => rowIndex === index ? { ...row, [field]: value } : row));
  };

  const payload = useMemo<GradingPayload>(() => ({
    version: "1.0",
    project: {
      title: project.projectName,
      clientName: project.clientName,
      date: project.projectDate || project.date,
      records: [record],
    },
    calculations: {
      ...calculations,
      ...moisture,
      fineMass,
      finesPercentage,
      gravelPercentage: classificationValues.gravel,
      sandPercentage: classificationValues.sand,
      sieveFinesPercentage: classificationValues.fines,
      plasticityIndex: classificationValues.plasticityIndex,
    },
  }), [project.projectName, project.clientName, project.projectDate, project.date, record, calculations, moisture, fineMass, finesPercentage, classificationValues]);

  const status = calculations.totalWeight === 0 ? "not-started" : calculations.percentageRetained.some((value) => value > 0) ? "in-progress" : "not-started";
  const save = useCallback(async () => {
    if (!projectId) throw new Error("Select a project before saving this record");
    setSaveStatus("saving");
    setError(null);
    const data = {
      project_id: projectId,
      test_key: "grading",
      name: "Particle Size Distribution",
      category: "soil",
      status,
      data_points: record.sieveRows.filter((row) => row.weightRetained.trim()).length,
      key_results_json: [
        { label: "D10", value: formatValue(calculations.d10, 3) },
        { label: "D30", value: formatValue(calculations.d30, 3) },
        { label: "D60", value: formatValue(calculations.d60, 3) },
        { label: "Cu", value: formatValue(calculations.cu) },
        { label: "Cc", value: formatValue(calculations.cc) },
      ],
      payload_json: payload,
    };
    try {
      const response = recordId
        ? await updateRecord<{ id: number }>("test_results", recordId, data)
        : await createRecord<{ id: number }>("test_results", data);
      setRecordId(recordId || response.data?.id || response.id || null);
      setSaveStatus("saved");
      if (isNewRecord) {
        const params = new URLSearchParams(location.search);
        params.delete("newRecord");
        params.delete("sourceProjectId");
        navigate({
          pathname: location.pathname,
          search: params.toString() ? `?${params.toString()}` : "",
          hash: location.hash,
        }, { replace: true });
      }
      toast.success("Particle Size Distribution saved");
    } catch (saveError) {
      setSaveStatus("error");
      setError(saveError instanceof Error ? saveError.message : "Unable to save this record");
      throw saveError;
    }
  }, [projectId, status, record, calculations, payload, recordId, isNewRecord, location, navigate]);

  const clear = async () => {
    if (projectId) {
      const response = await listRecords<ApiTestResultRow>("test_results", { limit: 5000 });
      const targetResultId = recordId ?? selectedResultId;
      const rows = (response.data || []).filter((row) => Number(row.project_id) === projectId && row.test_key === "grading" && (!targetResultId || row.id === targetResultId));
      await Promise.all(rows.map((row) => deleteRecord("test_results", row.id)));
    }
    setRecord(emptyRecord(metadata));
    setRecordId(null);
    setSaveStatus("idle");
    toast.success("Particle Size Distribution cleared");
  };

  const handleSave = () => {
    void save().catch(() => undefined);
  };

  const handleClear = () => {
    void clear().catch((clearError) => {
      const message = clearError instanceof Error ? clearError.message : "Unable to delete this record";
      setError(message);
      toast.error(message);
    });
  };

  const exportFiles = async (type: "pdf" | "xlsx" | "csv") => {
    const tables = [{
      headers: ["Sieve size (mm)", "Retained mass (g)", "% retained", "Cumulative passing (%)"],
      rows: record.sieveRows.map((row, index) => [row.sieveSize, row.weightRetained || "—", calculations.percentageRetained[index]?.toFixed(1) || "—", calculations.cumulativePassing[index]?.toFixed(1) || "—"]),
    }];
    if (type === "csv") {
      generateTestCSV({ title: "Particle Size Distribution", ...project, tables });
      return;
    }
    const chartImages: Record<string, string> = {};
    if (chartData.length >= 2) {
      const chart = await captureChartAsBase64("grading-chart");
      if (chart) chartImages["Particle Size Distribution Curve"] = chart;
    }
    if (type === "pdf") {
      generateTestPDF({ title: "Particle Size Distribution", ...project, tables, chartImages });
    } else {
      generateTestExcel({ data: { title: "Particle Size Distribution", fields: [{ label: "D10", value: formatValue(calculations.d10, 3) }, { label: "D30", value: formatValue(calculations.d30, 3) }, { label: "D60", value: formatValue(calculations.d60, 3) }], tables, chartImages }, projectName: project.projectName, clientName: project.clientName, date: project.projectDate || project.date, labOrganization: project.labOrganization, dateReported: project.dateReported, checkedBy: project.checkedBy });
    }
  };

  if (isLoading) {
    return <div className="flex min-h-[360px] items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading particle size distribution record...</div>;
  }

  if (!projectId) {
    return <div className="rounded-xl border bg-card p-10 text-center"><p className="font-medium">No project selected</p><p className="mt-1 text-sm text-muted-foreground">Start a Particle Size Distribution record from the test wizard.</p></div>;
  }

  return (
    <div className="grading-record space-y-3 pb-6" data-test-key={testKey || "grading"}>
      {error && <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</div>}

      <section className="record-card record-identity">
        <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
          <div><h1 className="text-sm font-semibold">{project.projectName || "Particle Size Distribution"}</h1><p className="text-[11px] text-muted-foreground">{project.clientName || (record.sampleNumber ? `Sample ${record.sampleNumber}` : "Sample details")}</p></div>
          <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => navigate(`/?material=soil&test=grading&projectId=${projectId}`)}>Change <ChevronDown className="ml-1 h-3 w-3" /></Button>
        </div>
        <div className="flex flex-wrap gap-x-2 gap-y-1 px-4 py-2 text-[10px] text-muted-foreground"><span>Material: <strong className="text-foreground">Soil</strong></span><span>·</span><span>Test type: <strong className="text-foreground">Particle Size Distribution</strong></span><span>·</span><span>Sample ID: <strong className="text-foreground">{record.label || "—"}</strong></span><span>·</span><span>Sample No.: <strong className="text-foreground">{record.sampleNumber || "—"}</strong></span><span>·</span><span>Sample Depth From (m): <strong className="text-foreground">{record.sampleDepthFrom || "—"}</strong></span><span>·</span><span>Sample Depth To (m): <strong className="text-foreground">{record.sampleDepthTo || "—"}</strong></span></div>
      </section>

      <div className="px-1 pt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Record results — BS 1377 Part 2</div>

      <div className="grid gap-3 md:grid-cols-2">
        <RecordSection title="Sample preparation">
          <div className="grid gap-px overflow-hidden rounded-md border sm:grid-cols-2">
            <RecordField label="Initial air-dried mass (g) *" value={record.samplePreparation.initialDryMass} placeholder="e.g. 669" onChange={(value) => updateNested("samplePreparation", "initialDryMass", value)} />
            <RecordField label="Washed & oven-dried mass (g) *" value={record.samplePreparation.washedOvenDryMass} placeholder="auto" onChange={(value) => updateNested("samplePreparation", "washedOvenDryMass", value)} />
            <CalculatedField label="Fine mass (g)" value={fineMass === null ? "auto" : fineMass.toFixed(1)} />
            <CalculatedField label="Fines %" value={formatValue(finesPercentage, 1)} />
          </div>
        </RecordSection>
        <RecordSection title="Moisture content at preparation">
          <div className="grid gap-px overflow-hidden rounded-md border sm:grid-cols-2">
            <RecordField label="Wet weight of sample (g)" value={record.moisture.wetMass} placeholder="e.g. 109" onChange={(value) => updateNested("moisture", "wetMass", value)} />
            <RecordField label="Dry weight of sample (g)" value={record.moisture.dryMass} placeholder="e.g. 85.5" onChange={(value) => updateNested("moisture", "dryMass", value)} />
            <CalculatedField label="Weight of water (g)" value={formatValue(moisture.waterWeight, 1)} />
            <CalculatedField label="Moisture content (%)" value={formatValue(moisture.moistureContent, 1)} />
          </div>
        </RecordSection>
      </div>

      <RecordSection title="Soil classification" help="Calculated classification values update from the recorded material data.">
        <div className="grid gap-px overflow-hidden rounded-md border sm:grid-cols-3">
          <EditableCell label="Gravel (%)" value={formatValue(classificationValues.gravel, 1)} calculated />
          <EditableCell label="Sand (%)" value={formatValue(classificationValues.sand, 1)} calculated />
          <EditableCell label="Fines (%)" value={formatValue(classificationValues.fines, 1)} calculated />
        </div>
        <div className="mt-px overflow-hidden rounded-md border">
          <EditableCell label="USCS" value={record.classification.uscs} onChange={(value) => updateNested("classification", "uscs", value)} />
        </div>
        <div className="mt-px grid gap-px overflow-hidden rounded-md border sm:grid-cols-3">
          <EditableCell label="AASHTO group" value={record.classification.aashtoGroup} onChange={(value) => updateNested("classification", "aashtoGroup", value)} />
          <EditableCell label="Group Index" value="auto" calculated />
          <EditableCell label="Rating" value={record.classification.aashtoRating} onChange={(value) => updateNested("classification", "aashtoRating", value)} />
        </div>
        <div className="mt-2 border-t pt-2">
          <div className="mb-px bg-muted/60 px-2 py-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">Atterberg</div>
          <div className="grid gap-px overflow-hidden rounded-md border sm:grid-cols-3">
            <EditableCell label="Liquid limit" value={record.classification.liquidLimit} placeholder="-" onChange={(value) => updateNested("classification", "liquidLimit", value)} />
            <EditableCell label="Plastic limit" value={record.classification.plasticLimit} placeholder="-" onChange={(value) => updateNested("classification", "plasticLimit", value)} />
            <EditableCell label="Plasticity index" value={formatValue(classificationValues.plasticityIndex, 1)} calculated />
          </div>
        </div>
        <div className="mt-2 grid gap-2 border-t pt-2 text-[11px] sm:grid-cols-3"><label className="flex items-center gap-2"><Checkbox checked={record.classification.nonPlastic} onCheckedChange={(checked) => updateNested("classification", "nonPlastic", checked === true)} />Non-plastic (NP)</label><label className="flex items-center gap-2"><Checkbox checked={record.classification.suspectedOrganic} onCheckedChange={(checked) => updateNested("classification", "suspectedOrganic", checked === true)} />Suspected organic soil</label><div><span className="text-muted-foreground">Oven-dried Liquid Limit</span><div className="mt-1 rounded border bg-muted/40 px-2 py-1">{record.classification.ovenDriedLiquidLimit}</div></div></div>
        <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] text-amber-800">USCS: USCS requires measured No. 4 and No. 200 passing values. AASHTO: AASHTO requires measured No. 10, No. 40, and No. 200 passing values.</div>
      </RecordSection>

      <div className="grid gap-3 md:grid-cols-[3fr_5fr]">
        <RecordSection title="Wet & dry sieve analysis to BS 1377-2:1990:9.2/9.3/9.4">
          <div className="overflow-x-auto"><table className="record-table grading-sieve-table w-full table-fixed"><thead><tr><th>Sieve size (mm)</th><th>Retained mass (g)</th><th>% retained</th><th>Cumulative passing (%)</th></tr></thead><tbody>{record.sieveRows.map((row, index) => <tr key={`${row.sieveSize}-${index}`}><td className="font-semibold">{row.sieveSize}</td><td><Input type="number" value={row.weightRetained} onChange={(event) => updateSieve(index, event.target.value)} className="record-input h-7 min-w-0 w-full px-1 text-center" /></td><td className="calculated-cell">{calculations.percentageRetained[index] ? calculations.percentageRetained[index].toFixed(1) : "auto"}</td><td className="calculated-cell">{calculations.cumulativePassing[index] === null ? "auto" : calculations.cumulativePassing[index]?.toFixed(1)}</td></tr>)}<tr className="font-semibold"><td>TOTAL</td><td className="calculated-cell">{calculations.totalWeight ? calculations.totalWeight.toFixed(1) : "auto"}</td><td className="calculated-cell">{calculations.totalWeight ? "100.0" : "auto"}</td><td className="calculated-cell">—</td></tr></tbody></table></div>
        </RecordSection>

        <RecordSection title="Hydrometer analysis to BS 1377-2:1990:9.5">
          <div className="grid gap-px overflow-hidden rounded border sm:grid-cols-2"><HydrometerInput label="Dry weight (g)" value={record.hydrometerInputs.dryWeight} onChange={(value) => updateRecordField("hydrometerInputs", { ...record.hydrometerInputs, dryWeight: value })} /><HydrometerInput label="Hydrometer type" value={record.hydrometerInputs.hydrometerType} onChange={(value) => updateRecordField("hydrometerInputs", { ...record.hydrometerInputs, hydrometerType: value })} /><HydrometerInput label="S.G (Mg/m³)" value={record.hydrometerInputs.sG} onChange={(value) => updateRecordField("hydrometerInputs", { ...record.hydrometerInputs, sG: value })} /><HydrometerInput label="Zero correction factor" value={record.hydrometerInputs.zeroCorrection} onChange={(value) => updateRecordField("hydrometerInputs", { ...record.hydrometerInputs, zeroCorrection: value })} /><HydrometerInput label="Temperature (°C)" value={record.hydrometerInputs.temperature} onChange={(value) => updateRecordField("hydrometerInputs", { ...record.hydrometerInputs, temperature: value })} /><HydrometerInput label="S.G correction factor" value={record.hydrometerInputs.meniscusCorrection} onChange={(value) => updateRecordField("hydrometerInputs", { ...record.hydrometerInputs, meniscusCorrection: value })} /><HydrometerInput label="K factor" value={record.hydrometerInputs.kFactor} onChange={(value) => updateRecordField("hydrometerInputs", { ...record.hydrometerInputs, kFactor: value })} /><HydrometerInput label="Temperature correction factor" value={record.hydrometerInputs.temperatureCorrection} onChange={(value) => updateRecordField("hydrometerInputs", { ...record.hydrometerInputs, temperatureCorrection: value })} /></div>
          <div className="mt-2 overflow-x-auto"><table className="record-table min-w-[1080px]"><thead><tr><th>Time, min</th><th>Actual HR reading</th><th>Adjusted HR</th><th>Composite correction</th><th>Corrected HR</th><th>Effective depth (cm)</th><th>Diameter (mm)</th><th>% fines in suspension</th><th>% fines by hydrometer</th></tr></thead><tbody>{record.hydrometerRows.map((row, index) => <tr key={row.time}><td className="font-semibold">{row.time}</td><td><Input value={row.actualHydrometer} onChange={(event) => updateHydrometer(index, "actualHydrometer", event.target.value)} className="record-input" /></td><td className="calculated-cell">{row.adjustedHydrometer}</td><td className="calculated-cell">{row.compositeCorrection}</td><td className="calculated-cell">{row.correctedHydrometer}</td><td className="calculated-cell">{row.effectiveDepth}</td><td className="calculated-cell">{row.particleDiameter}</td><td className="calculated-cell">{row.finesInSuspension}</td><td className="calculated-cell">{row.finesByHydrometer}</td></tr>)}</tbody></table></div>
        </RecordSection>
      </div>

      <RecordSection title="Particle size distribution graph">
        <div className="overflow-x-auto"><div id="grading-chart" className="relative h-[300px] min-w-[620px] overflow-hidden rounded-md border bg-card"><ChartContainer config={{ percentPassing: { label: "% Passing", color: "hsl(var(--primary))" } }} className="h-full w-full"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartData} margin={{ top: 16, right: 18, bottom: 35, left: 28 }}><CartesianGrid strokeDasharray="2 2" /><ReferenceArea x1={0.001} x2={0.075} fill="#dcecdf" fillOpacity={0.65} /><ReferenceArea x1={0.075} x2={4.75} fill="#fff2cc" fillOpacity={0.65} /><ReferenceArea x1={4.75} x2={63} fill="#dceaf7" fillOpacity={0.65} /><ReferenceArea x1={63} x2={200} fill="#ece8e1" fillOpacity={0.65} /><ReferenceLine y={10} stroke="#9aa49d" strokeDasharray="3 3" /><ReferenceLine y={30} stroke="#9aa49d" strokeDasharray="3 3" /><ReferenceLine y={60} stroke="#9aa49d" strokeDasharray="3 3" /><XAxis dataKey="size" type="number" scale="log" domain={[0.001, 200]} ticks={[0.001, 0.002, 0.006, 0.01, 0.02, 0.06, 0.1, 0.2, 0.6, 1, 2, 6, 10, 20, 60, 100, 200]} tickFormatter={(value) => String(value)} label={{ value: "Particle size (mm)", position: "insideBottom", offset: -20 }} /><YAxis domain={[0, 100]} tickCount={11} label={{ value: "Passing (%)", angle: -90, position: "insideLeft", offset: -10 }} /><ChartTooltip content={<ChartTooltipContent />} /><Line type="monotone" dataKey="passing" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} /></LineChart></ResponsiveContainer></ChartContainer></div><div className="mt-2 grid min-w-[620px] grid-cols-[1.875fr_1.8fr_1.125fr_0.5fr] overflow-hidden rounded border text-center text-[9px] font-medium uppercase tracking-wide"><span className="bg-[#dcecdf] px-1 py-1.5">Fines (&lt;0.075 mm)</span><span className="bg-[#fff2cc] px-1 py-1.5">Sand (0.075–4.75 mm)</span><span className="bg-[#dceaf7] px-1 py-1.5">Gravel (4.75–63 mm)</span><span className="bg-[#ece8e1] px-1 py-1.5">Boulders (&gt;63 mm)</span></div></div>
        <div className="mt-3 grid gap-2 border-t pt-3 sm:grid-cols-5"><CalculatedField label="D10 (mm)" value={formatValue(calculations.d10, 3)} /><CalculatedField label="D30 (mm)" value={formatValue(calculations.d30, 3)} /><CalculatedField label="D60 (mm)" value={formatValue(calculations.d60, 3)} /><CalculatedField label="Cu" value={formatValue(calculations.cu)} /><CalculatedField label="Cc" value={formatValue(calculations.cc)} /></div>
      </RecordSection>

      <section className="record-card flex flex-col gap-3 px-4 py-3 text-[10px] sm:flex-row sm:items-center sm:justify-between"><div><span className="text-muted-foreground">TESTED BY</span><div className="font-semibold uppercase">{record.sampledSubmittedBy || "—"}</div></div><div><span className="text-muted-foreground">DATE REPORTED</span><div className="font-semibold">{project.dateReported || "—"}</div></div></section>
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden"><Button variant="outline" size="sm" className="border-destructive/20 text-destructive hover:bg-destructive/10" onClick={handleClear}><Trash2 className="mr-1.5 h-3.5 w-3.5" />Delete</Button><div className="flex flex-wrap gap-0"><Button size="sm" className="rounded-r-none bg-primary" onClick={handleSave} disabled={saveStatus === "saving"}>{saveStatus === "saving" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : saveStatus === "saved" ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}{saveStatus === "saving" ? "Saving..." : saveStatus === "saved" ? "Saved" : "Save"}</Button><DropdownMenu><DropdownMenuTrigger asChild><Button size="sm" aria-label="Export options" className="rounded-l-none border-l border-primary-foreground/30 bg-primary px-2 text-primary-foreground hover:bg-primary/90"><ChevronDown className="h-3.5 w-3.5" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => void exportFiles("pdf")}><FileDown className="mr-2 h-4 w-4" />PDF</DropdownMenuItem><DropdownMenuItem onSelect={() => void exportFiles("xlsx")}><Sheet className="mr-2 h-4 w-4" />Excel</DropdownMenuItem><DropdownMenuItem onSelect={() => void exportFiles("csv")}><FileText className="mr-2 h-4 w-4" />CSV</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div></div>
    </div>
  );
};

const RecordSection = ({ title, help, children }: { title: string; help?: string; children: React.ReactNode }) => <section className="record-card overflow-hidden"><div className="flex items-center justify-between bg-muted/60 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"><span>{title}</span>{help && <span title={help}><HelpCircle className="h-3.5 w-3.5" /></span>}</div><div className="p-2">{children}</div></section>;

const RecordField = ({ label, value, placeholder, onChange }: { label: string; value: string; placeholder?: string; onChange: (value: string) => void }) => <label className="block bg-card px-2.5 py-2"><span className="mb-1 block text-[10px] text-muted-foreground">{label}</span><Input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className="record-input w-full" /></label>;
const CalculatedField = ({ label, value }: { label: string; value: string }) => <div className="calculated-cell px-2.5 py-2"><span className="mb-1 block text-[10px] text-calculated-foreground/80">{label}</span><strong className="font-mono text-xs text-calculated-foreground">{value}</strong></div>;
const EditableCell = ({ label, value, placeholder, calculated, onChange }: { label: string; value: string; placeholder?: string; calculated?: boolean; onChange?: (value: string) => void }) => <label className={`grid min-h-8 min-w-0 grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] items-stretch ${calculated ? "bg-calculated" : "bg-card"}`}><span className="flex items-center border-r bg-muted/50 px-2 py-1 text-[9px] uppercase leading-tight text-muted-foreground">{label}</span>{calculated ? <strong className="flex items-center px-2 font-mono text-[10px] text-calculated-foreground">{value}</strong> : <Input value={value} placeholder={placeholder} onChange={(event) => onChange?.(event.target.value)} className="h-8 min-w-0 rounded-none border-0 bg-transparent px-2 py-1 font-mono text-[10px] shadow-none focus-visible:ring-0" />}</label>;
const HydrometerInput = ({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) => <RecordField label={label} value={value} onChange={onChange} />;

export default GradingTest;
