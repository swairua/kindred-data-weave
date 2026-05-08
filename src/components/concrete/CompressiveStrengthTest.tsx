import { useState, useMemo, useCallback, useEffect } from "react";
import TestSection from "@/components/TestSection";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import CalculatedInput from "@/components/CalculatedInput";
import { Plus, X, Save as SaveIcon, Printer, Loader2, CheckCircle2, GripVertical } from "lucide-react";
import { useProject } from "@/context/ProjectContext";
import { useTestData } from "@/context/TestDataContext";
import { generateTestPDF } from "@/lib/pdfGenerator";
import { generateTestCSV } from "@/lib/csvExporter";
import { generateTestExcel } from "@/lib/genericExcelExporter";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line, PieChart, Pie, Cell, Legend, ResponsiveContainer } from "recharts";
import { Label } from "@/components/ui/label";
import { useTestReport } from "@/hooks/useTestReport";
import { captureChartAsBase64 } from "@/lib/chartCapture";
import { saveCompressiveTest } from "@/lib/api";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Row {
  mark: string;
  dateOfCast: string;
  dateOfTest: string;
  load: string;
  width: string;
  height: string;
  depth: string;
  mass: string;
  remarks: string;
}

interface TestDetails {
  cement: string;
  fineAggregate: string;
  coarseAggregate: string;
  contractor: string;
  concreteClass: string;
  section: string;
  madeBy: string;
  slump: string;
  clientRef: string;
  dateTested: string;
}

interface CompressiveStrengthTestProps {
  testKey?: string;
}

const CompressiveStrengthTest = ({ testKey }: CompressiveStrengthTestProps) => {
  const project = useProject();
  const testData = useTestData();
  const defaultRows: Row[] = [
    { mark: "", dateOfCast: "", dateOfTest: "", load: "", width: "150", height: "150", depth: "150", mass: "", remarks: "" },
  ];
  const [rows, setRows] = useState<Row[]>(defaultRows);
  const [isSaving, setIsSaving] = useState(false);
  const [saveCompleted, setSaveCompleted] = useState(false);
  const [editingRemarksIndex, setEditingRemarksIndex] = useState<number | null>(null);
  const [highlightedRowIndex, setHighlightedRowIndex] = useState<number | null>(null);
  const [passFailThreshold, setPassFailThreshold] = useState(25);
  const [passFailMode, setPassFailMode] = useState<"simple" | "multi">("simple");
  const [multiStandardTargets, setMultiStandardTargets] = useState({
    sevenDay: 17,
    twentyEightDay: 25,
    custom: 30,
  });
  const [testDetails, setTestDetails] = useState<TestDetails>(() => ({
    cement: "",
    fineAggregate: "",
    coarseAggregate: "",
    contractor: "",
    concreteClass: "",
    section: "",
    madeBy: "",
    slump: "",
    clientRef: "",
    dateTested: "",
    ...(testData.concreteTestMetadata ?? {})
  }));
  const hasProjectSelected = !!project.currentProjectId;

  const getAge = (dateOfCast: string, dateOfTest: string) => {
    if (!dateOfCast || !dateOfTest) return "";
    const cast = new Date(dateOfCast);
    const test = new Date(dateOfTest);
    const days = Math.floor((test.getTime() - cast.getTime()) / (1000 * 60 * 60 * 24));
    return days >= 0 ? String(days) : "";
  };

  const getDensity = (row: Row) => {
    const mass = parseFloat(row.mass);
    const w = parseFloat(row.width);
    const h = parseFloat(row.height);
    const d = parseFloat(row.depth);
    if (!mass || !w || !h || !d) return "";
    const volume = (w * h * d) / 1000000000; // mm³ to m³
    const massKg = mass / 1000;
    return (massKg / volume).toFixed(0);
  };

  const getStrength = (row: Row) => {
    const load = parseFloat(row.load);
    const w = parseFloat(row.width);
    const h = parseFloat(row.height);
    if (!load || !w || !h) return "";
    return ((load * 1000) / (w * h)).toFixed(2);
  };

  const getRemarks = (row: Row) => {
    const strength = parseFloat(getStrength(row));
    if (!strength) return "";
    if (strength < 7) return "Very low strength";
    if (strength < 20) return "Low strength";
    if (strength < 40) return "Normal structural concrete";
    return "High strength";
  };

  const isAbnormalDensity = (row: Row) => {
    const density = parseFloat(getDensity(row));
    return density && (density < 2200 || density > 2600);
  };

  const getStrengthCategory = (strength: number): "veryLow" | "low" | "normal" | "high" => {
    if (strength < 7) return "veryLow";
    if (strength < 20) return "low";
    if (strength < 40) return "normal";
    return "high";
  };

  const getPassFailResults = (testRows: Row[], threshold: number) => {
    const strengths = testRows.map(r => parseFloat(getStrength(r))).filter(Boolean);
    const passCount = strengths.filter(s => s >= threshold).length;
    const failCount = strengths.filter(s => s < threshold).length;
    const passRate = strengths.length ? (passCount / strengths.length) * 100 : 0;
    return { passCount, failCount, passRate };
  };

  const getStrengthDistribution = (testRows: Row[]) => {
    const categories = { veryLow: 0, low: 0, normal: 0, high: 0 };
    testRows.forEach(r => {
      const strength = parseFloat(getStrength(r));
      if (strength) categories[getStrengthCategory(strength)]++;
    });
    return categories;
  };

  const update = (i: number, field: keyof Row, val: string) => {
    const next = [...rows];
    next[i] = { ...next[i], [field]: val };
    setRows(next);
  };

  const updateTestDetail = (field: keyof TestDetails, val: string) => {
    setTestDetails(prev => ({ ...prev, [field]: val }));
  };

  const handleSave = useCallback(async () => {
    if (!project.currentProjectId) {
      toast.error("No project selected");
      return;
    }

    const cubesWithData = rows.filter(r => r.load && r.width && r.height);
    if (cubesWithData.length === 0) {
      toast.error("Please enter data for at least one cube");
      return;
    }

    setIsSaving(true);
    try {
      const cubesPayload = cubesWithData.map(row => ({
        cube_mark: row.mark || "Unknown",
        date_of_cast: row.dateOfCast,
        date_of_test: row.dateOfTest,
        load_kn: parseFloat(row.load),
        width_mm: parseFloat(row.width),
        height_mm: parseFloat(row.height),
        depth_mm: parseFloat(row.depth),
        mass_g: parseFloat(row.mass),
        calculated_strength_mpa: parseFloat(getStrength(row) || "0"),
        density_kg_m3: parseFloat(getDensity(row) || "0"),
        remarks: row.remarks,
      }));

      const testDataPayload = {
        date_tested: testDetails.dateTested,
        cement: testDetails.cement,
        fine_aggregate: testDetails.fineAggregate,
        coarse_aggregate: testDetails.coarseAggregate,
        contractor: testDetails.contractor,
        concrete_class: testDetails.concreteClass,
        section: testDetails.section,
        made_by: testDetails.madeBy,
        slump: testDetails.slump,
        client_ref: testDetails.clientRef,
        status: "submitted",
      };

      await saveCompressiveTest({
        projectId: project.currentProjectId,
        testData: testDataPayload,
        cubes: cubesPayload,
      });

      toast.success("Compressive strength test saved successfully");
      setSaveCompleted(true);
    } catch (error) {
      console.error("Failed to save test:", error);
      toast.error(error instanceof Error ? error.message : "Failed to save test");
    } finally {
      setIsSaving(false);
    }
  }, [project.currentProjectId, rows, testDetails, getStrength]);

  const chartData = useMemo(() =>
    rows
      .filter(r => getStrength(r))
      .map(r => ({ name: r.mark || "—", strength: parseFloat(getStrength(r)) })),
    [rows]
  );

  const strengthTrendData = useMemo(() =>
    rows
      .filter(r => getStrength(r))
      .map((r, idx) => ({
        name: r.mark || `Cube ${idx + 1}`,
        strength: parseFloat(getStrength(r)),
        age: parseInt(getAge(r.dateOfCast, r.dateOfTest)) || 0,
        index: idx,
      })),
    [rows]
  );

  const densityChartData = useMemo(() =>
    rows
      .filter(r => getDensity(r))
      .map((r, idx) => ({
        name: r.mark || `Cube ${idx + 1}`,
        density: parseFloat(getDensity(r)),
        isAbnormal: isAbnormalDensity(r),
        index: idx,
      })),
    [rows]
  );

  const strengthDistribution = useMemo(() => {
    const dist = getStrengthDistribution(rows);
    return [
      { name: "Very Low (< 7)", value: dist.veryLow, color: "#ef4444" },
      { name: "Low (7–20)", value: dist.low, color: "#f97316" },
      { name: "Normal (20–40)", value: dist.normal, color: "#22c55e" },
      { name: "High (> 40)", value: dist.high, color: "#3b82f6" },
    ];
  }, [rows]);

  const passFailData = useMemo(() => getPassFailResults(rows, passFailThreshold), [rows, passFailThreshold]);

  const multiStandardResults = useMemo(() => {
    const sevenDay = rows.filter(r => {
      const age = parseInt(getAge(r.dateOfCast, r.dateOfTest)) || 0;
      const strength = parseFloat(getStrength(r)) || 0;
      return age <= 7 && strength;
    });
    const twentyEightDay = rows.filter(r => {
      const age = parseInt(getAge(r.dateOfCast, r.dateOfTest)) || 0;
      const strength = parseFloat(getStrength(r)) || 0;
      return age >= 25 && age <= 31 && strength;
    });

    return {
      sevenDay: sevenDay.length ? {
        pass: sevenDay.filter(r => parseFloat(getStrength(r)) >= multiStandardTargets.sevenDay).length,
        fail: sevenDay.filter(r => parseFloat(getStrength(r)) < multiStandardTargets.sevenDay).length,
        total: sevenDay.length,
      } : null,
      twentyEightDay: twentyEightDay.length ? {
        pass: twentyEightDay.filter(r => parseFloat(getStrength(r)) >= multiStandardTargets.twentyEightDay).length,
        fail: twentyEightDay.filter(r => parseFloat(getStrength(r)) < multiStandardTargets.twentyEightDay).length,
        total: twentyEightDay.length,
      } : null,
    };
  }, [rows, multiStandardTargets]);

  const chartConfig = { strength: { label: "Strength (MPa)", color: "hsl(var(--primary))" } };

  const strengths = rows.map(r => parseFloat(getStrength(r))).filter(Boolean);
  const avgStrength = strengths.length ? (strengths.reduce((a, b) => a + b, 0) / strengths.length).toFixed(2) : "";
  const compResults = useMemo(() => [
    { label: "Avg Strength", value: avgStrength ? `${avgStrength} MPa` : "" },
    { label: "Cubes Tested", value: strengths.length ? String(strengths.length) : "" },
  ], [avgStrength, strengths.length]);
  useTestReport("compressive", strengths.length, compResults);

  const exportPDF = async () => {
    let chartImages = {};
    if (chartData.length >= 1) {
      const chartBase64 = await captureChartAsBase64("compressive-chart");
      if (chartBase64) {
        chartImages = { "Cube Compressive Strengths": chartBase64 };
      }
    }

    const summaryFields = [
      { label: "Avg Strength", value: avgStrength ? `${avgStrength} MPa` : "—" },
      { label: "Cubes Tested", value: strengths.length ? String(strengths.length) : "—" },
      { label: "Pass/Fail Threshold", value: `${passFailThreshold} MPa` },
      { label: "Pass Count", value: String(passFailData.passCount) },
      { label: "Fail Count", value: String(passFailData.failCount) },
      { label: "Pass Rate", value: `${passFailData.passRate.toFixed(0)}%` },
    ];

    const dist = getStrengthDistribution(rows);
    const classificationTable = [{
      headers: ["Classification", "Count"],
      rows: [
        ["Very Low (< 7 MPa)", String(dist.veryLow)],
        ["Low (7–20 MPa)", String(dist.low)],
        ["Normal (20–40 MPa)", String(dist.normal)],
        ["High (> 40 MPa)", String(dist.high)],
      ]
    }];

    generateTestPDF({
      title: "Compressive Strength (Cube Test)",
      ...project,
      fields: summaryFields,
      tables: [
        classificationTable[0],
        {
          headers: ["#", "Cube Mark", "Date of Cast", "Date of Test", "Age", "Dims", "Mass", "Density", "Load", "Strength", "Remarks"],
          rows: rows.map((r, i) => [String(i + 1), r.mark || "—", r.dateOfCast || "—", r.dateOfTest || "—", getAge(r.dateOfCast, r.dateOfTest) || "—", `${r.width}×${r.height}×${r.depth}`, r.mass || "—", getDensity(r) || "—", r.load || "—", getStrength(r) || "—", r.remarks || getRemarks(r) || "—"])
        }
      ],
      chartImages
    });
  };

  const exportXLSX = async () => {
    let chartImages = {};
    if (chartData.length >= 1) {
      const chartBase64 = await captureChartAsBase64("compressive-chart");
      if (chartBase64) {
        chartImages = { "Cube Compressive Strengths": chartBase64 };
      }
    }

    const summaryFields = [
      { label: "Avg Strength", value: avgStrength ? `${avgStrength} MPa` : "—" },
      { label: "Cubes Tested", value: strengths.length ? String(strengths.length) : "—" },
      { label: "Pass/Fail Threshold", value: `${passFailThreshold} MPa` },
      { label: "Pass Count", value: String(passFailData.passCount) },
      { label: "Fail Count", value: String(passFailData.failCount) },
      { label: "Pass Rate", value: `${passFailData.passRate.toFixed(0)}%` },
    ];

    const dist = getStrengthDistribution(rows);
    const classificationTable = {
      headers: ["Classification", "Count"],
      rows: [
        ["Very Low (< 7 MPa)", String(dist.veryLow)],
        ["Low (7–20 MPa)", String(dist.low)],
        ["Normal (20–40 MPa)", String(dist.normal)],
        ["High (> 40 MPa)", String(dist.high)],
      ]
    };

    generateTestExcel({
      data: {
        title: "Compressive Strength (Cube Test)",
        fields: summaryFields,
        tables: [
          classificationTable,
          {
            headers: ["#", "Cube Mark", "Date of Cast", "Date of Test", "Age", "Dims", "Mass", "Density", "Load", "Strength", "Remarks"],
            rows: rows.map((r, i) => [String(i + 1), r.mark || "—", r.dateOfCast || "—", r.dateOfTest || "—", getAge(r.dateOfCast, r.dateOfTest) || "—", `${r.width}×${r.height}×${r.depth}`, r.mass || "—", getDensity(r) || "—", r.load || "—", getStrength(r) || "—", r.remarks || getRemarks(r) || "—"])
          }
        ],
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

  const handlePrint = () => {
    window.print();
  };

  const handleChartClick = (index: number) => {
    setHighlightedRowIndex(highlightedRowIndex === index ? null : index);
  };

  const handleRowClick = (index: number) => {
    setHighlightedRowIndex(highlightedRowIndex === index ? null : index);
  };

  const renderTable = () => (
    <div className="flex flex-col gap-4">
      <div className="mb-6 p-4 bg-gradient-to-r from-amber-50 to-amber-100 rounded-lg border border-amber-200">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">Test Details</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {[
            { label: "Cement", value: testDetails.cement },
            { label: "Fine Aggregate", value: testDetails.fineAggregate },
            { label: "Coarse Aggregate", value: testDetails.coarseAggregate },
            { label: "Contractor", value: testDetails.contractor },
            { label: "Concrete Class", value: testDetails.concreteClass },
            { label: "Section", value: testDetails.section },
            { label: "Made By", value: testDetails.madeBy },
            { label: "Slump", value: testDetails.slump },
            { label: "Client Ref", value: testDetails.clientRef },
            { label: "Date Tested", value: testDetails.dateTested },
          ].map((item) => (
            <div key={item.label} className="flex flex-col">
              <span className="text-xs text-gray-600 font-medium">{item.label}</span>
              <span className="text-sm font-semibold text-gray-900">{item.value || "—"}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border border-border rounded-lg">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left py-2 px-2 font-medium text-muted-foreground text-xs">#</th>
              <th className="text-left py-2 px-2 font-medium text-muted-foreground text-xs">Cube Mark</th>
              <th className="text-left py-2 px-2 font-medium text-muted-foreground text-xs">Date of Cast</th>
              <th className="text-left py-2 px-2 font-medium text-muted-foreground text-xs">Date of Test</th>
              <th className="text-left py-2 px-2 font-medium text-muted-foreground text-xs">Age (days)</th>
              <th className="text-left py-2 px-2 font-medium text-muted-foreground text-xs">Cube Dim (mm)<br/>L × W × H</th>
              <th className="text-left py-2 px-2 font-medium text-muted-foreground text-xs">Mass (g)</th>
              <th className="text-left py-2 px-2 font-medium text-muted-foreground text-xs">Density (kg/m³)</th>
              <th className="text-left py-2 px-2 font-medium text-muted-foreground text-xs">Max Load (kN)</th>
              <th className="text-left py-2 px-2 font-medium text-muted-foreground text-xs">Strength (N/mm²)</th>
              <th className="text-left py-2 px-2 font-medium text-muted-foreground text-xs">Remarks</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const isDensityAbnormal = isAbnormalDensity(row);
              const isHighlighted = highlightedRowIndex === i;
              return (
                <tr
                  key={i}
                  className={`border-b border-border/50 cursor-pointer transition-colors ${isHighlighted ? "bg-blue-100" : isDensityAbnormal ? "bg-red-50" : "hover:bg-muted/30"}`}
                  onClick={() => handleRowClick(i)}
                >
                  <td className="py-1.5 px-2 text-muted-foreground">{i + 1}</td>
                  <td className="py-1.5 px-2"><Input value={row.mark} onChange={(e) => update(i, "mark", e.target.value)} className="h-8 text-sm" placeholder="—" /></td>
                  <td className="py-1.5 px-2"><Input type="date" value={row.dateOfCast} onChange={(e) => update(i, "dateOfCast", e.target.value)} className="h-8 text-sm" /></td>
                  <td className="py-1.5 px-2"><Input type="date" value={row.dateOfTest} onChange={(e) => update(i, "dateOfTest", e.target.value)} className="h-8 text-sm" /></td>
                  <td className="py-1.5 px-2"><CalculatedInput value={getAge(row.dateOfCast, row.dateOfTest)} /></td>
                  <td className="py-1.5 px-2">
                    <div className="flex gap-1 text-xs">
                      <Input type="number" value={row.width} onChange={(e) => update(i, "width", e.target.value)} className="h-8 w-14" placeholder="L" />
                      <span className="text-muted-foreground">×</span>
                      <Input type="number" value={row.height} onChange={(e) => update(i, "height", e.target.value)} className="h-8 w-14" placeholder="W" />
                      <span className="text-muted-foreground">×</span>
                      <Input type="number" value={row.depth} onChange={(e) => update(i, "depth", e.target.value)} className="h-8 w-14" placeholder="H" />
                    </div>
                  </td>
                  <td className="py-1.5 px-2"><Input type="number" value={row.mass} onChange={(e) => update(i, "mass", e.target.value)} className="h-8 text-sm" placeholder="—" /></td>
                  <td className={`py-1.5 px-2 ${isDensityAbnormal ? "text-red-600 font-semibold" : ""}`}><CalculatedInput value={getDensity(row)} /></td>
                  <td className="py-1.5 px-2"><Input type="number" value={row.load} onChange={(e) => update(i, "load", e.target.value)} className="h-8 text-sm" placeholder="0" /></td>
                  <td className="py-1.5 px-2"><CalculatedInput value={getStrength(row)} /></td>
                  <td className="py-1.5 px-2">
                    {editingRemarksIndex === i ? (
                      <div className="flex gap-1">
                        <Input value={row.remarks} onChange={(e) => update(i, "remarks", e.target.value)} className="h-8 text-sm flex-1" placeholder="—" />
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditingRemarksIndex(null)}><CheckCircle2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    ) : (
                      <div className="flex gap-1 items-center group">
                        <CalculatedInput value={row.remarks || getRemarks(row)} />
                        <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100" onClick={() => setEditingRemarksIndex(i)}>
                          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                        </Button>
                      </div>
                    )}
                  </td>
                  <td className="py-1.5 px-1"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setRows(rows.filter((_, j) => j !== i))}><X className="h-3.5 w-3.5" /></Button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between mt-3">
        <Button variant="outline" size="sm" onClick={() => setRows([...rows, { mark: "", dateOfCast: "", dateOfTest: "", load: "", width: "150", height: "150", depth: "150", mass: "", remarks: "" }])}><Plus className="h-3.5 w-3.5 mr-1" /> Add row</Button>
        {saveCompleted ? (
          <Button size="sm" variant="default" onClick={handlePrint}><Printer className="h-3.5 w-3.5 mr-1" /> Print to Browser</Button>
        ) : isSaving ? (
          <Button size="sm" variant="default" disabled><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Saving...</Button>
        ) : (
          <Button size="sm" variant="default" onClick={handleSave}><SaveIcon className="h-3.5 w-3.5 mr-1" /> Save</Button>
        )}
      </div>
    </div>
  );

  const renderAnalytics = () => (
    <div className="flex flex-col gap-4">
      {strengthTrendData.length >= 1 && (
        <div className="rounded-lg border bg-card p-4">
          <Label className="text-xs font-semibold mb-2 block">Strength Trend</Label>
          <ChartContainer config={chartConfig} className="h-[250px] w-full">
            <LineChart data={strengthTrendData} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" className="text-xs" />
              <YAxis className="text-xs" />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line
                type="monotone"
                dataKey="strength"
                stroke="var(--color-strength)"
                dot={{ r: 4, cursor: "pointer" }}
                onClick={(e: any) => handleChartClick(e.payload.index)}
              />
            </LineChart>
          </ChartContainer>
        </div>
      )}

      {densityChartData.length >= 1 && (
        <div className="rounded-lg border bg-card p-4">
          <Label className="text-xs font-semibold mb-2 block">Density Distribution</Label>
          <ChartContainer config={chartConfig} className="h-[200px] w-full">
            <BarChart data={densityChartData} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" className="text-xs" />
              <YAxis className="text-xs" />
              <ChartTooltip
                content={<ChartTooltipContent />}
              />
              <Bar
                dataKey="density"
                fill="hsl(var(--primary))"
                onClick={(e: any) => handleChartClick(e.payload.index)}
                radius={[4, 4, 0, 0]}
              >
                {densityChartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.isAbnormal ? "#ef4444" : "hsl(var(--primary))"} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        </div>
      )}

      {strengthDistribution.some(d => d.value > 0) && (
        <div className="rounded-lg border bg-card p-4">
          <Label className="text-xs font-semibold mb-2 block">Strength Classification</Label>
          <ChartContainer config={chartConfig} className="h-[200px] w-full">
            <PieChart>
              <Pie data={strengthDistribution} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}>
                {strengthDistribution.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <ChartTooltip content={<ChartTooltipContent />} />
            </PieChart>
          </ChartContainer>
        </div>
      )}

      <div className="rounded-lg border bg-card p-4">
        <Label className="text-xs font-semibold mb-3 block">Pass/Fail Summary</Label>
        <Tabs value={passFailMode} onValueChange={(v) => setPassFailMode(v as "simple" | "multi")}>
          <TabsList className="mb-3 w-full">
            <TabsTrigger value="simple" className="flex-1">Simple Mode</TabsTrigger>
            <TabsTrigger value="multi" className="flex-1">Multi-Standard</TabsTrigger>
          </TabsList>

          <TabsContent value="simple" className="space-y-3 mt-0">
            <div className="flex items-center gap-2">
              <Label className="text-xs">Threshold (MPa):</Label>
              <Input
                type="number"
                value={passFailThreshold}
                onChange={(e) => setPassFailThreshold(parseFloat(e.target.value) || 25)}
                className="h-8 w-20 text-sm"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded bg-green-50 border border-green-200 p-3 text-center">
                <div className="text-2xl font-bold text-green-600">{passFailData.passCount}</div>
                <div className="text-xs text-green-700">Pass</div>
              </div>
              <div className="rounded bg-red-50 border border-red-200 p-3 text-center">
                <div className="text-2xl font-bold text-red-600">{passFailData.failCount}</div>
                <div className="text-xs text-red-700">Fail</div>
              </div>
              <div className={`rounded p-3 text-center border ${passFailData.passRate >= 80 ? "bg-green-50 border-green-200" : passFailData.passRate >= 50 ? "bg-yellow-50 border-yellow-200" : "bg-red-50 border-red-200"}`}>
                <div className={`text-2xl font-bold ${passFailData.passRate >= 80 ? "text-green-600" : passFailData.passRate >= 50 ? "text-yellow-600" : "text-red-600"}`}>
                  {passFailData.passRate.toFixed(0)}%
                </div>
                <div className={`text-xs ${passFailData.passRate >= 80 ? "text-green-700" : passFailData.passRate >= 50 ? "text-yellow-700" : "text-red-700"}`}>Pass Rate</div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="multi" className="space-y-3 mt-0">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label className="text-xs w-20">7-Day (MPa):</Label>
                <Input
                  type="number"
                  value={multiStandardTargets.sevenDay}
                  onChange={(e) => setMultiStandardTargets(prev => ({ ...prev, sevenDay: parseFloat(e.target.value) || 17 }))}
                  className="h-8 flex-1 text-sm"
                />
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs w-20">28-Day (MPa):</Label>
                <Input
                  type="number"
                  value={multiStandardTargets.twentyEightDay}
                  onChange={(e) => setMultiStandardTargets(prev => ({ ...prev, twentyEightDay: parseFloat(e.target.value) || 25 }))}
                  className="h-8 flex-1 text-sm"
                />
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs w-20">Custom (MPa):</Label>
                <Input
                  type="number"
                  value={multiStandardTargets.custom}
                  onChange={(e) => setMultiStandardTargets(prev => ({ ...prev, custom: parseFloat(e.target.value) || 30 }))}
                  className="h-8 flex-1 text-sm"
                />
              </div>
            </div>
            {multiStandardResults.sevenDay && (
              <div className="rounded bg-blue-50 border border-blue-200 p-3">
                <div className="text-xs font-semibold text-blue-900 mb-2">7-Day Results</div>
                <div className="text-sm text-blue-700">Pass: {multiStandardResults.sevenDay.pass} / {multiStandardResults.sevenDay.total}</div>
              </div>
            )}
            {multiStandardResults.twentyEightDay && (
              <div className="rounded bg-purple-50 border border-purple-200 p-3">
                <div className="text-xs font-semibold text-purple-900 mb-2">28-Day Results</div>
                <div className="text-sm text-purple-700">Pass: {multiStandardResults.twentyEightDay.pass} / {multiStandardResults.twentyEightDay.total}</div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {chartData.length >= 1 && (
        <div className="rounded-lg border bg-card p-4">
          <Label className="text-xs font-semibold mb-2 block">Cube Compressive Strengths</Label>
          <ChartContainer id="compressive-chart" config={chartConfig} className="h-[250px] w-full">
            <BarChart data={chartData} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" className="text-xs" />
              <YAxis className="text-xs" />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="strength" name="strength" fill="var(--color-strength)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </div>
      )}
    </div>
  );

  return (
    <TestSection title="Compressive Strength (Cube Test)" testKey={testKey} onClear={() => setRows([{ mark: "", dateOfCast: "", dateOfTest: "", load: "", width: "150", height: "150", depth: "150", mass: "", remarks: "" }])}>
      <>
        <div className="flex flex-col gap-6 w-full">
          <div className="w-full">
            {renderTable()}
          </div>
          <div className="w-full">
            {renderAnalytics()}
          </div>
        </div>
      </>
    </TestSection>
  );
};

export default CompressiveStrengthTest;
