import { useState, useMemo } from "react";
import TestSection from "@/components/TestSection";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import CalculatedInput from "@/components/CalculatedInput";
import { Plus, X } from "lucide-react";
import { useProject } from "@/context/ProjectContext";
import { generateTestPDF } from "@/lib/pdfGenerator";
import { generateTestCSV } from "@/lib/csvExporter";
import { useTestReport } from "@/hooks/useTestReport";

interface Row { sampleId: string; load: string; area: string }

const UCSTest = () => {
  const project = useProject();
  const [rows, setRows] = useState<Row[]>([{ sampleId: "R1", load: "", area: "" }]);

  const getStrength = (row: Row) => { const l = parseFloat(row.load); const a = parseFloat(row.area); if (!l || !a) return ""; return ((l * 1000) / a).toFixed(2); };
  const update = (i: number, field: keyof Row, val: string) => { const next = [...rows]; next[i] = { ...next[i], [field]: val }; setRows(next); };

  const strengths = rows.map(r => parseFloat(getStrength(r))).filter(Boolean);
  const avgUCS = strengths.length ? (strengths.reduce((a, b) => a + b, 0) / strengths.length).toFixed(2) : "";
  const ucsResults = useMemo(() => [
    { label: "Avg UCS", value: avgUCS ? `${avgUCS} MPa` : "" },
  ], [avgUCS]);
  useTestReport("ucs", strengths.length, ucsResults);

  const exportPDF = () => {
    generateTestPDF({ title: "UCS (Unconfined Compressive Strength)", ...project, tables: [{ headers: ["Sample ID", "Load (kN)", "Area (mm²)", "Strength (MPa)"], rows: rows.map(r => [r.sampleId, r.load || "—", r.area || "—", getStrength(r) || "—"]) }] });
  };

  return (
    <TestSection title="UCS (Unconfined Compressive Strength)" onSave={() => {}} onClear={() => setRows([{ sampleId: "", load: "", area: "" }])} onExportPDF={exportPDF} onExportCSV={() => generateTestCSV({ title: "UCS (Unconfined Compressive Strength)", ...project, tables: [{ headers: ["Sample ID", "Load (kN)", "Area (mm²)", "Strength (MPa)"], rows: rows.map(r => [r.sampleId, r.load || "—", r.area || "—", getStrength(r) || "—"]) }] })}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b"><th className="text-left py-2 px-2 font-medium text-muted-foreground">Sample ID</th><th className="text-left py-2 px-2 font-medium text-muted-foreground">Load (kN)</th><th className="text-left py-2 px-2 font-medium text-muted-foreground">Area (mm²)</th><th className="text-left py-2 px-2 font-medium text-muted-foreground">Strength (MPa)</th><th className="w-10"></th></tr></thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-border/50">
                <td className="py-1.5 px-2"><Input value={row.sampleId} onChange={(e) => update(i, "sampleId", e.target.value)} className="h-8" /></td>
                <td className="py-1.5 px-2"><Input type="number" value={row.load} onChange={(e) => update(i, "load", e.target.value)} className="h-8" placeholder="0" /></td>
                <td className="py-1.5 px-2"><Input type="number" value={row.area} onChange={(e) => update(i, "area", e.target.value)} className="h-8" placeholder="0" /></td>
                <td className="py-1.5 px-2"><CalculatedInput value={getStrength(row)} /></td>
                <td className="py-1.5 px-1"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setRows(rows.filter((_, j) => j !== i))}><X className="h-3.5 w-3.5" /></Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button variant="outline" size="sm" className="mt-3" onClick={() => setRows([...rows, { sampleId: `R${rows.length + 1}`, load: "", area: "" }])}><Plus className="h-3.5 w-3.5 mr-1" /> Add Row</Button>
    </TestSection>
  );
};

export default UCSTest;
