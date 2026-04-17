import { useState, useMemo, useEffect } from "react";
import TestSection from "@/components/TestSection";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import CalculatedInput from "@/components/CalculatedInput";
import { Plus, X } from "lucide-react";
import { useProject } from "@/context/ProjectContext";
import { generateTestPDF } from "@/lib/pdfGenerator";
import { generateTestCSV } from "@/lib/csvExporter";
import { generateTestExcel } from "@/lib/genericExcelExporter";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { LineChart, Line, XAxis, YAxis, CartesianGrid } from "recharts";
import { Label } from "@/components/ui/label";
import { useTestReport } from "@/hooks/useTestReport";
import { captureChartAsBase64 } from "@/lib/chartCapture";

interface Row {
  sieveSize: string;
  weightRetained: string;
}

const GradingTest = () => {
  const project = useProject();
  const defaultRows: Row[] = [
    { sieveSize: "75", weightRetained: "" },
    { sieveSize: "63", weightRetained: "" },
    { sieveSize: "37.5", weightRetained: "" },
    { sieveSize: "20", weightRetained: "" },
    { sieveSize: "10", weightRetained: "" },
    { sieveSize: "5", weightRetained: "" },
    { sieveSize: "2.36", weightRetained: "" },
    { sieveSize: "1.18", weightRetained: "" },
    { sieveSize: "0.6", weightRetained: "" },
    { sieveSize: "0.3", weightRetained: "" },
    { sieveSize: "0.15", weightRetained: "" },
    { sieveSize: "0.075", weightRetained: "" },
    { sieveSize: "Pan", weightRetained: "" },
  ];

  // Only initialize with default rows if a project is selected
  const [rows, setRows] = useState<Row[]>(project.currentProjectId ? defaultRows : []);
  const hasProjectSelected = !!project.currentProjectId;

  // Reset rows when project changes
  useEffect(() => {
    if (project.currentProjectId) {
      setRows(defaultRows);
    } else {
      setRows([]);
    }
  }, [project.currentProjectId]);

  const totalWeight = rows.reduce((s, r) => s + (parseFloat(r.weightRetained) || 0), 0);

  const getPercentPassing = (index: number) => {
    if (totalWeight === 0) return "";
    let cumRetained = 0;
    for (let i = 0; i <= index; i++) {
      cumRetained += parseFloat(rows[i].weightRetained) || 0;
    }
    return ((1 - cumRetained / totalWeight) * 100).toFixed(1);
  };

  const update = (i: number, field: keyof Row, val: string) => {
    const next = [...rows];
    next[i] = { ...next[i], [field]: val };
    setRows(next);
  };

  const chartData = useMemo(() => {
    if (totalWeight === 0) return [];
    return rows
      .filter(r => r.sieveSize !== "Pan" && parseFloat(r.sieveSize) > 0)
      .map((r, _origIdx) => {
        const idx = rows.indexOf(r);
        const pp = getPercentPassing(idx);
        return pp ? { sieveSize: parseFloat(r.sieveSize), percentPassing: parseFloat(pp) } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a!.sieveSize - b!.sieveSize) as { sieveSize: number; percentPassing: number }[];
  }, [rows, totalWeight]);

  const chartConfig = { percentPassing: { label: "% Passing", color: "hsl(var(--primary))" } };

  const filledGrading = rows.filter(r => r.weightRetained).length;
  const gradingResults = useMemo(() => [
    { label: "Total Weight", value: totalWeight ? `${totalWeight.toFixed(1)} g` : "" },
  ], [totalWeight]);
  useTestReport("grading", filledGrading, gradingResults);

  const exportPDF = async () => {
    let chartImages = {};
    if (chartData.length >= 2) {
      const chartBase64 = await captureChartAsBase64("grading-chart");
      if (chartBase64) {
        chartImages = { "Particle Size Distribution Curve": chartBase64 };
      }
    }

    generateTestPDF({
      title: "Grading (Sieve Analysis)",
      ...project,
      tables: [{
        headers: ["Sieve Size (mm)", "Weight Retained (g)", "% Passing"],
        rows: rows.map((r, i) => [r.sieveSize, r.weightRetained || "—", getPercentPassing(i) || "—"]),
      }],
      chartImages,
    });
  };

  const exportXLSX = async () => {
    let chartImages = {};
    if (chartData.length >= 2) {
      const chartBase64 = await captureChartAsBase64("grading-chart");
      if (chartBase64) {
        chartImages = { "Particle Size Distribution Curve": chartBase64 };
      }
    }

    generateTestExcel({
      data: {
        title: "Grading (Sieve Analysis)",
        fields: [
          { label: "Total Weight", value: totalWeight ? `${totalWeight.toFixed(1)} g` : "—" },
        ],
        tables: [{
          headers: ["Sieve Size (mm)", "Weight Retained (g)", "% Passing"],
          rows: rows.map((r, i) => [r.sieveSize, r.weightRetained || "—", getPercentPassing(i) || "—"]),
        }],
        chartImages,
      },
      projectName: project.projectName,
      clientName: project.clientName,
      date: project.date,
      labOrganization: project.labOrganization,
      dateReported: project.dateReported,
      checkedBy: project.checkedBy,
    });
  };

  return (
    <TestSection title="Grading (Sieve Analysis)" onSave={() => {}} onClear={() => setRows(defaultRows)} onExportPDF={exportPDF} onExportXLSX={exportXLSX}>
      {!hasProjectSelected && rows.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <p className="text-sm text-muted-foreground mb-2">No project selected</p>
            <p className="text-xs text-muted-foreground">Select an existing project or create a new one to begin testing</p>
          </div>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-2 font-medium text-muted-foreground">Sieve Size (mm)</th>
                  <th className="text-left py-2 px-2 font-medium text-muted-foreground">Weight Retained (g)</th>
                  <th className="text-left py-2 px-2 font-medium text-muted-foreground">% Passing</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} className="border-b border-border/50">
                    <td className="py-1.5 px-2">
                      <Input value={row.sieveSize} onChange={(e) => update(i, "sieveSize", e.target.value)} className="h-8" />
                    </td>
                    <td className="py-1.5 px-2">
                      <Input type="number" value={row.weightRetained} onChange={(e) => update(i, "weightRetained", e.target.value)} className="h-8" placeholder="0" />
                    </td>
                    <td className="py-1.5 px-2">
                      <CalculatedInput value={getPercentPassing(i)} />
                    </td>
                    <td className="py-1.5 px-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => setRows([...rows, { sieveSize: "", weightRetained: "" }])}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add Row
          </Button>

          {chartData.length >= 2 && (
            <div className="mt-6">
              <Label className="text-xs text-muted-foreground mb-2 block">Particle Size Distribution Curve</Label>
              <ChartContainer id="grading-chart" config={chartConfig} className="h-[300px] w-full">
                <LineChart data={chartData} margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="sieveSize"
                    type="number"
                    scale="log"
                    domain={["dataMin", "dataMax"]}
                    tickFormatter={(v) => String(v)}
                    label={{ value: "Sieve Size (mm)", position: "insideBottom", offset: -10, className: "fill-muted-foreground text-xs" }}
                  />
                  <YAxis type="number" domain={[0, 100]} label={{ value: "% Passing", angle: -90, position: "insideLeft", offset: 5, className: "fill-muted-foreground text-xs" }} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line type="monotone" dataKey="percentPassing" name="percentPassing" stroke="var(--color-percentPassing)" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ChartContainer>
            </div>
          )}
        </>
      )}
    </TestSection>
  );
};

export default GradingTest;
