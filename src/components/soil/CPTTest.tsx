import { useState, useMemo, useEffect } from "react";
import TestSection from "@/components/TestSection";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, X } from "lucide-react";
import { useProject } from "@/context/ProjectContext";
import { generateTestPDF, printPDFDocument } from "@/lib/pdfGenerator";
import { useTestReport } from "@/hooks/useTestReport";
import { loadTestResult, saveTestResult } from "@/lib/testResultPersistence";

interface Row { depth: string; coneResistance: string; frictionRatio: string }

const CPTTest = ({ testKey }: { testKey?: string }) => {
  const project = useProject();
  const [rows, setRows] = useState<Row[]>([{ depth: "", coneResistance: "", frictionRatio: "" }]);
  const projectId = project.currentProjectId ?? null;
  const [recordId, setRecordId] = useState<number | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const update = (i: number, field: keyof Row, val: string) => { const next = [...rows]; next[i] = { ...next[i], [field]: val }; setRows(next); };

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
        const savedRows = (result.payload_json as { rows?: Row[] } | null)?.rows;
        if (Array.isArray(savedRows) && savedRows.length > 0) setRows(savedRows);
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
      payload_json: { rows },
    });
    setRecordId(savedId);
    setIsSaved(true);
  };

  const buildPDF = (skipDownload: boolean) => generateTestPDF({ title: "CPT (Cone Penetration Test)", ...project, skipDownload, tables: [{ headers: ["Depth (m)", "Cone Resistance qc (MPa)", "Friction Ratio fs (kPa)"], rows: rows.map(r => [r.depth || "—", r.coneResistance || "—", r.frictionRatio || "—"]) }] });

  const exportPDF = async () => {
    await buildPDF(false);
  };

  const printPDF = async () => printPDFDocument(await buildPDF(true));

  const canExport = !!projectId || isSaved;

  return (
    <TestSection title="CPT (Cone Penetration Test)" testKey={testKey} onSave={save} onClear={() => setRows([{ depth: "", coneResistance: "", frictionRatio: "" }])} onExportPDF={exportPDF} onPrint={printPDF} canExport={canExport}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b"><th className="text-left py-2 px-2 font-medium text-muted-foreground">Depth (m)</th><th className="text-left py-2 px-2 font-medium text-muted-foreground">Cone Resistance qc (MPa)</th><th className="text-left py-2 px-2 font-medium text-muted-foreground">Friction Ratio fs (kPa)</th><th className="w-10"></th></tr></thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-border/50">
                <td className="py-1.5 px-2"><Input type="number" value={row.depth} onChange={(e) => update(i, "depth", e.target.value)} className="h-8" placeholder="0" /></td>
                <td className="py-1.5 px-2"><Input type="number" value={row.coneResistance} onChange={(e) => update(i, "coneResistance", e.target.value)} className="h-8" placeholder="0" /></td>
                <td className="py-1.5 px-2"><Input type="number" value={row.frictionRatio} onChange={(e) => update(i, "frictionRatio", e.target.value)} className="h-8" placeholder="0" /></td>
                <td className="py-1.5 px-1"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setRows(rows.filter((_, j) => j !== i))}><X className="h-3.5 w-3.5" /></Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button variant="outline" size="sm" className="mt-3" onClick={() => setRows([...rows, { depth: "", coneResistance: "", frictionRatio: "" }])}><Plus className="h-3.5 w-3.5 mr-1" /> Add Row</Button>
    </TestSection>
  );
};

export default CPTTest;
