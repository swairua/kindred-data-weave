/**
 * Point Load Test component — ISRM SM (2007) / ASTM D5731-14.
 */
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
  calculatePointLoadIndex,
  assessConformity,
  calculatePointLoadRows,
  type PointLoadRow,
} from "@/lib/pointLoadCalculations";

interface SavedPayload {
  rows: PointLoadRow[];
  testedBy?: string;
  dateTested?: string;
  orientationToBedding?: string;
  specimenType?: string;
  remarks?: string;
}

const ORIENTATIONS = ["Parallel to bedding plane", "Perpendicular to bedding plane", "Not specified"] as const;
const SPECIMEN_TYPES = ["diametral core", "lumps (irregular)", "axial core", "blocks"] as const;
const emptyRow = (sampleId: string): PointLoadRow => ({ sampleId, specimenType: "diametral core", failureLoad: "", de: "" });

const normalizePayloadRows = (value: unknown): PointLoadRow[] => {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    if (item && typeof item === "object") {
      const source = item as Record<string, unknown>;
      const sampleId = typeof source.sampleId === "string" && source.sampleId.trim() !== "" ? source.sampleId : `P${index + 1}`;
      return {
        sampleId,
        specimenType: typeof source.specimenType === "string" && source.specimenType.trim() !== "" ? source.specimenType : "diametral core",
        failureLoad: typeof source.failureLoad === "string" ? source.failureLoad : String(source.failureLoad ?? ""),
        de: typeof source.de === "string" ? source.de : String(source.de ?? ""),
      };
    }
    return emptyRow(`P${index + 1}`);
  });
};

const PointLoadTest = ({ testKey }: { testKey?: string }) => {
  const project = useProject();
  const key = testKey ?? "pointload";
  const [rows, setRows] = useState<PointLoadRow[]>([emptyRow("P1")]);
  const [orientationToBedding, setOrientationToBedding] = useState("");
  const [remarks, setRemarks] = useState("");
  const [testedBy, setTestedBy] = useState("");
  const [dateTested, setDateTested] = useState("");
  const projectId = project.currentProjectId ?? null;
  const [recordId, setRecordId] = useState<number | null>(null);
  const [isSaved, setIsSaved] = useState(false);

  const method = useMemo(() => ({ orientationToBedding }), [orientationToBedding]);
  const assessment = useMemo(() => assessConformity(rows, method), [rows, method]);
  const specimenCalculations = assessment.specimenCalculations;
  const stats = assessment.stats;
  const hasStartedRow = rows.some((row) => row.sampleId.trim() !== "" || row.failureLoad.trim() !== "" || row.de.trim() !== "");
  const status: "not-started" | "in-progress" | "completed" = !hasStartedRow
    ? "not-started"
    : (assessment.conformityValid ? "completed" : "in-progress");

  const results = useMemo(() => {
    if (!stats) return [{ label: "Is(50)", value: "" }];
    return [
      { label: "Is(50)", value: `${stats.mean.toFixed(3)} MPa` },
      { label: "Is", value: `${stats.meanIs.toFixed(3)} MPa` },
      { label: "Specimens", value: `${stats.count}` },
    ];
  }, [stats]);
  useTestReport(key, specimenCalculations.length, results, status, rows.filter((row) => row.failureLoad.trim() !== "" || row.de.trim() !== "").length);

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
        if (payload.specimenType) {
          const specimenType = payload.specimenType;
          setRows((current) => current.map((row) => ({ ...row, specimenType: row.specimenType || specimenType })));
        }
        if (payload.remarks) setRemarks(payload.remarks);
      })
      .catch((error) => console.error("Failed to load point load result", error));
    return () => { active = false; };
  }, [projectId, key]);

  const save = async () => {
    if (!projectId) throw new Error("Select a project before saving this point load test");
    const savedId = await saveTestResult(projectId, recordId, {
      test_key: key,
      name: "Point Load Test",
      category: "rock",
      status,
      data_points: specimenCalculations.length,
      key_results_json: results.filter((result) => result.value && result.value !== ""),
      payload_json: { rows, testedBy, dateTested, orientationToBedding, remarks },
    });
    setRecordId(savedId);
    setIsSaved(true);
  };

  const update = (i: number, field: keyof PointLoadRow, val: string) => {
    setRows((current) => current.map((row, index) => (index === i ? { ...row, [field]: val } : row)));
  };

  const statsText = stats ? `${stats.mean.toFixed(3)} ± ${stats.standardDeviation.toFixed(3)} MPa (n=${stats.count}, COV = ${stats.coefficientOfVariation.toFixed(1)}%)` : "";
  const missingForCompletion = [
    specimenCalculations.length >= MIN_SPECIMENS ? null : `at least ${MIN_SPECIMENS} valid tests required`,
    method.orientationToBedding ? null : "orientation relative to bedding",
    assessment.warnings.length > 0 ? "see warnings" : null,
  ].filter((item) => item !== null);

  const buildPDF = (skipDownload: boolean) => generateTestPDF({
    title: "Point Load Test",
    standard: "ISRM SM (2007) / ASTM D5731-14",
    ...project,
    dateTested: dateTested || project.projectDate,
    testedBy,
    compactSummary: true,
    fields: [
      { label: "Is(50)", value: stats ? `${stats.mean.toFixed(3)} MPa` : "—" },
      { label: "Is", value: stats ? `${stats.meanIs.toFixed(3)} MPa` : "—" },
      { label: "Std. dev.", value: stats ? `${stats.standardDeviation.toFixed(3)} MPa` : "—" },
      { label: "COV", value: stats ? `${stats.coefficientOfVariation.toFixed(1)}%` : "—" },
      { label: "Specimens", value: `${specimenCalculations.length}` },
      { label: "Orientation to bedding", value: orientationToBedding || "Not recorded" },
      { label: "Specimen type", value: rows.length > 0 ? rows[0].specimenType : "Not recorded" },
      { label: "Conformance", value: assessment.conformityValid ? "Conforms (ISRM SM 2007)" : "Non-conforming" },
    ],
    tables: [
      {
        title: "Specimens and results",
        headers: ["Sample ID", "Type", "P (kN)", "De (mm)", "Is (MPa)", "Is(50) (MPa)"],
        rows: specimenCalculations.map((specimen) => [
          specimen.sampleId,
          specimen.specimenType,
          specimen.failureLoad.toFixed(2),
          specimen.de.toFixed(1),
          specimen.is.toFixed(3),
          specimen.is50.toFixed(3),
        ]),
      },
      {
        title: "Validity statement",
        headers: ["Assessment"],
        rows: [[assessment.conformityValid
          ? "Procedure performed and specimens meet ISRM SM (2007) requirements. Compare results only for similar rock lithologies; verify with laboratory unconfined compressive strength tests for design classes."
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
    <TestSection title="Point Load Test" testKey={key} onSave={save} onClear={() => { setRows([emptyRow("P1")]); setTestedBy(""); setDateTested(""); setOrientationToBedding(""); setRemarks(""); }} onExportPDF={exportPDF} onPrint={printPDF} canExport={canExport} actionsPlacement="footer">
      {/* Method documentation - required for a conforming test. */}
      <div className="mb-4 rounded-md border p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Method &amp; documentation</span>
          <span className="text-[10px] text-muted-foreground">required for a completed test</span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground" htmlFor="pl-orientation">Orientation to bedding</label>
            <select id="pl-orientation" value={orientationToBedding} onChange={(event) => setOrientationToBedding(event.target.value)} className="record-input h-9 w-full rounded-md border bg-background px-2 text-sm">
              <option value="">Select…</option>
              {ORIENTATIONS.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground" htmlFor="pl-remarks">Remarks</label>
            <Input id="pl-remarks" value={remarks} onChange={(event) => setRemarks(event.target.value)} placeholder="optional" className="h-9" />
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b"><th className="text-left py-2 px-2 font-medium text-muted-foreground">Sample ID</th><th className="text-left py-2 px-2 font-medium text-muted-foreground">Type</th><th className="text-left py-2 px-2 font-medium text-muted-foreground">P (kN)</th><th className="text-left py-2 px-2 font-medium text-muted-foreground">De (mm)</th><th className="text-left py-2 px-2 font-medium text-muted-foreground">Is (MPa)</th><th className="text-left py-2 px-2 font-medium text-muted-foreground">Is(50) (MPa)</th><th className="w-10"></th></tr></thead>
          <tbody>
            {rows.map((row, i) => {
              const specimen = specimenCalculations.find((s) => s.sampleId === (row.sampleId.trim() || `Spec`));
              const result = calculatePointLoadIndex(row.failureLoad, row.de);
              return (
                <tr key={i} className="border-b border-border/50">
                  <td className="py-1.5 px-2"><Input value={row.sampleId} onChange={(e) => update(i, "sampleId", e.target.value)} className="h-8" aria-label={`Sample ID, point ${i + 1}`} /></td>
                  <td className="py-1.5 px-2"><select className="record-input h-8 w-32 rounded-md border bg-background px-1.5 text-xs" value={row.specimenType} onChange={(e) => update(i, "specimenType", e.target.value)}>{SPECIMEN_TYPES.map((value) => <option key={value} value={value}>{value}</option>)}</select></td>
                  <td className="py-1.5 px-2"><Input type="number" min="0" step="0.01" value={row.failureLoad} onChange={(e) => update(i, "failureLoad", e.target.value)} className="h-8" placeholder="0" aria-label={`Load, point ${i + 1}`} /></td>
                  <td className="py-1.5 px-2"><Input type="number" min="0" step="0.1" value={row.de} onChange={(e) => update(i, "de", e.target.value)} className="h-8" placeholder="0" aria-label={`De, point ${i + 1}`} /></td>
                  <td className="py-1.5 px-2"><CalculatedInput value={result ? result.is.toFixed(3) : ""} /></td>
                  <td className="py-1.5 px-2"><CalculatedInput value={result ? result.is50.toFixed(3) : ""} /></td>
                  <td className="py-1.5 px-1"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setRows(rows.filter((_, j) => j !== i))}><X className="h-3.5 w-3.5" /></Button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Button variant="outline" size="sm" className="mt-2" onClick={() => setRows([...rows, emptyRow(`P${rows.length + 1}`)])}><Plus className="h-3.5 w-3.5 mr-1" /> Add Specimen</Button>

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
          <Input value={testedBy} onChange={(e) => setTestedBy(e.target.value)} placeholder="Technician name" className="h-8" />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">Date Tested</label>
          <Input type="date" value={dateTested} onChange={(e) => setDateTested(e.target.value)} className="h-8" />
        </div>
      </div>
    </TestSection>
  );
};

export default PointLoadTest;
