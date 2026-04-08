import { useState, useMemo } from "react";
import TestSection from "@/components/TestSection";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import CalculatedInput from "@/components/CalculatedInput";
import { Plus, X } from "lucide-react";
import { useProject } from "@/context/ProjectContext";
import { generateTestPDF } from "@/lib/pdfGenerator";
import { generateTestCSV } from "@/lib/csvExporter";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ReferenceLine } from "recharts";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTestReport } from "@/hooks/useTestReport";

interface Row { cubeId: string; age: string; load: string; size: string; mass: string }

const ConcreteCubesTest = () => {
  const project = useProject();
  const [gradeTarget, setGradeTarget] = useState("25");
  const [rows, setRows] = useState<Row[]>([
    { cubeId: "C1", age: "7", load: "", size: "150", mass: "" },
    { cubeId: "C2", age: "7", load: "", size: "150", mass: "" },
    { cubeId: "C3", age: "28", load: "", size: "150", mass: "" },
  ]);

  const getStrength = (row: Row) => {
    const load = parseFloat(row.load); const s = parseFloat(row.size);
    if (!load || !s) return "";
    return ((load * 1000) / (s * s)).toFixed(2);
  };

  const getDensity = (row: Row) => {
    const m = parseFloat(row.mass); const s = parseFloat(row.size);
    if (!m || !s) return "";
    const vol = (s / 1000) ** 3; // m³
    return (m / 1000 / vol).toFixed(0); // kg/m³
  };

  const update = (i: number, field: keyof Row, val: string) => {
    const next = [...rows]; next[i] = { ...next[i], [field]: val }; setRows(next);
  };

  const strengths = rows.map(r => parseFloat(getStrength(r))).filter(Boolean);
  const avgStrength = strengths.length ? (strengths.reduce((a, b) => a + b, 0) / strengths.length).toFixed(2) : "";
  const target = parseFloat(gradeTarget);
  const passCount = strengths.filter(s => s >= target).length;

  const chartData = useMemo(() =>
    rows.filter(r => getStrength(r)).map(r => ({
      name: `${r.cubeId} (${r.age}d)`,
      strength: parseFloat(getStrength(r)),
    })),
    [rows]
  );
  const chartConfig = { strength: { label: "Strength (MPa)", color: "hsl(var(--primary))" } };

  const results = useMemo(() => [
    { label: "Avg Strength", value: avgStrength ? `${avgStrength} MPa` : "" },
    { label: "Pass Rate", value: strengths.length ? `${passCount}/${strengths.length}` : "" },
  ], [avgStrength, passCount, strengths.length]);
  useTestReport("cubes", strengths.length, results);

  const tableData = { headers: ["Cube ID", "Age (days)", "Size (mm)", "Mass (g)", "Load (kN)", "Strength (MPa)", "Density (kg/m³)"], rows: rows.map(r => [r.cubeId, r.age, r.size, r.mass || "—", r.load || "—", getStrength(r) || "—", getDensity(r) || "—"]) };

  return (
    <TestSection title="Concrete Cubes" onSave={() => {}} onClear={() => setRows([{ cubeId: "C1", age: "7", load: "", size: "150", mass: "" }])} onExportPDF={() => generateTestPDF({ title: "Concrete Cubes", ...project, tables: [tableData] })} onExportCSV={() => generateTestCSV({ title: "Concrete Cubes", ...project, tables: [tableData] })}>
      <div className="flex items-center gap-3 mb-4">
        <Label className="text-xs text-muted-foreground whitespace-nowrap">Target Grade (MPa)</Label>
        <Select value={gradeTarget} onValueChange={setGradeTarget}>
          <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            {["15","20","25","30","35","40","45","50","60"].map(g => (
              <SelectItem key={g} value={g}>C{g}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b"><th className="text-left py-2 px-2 font-medium text-muted-foreground">Cube ID</th><th className="text-left py-2 px-2 font-medium text-muted-foreground">Age (d)</th><th className="text-left py-2 px-2 font-medium text-muted-foreground">Size (mm)</th><th className="text-left py-2 px-2 font-medium text-muted-foreground">Mass (g)</th><th className="text-left py-2 px-2 font-medium text-muted-foreground">Load (kN)</th><th className="text-left py-2 px-2 font-medium text-muted-foreground">Strength</th><th className="text-left py-2 px-2 font-medium text-muted-foreground">Density</th><th className="w-10"></th></tr></thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-border/50">
                <td className="py-1.5 px-2"><Input value={row.cubeId} onChange={(e) => update(i, "cubeId", e.target.value)} className="h-8" /></td>
                <td className="py-1.5 px-2"><Input type="number" value={row.age} onChange={(e) => update(i, "age", e.target.value)} className="h-8 w-16" /></td>
                <td className="py-1.5 px-2"><Input type="number" value={row.size} onChange={(e) => update(i, "size", e.target.value)} className="h-8 w-20" /></td>
                <td className="py-1.5 px-2"><Input type="number" value={row.mass} onChange={(e) => update(i, "mass", e.target.value)} className="h-8 w-20" placeholder="0" /></td>
                <td className="py-1.5 px-2"><Input type="number" value={row.load} onChange={(e) => update(i, "load", e.target.value)} className="h-8 w-20" placeholder="0" /></td>
                <td className="py-1.5 px-2"><CalculatedInput value={getStrength(row)} /></td>
                <td className="py-1.5 px-2"><CalculatedInput value={getDensity(row)} /></td>
                <td className="py-1.5 px-1"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setRows(rows.filter((_, j) => j !== i))}><X className="h-3.5 w-3.5" /></Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button variant="outline" size="sm" className="mt-3" onClick={() => setRows([...rows, { cubeId: `C${rows.length + 1}`, age: "28", load: "", size: "150", mass: "" }])}><Plus className="h-3.5 w-3.5 mr-1" /> Add Row</Button>

      {chartData.length >= 1 && (
        <div className="mt-6">
          <Label className="text-xs text-muted-foreground mb-2 block">Cube Strengths vs Target Grade</Label>
          <ChartContainer config={chartConfig} className="h-[300px] w-full">
            <BarChart data={chartData} margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" label={{ value: "Cube", position: "insideBottom", offset: -10, className: "fill-muted-foreground text-xs" }} />
              <YAxis domain={[0, "dataMax + 10"]} label={{ value: "Strength (MPa)", angle: -90, position: "insideLeft", offset: 5, className: "fill-muted-foreground text-xs" }} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <ReferenceLine y={target} stroke="hsl(var(--destructive))" strokeDasharray="5 5" label={{ value: `C${gradeTarget}`, position: "right", className: "fill-destructive text-xs" }} />
              <Bar dataKey="strength" name="strength" fill="var(--color-strength)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </div>
      )}
    </TestSection>
  );
};

export default ConcreteCubesTest;
