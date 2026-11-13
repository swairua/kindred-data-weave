import { useState, useMemo, useEffect } from "react";
import TestSection from "@/components/TestSection";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import CalculatedInput from "@/components/CalculatedInput";
import { Plus, X } from "lucide-react";
import { useProject } from "@/context/ProjectContext";
import { generateTestPDF, printPDFDocument } from "@/lib/pdfGenerator";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { Label } from "@/components/ui/label";
import { useTestReport } from "@/hooks/useTestReport";
import { captureChartAsBase64 } from "@/lib/chartCapture";
import { loadTestResult, saveTestResult } from "@/lib/testResultPersistence";
import {
  REQUIRED_READINGS,
  calculateSchmidtRows,
  evaluateSchmidtRow,
  type SchmidtCalibration,
  type SchmidtRow,
} from "@/lib/schmidtCalculations";

interface SavedPayload {
  rows: SchmidtRow[];
  testedBy?: string;
  dateTested?: string;
  orientation?: string;
  surfaceCondition?: string;
  anvilCalibration?: string;
  carbonationDepth?: string;
  calibrationSlope?: string;
  calibrationIntercept?: string;
}

const ORIENTATIONS = ["Horizontal (perpendicular to surface)", "Downward strike", "Upward strike", "Vertical"] as const;
const SURFACES = ["Smooth (trowelled / formed)", "Rough or damaged", "Carbonated surface", "Polished / worn"] as const;

const emptyRow = (location: string): SchmidtRow => ({ location, readings: Array.from({ length: REQUIRED_READINGS }, () => "") });

const normalizePayloadRows = (value: unknown): SchmidtRow[] => {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    if (item && typeof item === "object") {
      const source = item as Record<string, unknown>;
      // Legacy payload: { r1..r5 } fields or an incomplete readings array.
      const legacyReadingKeys = ["r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8", "r9", "r10"];
      const legacyReadings = legacyReadingKeys
        .map((key) => (typeof source[key] === "string" ? String(source[key]) : ""));
      const readings = Array.isArray(source.readings)
        ? legacyReadings.map((_, position) => String((source.readings as unknown[])[position] ?? legacyReadings[position] ?? ""))
        : legacyReadings;
      const padded = Array.from({ length: REQUIRED_READINGS }, (_value, position) => readings[position] ?? "");
      const location = typeof source.location === "string" && source.location.trim() !== "" ? source.location : `L${index + 1}`;
      return { location, readings: padded };
    }
    return emptyRow(`L${index + 1}`);
  });
};

const SchmidtHammerTest = ({ testKey = "schmidt" }: { testKey?: string }) => {
  const project = useProject();
  const isRock = testKey === "schmidt_rock";
  const testName = isRock ? "Schmidt Hammer" : "NDT (Rebound Hammer)";
  const standard = isRock ? "ASTM D5873" : "BS EN 12504-2 / ASTM C805";
  const chartId = isRock ? "schmidt-rock-chart" : "schmidt-chart";
  const [rows, setRows] = useState<SchmidtRow[]>([emptyRow("L1")]);
  const [testedBy, setTestedBy] = useState("");
  const [dateTested, setDateTested] = useState("");
  const [orientation, setOrientation] = useState("");
  const [surfaceCondition, setSurfaceCondition] = useState("");
  const [anvilCalibration, setAnvilCalibration] = useState("");
  const [carbonationDepth, setCarbonationDepth] = useState("");
  const [calibrationSlope, setCalibrationSlope] = useState("");
  const [calibrationIntercept, setCalibrationIntercept] = useState("");
  const projectId = project.currentProjectId ?? null;
  const [recordId, setRecordId] = useState<number | null>(null);
  const [isSaved, setIsSaved] = useState(false);

  const calibration: SchmidtCalibration | null = useMemo(() => {
    const slope = Number(calibrationSlope);
    const intercept = Number(calibrationIntercept);
    if (calibrationSlope.trim() !== "" && calibrationIntercept.trim() !== "" && Number.isFinite(slope) && Number.isFinite(intercept)) {
      return { slope, intercept };
    }
    return null;
  }, [calibrationSlope, calibrationIntercept]);

  // Evaluate each row against the outlier rule WITHOUT disturbing empty rows.
  const rowStates = useMemo(() => rows.map((row) => evaluateSchmidtRow(row)), [rows]);
  const conformingRows = useMemo(() => rowStates.filter((state) => state?.conformity.valid).length, [rowStates]);
  const startedRows = useMemo(() => rowStates.filter((state) => state !== null).length, [rowStates]);
  const rowsPlanned = rows.length;
  const documentationComplete = orientation !== "" && surfaceCondition !== "" && anvilCalibration.trim() !== "";
  const hasStartedRow = rows.some((row) => row.readings.some((value) => value.trim() !== "") || row.location.trim() !== "");
  const allConforming = rowsPlanned > 0 && conformingRows === rowsPlanned;
  const status: "not-started" | "in-progress" | "completed" = !hasStartedRow ? "not-started" : (allConforming && documentationComplete ? "completed" : "in-progress");

  const calculations = useMemo(() => calculateSchmidtRows(rows, calibration), [rows, calibration]);
  const allAvgRebounds = calculations.map((row) => row.avgRebound);
  const avgRebound = allAvgRebounds.length ? (allAvgRebounds.reduce((sum, value) => sum + value, 0) / allAvgRebounds.length).toFixed(1) : "";
  const avgEstimated = calculations.length && calibration
    ? (calculations.reduce((sum, row) => sum + (row.estimatedStrength ?? 0), 0) / calculations.length).toFixed(1)
    : null;

  const chartData = useMemo(() =>
    rows
      .map((row, index) => ({ name: row.location || "—", calc: rowStates[index], index }))
      .filter((item) => item.calc !== null)
      .map((item) => ({
        name: item.name,
        rebound: Number(item.calc!.avgRebound.toFixed(1)),
        strength: item.calc!.estimatedStrength !== null ? Number(item.calc!.estimatedStrength.toFixed(1)) : 0,
      })),
    [rows, rowStates]
  );
  const chartConfig = { rebound: { label: "Avg Rebound", color: "hsl(var(--primary))" }, strength: { label: "Est. Strength (MPa)", color: "hsl(var(--accent-foreground))" } };

  const results = useMemo(() => ([
    { label: "Avg Rebound", value: avgRebound || "" },
    ...(calibration && avgEstimated !== null ? [{ label: "Est. Strength", value: `${avgEstimated} MPa` }] : []),
  ]), [avgRebound, avgEstimated, calibration]);
  useTestReport(testKey, conformingRows, results, status, rows.filter((row) => row.readings.some((value) => value.trim() !== "")).length);

  useEffect(() => {
    if (!projectId) return;
    let active = true;
    loadTestResult(projectId, testKey)
      .then((result) => {
        if (!active || !result) return;
        setRecordId(result.id);
        setIsSaved(true);
        const payload: Partial<SavedPayload> = (result.payload_json as SavedPayload | null) ?? {};
        if (payload.rows) {
          const normalized = normalizePayloadRows(payload.rows);
          if (normalized.length > 0) setRows(normalized);
        }
        if (payload.testedBy) setTestedBy(payload.testedBy);
        if (payload.dateTested) setDateTested(payload.dateTested);
        if (payload.orientation) setOrientation(payload.orientation);
        if (payload.surfaceCondition) setSurfaceCondition(payload.surfaceCondition);
        if (payload.anvilCalibration) setAnvilCalibration(payload.anvilCalibration);
        if (payload.carbonationDepth) setCarbonationDepth(payload.carbonationDepth);
        if (payload.calibrationSlope) setCalibrationSlope(payload.calibrationSlope);
        if (payload.calibrationIntercept) setCalibrationIntercept(payload.calibrationIntercept);
      })
      .catch((error) => console.error(`Failed to load ${testName} result`, error));
    return () => { active = false; };
  }, [projectId, testKey, testName]);

  const save = async () => {
    if (!projectId) throw new Error(`Select a project before saving this ${testName} test`);
    const savedId = await saveTestResult(projectId, recordId, {
      test_key: testKey,
      name: testName,
      category: isRock ? "rock" : "concrete",
      status,
      data_points: conformingRows,
      key_results_json: results.filter((result) => result.value),
      payload_json: { rows, testedBy, dateTested, orientation, surfaceCondition, anvilCalibration, carbonationDepth, calibrationSlope, calibrationIntercept },
    });
    setRecordId(savedId);
    setIsSaved(true);
  };

  const update = (index: number, field: keyof SchmidtRow, value: string) => {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  };

  const updateReading = (index: number, readingIndex: number, value: string) => {
    setRows((current) => current.map((row, i) => {
      if (i !== index) return row;
      const readings = [...row.readings];
      readings[readingIndex] = value;
      return { ...row, readings };
    }));
  };

  const missingForCompletion = [
    allConforming ? null : "each row needs 10 valid readings with no more than 2 discarded",
    documentationComplete ? null : "orientation, surface condition and anvil calibration",
  ].filter((item) => item !== null);

  const buildPDF = async (skipDownload: boolean) => {
    let chartImages = {};
    if (chartData.length >= 1) {
      const chartBase64 = await captureChartAsBase64(chartId);
      if (chartBase64) {
        chartImages = { "Rebound & Estimated Strength": chartBase64 };
      }
    }

    const conformStatement = status === "completed"
      ? `Procedure performed and readings conform to ${standard}. Rebound number indicates surface hardness only; verify compressive strength by core/cube test.`
      : `NOT REPORTABLE - test is not complete or conforms to neither ${standard} nor house procedure (missing: ${missingForCompletion.join("; ")}). Results are indicative only and must be verified by core/cube test.`;

    const fields = [
      { label: "Avg Rebound", value: avgRebound || "—" },
      { label: "Est. Strength", value: calibration && avgEstimated ? `${avgEstimated} MPa` : "Not estimated" },
      { label: "Orientation", value: orientation || "Not recorded" },
      { label: "Surface condition", value: surfaceCondition || "Not recorded" },
      { label: "Anvil calibration", value: anvilCalibration || "Not recorded" },
      { label: "Carbonation depth", value: carbonationDepth ? `${carbonationDepth} mm` : "Not determined" },
      { label: "Strength correlation", value: calibration ? `fc = ${calibration.slope}·R ${calibration.intercept >= 0 ? "+" : "−"} ${Math.abs(calibration.intercept)} MPa` : "Not used" },
      { label: "Conformance", value: status === "completed" ? `Conforms (${standard})` : "Non-conforming" },
    ];

    const tableData = {
      title: "Readings per location",
      headers: ["Location", ...Array.from({ length: REQUIRED_READINGS }, (_value, i) => `R${i + 1}`), "Readings", "Avg R", "Discarded", "Est. MPa"],
      rows: rows.map((row, index) => {
        const state = rowStates[index];
        const avg = state?.avgRebound.toFixed(1) ?? "";
        const discarded = state && state.discardedIndexes.length > 0 ? state.discardedIndexes.map((i) => `R${i + 1}`).join(", ") : "—";
        const est = state?.estimatedStrength !== null && state?.estimatedStrength !== undefined ? state.estimatedStrength.toFixed(1) : "—";
        return [
          row.location,
          ...row.readings.map((value) => value || "—"),
          state ? `${state.conformity.retainedCount}/${REQUIRED_READINGS}` : "0/10",
          avg || "—",
          discarded,
          est,
        ];
      }),
    };

    const validityTable = {
      title: "Validity statement",
      headers: ["Assessment"],
      rows: [[conformStatement]],
    };

    return generateTestPDF({
      title: testName,
      standard,
      ...project,
      dateTested: dateTested || project.projectDate,
      testedBy,
      fields,
      skipDownload,
      tables: [tableData, validityTable],
      chartImages,
    });
  };

  const exportPDF = async () => {
    await buildPDF(false);
  };

  const printPDF = async () => printPDFDocument(await buildPDF(true));

  const canExport = !!projectId || isSaved;

  return (
    <TestSection title={testName} testKey={testKey} onSave={save} onClear={() => { setRows([emptyRow("L1")]); setTestedBy(""); setDateTested(""); setOrientation(""); setSurfaceCondition(""); setAnvilCalibration(""); setCarbonationDepth(""); setCalibrationSlope(""); setCalibrationIntercept(""); }} onExportPDF={exportPDF} onPrint={printPDF} canExport={canExport}>

      {/* Equipment & method - all four are required for a completed test. */}
      <div className="mb-4 rounded-md border p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Equipment &amp; method</span>
          <span className="text-[10px] text-muted-foreground">all three required to complete the test</span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground" htmlFor="schmidt-orientation">Impact orientation</label>
            <select
              id="schmidt-orientation"
              value={orientation}
              onChange={(event) => setOrientation(event.target.value)}
              className="record-input h-9 w-full rounded-md border bg-background px-2 text-sm"
            >
              <option value="">Select…</option>
              {ORIENTATIONS.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground" htmlFor="schmidt-surface">Surface condition</label>
            <select
              id="schmidt-surface"
              value={surfaceCondition}
              onChange={(event) => setSurfaceCondition(event.target.value)}
              className="record-input h-9 w-full rounded-md border bg-background px-2 text-sm"
            >
              <option value="">Select…</option>
              {SURFACES.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground" htmlFor="schmidt-anvil">Anvil calibration</label>
            <Input
              id="schmidt-anvil"
              value={anvilCalibration}
              onChange={(event) => setAnvilCalibration(event.target.value)}
              placeholder="e.g. 58 (hammer against anvil)"
              className="h-9"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground" htmlFor="schmidt-carbonation">Carbonation depth (mm)</label>
            <Input
              id="schmidt-carbonation"
              type="number"
              min="0"
              step="0.5"
              value={carbonationDepth}
              onChange={(event) => setCarbonationDepth(event.target.value)}
              placeholder="Not determined"
              className="h-9"
            />
          </div>
        </div>
      </div>

      {/* Strength estimation is opt-in, never assumed. */}
      <div className="mb-4 rounded-md border p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Strength correlation (optional)</span>
          <span className="text-[10px] text-muted-foreground">leave blank to report rebound numbers only</span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground" htmlFor="schmidt-slope">Slope (MPa per rebound)</label>
            <Input id="schmidt-slope" type="number" step="any" value={calibrationSlope} onChange={(event) => setCalibrationSlope(event.target.value)} placeholder="e.g. 1.2" className="h-9" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground" htmlFor="schmidt-intercept">Intercept (MPa)</label>
            <Input id="schmidt-intercept" type="number" step="any" value={calibrationIntercept} onChange={(event) => setCalibrationIntercept(event.target.value)} placeholder="e.g. -13.5" className="h-9" />
          </div>
          <p className="self-end text-[10px] leading-snug text-muted-foreground">A rebound number alone is not a strength value. Estimate only with a correlation established on this concrete (core/cube), per BS EN 12504-2 / ASTM C805.</p>
        </div>
      </div>

      {/* Readings */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b"><th className="text-left py-2 px-2 font-medium text-muted-foreground">Location</th>{Array.from({ length: REQUIRED_READINGS }, (_value, i) => <th key={i} className="w-14 text-left py-2 px-2 font-medium text-muted-foreground">R{i + 1}</th>)}<th className="w-16 text-left py-2 px-2 font-medium text-muted-foreground">Avg R</th><th className="w-20 text-left py-2 px-2 font-medium text-muted-foreground">Discarded</th><th className="w-20 text-left py-2 px-2 font-medium text-muted-foreground">Est. MPa</th><th className="w-10"></th></tr></thead>
          <tbody>
            {rows.map((row, i) => {
              const state = rowStates[i];
              const discardedSet = new Set(state?.discardedIndexes ?? []);
              const avg = state ? state.avgRebound.toFixed(1) : "";
              const est = state?.estimatedStrength !== null && state?.estimatedStrength !== undefined ? state.estimatedStrength.toFixed(1) : "";
              return (
                <tr key={i} className="border-b border-border/50 align-middle">
                  <td className="py-1.5 px-2"><Input value={row.location} onChange={(event) => update(i, "location", event.target.value)} className="h-8" /></td>
                  {row.readings.map((value, readingIndex) => (
                    <td key={readingIndex} className="py-1.5 px-1">
                      <Input
                        type="number"
                        min="0"
                        value={value}
                        onChange={(event) => updateReading(i, readingIndex, event.target.value)}
                        className={`h-8 w-14 px-1.5 text-center ${discardedSet.has(readingIndex) ? "border-amber-500 bg-amber-50 text-amber-900" : ""}`}
                        placeholder="0"
                        aria-label={`R${readingIndex + 1}, point ${i + 1}`}
                      />
                    </td>
                  ))}
                  <td className="py-1.5 px-2"><CalculatedInput value={avg} /></td>
                  <td className="py-1.5 px-2 text-xs">{state && state.discardedIndexes.length > 0 ? state.discardedIndexes.map((index) => `R${index + 1}`).join(", ") : "—"}</td>
                  <td className="py-1.5 px-2"><CalculatedInput value={est} /></td>
                  <td className="py-1.5 px-1"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setRows(rows.filter((_, j) => j !== i))}><X className="h-3.5 w-3.5" /></Button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!allConforming && hasStartedRow && (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-snug text-amber-800">
          <strong>Not complete:</strong> each test area needs 10 valid readings with at most 2 discarded ({missingForCompletion.length > 0 ? `missing: ${missingForCompletion.join("; ")}` : ""}).
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 mt-3">
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">Tested By</label>
          <Input value={testedBy} onChange={(e) => setTestedBy(e.target.value)} placeholder="Technician name" className="h-8" />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">Date Tested</label>
          <Input type="date" value={dateTested} onChange={(e) => setDateTested(e.target.value)} className="h-8" />
        </div>
      </div>
      <Button variant="outline" size="sm" className="mt-3" onClick={() => setRows([...rows, emptyRow(`L${rows.length + 1}`)])}><Plus className="h-3.5 w-3.5 mr-1" /> Add Row</Button>

      {chartData.length >= 1 && (
        <div className="mt-6">
          <Label className="text-xs text-muted-foreground mb-2 block">Rebound &amp; Estimated Strength</Label>
          <ChartContainer id={chartId} config={chartConfig} className="h-[300px] w-full">
            <BarChart data={chartData} margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" label={{ value: "Location", position: "insideBottom", offset: -10, className: "fill-muted-foreground text-xs" }} />
              <YAxis label={{ value: "Value", angle: -90, position: "insideLeft", offset: 5, className: "fill-muted-foreground text-xs" }} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="rebound" name="rebound" fill="var(--color-rebound)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="strength" name="strength" fill="var(--color-strength)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </div>
      )}
    </TestSection>
  );
};

export default SchmidtHammerTest;
