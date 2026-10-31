import { useState, useMemo, useEffect } from "react";
import TestSection from "@/components/TestSection";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import CalculatedInput from "@/components/CalculatedInput";
import { useProject } from "@/context/ProjectContext";
import { useTestData } from "@/context/TestDataContext";
import { generateTestPDF } from "@/lib/pdfGenerator";
import { useTestReport } from "@/hooks/useTestReport";
import { loadTestResult, saveTestResult } from "@/lib/testResultPersistence";

interface PorosityPayload { dryWeight?: string; satWeight?: string; volume?: string }

const PorosityTest = ({ testKey }: { testKey?: string }) => {
  const project = useProject();
  const testData = useTestData();
  const sample = useMemo(() => testData.recordMetadata.porosity || {}, [testData.recordMetadata.porosity]);
  const projectId = project.currentProjectId ?? null;
  const [recordId, setRecordId] = useState<number | null>(null);
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

  useEffect(() => {
    setRecordId(null);
    setDryWeight("");
    setSatWeight("");
    setVolume("");
    if (!projectId) return;
    let active = true;
    loadTestResult(projectId, "porosity")
      .then((result) => {
        if (!active || !result) return;
        setRecordId(result.id);
        const saved = result.payload_json as PorosityPayload | null;
        setDryWeight(saved?.dryWeight ?? "");
        setSatWeight(saved?.satWeight ?? "");
        setVolume(saved?.volume ?? "");
      })
      .catch((error) => console.error("Failed to load porosity result", error));
    return () => { active = false; };
  }, [projectId]);

  const save = async () => {
    if (!projectId) throw new Error("Select a project before saving this porosity test");
    const savedId = await saveTestResult(projectId, recordId, {
      test_key: "porosity",
      name: "Porosity Test",
      category: "rock",
      status: dataPoints === 0 ? "not-started" : dataPoints < 3 ? "in-progress" : "completed",
      data_points: dataPoints,
      key_results_json: porosityResults.filter((result) => result.value),
      payload_json: { dryWeight, satWeight, volume },
    });
    setRecordId(savedId);
  };

  const exportPDF = () => {
    generateTestPDF({
      title: "Porosity Test",
      ...project,
      dateTested: sample.dateTested,
      testedBy: sample.testedBy,
      fields: [
        { label: "Sample ID", value: sample.sampleId || "—" },
        { label: "Sample No.", value: sample.sampleNumber || "—" },
        { label: "Sample Depth From (m)", value: sample.sampleDepthFrom || "—" },
        { label: "Sample Depth To (m)", value: sample.sampleDepthTo || "—" },
        { label: "Dry Weight (g)", value: dryWeight },
        { label: "Saturated Weight (g)", value: satWeight },
        { label: "Volume (cm³)", value: volume },
        { label: "Porosity (%)", value: porosity },
      ],
    });
  };

  return (
    <TestSection title="Porosity" testKey={testKey} onSave={save} onClear={() => { setDryWeight(""); setSatWeight(""); setVolume(""); }} onExportPDF={exportPDF}>
      {sample.sampleId && (
        <p className="mb-3 text-xs text-muted-foreground">
          Sample ID: <strong className="text-foreground">{sample.sampleId}</strong> · Depth{" "}
          <strong className="text-foreground">{sample.sampleDepthFrom || "—"} to {sample.sampleDepthTo || "—"} m</strong>
        </p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Dry Weight (g)</Label><Input type="number" min="0" step="any" value={dryWeight} onChange={(e) => setDryWeight(e.target.value)} placeholder="0" /></div>
        <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Saturated Weight (g)</Label><Input type="number" min="0" step="any" value={satWeight} onChange={(e) => setSatWeight(e.target.value)} placeholder="0" /></div>
        <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Volume (cm³)</Label><Input type="number" min="0" step="any" value={volume} onChange={(e) => setVolume(e.target.value)} placeholder="0" /></div>
        <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Porosity (%)</Label><CalculatedInput value={porosity} label="Porosity" /></div>
      </div>
    </TestSection>
  );
};

export default PorosityTest;
