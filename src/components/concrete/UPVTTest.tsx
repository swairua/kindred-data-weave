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
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { Label } from "@/components/ui/label";
import { useTestReport } from "@/hooks/useTestReport";

interface Row { id: string; pathLength: string; transitTime: string }

const UPVTTest = () => {
  const project = useProject();
  const [rows, setRows] = useState<Row[]>([
    { id: "U1", pathLength: "", transitTime: "" },
    { id: "U2", pathLength: "", transitTime: "" },
    { id: "U3", pathLength: "", transitTime: "" },
  ]);

  const getVelocity = (row: Row) => {
    const L = parseFloat(row.pathLength);
    const T = parseFloat(row.transitTime);
    if (!L || !T) return "";
    return ((L / T) * 1000).toFixed(1); // mm / µs → km/s * 1000 = m/s ... actually L(mm)/T(µs) = km/s
  };

  const getQuality = (v: number) => {
    if (v >= 4.5) return "Excellent";
    if (v >= 3.5) return "Good";
    if (v >= 3.0) return "Medium";
    if (v >= 2.0) return "Poor";
    return "Very Poor";
  };

  const update = (i: number, field: keyof Row, val: string) => {
    const next = [...rows]; next[i] = { ...next[i], [field]: val }; setRows(next);
  };

  const velocities = rows.map(r => parseFloat(getVelocity(r))).filter(Boolean);
  const avgVelocity = velocities.length ? (velocities.reduce((a, b) => a + b, 0) / velocities.length).toFixed(2) : "";

  const chartData = useMemo(() =>
    rows.filter(r => getVelocity(r)).map(r => ({ name: r.id || "—", velocity: parseFloat(getVelocity(r)) })),
    [rows]
  );
  const chartConfig = { velocity: { label: "Velocity (km/s)", color: "hsl(var(--primary))" } };

  const results = useMemo(() => [
    { label: "Avg Velocity", value: avgVelocity ? `${avgVelocity} km/s` : "" },
    { label: "Quality", value: avgVelocity ? getQuality(parseFloat(avgVelocity)) : "" },
  ], [avgVelocity]);
  useTestReport("upvt", velocities.length, results);

  const tableData = { headers: ["ID", "Path Length (mm)", "Transit Time (µs)", "Velocity (km/s)", "Quality"], rows: rows.map(r => { const v = getVelocity(r); return [r.id, r.pathLength || "—", r.transitTime || "—", v || "—", v ? getQuality(parseFloat(v)) : "—"]; }) };

  return (
    <TestSection title="Ultrasonic Pulse Velocity Test (UPVT)" onSave={() => {}} onClear={() => setRows([{ id: "U1", pathLength: "", transitTime: "" }])} onExportPDF={() => generateTestPDF({ title: "UPVT", ...project, tables: [tableData] })}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b"><th className="text-left py-2 px-2 font-medium text-muted-foreground">ID</th><th className="text-left py-2 px-2 font-medium text-muted-foreground">Path Length (mm)</th><th className="text-left py-2 px-2 font-medium text-muted-foreground">Transit Time (µs)</th><th className="text-left py-2 px-2 font-medium text-muted-foreground">Velocity (km/s)</th><th className="text-left py-2 px-2 font-medium text-muted-foreground">Quality</th><th className="w-10"></th></tr></thead>
          <tbody>
            {rows.map((row, i) => {
              const v = getVelocity(row);
              return (
                <tr key={i} className="border-b border-border/50">
                  <td className="py-1.5 px-2"><Input value={row.id} onChange={(e) => update(i, "id", e.target.value)} className="h-8" /></td>
                  <td className="py-1.5 px-2"><Input type="number" value={row.pathLength} onChange={(e) => update(i, "pathLength", e.target.value)} className="h-8" placeholder="0" /></td>
                  <td className="py-1.5 px-2"><Input type="number" value={row.transitTime} onChange={(e) => update(i, "transitTime", e.target.value)} className="h-8" placeholder="0" /></td>
                  <td className="py-1.5 px-2"><CalculatedInput value={v} /></td>
                  <td className="py-1.5 px-2"><CalculatedInput value={v ? getQuality(parseFloat(v)) : ""} /></td>
                  <td className="py-1.5 px-1"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setRows(rows.filter((_, j) => j !== i))}><X className="h-3.5 w-3.5" /></Button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Button variant="outline" size="sm" className="mt-3" onClick={() => setRows([...rows, { id: `U${rows.length + 1}`, pathLength: "", transitTime: "" }])}><Plus className="h-3.5 w-3.5 mr-1" /> Add Row</Button>

      {chartData.length >= 1 && (
        <div className="mt-6">
          <Label className="text-xs text-muted-foreground mb-2 block">Pulse Velocity Comparison</Label>
          <ChartContainer config={chartConfig} className="h-[300px] w-full">
            <BarChart data={chartData} margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" label={{ value: "Sample", position: "insideBottom", offset: -10, className: "fill-muted-foreground text-xs" }} />
              <YAxis domain={[0, "dataMax + 1"]} label={{ value: "Velocity (km/s)", angle: -90, position: "insideLeft", offset: 5, className: "fill-muted-foreground text-xs" }} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="velocity" name="velocity" fill="var(--color-velocity)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </div>
      )}
    </TestSection>
  );
};

export default UPVTTest;
