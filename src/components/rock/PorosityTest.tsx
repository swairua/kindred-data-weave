import { useState, useMemo, useEffect } from "react";
import TestSection from "@/components/TestSection";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import CalculatedInput from "@/components/CalculatedInput";
import { useProject } from "@/context/ProjectContext";
import { generateTestPDF } from "@/lib/pdfGenerator";
import { useTestReport } from "@/hooks/useTestReport";
import { loadTestResult, saveTestResult } from "@/lib/testResultPersistence";

interface SavedPayload {
  dryWeight?: string;
  satWeight?: string;
  volume?: string;
}

const PorosityTest = ({ testKey }: { testKey?: string }) => {
  const project = useProject();
  const [dryWeight, setDryWeight] = useState("");
  const [satWeight, setSatWeight] = useState("");
  const [volume, setVolume] = useState("");
  const projectId = project.currentProjectId ?? null;
  const [recordId, setRecordId] = useState<number | null>(null);
  const [isSaved, setIsSaved] = useState(false);

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

  const fields = [{ label: "Dry Weight (g)", value: dryWeight }, { label: "Saturated Weight (g)", value: satWeight }, { label: "Volume (cm³)", value: volume }, { label: "Porosity (%)", value: porosity }];

  const save = async () => {
    if (!projectId) throw new Error("Select a project before saving this porosity test");
    const savedId = await saveTestResult(projectId, recordId, {
      test_key: "porosity",
      name: "Porosity Test",
      category: "rock",
      status: dataPoints < 3 ? "in-progress" : "completed",
      data_points: dataPoints,
      key_results_json: porosityResults.filter((result) => result.value),
      payload_json: { dryWeight, satWeight, volume },
    });
    setRecordId(savedId);
    setIsSaved(true);
  };

  // Load the saved porosity values for this project so deep links (resultId +
  // #porosity) show the recorded data instead of an empty form.
  useEffect(() => {
    if (!projectId) return;
    let active = true;
    loadTestResult(projectId, "porosity")
      .then((result) => {
        if (!active || !result) return;
        setRecordId(result.id);
        setIsSaved(true);
        const payload: Partial<SavedPayload> = (result.payload_json as SavedPayload | null) ?? {};
        if (payload.dryWeight) setDryWeight(payload.dryWeight);
        if (payload.satWeight) setSatWeight(payload.satWeight);
        if (payload.volume) setVolume(payload.volume);
      })
      .catch((error) => console.error("Failed to load porosity result", error));
    return () => { active = false; };
  }, [projectId]);

  const exportPDF = () => {
    generateTestPDF({ title: "Porosity Test", ...project, fields });
  };

  const canExport = !!project.currentProjectId || isSaved;

  return (
    <TestSection title="Porosity" testKey={testKey} onSave={save} onClear={() => { setDryWeight(""); setSatWeight(""); setVolume(""); }} onExportPDF={exportPDF} canExport={canExport}>
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
