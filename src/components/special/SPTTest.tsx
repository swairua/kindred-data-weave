import { useState, useMemo, useEffect } from "react";
import TestSection from "@/components/TestSection";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, X } from "lucide-react";
import { useProject } from "@/context/ProjectContext";
import { generateTestPDF, printPDFDocument } from "@/lib/pdfGenerator";
import { useTestReport } from "@/hooks/useTestReport";
import { loadTestResult, saveTestResult } from "@/lib/testResultPersistence";
import { useGridArrowNavigation } from "@/hooks/useGridArrowNavigation";

interface Row { 
  depth: string; 
  blowCount: string; 
  n60?: string; 
  n1_60?: string; 
}

interface SavedPayload {
  rows: Row[];
  testedBy?: string;
  dateTested?: string;
  // Correction factors
  energyRatio?: string;    // ER (%)
  boreholeDiameter?: string; // mm
  rodLength?: string;      // m
  samplingMethod?: string; // "standard" | "liners"
  overburdenPressure?: string; // kPa
}

const SPTTest = ({ testKey }: { testKey?: string }) => {
  const project = useProject();
  const gridNav = useGridArrowNavigation<HTMLTableElement>();
  const [rows, setRows] = useState<Row[]>([{ depth: "", blowCount: "", n60: "", n1_60: "" }]);
  const [testedBy, setTestedBy] = useState("");
  const [dateTested, setDateTested] = useState("");
  const projectId = project.currentProjectId ?? null;
  const [recordId, setRecordId] = useState<number | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  
  // Correction factors
  const [energyRatio, setEnergyRatio] = useState("60");     // ER (%)
  const [boreholeDiameter, setBoreholeDiameter] = useState("100"); // mm
  const [rodLength, setRodLength] = useState("10");         // m
  const [samplingMethod, setSamplingMethod] = useState("standard"); // "standard" | "liners"
  const [overburdenPressure, setOverburdenPressure] = useState("100"); // kPa
  
  const update = (i: number, field: keyof Row, val: string) => { 
    const next = [...rows]; 
    next[i] = { ...next[i], [field]: val }; 
    // Auto-calculate N60 and N1,60
    if ((field === "blowCount" || field === "depth") && next[i].blowCount) {
      const n = parseFloat(next[i].blowCount);
      if (n && !isNaN(n)) {
        const n60 = calculateN60(n, energyRatio);
        next[i].n60 = n60.toFixed(1);
        const n1_60 = calculateN1_60(n60, overburdenPressure);
        next[i].n1_60 = n1_60.toFixed(1);
      }
    }
    setRows(next); 
  };

  // SPT Correction factors
  // N60 = N * (ER/60) * CB * CS * CR
  // CB = Borehole diameter correction
  // CS = Sampling method correction  
  // CR = Rod length correction
  // N1,60 = N60 * (Pa/σ'v)^0.5 (overburden correction)
  
  const getBoreholeCorrection = (diameter: string): number => {
    const d = parseFloat(diameter);
    if (!d) return 1.0;
    if (d <= 65) return 1.0;
    if (d <= 80) return 1.05;
    if (d <= 100) return 1.15;
    if (d <= 150) return 1.15;
    return 1.15;
  };
  
  const getSamplingCorrection = (method: string): number => {
    return method === "liners" ? 0.85 : 1.0;
  };
  
  const getRodCorrection = (length: string): number => {
    const l = parseFloat(length);
    if (!l) return 1.0;
    if (l < 3) return 0.75;
    if (l < 4) return 0.85;
    if (l < 6) return 0.95;
    if (l < 10) return 1.0;
    if (l < 30) return 1.15;
    return 1.15;
  };
  
  const calculateN60 = (n: number, energyRatio: string): number => {
    const er = parseFloat(energyRatio) || 60;
    const cb = getBoreholeCorrection(boreholeDiameter);
    const cs = getSamplingCorrection(samplingMethod);
    const cr = getRodCorrection(rodLength);
    return n * (er / 60) * cb * cs * cr;
  };
  
  const calculateN1_60 = (n60: number, overburden: string): number => {
    const pa = 100; // reference pressure kPa
    const sigmaV = parseFloat(overburden) || 100;
    if (sigmaV <= 0) return n60;
    return n60 * Math.sqrt(pa / sigmaV);
  };

  const filledSPT = rows.filter(r => r.depth && r.blowCount).length;
  const sptResults = useMemo(() => {
    const blows = rows.map(r => parseFloat(r.blowCount)).filter(Boolean);
    const avg = blows.length ? (blows.reduce((a, b) => a + b, 0) / blows.length).toFixed(0) : "";
    return [{ label: "Avg N-value", value: avg }];
  }, [rows]);
  useTestReport("spt", filledSPT, sptResults);

  useEffect(() => {
    if (!projectId) return;
    let active = true;
    loadTestResult(projectId, "spt")
      .then((result) => {
        if (!active || !result) return;
        setRecordId(result.id);
        setIsSaved(true);
        const payload: Partial<SavedPayload> = (result.payload_json as SavedPayload | null) ?? {};
        if (Array.isArray(payload.rows) && payload.rows.length > 0) setRows(payload.rows);
        if (payload.testedBy) setTestedBy(payload.testedBy);
        if (payload.dateTested) setDateTested(payload.dateTested);
      })
      .catch((error) => console.error("Failed to load SPT result", error));
    return () => { active = false; };
  }, [projectId]);

  const save = async () => {
    if (!projectId) throw new Error("Select a project before saving this SPT test");
    const savedId = await saveTestResult(projectId, recordId, {
      test_key: "spt",
      name: "SPT (Standard Penetration Test)",
      category: "soil",
      status: filledSPT === 0 ? "not-started" : filledSPT < rows.length ? "in-progress" : "completed",
      data_points: filledSPT,
      key_results_json: sptResults.filter((result) => result.value),
      payload_json: { rows, testedBy, dateTested },
    });
    setRecordId(savedId);
    setIsSaved(true);
  };

  const buildPDF = (skipDownload: boolean) => {
    const blows = rows.map(r => parseFloat(r.blowCount)).filter(Boolean);
    const avg = blows.length ? (blows.reduce((a, b) => a + b, 0) / blows.length).toFixed(0) : "";
    
    const n60Values = rows.map(r => parseFloat(r.n60)).filter(Boolean);
    const avgN60 = n60Values.length ? (n60Values.reduce((a, b) => a + b, 0) / n60Values.length).toFixed(1) : "";
    
    const n1_60Values = rows.map(r => parseFloat(r.n1_60)).filter(Boolean);
    const avgN1_60 = n1_60Values.length ? (n1_60Values.reduce((a, b) => a + b, 0) / n1_60Values.length).toFixed(1) : "";
    
    const fields = [
      { label: "Avg N-value", value: avg || "—" },
      { label: "Avg N60", value: avgN60 ? `${avgN60}` : "—" },
      { label: "Avg N1,60", value: avgN1_60 ? `${avgN1_60}` : "—" },
      { label: "Energy Ratio", value: `${energyRatio}%` },
      { label: "Borehole Diameter", value: `${boreholeDiameter} mm` },
      { label: "Rod Length", value: `${rodLength} m` },
      { label: "Sampling Method", value: samplingMethod === "liners" ? "With Liners" : "Standard" },
      { label: "Overburden Pressure", value: `${overburdenPressure} kPa` },
    ];
    
    return generateTestPDF({
      title: "SPT (Standard Penetration Test)",
      standard: "BS 1377-9:1990 / ASTM D1586",
      ...project,
      dateTested: dateTested || project.projectDate,
      testedBy,
      fields,
      skipDownload,
      tables: [{ 
        headers: ["Depth (m)", "Blow Count (N)", "N60", "N1,60"], 
        rows: rows.map(r => [r.depth || "—", r.blowCount || "—", r.n60 || "—", r.n1_60 || "—"]) 
      }]
    });
  };

  const exportPDF = async () => {
    await buildPDF(false);
  };

  const printPDF = async () => printPDFDocument(await buildPDF(true));

  const canExport = !!projectId || isSaved;

  return (
    <TestSection title="SPT (Standard Penetration Test)" testKey={testKey} onSave={save} onClear={() => { setRows([{ depth: "", blowCount: "", n60: "", n1_60: "" }]); setTestedBy(""); setDateTested(""); }} onExportPDF={exportPDF} onPrint={printPDF} canExport={canExport}>
      <div className="overflow-x-auto">
        <table ref={gridNav.ref} onKeyDown={gridNav.onKeyDown} className="w-full text-sm">
          <thead><tr className="border-b"><th className="text-left py-2 px-2 font-medium text-muted-foreground">Depth (m)</th><th className="text-left py-2 px-2 font-medium text-muted-foreground">Blow Count (N)</th><th className="text-left py-2 px-2 font-medium text-muted-foreground">N60</th><th className="text-left py-2 px-2 font-medium text-muted-foreground">N1,60</th><th className="w-10"></th></tr></thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-border/50">
                <td className="py-1.5 px-2"><Input type="number" value={row.depth} onChange={(e) => update(i, "depth", e.target.value)} className="h-8" placeholder="0" /></td>
                <td className="py-1.5 px-2"><Input type="number" value={row.blowCount} onChange={(e) => update(i, "blowCount", e.target.value)} className="h-8" placeholder="0" /></td>
                <td className="py-1.5 px-2"><Input value={row.n60 || ""} readOnly tabIndex={-1} className="h-8 bg-muted/50" /></td>
                <td className="py-1.5 px-2"><Input value={row.n1_60 || ""} readOnly tabIndex={-1} className="h-8 bg-muted/50" /></td>
                <td className="py-1.5 px-1"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setRows(rows.filter((_, j) => j !== i))}><X className="h-3.5 w-3.5" /></Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid grid-cols-2 gap-4 mt-3">
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">Tested By</label>
          <Input value={testedBy} onChange={(e) => setTestedBy(e.target.value)} placeholder="Technician name" className="h-8" />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">Date Tested</label>
          <Input type="date" value={dateTested} onChange={(e) => setDateTested(e.target.value)} className="h-8" />
        </div>
      </div>
      <Button variant="outline" size="sm" className="mt-3" onClick={() => setRows([...rows, { depth: "", blowCount: "" }])}><Plus className="h-3.5 w-3.5 mr-1" /> Add Row</Button>
    </TestSection>
  );
};

export default SPTTest;
