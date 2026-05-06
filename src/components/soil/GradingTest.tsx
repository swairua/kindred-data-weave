import { useState, useMemo, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import TestSection from "@/components/TestSection";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, X } from "lucide-react";
import { useProject } from "@/context/ProjectContext";
import { generateTestPDF } from "@/lib/pdfGenerator";
import { generateTestCSV } from "@/lib/csvExporter";
import { generateTestExcel } from "@/lib/genericExcelExporter";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { LineChart, Line, XAxis, YAxis, CartesianGrid } from "recharts";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useTestReport } from "@/hooks/useTestReport";
import { captureChartAsBase64 } from "@/lib/chartCapture";

interface Row {
  sieveSize: string;
  weightRetained: string;
}

interface GradingTestProps {
  testKey?: string;
}

const GradingTest = ({ testKey }: GradingTestProps) => {
  const navigate = useNavigate();
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

  // Grain-size computation functions
  const interpolateD = (targetPercent: number): number | null => {
    if (totalWeight === 0) return null;

    const dataPoints: Array<{ size: number; percentPassing: number }> = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (r.sieveSize === "Pan" || parseFloat(r.sieveSize) <= 0) continue;

      const pp = getPercentPassing(i);
      if (!pp) continue; // Skip if percent passing is empty

      dataPoints.push({
        size: parseFloat(r.sieveSize),
        percentPassing: parseFloat(pp)
      });
    }

    // Sort by size
    dataPoints.sort((a, b) => a.size - b.size);

    if (dataPoints.length < 2) return null;

    // Find the two points that bracket the target percentage
    for (let i = 0; i < dataPoints.length - 1; i++) {
      const p1 = dataPoints[i];
      const p2 = dataPoints[i + 1];

      if (p1.percentPassing <= targetPercent && p2.percentPassing >= targetPercent) {
        // Linear interpolation on log scale
        const logSize1 = Math.log10(p1.size);
        const logSize2 = Math.log10(p2.size);
        const ratio = (targetPercent - p1.percentPassing) / (p2.percentPassing - p1.percentPassing);
        const logD = logSize1 + ratio * (logSize2 - logSize1);
        return Math.pow(10, logD);
      }
    }
    return null;
  };

  const calculateD10 = () => interpolateD(10);
  const calculateD30 = () => interpolateD(30);
  const calculateD60 = () => interpolateD(60);

  const calculateCu = () => {
    const d60 = calculateD60();
    const d10 = calculateD10();
    if (d60 === null || d10 === null || d10 === 0) return null;
    return d60 / d10;
  };

  const calculateCc = () => {
    const d30 = calculateD30();
    const d60 = calculateD60();
    const d10 = calculateD10();
    if (d30 === null || d60 === null || d10 === null || d10 === 0 || d60 === 0) return null;
    return (d30 * d30) / (d10 * d60);
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

  const handleStartRecording = useCallback(() => {
    navigate("/record?material=soil&test=grading");
  }, [navigate]);

  const filledGrading = rows.filter(r => r.weightRetained).length;
  const completenessPercent = rows.length > 0 ? Math.round((filledGrading / rows.length) * 100) : 0;

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

  const filledRows = rows.filter(r => r.weightRetained).length;
  const status = filledRows === 0 ? "No data" : filledRows < rows.length ? "In progress" : "Complete";

  return (
    <TestSection title="Grading (Sieve Analysis)" testKey={testKey} onSave={() => {}} onClear={() => setRows(defaultRows)} onExportPDF={exportPDF} onExportXLSX={exportXLSX} recordButtonLabel="Start Recording" onRecordClick={handleStartRecording}>
      <div className="space-y-4">
        {/* Overview metrics card */}
        <Card className="border bg-muted/20 shadow-none">
          <CardContent className="grid gap-2 p-3 sm:p-4 grid-cols-2 sm:grid-cols-2 md:grid-cols-5">
            <OverviewMetric label="Project" value={project.projectName || "Current project"} />
            <OverviewMetric label="Total Weight" value={totalWeight ? `${totalWeight.toFixed(1)} g` : "—"} />
            <OverviewMetric label="Filled Rows" value={`${filledRows}/${rows.length}`} />
            <OverviewMetric label="Completeness" value={`${completenessPercent}%`} />
            <OverviewMetric label="Status" value={status} className="capitalize" />
          </CardContent>
        </Card>

        {!hasProjectSelected && rows.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-2">No project selected</p>
              <p className="text-xs text-muted-foreground">Select an existing project or create a new one to begin testing</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Data input section */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-3">
                <h3 className="text-sm font-semibold">Sieve Analysis Data</h3>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="overflow-x-auto">
                  <table className="grading-table">
                    <thead>
                      <tr>
                        <th>Sieve Size (mm)</th>
                        <th>Weight Retained (g)</th>
                        <th>% Passing</th>
                        <th className="w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, i) => (
                        <tr key={i}>
                          <td>
                            <Input value={row.sieveSize} onChange={(e) => update(i, "sieveSize", e.target.value)} className="grading-input" />
                          </td>
                          <td>
                            <Input type="number" value={row.weightRetained} onChange={(e) => update(i, "weightRetained", e.target.value)} className="grading-input" placeholder="0" />
                          </td>
                          <td className="grading-calculated">
                            {getPercentPassing(i) || "—"}
                          </td>
                          <td>
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
              </CardContent>
            </Card>

            {/* Chart section */}
            {chartData.length >= 2 && (
              <Card className="border shadow-sm">
                <CardHeader className="pb-3">
                  <h3 className="text-sm font-semibold">Particle Size Distribution Curve</h3>
                </CardHeader>
                <CardContent className="pt-0">
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
                </CardContent>
              </Card>
            )}

            {/* Results card - computed grain-size characteristics */}
            {chartData.length >= 2 && (
              <Card className="border shadow-sm">
                <CardHeader className="pb-3">
                  <h3 className="text-sm font-semibold">Grain-Size Characteristics</h3>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 md:grid-cols-5">
                    <ResultMetric
                      label="D₁₀ (mm)"
                      value={calculateD10()?.toFixed(3) || "—"}
                    />
                    <ResultMetric
                      label="D₃₀ (mm)"
                      value={calculateD30()?.toFixed(3) || "—"}
                    />
                    <ResultMetric
                      label="D₆₀ (mm)"
                      value={calculateD60()?.toFixed(3) || "—"}
                    />
                    <ResultMetric
                      label="Cu"
                      value={calculateCu()?.toFixed(2) || "—"}
                      subtitle="(D₆₀/D₁₀)"
                    />
                    <ResultMetric
                      label="Cc"
                      value={calculateCc()?.toFixed(2) || "—"}
                      subtitle="((D₃₀)²/(D₁₀·D₆₀))"
                    />
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </TestSection>
  );
};

interface OverviewMetricProps {
  label: string;
  value: string;
  className?: string;
}

const OverviewMetric = ({ label, value, className }: OverviewMetricProps) => (
  <div className="rounded-lg border bg-card px-2 sm:px-3 py-1.5 sm:py-2">
    <div className="text-xs font-medium text-muted-foreground truncate">{label}</div>
    <div className={`mt-0.5 sm:mt-1 text-xs sm:text-sm font-semibold text-foreground truncate ${className || ""}`}>{value || "—"}</div>
  </div>
);

interface ResultMetricProps {
  label: string;
  value: string;
  subtitle?: string;
}

const ResultMetric = ({ label, value, subtitle }: ResultMetricProps) => (
  <div className="rounded-lg border bg-calculated/20 px-2 sm:px-3 py-2 sm:py-2.5">
    <div className="text-xs font-medium text-calculated-foreground truncate">{label}</div>
    <div className="mt-0.5 sm:mt-1 text-sm sm:text-base font-semibold text-calculated-foreground font-mono">{value}</div>
    {subtitle && <div className="mt-0.5 text-xs text-calculated-foreground/70 truncate">{subtitle}</div>}
  </div>
);

export default GradingTest;
