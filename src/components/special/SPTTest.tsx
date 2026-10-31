import { useState, useMemo, useEffect } from "react";
import TestSection from "@/components/TestSection";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, X } from "lucide-react";
import { useProject } from "@/context/ProjectContext";
import { generateTestPDF, printPDFDocument } from "@/lib/pdfGenerator";
import { useTestReport } from "@/hooks/useTestReport";
import { loadTestResult, saveTestResult } from "@/lib/testResultPersistence";

interface Row { depth: string; blowCount: string }

const SPTTest = ({ testKey }: { testKey?: string }) => {
  const project = useProject();
  const [rows, setRows] = useState<Row[]>([{ depth: "", blowCount: "" }]);
  const projectId = project.currentProjectId ?? null;
  const [recordId, setRecordId] = useState<number | null>(null);
  const update = (i: number, field: keyof Row, val: string) => { const next = [...rows]; next[i] = { ...next[i], [field]: val }; setRows(next); };

  const filledSPT = rows.filter(r => r.depth && r.blowCount).length;
  const sptResults = useMemo(() => {
    const blows = rows.map(r => parseFloat(r.blowCount)).filter(Boolean);
    const avg = blows.length ? (blows.reduce((a, b) => a + b, 0) / blows.length).toFixed(0) : "";
    return [{ label: "Avg N-value", value: avg }];
  }, [rows]);
  useTestReport("spt", filledSPT, sptResults);

  useEffect(() => {
    if (!projectId) return;
    let active = true;
    loadTestResult(projectId, "spt")
      .then((result) => {
        if (!active || !result) return;
        setRecordId(result.id);
        const savedRows = (result.payload_json as { rows?: Row[] } | null)?.rows;
        if (Array.isArray(savedRows) && savedRows.length > 0) setRows(savedRows);
      })
      .catch((error) => console.error("Failed to load SPT result", error));
    return () => { active = false; };
  }, [projectId]);

  const save = async () => {
    if (!projectId) throw new Error("Select a project before saving this SPT test");
    const savedId = await saveTestResult(projectId, recordId, {
      test_key: "spt",
      name: "SPT (Standard Penetration Test)",
      category: "soil",
      status: filledSPT === 0 ? "not-started" : filledSPT < rows.length ? "in-progress" : "completed",
      data_points: filledSPT,
      key_results_json: sptResults.filter((result) => result.value),
      payload_json: { rows },
    });
    setRecordId(savedId);
  };

  const buildPDF = (skipDownload: boolean) => generateTestPDF({ title: "SPT (Standard Penetration Test)", ...project, skipDownload, tables: [{ headers: ["Depth (m)", "Blow Count (N-value)"], rows: rows.map(r => [r.depth || "—", r.blowCount || "—"]) }] });

  const exportPDF = async () => {
    await buildPDF(false);
  };

  const printPDF = async () => printPDFDocument(await buildPDF(true));

  return (
    <TestSection title="SPT (Standard Penetration Test)" testKey={testKey} onSave={save} onClear={() => setRows([{ depth: "", blowCount: "" }])} onExportPDF={exportPDF} onPrint={printPDF}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b"><th className="text-left py-2 px-2 font-medium text-muted-foreground">Depth (m)</th><th className="text-left py-2 px-2 font-medium text-muted-foreground">Blow Count (N-value)</th><th className="w-10"></th></tr></thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-border/50">
                <td className="py-1.5 px-2"><Input type="number" value={row.depth} onChange={(e) => update(i, "depth", e.target.value)} className="h-8" placeholder="0" /></td>
                <td className="py-1.5 px-2"><Input type="number" value={row.blowCount} onChange={(e) => update(i, "blowCount", e.target.value)} className="h-8" placeholder="0" /></td>
                <td className="py-1.5 px-1"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setRows(rows.filter((_, j) => j !== i))}><X className="h-3.5 w-3.5" /></Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button variant="outline" size="sm" className="mt-3" onClick={() => setRows([...rows, { depth: "", blowCount: "" }])}><Plus className="h-3.5 w-3.5 mr-1" /> Add Row</Button>
    </TestSection>
  );
};

export default SPTTest;
