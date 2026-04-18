import { useState, useMemo } from "react";
import TestSection from "@/components/TestSection";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import CalculatedInput from "@/components/CalculatedInput";
import { useProject } from "@/context/ProjectContext";
import { generateTestPDF } from "@/lib/pdfGenerator";
import { useTestReport } from "@/hooks/useTestReport";

const PorosityTest = () => {
  const project = useProject();
  const [dryWeight, setDryWeight] = useState("");
  const [satWeight, setSatWeight] = useState("");
  const [volume, setVolume] = useState("");

  const porosity = (() => {
    const dw = parseFloat(dryWeight); const sw = parseFloat(satWeight); const v = parseFloat(volume);
    if (!dw || !sw || !v || v === 0) return "";
    return (((sw - dw) / v) * 100).toFixed(2);
  })();

  const dataPoints = [dryWeight, satWeight, volume].filter(Boolean).length;
  const porosityResults = useMemo(() => [
    { label: "Porosity", value: porosity ? `${porosity}%` : "" },
  ], [porosity]);
  useTestReport("porosity", dataPoints, porosityResults);

  const exportPDF = () => {
    generateTestPDF({ title: "Porosity Test", ...project, fields: [{ label: "Dry Weight (g)", value: dryWeight }, { label: "Saturated Weight (g)", value: satWeight }, { label: "Volume (cm³)", value: volume }, { label: "Porosity (%)", value: porosity }] });
  };

  return (
    <TestSection title="Porosity" onSave={() => {}} onClear={() => { setDryWeight(""); setSatWeight(""); setVolume(""); }} onExportPDF={exportPDF}>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Dry Weight (g)</Label><Input type="number" value={dryWeight} onChange={(e) => setDryWeight(e.target.value)} placeholder="0" /></div>
        <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Saturated Weight (g)</Label><Input type="number" value={satWeight} onChange={(e) => setSatWeight(e.target.value)} placeholder="0" /></div>
        <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Volume (cm³)</Label><Input type="number" value={volume} onChange={(e) => setVolume(e.target.value)} placeholder="0" /></div>
        <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Porosity (%)</Label><CalculatedInput value={porosity} label="Porosity" /></div>
      </div>
    </TestSection>
  );
};

export default PorosityTest;
