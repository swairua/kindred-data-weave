import { useState, useMemo } from "react";
import TestSection from "@/components/TestSection";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import CalculatedInput from "@/components/CalculatedInput";
import { Plus, X } from "lucide-react";
import { useProject } from "@/context/ProjectContext";
import { generateTestPDF } from "@/lib/pdfGenerator";
import { useTestReport } from "@/hooks/useTestReport";

interface Row { sampleId: string; failureLoad: string; de: string }

const PointLoadTest = () => {
  const project = useProject();
  const [rows, setRows] = useState<Row[]>([{ sampleId: "P1", failureLoad: "", de: "" }]);

  const getIndex = (row: Row) => { const p = parseFloat(row.failureLoad); const de = parseFloat(row.de); if (!p || !de) return ""; return ((p * 1000) / (de * de)).toFixed(3); };
  const update = (i: number, field: keyof Row, val: string) => { const next = [...rows]; next[i] = { ...next[i], [field]: val }; setRows(next); };

  const indices = rows.map(r => parseFloat(getIndex(r))).filter(Boolean);
  const avgIndex = indices.length ? (indices.reduce((a, b) => a + b, 0) / indices.length).toFixed(3) : "";
  const plResults = useMemo(() => [
    { label: "Avg Is(50)", value: avgIndex ? `${avgIndex} MPa` : "" },
  ], [avgIndex]);
  useTestReport("pointload", indices.length, plResults);

  const exportPDF = () => {
    generateTestPDF({ title: "Point Load Test", ...project, tables: [{ headers: ["Sample ID", "Failure Load (kN)", "De (mm)", "Is(50) (MPa)"], rows: rows.map(r => [r.sampleId, r.failureLoad || "—", r.de || "—", getIndex(r) || "—"]) }] });
  };

  return (
    <TestSection title="Point Load Test" onSave={() => {}} onClear={() => setRows([{ sampleId: "", failureLoad: "", de: "" }])} onExportPDF={exportPDF}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b"><th className="text-left py-2 px-2 font-medium text-muted-foreground">Sample ID</th><th className="text-left py-2 px-2 font-medium text-muted-foreground">Failure Load (kN)</th><th className="text-left py-2 px-2 font-medium text-muted-foreground">De (mm)</th><th className="text-left py-2 px-2 font-medium text-muted-foreground">Is(50) (MPa)</th><th className="w-10"></th></tr></thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-border/50">
                <td className="py-1.5 px-2"><Input value={row.sampleId} onChange={(e) => update(i, "sampleId", e.target.value)} className="h-8" /></td>
                <td className="py-1.5 px-2"><Input type="number" value={row.failureLoad} onChange={(e) => update(i, "failureLoad", e.target.value)} className="h-8" placeholder="0" /></td>
                <td className="py-1.5 px-2"><Input type="number" value={row.de} onChange={(e) => update(i, "de", e.target.value)} className="h-8" placeholder="0" /></td>
                <td className="py-1.5 px-2"><CalculatedInput value={getIndex(row)} /></td>
                <td className="py-1.5 px-1"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setRows(rows.filter((_, j) => j !== i))}><X className="h-3.5 w-3.5" /></Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button variant="outline" size="sm" className="mt-3" onClick={() => setRows([...rows, { sampleId: `P${rows.length + 1}`, failureLoad: "", de: "" }])}><Plus className="h-3.5 w-3.5 mr-1" /> Add Row</Button>
    </TestSection>
  );
};

export default PointLoadTest;
