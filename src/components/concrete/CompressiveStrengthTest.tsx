import { useState, useMemo, useCallback, useEffect } from "react";
import TestSection from "@/components/TestSection";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import CalculatedInput from "@/components/CalculatedInput";
import { Plus, X, Save as SaveIcon, Printer, Loader2, CheckCircle2 } from "lucide-react";
import { useProject } from "@/context/ProjectContext";
import { useTestData } from "@/context/TestDataContext";
import { generateTestPDF } from "@/lib/pdfGenerator";
import { generateTestCSV } from "@/lib/csvExporter";
import { generateTestExcel } from "@/lib/genericExcelExporter";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { Label } from "@/components/ui/label";
import { useTestReport } from "@/hooks/useTestReport";
import { captureChartAsBase64 } from "@/lib/chartCapture";
import { saveCompressiveTest } from "@/lib/api";
import { toast } from "sonner";

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
  const [testDetails, setTestDetails] = useState<TestDetails>(() =>
    testData.concreteTestMetadata || {
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
    }
  );
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
    const volume = (w * h * d) / 1000000; // mm³ to cm³
    return (mass / volume).toFixed(0);
  };

  const getStrength = (row: Row) => {
    const load = parseFloat(row.load);
    const w = parseFloat(row.width);
    const h = parseFloat(row.height);
    if (!load || !w || !h) return "";
    return ((load * 1000) / (w * h)).toFixed(2);
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

    generateTestPDF({
      title: "Compressive Strength (Cube Test)",
      ...project,
      tables: [{
        headers: ["#", "Cube Mark", "Date of Cast", "Date of Test", "Age", "Dims", "Mass", "Density", "Load", "Strength", "Remarks"],
        rows: rows.map((r, i) => [i + 1, r.mark || "—", r.dateOfCast || "—", r.dateOfTest || "—", getAge(r.dateOfCast, r.dateOfTest) || "—", `${r.width}×${r.height}×${r.depth}`, r.mass || "—", getDensity(r) || "—", r.load || "—", getStrength(r) || "—", r.remarks || "—"])
      }],
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

    generateTestExcel({
      data: {
        title: "Compressive Strength (Cube Test)",
        fields: [
          { label: "Avg Strength", value: avgStrength ? `${avgStrength} MPa` : "—" },
          { label: "Cubes Tested", value: strengths.length ? String(strengths.length) : "—" },
        ],
        tables: [{
          headers: ["#", "Cube Mark", "Date of Cast", "Date of Test", "Age", "Dims", "Mass", "Density", "Load", "Strength", "Remarks"],
          rows: rows.map((r, i) => [i + 1, r.mark || "—", r.dateOfCast || "—", r.dateOfTest || "—", getAge(r.dateOfCast, r.dateOfTest) || "—", `${r.width}×${r.height}×${r.depth}`, r.mass || "—", getDensity(r) || "—", r.load || "—", getStrength(r) || "—", r.remarks || "—"])
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

  const handlePrint = () => {
    window.print();
  };

  return (
    <TestSection title="Compressive Strength (Cube Test)" testKey={testKey} onClear={() => setRows([{ mark: "", dateOfCast: "", dateOfTest: "", load: "", width: "150", height: "150", depth: "150", mass: "", remarks: "" }])}>
      <>
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
                {rows.map((row, i) => (
                  <tr key={i} className="border-b border-border/50">
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
                    <td className="py-1.5 px-2"><CalculatedInput value={getDensity(row)} /></td>
                    <td className="py-1.5 px-2"><Input type="number" value={row.load} onChange={(e) => update(i, "load", e.target.value)} className="h-8 text-sm" placeholder="0" /></td>
                    <td className="py-1.5 px-2"><CalculatedInput value={getStrength(row)} /></td>
                    <td className="py-1.5 px-2"><Input value={row.remarks} onChange={(e) => update(i, "remarks", e.target.value)} className="h-8 text-sm" placeholder="—" /></td>
                    <td className="py-1.5 px-1"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setRows(rows.filter((_, j) => j !== i))}><X className="h-3.5 w-3.5" /></Button></td>
                  </tr>
                ))}
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

          {chartData.length >= 1 && (
            <div className="mt-6">
              <Label className="text-xs text-muted-foreground mb-2 block">Cube Compressive Strengths</Label>
              <ChartContainer id="compressive-chart" config={chartConfig} className="h-[300px] w-full">
                <BarChart data={chartData} margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" label={{ value: "Cube ID", position: "insideBottom", offset: -10, className: "fill-muted-foreground text-xs" }} />
                  <YAxis domain={[0, "dataMax + 5"]} label={{ value: "Strength (MPa)", angle: -90, position: "insideLeft", offset: 5, className: "fill-muted-foreground text-xs" }} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="strength" name="strength" fill="var(--color-strength)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </div>
          )}
      </>
    </TestSection>
  );
};

export default CompressiveStrengthTest;
