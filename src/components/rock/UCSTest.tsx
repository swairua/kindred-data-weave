import { useState, useMemo, useEffect } from "react";
import TestSection from "@/components/TestSection";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import CalculatedInput from "@/components/CalculatedInput";
import { Plus, X } from "lucide-react";
import { useProject } from "@/context/ProjectContext";
import { generateTestPDF, printPDFDocument } from "@/lib/pdfGenerator";
import { useTestReport } from "@/hooks/useTestReport";
import { loadTestResult, saveTestResult } from "@/lib/testResultPersistence";
import {
  MIN_SPECIMENS,
  MAX_SPECIMENS,
  assessConformity,
  calculateSpecimen,
  type UCSSpecimenRow,
  type UCSMethodInput,
} from "@/lib/ucsCalculations";

interface SavedPayload {
  rows: UCSSpecimenRow[];
  testedBy?: string;
  dateTested?: string;
  orientationToBedding?: string;
  stressRate?: string;
  failureMode?: string;
  flatEnds?: string;
}

const ORIENTATIONS = ["Parallel to bedding plane", "Perpendicular to bedding plane", "Not specified"] as const;
const FAILURE_MODES = ["Through midsection", "Through ends (invalid per ISRM SM)", "Pent-knife shear", "Other"] as const;
const FLAT_END_OPTIONS = ["pass", "fail", "not recorded yet"] as const;

const emptyRow = (sampleId: string): UCSSpecimenRow => ({ sampleId, diameter: "", length: "", load: "" });

const normalizePayloadRows = (value: unknown): UCSSpecimenRow[] => {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    if (item && typeof item === "object") {
      const source = item as Record<string, unknown>;
      // Legacy payload stored { sampleId, load, area } - derive diameter from area where possible.
      const load = String(source.load ?? "");
      const area = source.area;
      const diameter = typeof area === "number" ? String(Math.sqrt((4 * (area as number)) / Math.PI).toFixed(1))
        : (typeof area === "string" && area.trim() !== "" && Number.isFinite(Number(area)) ? String(Math.sqrt((4 * Number(area)) / Math.PI).toFixed(1)) : "");
      const sampleId = typeof source.sampleId === "string" && source.sampleId.trim() !== "" ? source.sampleId : `R${index + 1}`;
      return { sampleId, diameter, length: "", load };
    }
    return emptyRow(`R${index + 1}`);
  });
};

const UCSTest = ({ testKey }: { testKey?: string }) => {
  const project = useProject();
  const key = testKey ?? "ucs";
  const [rows, setRows] = useState<UCSSpecimenRow[]>([emptyRow("R1")]);
  const [testedBy, setTestedBy] = useState("");
  const [dateTested, setDateTested] = useState("");
  const [orientationToBedding, setOrientationToBedding] = useState("");
  const [stressRate, setStressRate] = useState("");
  const [failureMode, setFailureMode] = useState("");
  const [flatEnds, setFlatEnds] = useState("not recorded yet");
  const [recordId, setRecordId] = useState<number | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const hasProjectSelected = !!project.currentProjectId;
  const projectId = project.currentProjectId ?? null;

  const method = useMemo<UCSMethodInput>(() => ({ orientationToBedding, stressRate, failureMode, flatEnds }), [orientationToBedding, stressRate, failureMode, flatEnds]);
  const assessment = useMemo(() => assessConformity(rows, method), [rows, method]);
  const specimens = assessment.specimenStrength;
  const stats = assessment.stats;
  const hasStartedRow = rows.some((row) => row.sampleId.trim() !== "" || row.load.trim() !== "" || row.diameter.trim() !== "" || row.length.trim() !== "");
  const status: "not-started" | "in-progress" | "completed" = !hasStartedRow
    ? "not-started"
    : (assessment.conformityValid ? "completed" : "in-progress");

  const results = useMemo(() => {
    if (!stats) return [{ label: "Avg UCS", value: "" }];
    return [
      { label: "Avg UCS", value: `${stats.mean.toFixed(2)} MPa` },
      { label: "Std dev", value: `${stats.standardDeviation.toFixed(2)} MPa` },
      { label: "Specimens", value: `${stats.count}` },
    ];
  }, [stats]);
  useTestReport(key, specimens.length, results, status, rows.filter((row) => row.sampleId.trim() !== "" || row.load.trim() !== "").length);

  useEffect(() => {
    if (!projectId) return;
    let active = true;
    loadTestResult(projectId, key)
      .then((result) => {
        if (!active || !result) return;
        setRecordId(result.id);
        setIsSaved(true);
        const payload: Partial<SavedPayload> = (result.payload_json as SavedPayload | null) ?? {};
        const normalized = payload.rows ? normalizePayloadRows(payload.rows) : [];
        if (normalized.length > 0) setRows(normalized);
        if (payload.testedBy) setTestedBy(payload.testedBy);
        if (payload.dateTested) setDateTested(payload.dateTested);
        if (payload.orientationToBedding) setOrientationToBedding(payload.orientationToBedding);
        if (payload.stressRate) setStressRate(payload.stressRate);
        if (payload.failureMode) setFailureMode(payload.failureMode);
        if (payload.flatEnds) setFlatEnds(payload.flatEnds);
      })
      .catch((error) => console.error("Failed to load UCS result", error));
    return () => { active = false; };
  }, [projectId, key]);

  const save = async () => {
    if (!projectId) throw new Error("Select a project before saving this UCS test");
    const savedId = await saveTestResult(projectId, recordId, {
      test_key: key,
      name: "UCS (Unconfined Compressive Strength)",
      category: "rock",
      status,
      data_points: specimens.length,
      key_results_json: results.filter((result) => result.value && result.value !== ""),
      payload_json: { rows, testedBy, dateTested, orientationToBedding, stressRate, failureMode, flatEnds },
    });
    setRecordId(savedId);
    setIsSaved(true);
  };

  const update = (i: number, field: keyof UCSSpecimenRow, val: string) => {
    setRows((current) => current.map((row, index) => (index === i ? { ...row, [field]: val } : row)));
  };

  const statsText = stats ? `${stats.mean.toFixed(2)} ± ${stats.standardDeviation.toFixed(2)} MPa (n=${stats.count}, COV = ${stats.coefficientOfVariation.toFixed(1)}%)` : "";
  const missingForCompletion = [
    specimens.length >= MIN_SPECIMENS ? null : `at least ${MIN_SPECIMENS} valid specimens required`,
    method.flatEnds === "pass" ? null : "confirm flat, parallel and polished specimen end surfaces",
    assessment.warnings.length > 0 ? "see warnings below" : null,
  ].filter((item) => item !== null);

  const buildPDF = (skipDownload: boolean) => generateTestPDF({
    title: "UCS (Unconfined Compressive Strength)",
    standard: "ISRM SM (2007) / ASTM D7012-14",
    ...project,
    dateTested: dateTested || project.projectDate,
    testedBy,
    compactSummary: true,
    fields: [
      { label: "Avg UCS", value: stats ? `${stats.mean.toFixed(2)} MPa` : "—" },
      { label: "Std. dev.", value: stats ? `${stats.standardDeviation.toFixed(2)} MPa` : "—" },
      { label: "COV", value: stats ? `${stats.coefficientOfVariation.toFixed(1)}%` : "—" },
      { label: "Specimens", value: `${specimens.length}` },
      { label: "Orientation to bedding", value: orientationToBedding || "Not recorded" },
      { label: "Stress rate", value: stressRate ? `${stressRate} MPa/s` : "Not recorded" },
      { label: "Failure mode", value: failureMode || "Not recorded" },
      { label: "Specimen ends", value: method.flatEnds || "Not recorded" },
      { label: "Conformance", value: assessment.conformityValid ? "Conforms (ISRM SM 2007)" : "Non-conforming" },
    ],
    tables: [
      {
        title: "Specimens and results",
        headers: ["Sample ID", "d (mm)", "L (mm)", "L/D", "Load (kN)", "Area (mm²)", "Strength (MPa)"],
        rows: specimens.map((specimen) => [
          specimen.sampleId,
          specimen.diameter.toFixed(1),
          specimen.length.toFixed(1),
          specimen.ldRatio.toFixed(2),
          specimen.load.toFixed(1),
          specimen.area.toFixed(0),
          specimen.strength.toFixed(2),
        ]),
      },
      {
        title: "Validity statement",
        headers: ["Assessment"],
        rows: [[assessment.conformityValid
          ? "Procedure performed and specimens meet ISRM SM (2007) requirements. Results indicate compressive strength of the sampled material; support with complementary laboratory tests for higher confidence classes."
          : `NOT REPORTABLE - test is not complete or conforms to neither ISRM SM nor house procedure (missing: ${missingForCompletion.join("; ")}). Results are indicative only and must be verified by complementary laboratory tests.`]],
      },
    ],
    skipDownload,
  });

  const exportPDF = async () => {
    await buildPDF(false);
  };

  const printPDF = async () => printPDFDocument(await buildPDF(true));

  const canExport = !!projectId || isSaved;

  return (
    <TestSection title="UCS (Unconfined Compressive Strength)" testKey={key} onSave={save} onClear={() => { setRows([emptyRow("R1")]); setTestedBy(""); setDateTested(""); setOrientationToBedding(""); setStressRate(""); setFailureMode(""); setFlatEnds("not recorded yet"); }} onExportPDF={exportPDF} onPrint={printPDF} canExport={canExport}>
      {!hasProjectSelected && rows.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <p className="text-sm text-muted-foreground mb-2">No project selected</p>
            <p className="text-xs text-muted-foreground">Select an existing project or create a new one to begin testing</p>
          </div>
        </div>
      ) : (
        <>
          {/* Method documentation - required for a conforming test. */}
          <div className="mb-4 rounded-md border p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Method &amp; documentation</span>
              <span className="text-[10px] text-muted-foreground">required for a completed test</span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground" htmlFor="ucs-orientation">Orientation to bedding</label>
                <select id="ucs-orientation" value={orientationToBedding} onChange={(event) => setOrientationToBedding(event.target.value)} className="record-input h-9 w-full rounded-md border bg-background px-2 text-sm">
                  <option value="">Select…</option>
                  {ORIENTATIONS.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground" htmlFor="ucs-stress-rate">Stress rate (MPa/s)</label>
                <Input id="ucs-stress-rate" type="number" min="0" step="0.1" value={stressRate} onChange={(event) => setStressRate(event.target.value)} placeholder="0.5 – 1.0" className="h-9" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground" htmlFor="ucs-failure-mode">Failure mode</label>
                <select id="ucs-failure-mode" value={failureMode} onChange={(event) => setFailureMode(event.target.value)} className="record-input h-9 w-full rounded-md border bg-background px-2 text-sm">
                  <option value="">Select…</option>
                  {FAILURE_MODES.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground" htmlFor="ucs-flat-ends">Specimen ends</label>
                <select id="ucs-flat-ends" value={flatEnds} onChange={(event) => setFlatEnds(event.target.value)} className="record-input h-9 w-full rounded-md border bg-background px-2 text-sm">
                  {FLAT_END_OPTIONS.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b"><th className="text-left py-2 px-2 font-medium text-muted-foreground">Sample ID</th><th className="text-left py-2 px-2 font-medium text-muted-foreground">d (mm)</th><th className="text-left py-2 px-2 font-medium text-muted-foreground">L (mm)</th><th className="text-left py-2 px-2 font-medium text-muted-foreground">L/D</th><th className="text-left py-2 px-2 font-medium text-muted-foreground">Load (kN)</th><th className="text-left py-2 px-2 font-medium text-muted-foreground">Area (mm²)</th><th className="text-left py-2 px-2 font-medium text-muted-foreground">Strength (MPa)</th><th className="w-10"></th></tr></thead>
              <tbody>
                {rows.map((row, i) => {
                  const specimen = calculateSpecimen(row);
                  return (
                    <tr key={i} className="border-b border-border/50">
                      <td className="py-1.5 px-2"><Input value={row.sampleId} onChange={(event) => update(i, "sampleId", event.target.value)} className="h-8" /></td>
                      <td className="py-1.5 px-2"><Input type="number" min="0" step="0.1" value={row.diameter} onChange={(event) => update(i, "diameter", event.target.value)} className="h-8" placeholder="" aria-label={`Diameter, point ${i + 1}`} /></td>
                      <td className="py-1.5 px-2"><Input type="number" min="0" step="0.1" value={row.length} onChange={(event) => update(i, "length", event.target.value)} className="h-8" placeholder="" aria-label={`Length, point ${i + 1}`} /></td>
                      <td className="py-1.5 px-2"><CalculatedInput value={specimen ? specimen.ldRatio.toFixed(2) : ""} /></td>
                      <td className="py-1.5 px-2"><Input type="number" min="0" step="0.1" value={row.load} onChange={(event) => update(i, "load", event.target.value)} className="h-8" placeholder="0" aria-label={`Load, point ${i + 1}`} /></td>
                      <td className="py-1.5 px-2"><CalculatedInput value={specimen ? specimen.area.toFixed(0) : ""} /></td>
                      <td className="py-1.5 px-2"><CalculatedInput value={specimen ? specimen.strength.toFixed(2) : ""} /></td>
                      <td className="py-1.5 px-1"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setRows(rows.filter((_, j) => j !== i))}><X className="h-3.5 w-3.5" /></Button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {rows.length < MAX_SPECIMENS && (
            <Button variant="outline" size="sm" className="mt-2" onClick={() => setRows([...rows, emptyRow(`R${rows.length + 1}`)])}><Plus className="h-3.5 w-3.5 mr-1" /> Add Specimen</Button>
          )}

          {statsText && <p className="mt-2 text-xs text-muted-foreground font-mono">{statsText}</p>}

          {assessment.warnings.length > 0 && (
            <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-snug text-amber-800">
              <strong>Warnings:</strong>
              <ul className="mt-1 list-disc pl-5">
                {assessment.warnings.map((warning, index) => <li key={index}>{warning}</li>)}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 mt-3">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Tested By</label>
              <Input value={testedBy} onChange={(event) => setTestedBy(event.target.value)} placeholder="Technician name" className="h-8" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Date Tested</label>
              <Input type="date" value={dateTested} onChange={(event) => setDateTested(event.target.value)} className="h-8" />
            </div>
          </div>
        </>
      )}
    </TestSection>
  );
};

export default UCSTest;
