import { useState, useMemo, useEffect } from "react";
import TestSection from "@/components/TestSection";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, X } from "lucide-react";
import { useProject } from "@/context/ProjectContext";
import { generateTestPDF, printPDFDocument } from "@/lib/pdfGenerator";
import { useTestReport } from "@/hooks/useTestReport";
import { loadTestResult, saveTestResult } from "@/lib/testResultPersistence";
import { useGridArrowNavigation } from "@/hooks/useGridArrowNavigation";
import { rederiveCptRow, type CptRow } from "@/lib/cptCalculations";

interface SavedPayload {
  rows: CptRow[];
  testedBy?: string;
  dateTested?: string;
}

const CPTTest = ({ testKey }: { testKey?: string }) => {
  const project = useProject();
  const gridNav = useGridArrowNavigation<HTMLTableElement>();
  const [rows, setRows] = useState<CptRow[]>([{ depth: "", coneResistance: "", sleeveFriction: "", frictionRatio: "", soilClass: "" }]);
  const [testedBy, setTestedBy] = useState("");
  const [dateTested, setDateTested] = useState("");
  const projectId = project.currentProjectId ?? null;
  const [recordId, setRecordId] = useState<number | null>(null);
  const [isSaved, setIsSaved] = useState(false);

  const update = (i: number, field: keyof CptRow, val: string) => {
    const next = [...rows];
    // Re-derive friction ratio and soil classification from the raw inputs
    // (depth, qc, fs) on every edit, so the derived columns are always live.
    next[i] = rederiveCptRow({ ...next[i], [field]: val });
    setRows(next);
  };

  const filledCPT = rows.filter(r => r.depth && r.coneResistance).length;
  const cptResults = useMemo(() => {
    const qcValues = rows.map(r => parseFloat(r.coneResistance)).filter((v) => Number.isFinite(v) && v > 0);
    const maxQc = qcValues.length ? Math.max(...qcValues).toFixed(1) : "";
    const rfValues = rows.map(r => parseFloat(r.frictionRatio ?? "")).filter((v) => Number.isFinite(v));
    const avgRf = rfValues.length ? (rfValues.reduce((a, b) => a + b, 0) / rfValues.length).toFixed(2) : "";
    // Dominant soil = most frequent Robertson classification among classified rows.
    const counts = new Map<string, number>();
    for (const r of rows) {
      if (r.soilClass) counts.set(r.soilClass, (counts.get(r.soilClass) ?? 0) + 1);
    }
    let dominant = "";
    let best = 0;
    for (const [name, n] of counts) {
      if (n > best) { best = n; dominant = name; }
    }
    return [
      { label: "Max qc", value: maxQc ? `${maxQc} MPa` : "" },
      { label: "Avg Rf", value: avgRf ? `${avgRf} %` : "" },
      { label: "Dominant Soil", value: dominant },
    ];
  }, [rows]);
  useTestReport("cpt", filledCPT, cptResults);

  useEffect(() => {
    if (!projectId) return;
    let active = true;
    loadTestResult(projectId, "cpt")
      .then((result) => {
        if (!active || !result) return;
        setRecordId(result.id);
        setIsSaved(true);
        const payload: Partial<SavedPayload> = (result.payload_json as SavedPayload | null) ?? {};
        if (Array.isArray(payload.rows) && payload.rows.length > 0) {
          // Rows saved before the fs/Rf split (including the production dump,
          // which stored sleeve friction under the "frictionRatio" key) only
          // carry raw readings - recompute the derived columns on load so
          // they are never blank.
          setRows(payload.rows.map((row) => {
            const normalized: CptRow = {
              ...row,
              sleeveFriction: row.sleeveFriction ?? row.frictionRatio ?? "",
            };
            return rederiveCptRow(normalized);
          }));
        }
        if (payload.testedBy) setTestedBy(payload.testedBy);
        if (payload.dateTested) setDateTested(payload.dateTested);
      })
      .catch((error) => console.error("Failed to load CPT result", error));
    return () => { active = false; };
  }, [projectId]);

  const save = async () => {
    if (!projectId) throw new Error("Select a project before saving this CPT test");
    const savedId = await saveTestResult(projectId, recordId, {
      test_key: "cpt",
      name: "CPT (Cone Penetration Test)",
      category: "soil",
      status: filledCPT === 0 ? "not-started" : filledCPT < rows.length ? "in-progress" : "completed",
      data_points: filledCPT,
      key_results_json: cptResults.filter((result) => result.value),
      payload_json: { rows, testedBy, dateTested },
    });
    setRecordId(savedId);
    setIsSaved(true);
  };

  const buildPDF = (skipDownload: boolean) => {
    const fields = [
      { label: "Max Cone Resistance", value: cptResults[0].value || "—" },
      { label: "Avg Friction Ratio", value: cptResults[1].value || "—" },
      { label: "Dominant Soil Class", value: cptResults[2].value || "—" },
    ];
    return generateTestPDF({
      title: "CPT (Cone Penetration Test)",
      standard: "ISO 22476-1",
      ...project,
      dateTested: dateTested || project.projectDate,
      testedBy,
      compactSummary: true,
      fields,
      skipDownload,
      tables: [{
        headers: ["Depth (m)", "Cone Resistance qc (MPa)", "Sleeve Friction fs (kPa)", "Friction Ratio Rf (%)", "Soil Classification"],
        rows: rows.map(r => [r.depth || "—", r.coneResistance || "—", r.sleeveFriction || "—", r.frictionRatio || "—", r.soilClass || "—"])
      }]
    });
  };

  const exportPDF = async () => {
    await buildPDF(false);
  };

  const printPDF = async () => printPDFDocument(await buildPDF(true));

  const canExport = !!projectId || isSaved;

  return (
    <TestSection title="CPT (Cone Penetration Test)" testKey={testKey} onSave={save} onClear={() => { setRows([{ depth: "", coneResistance: "", sleeveFriction: "", frictionRatio: "", soilClass: "" }]); setTestedBy(""); setDateTested(""); }} onExportPDF={exportPDF} onPrint={printPDF} canExport={canExport}>
      <div className="overflow-x-auto">
        <table ref={gridNav.ref} onKeyDown={gridNav.onKeyDown} className="w-full text-sm">
          <thead><tr className="border-b"><th className="text-left py-2 px-2 font-medium text-muted-foreground">Depth (m)</th><th className="text-left py-2 px-2 font-medium text-muted-foreground">Cone Resistance qc (MPa)</th><th className="text-left py-2 px-2 font-medium text-muted-foreground">Sleeve Friction fs (kPa)</th><th className="text-left py-2 px-2 font-medium text-muted-foreground">Friction Ratio Rf (%)</th><th className="text-left py-2 px-2 font-medium text-muted-foreground">Soil Classification</th><th className="w-10"></th></tr></thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-border/50">
                <td className="py-1.5 px-2"><Input type="number" value={row.depth} onChange={(e) => update(i, "depth", e.target.value)} className="h-8" placeholder="0" /></td>
                <td className="py-1.5 px-2"><Input type="number" value={row.coneResistance} onChange={(e) => update(i, "coneResistance", e.target.value)} className="h-8" placeholder="0" /></td>
                <td className="py-1.5 px-2"><Input type="number" value={row.sleeveFriction} onChange={(e) => update(i, "sleeveFriction", e.target.value)} className="h-8" placeholder="0" /></td>
                <td className="py-1.5 px-2"><Input value={row.frictionRatio || ""} readOnly tabIndex={-1} className="h-8 bg-muted/50" /></td>
                <td className="py-1.5 px-2"><Input value={row.soilClass || ""} readOnly tabIndex={-1} className="h-8 bg-muted/50" /></td>
                <td className="py-1.5 px-1"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setRows(rows.filter((_, j) => j !== i))}><X className="h-3.5 w-3.5" /></Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
      <Button variant="outline" size="sm" className="mt-3" onClick={() => setRows([...rows, { depth: "", coneResistance: "", sleeveFriction: "" }])}><Plus className="h-3.5 w-3.5 mr-1" /> Add Row</Button>
    </TestSection>
  );
};

export default CPTTest;
