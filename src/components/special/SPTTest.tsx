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
  unitWeight?: string;     // kN/m³ — σ'v = γ·z per row
}

// All editable correction factors, as a bundle so every recalculation uses a
// consistent set (needed when a factor changes: rows are re-derived with the
// NEW value before state commits).
interface Factors {
  energyRatio: string;
  boreholeDiameter: string;
  rodLength: string;
  samplingMethod: string;
  unitWeight: string;
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
  const [unitWeight, setUnitWeight] = useState("18");      // kN/m³ — σ'v = γ·z per row
  
  const currentFactors = (): Factors => ({ energyRatio, boreholeDiameter, rodLength, samplingMethod, unitWeight });

  const update = (i: number, field: keyof Row, val: string) => { 
    const next = [...rows]; 
    next[i] = { ...next[i], [field]: val }; 
    // Auto-calculate N60 and N1,60
    if ((field === "blowCount" || field === "depth") && next[i].blowCount) {
      const n = parseFloat(next[i].blowCount);
      if (n && !isNaN(n)) {
        const n60 = calculateN60(n, currentFactors());
        next[i].n60 = n60.toFixed(1);
        const n1_60 = calculateN1_60(n60, next[i].depth, unitWeight);
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
  
  // CR (rod length) per Skempton (1986): >10 m → 1.0, 6–10 m → 0.95,
  // 4–6 m → 0.85, 3–4 m → 0.75. Below 3 m lies outside the standard range
  // and takes the same 0.75 factor. CR never exceeds 1.0 — the previous
  // ladder returned 1.15 for rods ≥ 10 m, inflating every N60 by ~15%.
  const getRodCorrection = (length: string): number => {
    const l = parseFloat(length);
    if (!l) return 1.0;
    if (l <= 4) return 0.75;
    if (l <= 6) return 0.85;
    if (l <= 10) return 0.95;
    return 1.0;
  };
  
  const calculateN60 = (n: number, factors: Factors): number => {
    const er = parseFloat(factors.energyRatio) || 60;
    const cb = getBoreholeCorrection(factors.boreholeDiameter);
    const cs = getSamplingCorrection(factors.samplingMethod);
    const cr = getRodCorrection(factors.rodLength);
    return n * (er / 60) * cb * cs * cr;
  };
  
  // Overburden correction must vary with depth: σ'v is estimated per row from
  // depth using a bulk unit weight (σ'v ≈ γ·z, editable in the UI). A single
  // global pressure equal to the reference pressure Pa would make CN = 1.0 in
  // every row, so N1,60 would just duplicate N60.
  const calculateN1_60 = (n60: number, depth: string, gamma: string): number => {
    const pa = 100; // reference pressure kPa
    const z = parseFloat(depth);
    if (!z || isNaN(z) || z <= 0) return n60;
    const g = parseFloat(gamma) || 18;
    if (g <= 0) return n60;
    const sigmaV = g * z;
    return n60 * Math.sqrt(pa / sigmaV);
  };

  const filledSPT = rows.filter(r => r.depth && r.blowCount).length;
  const sptResults = useMemo(() => {
    const blows = rows.map(r => parseFloat(r.blowCount)).filter(Boolean);
    const avg = blows.length ? (blows.reduce((a, b) => a + b, 0) / blows.length).toFixed(0) : "";
    return [{ label: "Avg N-value", value: avg }];
  }, [rows]);
  useTestReport("spt", filledSPT, sptResults);

  // Recompute the derived N60 / N1,60 columns for one row. Used when loading a
  // saved result whose payload predates the auto-calculation (or was seeded
  // without derived values), and when any correction factor changes.
  const recalcDerived = (row: Row, factors: Factors): Row => {
    const n = parseFloat(row.blowCount);
    if (!n || isNaN(n)) return { ...row, n60: "", n1_60: "" };
    const n60 = calculateN60(n, factors);
    return { ...row, n60: n60.toFixed(1), n1_60: calculateN1_60(n60, row.depth, factors.unitWeight).toFixed(1) };
  };

  // Editing any correction factor re-derives N60/N1,60 for every row
  // immediately, so saved/typed rows always reflect the factors in use.
  const applyFactors = (overrides: Partial<Factors>) => {
    const next: Factors = { ...currentFactors(), ...overrides };
    if (overrides.energyRatio !== undefined) setEnergyRatio(overrides.energyRatio);
    if (overrides.boreholeDiameter !== undefined) setBoreholeDiameter(overrides.boreholeDiameter);
    if (overrides.rodLength !== undefined) setRodLength(overrides.rodLength);
    if (overrides.samplingMethod !== undefined) setSamplingMethod(overrides.samplingMethod);
    if (overrides.unitWeight !== undefined) setUnitWeight(overrides.unitWeight);
    setRows((prev) => prev.map((row) => recalcDerived(row, next)));
  };

  useEffect(() => {
    if (!projectId) return;
    let active = true;
    loadTestResult(projectId, "spt")
      .then((result) => {
        if (!active || !result) return;
        setRecordId(result.id);
        setIsSaved(true);
        const payload: Partial<SavedPayload> = (result.payload_json as SavedPayload | null) ?? {};
        const factors: Factors = {
          energyRatio: payload.energyRatio ?? energyRatio,
          boreholeDiameter: payload.boreholeDiameter ?? boreholeDiameter,
          rodLength: payload.rodLength ?? rodLength,
          samplingMethod: payload.samplingMethod ?? samplingMethod,
          unitWeight: payload.unitWeight ?? unitWeight,
        };
        if (Array.isArray(payload.rows) && payload.rows.length > 0) {
          // Rows saved before the N60/N1,60 auto-calculation (or seeded from a
          // dump) only carry depth/blowCount — recompute the derived columns
          // with the saved correction factors so they are never blank.
          setRows(payload.rows.map((row) => recalcDerived(row, factors)));
        }
        if (payload.energyRatio) setEnergyRatio(payload.energyRatio);
        if (payload.boreholeDiameter) setBoreholeDiameter(payload.boreholeDiameter);
        if (payload.rodLength) setRodLength(payload.rodLength);
        if (payload.samplingMethod) setSamplingMethod(payload.samplingMethod);
        if (payload.unitWeight) setUnitWeight(payload.unitWeight);
        if (payload.testedBy) setTestedBy(payload.testedBy);
        if (payload.dateTested) setDateTested(payload.dateTested);
      })
      .catch((error) => console.error("Failed to load SPT result", error));
    return () => { active = false; };
    // Runs once per project by design: rows are re-derived here with the saved
    // unit weight, so stale correction-factor deps are not wanted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      payload_json: { rows, testedBy, dateTested, energyRatio, boreholeDiameter, rodLength, samplingMethod, unitWeight },
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

    const depths = rows.map(r => parseFloat(r.depth)).filter((v) => Number.isFinite(v) && v > 0);
    const depthRange = depths.length ? `${Math.min(...depths)} - ${Math.max(...depths)} m` : "—";
    
    const fields = [
      { label: "Avg N-value", value: avg || "—" },
      { label: "Avg N60", value: avgN60 ? `${avgN60}` : "—" },
      { label: "Avg N1,60", value: avgN1_60 ? `${avgN1_60}` : "—" },
      { label: "Energy Ratio", value: `${energyRatio}%` },
      { label: "Borehole Diameter", value: `${boreholeDiameter} mm` },
      { label: "Rod Length", value: `${rodLength} m` },
      { label: "Sampling Method", value: samplingMethod === "liners" ? "With Liners" : "Standard" },
      { label: "Unit weight (kN/m3)", value: `${unitWeight} kN/m3` },
      { label: "Depth range", value: depthRange },
    ];
    
    return generateTestPDF({
      title: "SPT (Standard Penetration Test)",
      standard: "BS 1377-9:1990 / ASTM D1586",
      ...project,
      dateTested: dateTested || project.projectDate,
      testedBy,
      compactSummary: true,
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
    <TestSection title="SPT (Standard Penetration Test)" testKey={testKey} onSave={save} onClear={() => { setRows([{ depth: "", blowCount: "", n60: "", n1_60: "" }]); setTestedBy(""); setDateTested(""); setEnergyRatio("60"); setBoreholeDiameter("100"); setRodLength("10"); setSamplingMethod("standard"); setUnitWeight("18"); }} onExportPDF={exportPDF} onPrint={printPDF} canExport={canExport}>
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
      <div className="mt-3">
        <label className="text-xs font-medium text-muted-foreground">Correction Factors</label>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-1.5">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Energy Ratio ER (%)</label>
            <Input type="number" value={energyRatio} onChange={(e) => applyFactors({ energyRatio: e.target.value })} className="h-8" placeholder="60" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Borehole Ø (mm)</label>
            <Input type="number" value={boreholeDiameter} onChange={(e) => applyFactors({ boreholeDiameter: e.target.value })} className="h-8" placeholder="100" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Rod Length (m)</label>
            <Input type="number" value={rodLength} onChange={(e) => applyFactors({ rodLength: e.target.value })} className="h-8" placeholder="10" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Sampler</label>
            <Select value={samplingMethod} onValueChange={(v) => applyFactors({ samplingMethod: v })}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="standard">Standard</SelectItem>
                <SelectItem value="liners">With Liners</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Unit Weight γ (kN/m³)</label>
            <Input type="number" value={unitWeight} onChange={(e) => applyFactors({ unitWeight: e.target.value })} className="h-8" placeholder="18" />
          </div>
        </div>
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
