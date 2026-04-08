import { useState, useMemo } from "react";
import TestSection from "@/components/TestSection";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, X } from "lucide-react";
import { useProject } from "@/context/ProjectContext";
import { generateTestPDF } from "@/lib/pdfGenerator";
import { generateTestCSV } from "@/lib/csvExporter";
import { useTestReport } from "@/hooks/useTestReport";

interface Row { depth: string; penetration: string }

const DCPTest = () => {
  const project = useProject();
  const [rows, setRows] = useState<Row[]>([{ depth: "", penetration: "" },{ depth: "", penetration: "" },{ depth: "", penetration: "" }]);
  const update = (i: number, field: keyof Row, val: string) => { const next = [...rows]; next[i] = { ...next[i], [field]: val }; setRows(next); };

  const filledDCP = rows.filter(r => r.depth && r.penetration).length;
  const dcpResults = useMemo(() => {
    const pens = rows.map(r => parseFloat(r.penetration)).filter(Boolean);
    const avg = pens.length ? (pens.reduce((a, b) => a + b, 0) / pens.length).toFixed(1) : "";
    return [{ label: "Avg Pen Rate", value: avg ? `${avg} mm/blow` : "" }];
  }, [rows]);
  useTestReport("dcp", filledDCP, dcpResults);

  const exportPDF = () => {
    generateTestPDF({ title: "DCP (Dynamic Cone Penetrometer)", ...project, tables: [{ headers: ["Depth (mm)", "Penetration per Blow (mm/blow)"], rows: rows.map(r => [r.depth || "—", r.penetration || "—"]) }] });
  };

  return (
    <TestSection title="DCP (Dynamic Cone Penetrometer)" onSave={() => {}} onClear={() => setRows([{ depth: "", penetration: "" }])} onExportPDF={exportPDF} onExportCSV={() => generateTestCSV({ title: "DCP (Dynamic Cone Penetrometer)", ...project, tables: [{ headers: ["Depth (mm)", "Penetration per Blow (mm/blow)"], rows: rows.map(r => [r.depth || "—", r.penetration || "—"]) }] })}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b"><th className="text-left py-2 px-2 font-medium text-muted-foreground">Depth (mm)</th><th className="text-left py-2 px-2 font-medium text-muted-foreground">Penetration per Blow (mm/blow)</th><th className="w-10"></th></tr></thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-border/50">
                <td className="py-1.5 px-2"><Input type="number" value={row.depth} onChange={(e) => update(i, "depth", e.target.value)} className="h-8" placeholder="0" /></td>
                <td className="py-1.5 px-2"><Input type="number" value={row.penetration} onChange={(e) => update(i, "penetration", e.target.value)} className="h-8" placeholder="0" /></td>
                <td className="py-1.5 px-1"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setRows(rows.filter((_, j) => j !== i))}><X className="h-3.5 w-3.5" /></Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button variant="outline" size="sm" className="mt-3" onClick={() => setRows([...rows, { depth: "", penetration: "" }])}><Plus className="h-3.5 w-3.5 mr-1" /> Add Row</Button>
    </TestSection>
  );
};

export default DCPTest;
