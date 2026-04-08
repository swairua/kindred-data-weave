import { useState, useMemo } from "react";
import TestSection from "@/components/TestSection";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, X } from "lucide-react";
import { useProject } from "@/context/ProjectContext";
import { generateTestPDF } from "@/lib/pdfGenerator";
import { generateTestCSV } from "@/lib/csvExporter";
import { useTestReport } from "@/hooks/useTestReport";

interface Row { depth: string; blowCount: string }

const SPTTest = () => {
  const project = useProject();
  const [rows, setRows] = useState<Row[]>([{ depth: "", blowCount: "" },{ depth: "", blowCount: "" },{ depth: "", blowCount: "" }]);
  const update = (i: number, field: keyof Row, val: string) => { const next = [...rows]; next[i] = { ...next[i], [field]: val }; setRows(next); };

  const filledSPT = rows.filter(r => r.depth && r.blowCount).length;
  const sptResults = useMemo(() => {
    const blows = rows.map(r => parseFloat(r.blowCount)).filter(Boolean);
    const avg = blows.length ? (blows.reduce((a, b) => a + b, 0) / blows.length).toFixed(0) : "";
    return [{ label: "Avg N-value", value: avg }];
  }, [rows]);
  useTestReport("spt", filledSPT, sptResults);

  const exportPDF = () => {
    generateTestPDF({ title: "SPT (Standard Penetration Test)", ...project, tables: [{ headers: ["Depth (m)", "Blow Count (N-value)"], rows: rows.map(r => [r.depth || "—", r.blowCount || "—"]) }] });
  };

  return (
    <TestSection title="SPT (Standard Penetration Test)" onSave={() => {}} onClear={() => setRows([{ depth: "", blowCount: "" }])} onExportPDF={exportPDF} onExportCSV={() => generateTestCSV({ title: "SPT (Standard Penetration Test)", ...project, tables: [{ headers: ["Depth (m)", "Blow Count (N-value)"], rows: rows.map(r => [r.depth || "—", r.blowCount || "—"]) }] })}>
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
