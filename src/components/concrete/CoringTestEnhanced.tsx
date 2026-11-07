import { useState, useMemo, useEffect } from "react";
import TestSection from "@/components/TestSection";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import CalculatedInput from "@/components/CalculatedInput";
import { Plus, X, Image, Upload, Trash2, ArrowLeft, FilePlus, Loader2 } from "lucide-react";
import { useProject } from "@/context/ProjectContext";
import { generateTestPDF } from "@/lib/pdfGenerator";
import { captureChartAsBase64 } from "@/lib/chartCapture";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { useTestReport } from "@/hooks/useTestReport";
import { useNavigate } from "react-router-dom";
import { saveReceptionConsignment, listRecords, createRecord } from "@/lib/api";
import { emptyReceptionConsignment, nextRcNo, emptyReceptionSample, nextLabId, type ReceptionConsignmentInput, type ReceptionSampleInput } from "@/lib/reception";
import { useSession } from "@/context/SessionContext";

interface CoringRow {
  coreId: string;
  diameter: string;
  lengthBefore: string;
  lengthAfter: string;
  weightInAir: string;
  load: string;
  depth: string;
  failureMode: string;
  comments: string;
  pileBeforeImage?: string;
  pileAfterImage?: string;
}

interface CoringTestProps {
  testKey?: string;
}

const DEPTH_OPTIONS = [
  "0.0-2.0",
  "2.0-15.0",
  "15.0-30.0",
  "30.0-45.0",
  "45.0-60.0",
  "Custom"
];

const CONCRETE_CLASSES = ["45 MPA", "40 MPA", "35 MPA", "30 MPA", "25 MPA", "20 MPA", "Custom"];

const FAILURE_MODES = [
  "Sparsely distributed aggregates with maximum size approximately 20mm",
  "Dense aggregates with maximum size approximately 20mm",
  "Aggregate crushing",
  "Cement paste failure",
  "Mixed failure",
  "Custom"
];

const CORING_ROW_DEFAULTS = {
  coreId: "CR1",
  diameter: "75",
  lengthBefore: "",
  lengthAfter: "",
  weightInAir: "",
  load: "",
  depth: "0.0-2.0",
  failureMode: "Sparsely distributed aggregates with maximum size approximately 20mm",
  comments: "",
  pileBeforeImage: "",
  pileAfterImage: "",
};

export const CoringTest = ({ testKey }: CoringTestProps) => {
  const project = useProject();
  const navigate = useNavigate();
  const { user } = useSession();
  const [rows, setRows] = useState<CoringRow[]>([
    { ...CORING_ROW_DEFAULTS, coreId: "CR1" },
    { ...CORING_ROW_DEFAULTS, coreId: "CR2" },
  ]);
  const [isSaved, setIsSaved] = useState(false);
  const [projectDetails, setProjectDetails] = useState({
    projectName: "PROPOSED NSSF TWIN TOWERS, NAIROBI COUNTY",
    tower: "TOWER A",
    concreteClass: "45 MPA",
    ageOfConcrete: "over 28 days",
    dateOfTest: "2026-10-09",
    dateReported: "2026-10-17",
    testedBy: "PUAL N",
    checkedBy: "PUAL N",
    location: "",
    sampleNo: "PILE 03 BH2",
  });
  const [receptionMode, setReceptionMode] = useState(false);
  const [rcNo, setRcNo] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  const getLDRatio = (row: CoringRow) => {
    const d = parseFloat(row.diameter);
    const l = parseFloat(row.lengthAfter);
    if (!d || !l) return "";
    return (l / d).toFixed(2);
  };

  const getCoreStrength = (row: CoringRow) => {
    const d = parseFloat(row.diameter);
    const load = parseFloat(row.load);
    if (!d || !load) return "";
    const area = Math.PI * (d / 2) ** 2;
    return ((load * 1000) / area).toFixed(2);
  };

  const getCorrectedStrength = (row: CoringRow) => {
    const strength = parseFloat(getCoreStrength(row));
    const ld = parseFloat(getLDRatio(row));
    if (!strength || !ld) return "";
    let factor = 1.0;
    if (ld < 2.0) factor = 0.87 + 0.065 * ld;
    return (strength * factor).toFixed(2);
  };

  const getDensity = (row: CoringRow) => {
    const weight = parseFloat(row.weightInAir);
    const d = parseFloat(row.diameter);
    const l = parseFloat(row.lengthAfter);
    if (!weight || !d || !l) return "";
    const volume = (Math.PI * (d / 2) ** 2 * l) / 1000000000;
    if (volume <= 0) return "";
    return (weight / 1000 / volume).toFixed(0);
  };

  const getCdFactor = (row: CoringRow) => {
    const ld = parseFloat(getLDRatio(row));
    if (ld >= 2.0) return "1.00";
    return (0.87 + 0.065 * ld).toFixed(2);
  };

  const update = (i: number, field: keyof CoringRow, val: string) => {
    const next = [...rows];
    next[i] = { ...next[i], [field]: val };
    setRows(next);
  };

  const updateProjectDetail = (field: string, val: string) => {
    setProjectDetails(prev => ({ ...prev, [field]: val }));
  };

  const strengths = rows.map(r => parseFloat(getCorrectedStrength(r))).filter(Boolean);
  const avgStrength = strengths.length ? (strengths.reduce((a, b) => a + b, 0) / strengths.length).toFixed(2) : "";

  const chartData = useMemo(() =>
    rows.filter(r => getCorrectedStrength(r)).map(r => ({ name: r.coreId || "—", strength: parseFloat(getCorrectedStrength(r)) })),
    [rows]
  );
  const chartConfig = { strength: { label: "Corrected Strength (MPa)", color: "hsl(var(--primary))" } };

  const results = useMemo(() => [
    { label: "Avg Corrected Strength", value: avgStrength ? `${avgStrength} MPa` : "" },
    { label: "Cores Tested", value: strengths.length ? String(strengths.length) : "" },
  ], [avgStrength, strengths.length]);
  useTestReport("coring", strengths.length, results);

  const handleImageUpload = async (index: number, field: "pileBeforeImage" | "pileAfterImage", file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("image_type", field === "pileBeforeImage" ? "pile_before" : "pile_after");
    
    try {
      const response = await fetch("/api.php?action=upload-admin-image", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.file_path) {
          const next = [...rows];
          next[index] = { ...next[index], [field]: data.file_path };
          setRows(next);
        }
      }
    } catch (error) {
      console.error("Image upload failed:", error);
    }
  };

  const handleCreateProject = async () => {
    if (!projectDetails.projectName.trim() || !projectDetails.tower.trim()) {
      alert("Please fill in Project Name and Tower");
      return;
    }
    
    setIsProcessing(true);
    try {
      // Create reception consignment
      const consignments = await listRecords<{ rc_no: string }>("reception_consignments", { limit: 500 });
      const newRcNo = nextRcNo(consignments.data?.map(c => c.rc_no) || []);
      
      const consignment: ReceptionConsignmentInput = emptyReceptionConsignment(newRcNo);
      consignment.jobNo = projectDetails.projectName;
      consignment.project = projectDetails.tower;
      consignment.client = "NSSF";
      consignment.receivedAt = new Date().toISOString().slice(0, 16);
      consignment.receivedBy = user?.name || "PUAL N";
      consignment.methodSet = "BS EN 12504-1:2009";
      consignment.status = "processed";
      consignment.cubeCastDate = projectDetails.dateOfTest;
      
      // Create samples from rows
      consignment.samples = rows.map((row, i) => {
        const sample = emptyReceptionSample(`CR${i + 1}`);
        sample.clientMark = row.coreId;
        sample.location = projectDetails.tower;
        sample.depthLabel = row.depth;
        sample.sampleType = "Concrete cube";
        sample.container = "Core sample";
        sample.tests = ["CMP"];
        sample.massKg = row.weightInAir;
        sample.condition = "Intact";
        return sample;
      });
      
      await saveReceptionConsignment(consignment);
      
      // Create project from consignment
      const { processReceptionToProject } = await import("@/lib/api");
      const result = await processReceptionToProject(consignment, "compressive");
      
      if (result.projectId) {
        setReceptionMode(false);
        navigate(`/projects/${result.projectId}`);
      }
    } catch (error) {
      console.error("Project creation failed:", error);
      alert("Failed to create project. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const tableData = {
    headers: ["Core ID", "Depth (m)", "Dia (mm)", "L Before (mm)", "L After (mm)", "L/D", "Weight (g)", "Load (kN)", "Core Str (MPa)", "Cd Factor", "Corrected (MPa)", "Density (kg/m³)", "Failure Mode"],
    rows: rows.map(r => [
      r.coreId,
      r.depth,
      r.diameter,
      r.lengthBefore || "—",
      r.lengthAfter || "—",
      getLDRatio(r) || "—",
      r.weightInAir || "—",
      r.load || "—",
      getCoreStrength(r) || "—",
      getCdFactor(r) || "—",
      getCorrectedStrength(r) || "—",
      getDensity(r) || "—",
      r.failureMode,
    ])
  };

  const exportPDF = async () => {
    let chartImages = {};
    if (chartData.length >= 1) {
      const chartBase64 = await captureChartAsBase64("coring-chart");
      if (chartBase64) {
        chartImages = { "Corrected Core Strengths": chartBase64 };
      }
    }

    // Include before/after images in PDF
    const pileImages: Record<string, string> = {};
    rows.forEach((row, i) => {
      if (row.pileBeforeImage) {
        try {
          const response = await fetch(row.pileBeforeImage);
          if (response.ok) {
            const blob = await response.blob();
            const reader = new FileReader();
            reader.onload = () => {
              pileImages[`Core ${row.coreId} - Before Test`] = reader.result as string;
            };
            reader.readAsDataURL(blob);
          }
        } catch {}
      }
      if (row.pileAfterImage) {
        try {
          const response = await fetch(row.pileAfterImage);
          if (response.ok) {
            const blob = await response.blob();
            const reader = new FileReader();
            reader.onload = () => {
              pileImages[`Core ${row.coreId} - After Test`] = reader.result as string;
            };
            reader.readAsDataURL(blob);
          }
        } catch {}
      }
    });

    // Wait a bit for images to load
    await new Promise(r => setTimeout(r, 500));

    generateTestPDF({ 
      title: "Compressive Strength of Concrete Cores (BS EN 12504-1:2009)", 
      ...project, 
      ...projectDetails,
      tables: [tableData], 
      chartImages,
      pileImages,
    });
  };

  const canExport = !!project.currentProjectId || isSaved;

  return (
    <TestSection 
      title="Compressive Strength of Concrete Cores (BS EN 12504-1:2009)" 
      testKey={testKey} 
      onSave={() => setIsSaved(true)} 
      onClear={() => setRows([{ ...CORING_ROW_DEFAULTS, coreId: "CR1" }, { ...CORING_ROW_DEFAULTS, coreId: "CR2" }])}
      onExportPDF={exportPDF} 
      canExport={canExport}
    >
      {/* Project Details */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-sm">Project & Sample Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="projectName">Project Name</Label>
            <Input id="projectName" value={projectDetails.projectName} onChange={(e) => updateProjectDetail("projectName", e.target.value)} className="h-8 text-xs" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tower">Tower / Location</Label>
            <Input id="tower" value={projectDetails.tower} onChange={(e) => updateProjectDetail("tower", e.target.value)} className="h-8 text-xs" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="concreteClass">Concrete Class</Label>
            <Select value={projectDetails.concreteClass} onValueChange={(v) => updateProjectDetail("concreteClass", v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CONCRETE_CLASSES.map(c => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ageOfConcrete">Age of Concrete</Label>
            <Input id="ageOfConcrete" value={projectDetails.ageOfConcrete} onChange={(e) => updateProjectDetail("ageOfConcrete", e.target.value)} className="h-8 text-xs" placeholder="over 28 days" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dateOfTest">Date of Test</Label>
            <Input id="dateOfTest" type="date" value={projectDetails.dateOfTest} onChange={(e) => updateProjectDetail("dateOfTest", e.target.value)} className="h-8 text-xs" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dateReported">Date Reported</Label>
            <Input id="dateReported" type="date" value={projectDetails.dateReported} onChange={(e) => updateProjectDetail("dateReported", e.target.value)} className="h-8 text-xs" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="testedBy">Tested By</Label>
            <Input id="testedBy" value={projectDetails.testedBy} onChange={(e) => updateProjectDetail("testedBy", e.target.value)} className="h-8 text-xs" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="checkedBy">Checked By</Label>
            <Input id="checkedBy" value={projectDetails.checkedBy} onChange={(e) => updateProjectDetail("checkedBy", e.target.value)} className="h-8 text-xs" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sampleNo">Sample No.</Label>
            <Input id="sampleNo" value={projectDetails.sampleNo} onChange={(e) => updateProjectDetail("sampleNo", e.target.value)} className="h-8 text-xs" />
          </div>
        </CardContent>
      </Card>

      {/* Core Data Entry */}
      <div className="overflow-x-auto mb-4">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="text-left py-1.5 px-1.5 font-medium text-muted-foreground">Core ID</th>
              <th className="text-left py-1.5 px-1.5 font-medium text-muted-foreground">Depth (m)</th>
              <th className="text-left py-1.5 px-1.5 font-medium text-muted-foreground">Dia (mm)</th>
              <th className="text-left py-1.5 px-1.5 font-medium text-muted-foreground">L Before (mm)</th>
              <th className="text-left py-1.5 px-1.5 font-medium text-muted-foreground">L After (mm)</th>
              <th className="text-left py-1.5 px-1.5 font-medium text-muted-foreground">L/D</th>
              <th className="text-left py-1.5 px-1.5 font-medium text-muted-foreground">Wt Air (g)</th>
              <th className="text-left py-1.5 px-1.5 font-medium text-muted-foreground">Load (kN)</th>
              <th className="text-left py-1.5 px-1.5 font-medium text-muted-foreground">Core Str (MPa)</th>
              <th className="text-left py-1.5 px-1.5 font-medium text-muted-foreground">Cd Factor</th>
              <th className="text-left py-1.5 px-1.5 font-medium text-muted-foreground">Corrected (MPa)</th>
              <th className="text-left py-1.5 px-1.5 font-medium text-muted-foreground">Density (kg/m³)</th>
              <th className="text-left py-1.5 px-1.5 font-medium text-muted-foreground">Failure Mode</th>
              <th className="text-left py-1.5 px-1.5 font-medium text-muted-foreground w-32">Before Test</th>
              <th className="text-left py-1.5 px-1.5 font-medium text-muted-foreground w-32">After Test</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-border/50">
                <td className="py-1 px-1.5"><Input value={row.coreId} onChange={(e) => update(i, "coreId", e.target.value)} className="h-7 w-16 text-xs" /></td>
                <td className="py-1 px-1.5">
                  <Select value={row.depth} onValueChange={(v) => update(i, "depth", v)}>
                    <SelectTrigger className="h-7 w-24 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DEPTH_OPTIONS.map(d => <SelectItem key={d} value={d} className="text-xs">{d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </td>
                <td className="py-1 px-1.5"><Input type="number" value={row.diameter} onChange={(e) => update(i, "diameter", e.target.value)} className="h-7 w-16 text-xs" placeholder="75" /></td>
                <td className="py-1 px-1.5"><Input type="number" value={row.lengthBefore} onChange={(e) => update(i, "lengthBefore", e.target.value)} className="h-7 w-20 text-xs" placeholder="150" /></td>
                <td className="py-1 px-1.5"><Input type="number" value={row.lengthAfter} onChange={(e) => update(i, "lengthAfter", e.target.value)} className="h-7 w-20 text-xs" placeholder="150" /></td>
                <td className="py-1 px-1.5"><CalculatedInput value={getLDRatio(row)} className="h-7" /></td>
                <td className="py-1 px-1.5"><Input type="number" value={row.weightInAir} onChange={(e) => update(i, "weightInAir", e.target.value)} className="h-7 w-20 text-xs" placeholder="0" /></td>
                <td className="py-1 px-1.5"><Input type="number" value={row.load} onChange={(e) => update(i, "load", e.target.value)} className="h-7 w-20 text-xs" placeholder="0" /></td>
                <td className="py-1 px-1.5"><CalculatedInput value={getCoreStrength(row)} className="h-7" /></td>
                <td className="py-1 px-1.5"><CalculatedInput value={getCdFactor(row)} className="h-7" /></td>
                <td className="py-1 px-1.5"><CalculatedInput value={getCorrectedStrength(row)} className="h-7 font-medium" /></td>
                <td className="py-1 px-1.5"><CalculatedInput value={getDensity(row)} className="h-7" /></td>
                <td className="py-1 px-1.5">
                  <Select value={row.failureMode} onValueChange={(v) => update(i, "failureMode", v)}>
                    <SelectTrigger className="h-7 w-full text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FAILURE_MODES.map(f => <SelectItem key={f} value={f} className="text-xs">{f}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </td>
                <td className="py-1 px-1.5">
                  <div className="flex flex-col gap-1">
                    {row.pileBeforeImage ? (
                      <div className="relative w-28 h-20">
                        <img src={row.pileBeforeImage} alt="Before" className="w-full h-full object-cover rounded border" />
                        <Button variant="ghost" size="icon" className="absolute top-1 right-1 h-5 w-5 p-0" onClick={() => update(i, "pileBeforeImage", "")}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    ) : (
                      <label className="relative cursor-pointer">
                        <input type="file" accept="image/*" className="sr-only" onChange={(e) => e.target.files[0] && handleImageUpload(i, "pileBeforeImage", e.target.files[0])} />
                        <div className="w-28 h-20 border-2 border-dashed border-border rounded flex items-center justify-center bg-muted/50">
                          <Upload className="h-4 w-4 text-muted-foreground" />
                          <span className="text-[10px] text-muted-foreground">Before</span>
                        </div>
                      </label>
                    )}
                  </div>
                </td>
                <td className="py-1 px-1.5">
                  <div className="flex flex-col gap-1">
                    {row.pileAfterImage ? (
                      <div className="relative w-28 h-20">
                        <img src={row.pileAfterImage} alt="After" className="w-full h-full object-cover rounded border" />
                        <Button variant="ghost" size="icon" className="absolute top-1 right-1 h-5 w-5 p-0" onClick={() => update(i, "pileAfterImage", "")}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    ) : (
                      <label className="relative cursor-pointer">
                        <input type="file" accept="image/*" className="sr-only" onChange={(e) => e.target.files[0] && handleImageUpload(i, "pileAfterImage", e.target.files[0])} />
                        <div className="w-28 h-20 border-2 border-dashed border-border rounded flex items-center justify-center bg-muted/50">
                          <Upload className="h-4 w-4 text-muted-foreground" />
                          <span className="text-[10px] text-muted-foreground">After</span>
                        </div>
                      </label>
                    )}
                  </div>
                </td>
                <td className="py-1 px-1"><Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setRows(rows.filter((_, j) => j !== i))}><X className="h-3 w-3" /></Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Button variant="outline" size="sm" className="mb-4" onClick={() => setRows([...rows, { ...CORING_ROW_DEFAULTS, coreId: `CR${rows.length + 1}` }])}>
        <Plus className="h-3.5 w-3.5 mr-1" /> Add Core
      </Button>

      {/* Comments */}
      <div className="mb-4 grid grid-cols-2 gap-4">
        {rows.map((row, i) => (
          <div key={i} className="space-y-1">
            <Label className="text-xs">Comments - Core {row.coreId}</Label>
            <Input value={row.comments} onChange={(e) => update(i, "comments", e.target.value)} className="h-8 text-xs" placeholder="Sparsely distributed aggregates..." />
          </div>
        ))}
      </div>

      {/* Reception / Project Creation Actions */}
      <Card className="mb-4 border-primary">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <FilePlus className="h-4 w-4" />
            Reception & Project Creation
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <Label className="text-xs">RC No.</Label>
            <Input value={rcNo} onChange={(e) => setRcNo(e.target.value)} className="h-8 w-40 text-xs" placeholder="Auto-generated" readOnly />
            <Button variant="outline" size="sm" onClick={async () => {
              const consignments = await listRecords<{ rc_no: string }>("reception_consignments", { limit: 500 });
              setRcNo(nextRcNo(consignments.data?.map(c => c.rc_no) || []));
            }}>
              Generate RC No.
            </Button>
          </div>
          
          <div className="flex gap-2">
            <Button 
              variant="default" 
              className="gap-2 bg-[#0f6b5c] hover:bg-[#0c5a4a]"
              onClick={handleCreateProject}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating Project...
                </>
              ) : (
                <>
                  <FilePlus className="h-4 w-4" />
                  Create Project from Reception
                </>
              )}
            </Button>
            <Button variant="outline" onClick={() => setReceptionMode(!receptionMode)}>
              {receptionMode ? <ArrowLeft className="h-4 w-4 mr-1" /> Back : <ArrowLeft className="h-4 w-4 mr-1" /> Reception Dashboard}
            </Button>
          </div>

          {receptionMode && (
            <div className="p-3 bg-muted/50 rounded text-xs text-muted-foreground">
              Reception mode: Go to <strong>/reception/new</strong> to log a consignment, or use the dashboard at <strong>/reception</strong>.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Chart */}
      {chartData.length >= 1 && (
        <div className="mt-6">
          <Label className="text-xs text-muted-foreground mb-2 block">Corrected Core Strengths</Label>
          <ChartContainer id="coring-chart" config={chartConfig} className="h-[300px] w-full">
            <BarChart data={chartData} margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" label={{ value: "Core ID", position: "insideBottom", offset: -10, className: "fill-muted-foreground text-xs" }} />
              <YAxis domain={[0, "dataMax + 5"]} label={{ value: "Strength (MPa)", angle: -90, position: "insideLeft", offset: 5, className: "fill-muted-foreground text-xs" }} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="strength" name="strength" fill="var(--color-strength)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </div>
      )}
    </TestSection>
  );
};

export default CoringTest;