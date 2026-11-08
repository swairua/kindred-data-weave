import { useState, useMemo, useEffect } from "react";
import TestSection from "@/components/TestSection";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, X } from "lucide-react";
import { useProject } from "@/context/ProjectContext";
import { generateTestPDF, printPDFDocument } from "@/lib/pdfGenerator";
import { useTestReport } from "@/hooks/useTestReport";
import { loadTestResult, saveTestResult } from "@/lib/testResultPersistence";

interface Row { depth: string; coneResistance: string; frictionRatio: string; soilClass?: string }

interface SavedPayload {
  rows: Row[];
  testedBy?: string;
  dateTested?: string;
}

// Robertson chart soil classification (simplified)
const classifySoilRobertson = (qc: number, fr: number): string => {
  // fr in %, qc in MPa
  // Simplified Robertson chart boundaries
  if (qc > 10 && fr < 1) return "Sand";
  if (qc > 5 && qc <= 10 && fr < 1.5) return "Sand to Silty Sand";
  if (qc > 2 && qc <= 5 && fr < 2) return "Silty Sand to Sandy Silt";
  if (qc > 1 && qc <= 2 && fr < 3) return "Sandy Silt to Clayey Silt";
  if (qc <= 1 && fr < 5) return "Clayey Silt to Silty Clay";
  if (fr >= 5 && fr < 8) return "Silty Clay to Clay";
  if (fr >= 8) return "Clay";
  return "Unclassified";
};

const CPTTest = ({ testKey }: { testKey?: string }) => {
  const project = useProject();
  const [rows, setRows] = useState<Row[]>([{ depth: "", coneResistance: "", frictionRatio: "", soilClass: "" }]);
  const [testedBy, setTestedBy] = useState("");
  const [dateTested, setDateTested] = useState("");
  const projectId = project.currentProjectId ?? null;
  const [recordId, setRecordId] = useState<number | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const update = (i: number, field: keyof Row, val: string) => { 
    const next = [...rows]; 
    next[i] = { ...next[i], [field]: val }; 
    // Auto-calculate soil classification when qc or fr changes
    if (field === "coneResistance" || field === "frictionRatio") {
      const qc = parseFloat(next[i].coneResistance);
      const fr = parseFloat(next[i].frictionRatio);
      if (qc && fr) {
        next[i].soilClass = classifySoilRobertson(qc, fr);
      }
    }
    setRows(next); 
  };

  const filledCPT = rows.filter(r => r.depth && r.coneResistance).length;
  const cptResults = useMemo(() => {
    const qcValues = rows.map(r => parseFloat(r.coneResistance)).filter(Boolean);
    const maxQc = qcValues.length ? Math.max(...qcValues).toFixed(1) : "";
    return [{ label: "Max qc", value: maxQc ? `${maxQc} MPa` : "" }];
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
        if (Array.isArray(payload.rows) && payload.rows.length > 0) setRows(payload.rows);
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

  const buildPDF = (skipDownload: boolean) => generateTestPDF({
    title: "CPT (Cone Penetration Test)",
    standard: "ISO 22476-1",
    ...project,
    dateTested: dateTested || project.projectDate,
    testedBy,
    skipDownload,
    tables: [{ 
      headers: ["Depth (m)", "Cone Resistance qc (MPa)", "Friction Ratio fs (%)", "Soil Classification"], 
      rows: rows.map(r => [r.depth || "—", r.coneResistance || "—", r.frictionRatio || "—", r.soilClass || "—"]) 
    }]
  });

  const exportPDF = async () => {
    await buildPDF(false);
  };

  const printPDF = async () => printPDFDocument(await buildPDF(true));

  const canExport = !!projectId || isSaved;

  return (
    <TestSection title="CPT (Cone Penetration Test)" testKey={testKey} onSave={save} onClear={() => { setRows([{ depth: "", coneResistance: "", frictionRatio: "", soilClass: "" }]); setTestedBy(""); setDateTested(""); }} onExportPDF={exportPDF} onPrint={printPDF} canExport={canExport}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b"><th className="text-left py-2 px-2 font-medium text-muted-foreground">Depth (m)</th><th className="text-left py-2 px-2 font-medium text-muted-foreground">Cone Resistance qc (MPa)</th><th className="text-left py-2 px-2 font-medium text-muted-foreground">Friction Ratio fs (%)</th><th className="text-left py-2 px-2 font-medium text-muted-foreground">Soil Classification</th><th className="w-10"></th></tr></thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-border/50">
                <td className="py-1.5 px-2"><Input type="number" value={row.depth} onChange={(e) => update(i, "depth", e.target.value)} className="h-8" placeholder="0" /></td>
                <td className="py-1.5 px-2"><Input type="number" value={row.coneResistance} onChange={(e) => update(i, "coneResistance", e.target.value)} className="h-8" placeholder="0" /></td>
                <td className="py-1.5 px-2"><Input type="number" value={row.frictionRatio} onChange={(e) => update(i, "frictionRatio", e.target.value)} className="h-8" placeholder="0" /></td>
                <td className="py-1.5 px-2"><Input value={row.soilClass || ""} readOnly className="h-8 bg-muted/50" /></td>
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
      <Button variant="outline" size="sm" className="mt-3" onClick={() => setRows([...rows, { depth: "", coneResistance: "", frictionRatio: "" }])}><Plus className="h-3.5 w-3.5 mr-1" /> Add Row</Button>
    </TestSection>
  );
};

export default CPTTest;
