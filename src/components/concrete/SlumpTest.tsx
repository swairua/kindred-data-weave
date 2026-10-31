import { useState, useMemo, useEffect } from "react";
import TestSection from "@/components/TestSection";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useProject } from "@/context/ProjectContext";
import { useTestData } from "@/context/TestDataContext";
import { generateTestPDF, printPDFDocument } from "@/lib/pdfGenerator";
import { useTestReport } from "@/hooks/useTestReport";
import { loadTestResult, saveTestResult } from "@/lib/testResultPersistence";

interface SlumpTestProps {
  testKey?: string;
}

const SlumpTest = ({ testKey }: SlumpTestProps) => {
  const project = useProject();
  const testData = useTestData();
  const sample = useMemo(() => testData.recordMetadata.slump || {}, [testData.recordMetadata.slump]);
  const [slump, setSlump] = useState("");
  const [remarks, setRemarks] = useState("");
  const hasProjectSelected = !!project.currentProjectId;
  const projectId = project.currentProjectId ?? null;
  const [recordId, setRecordId] = useState<number | null>(null);

  const dataPoints = slump ? 1 : 0;
  const slumpResults = useMemo(() => [
    { label: "Slump", value: slump ? `${slump} mm` : "" },
  ], [slump]);
  useTestReport("slump", dataPoints, slumpResults);

  useEffect(() => {
    setRecordId(null);
    setSlump("");
    setRemarks("");
    if (!projectId) return;
    let active = true;
    loadTestResult(projectId, "slump")
      .then((result) => {
        if (!active || !result) return;
        setRecordId(result.id);
        const saved = result.payload_json as { slump?: string; remarks?: string } | null;
        if (saved) {
          setSlump(saved.slump ?? "");
          setRemarks(saved.remarks ?? "");
        }
      })
      .catch((error) => console.error("Failed to load slump result", error));
    return () => { active = false; };
  }, [projectId]);

  const save = async () => {
    if (!projectId) throw new Error("Select a project before saving this slump test");
    const savedId = await saveTestResult(projectId, recordId, {
      test_key: "slump",
      name: "Slump Test",
      category: "concrete",
      status: slump ? "completed" : "not-started",
      data_points: dataPoints,
      key_results_json: slumpResults.filter((result) => result.value),
      payload_json: { testKey: "slump", dataPoints, sample, slump, remarks },
    });
    setRecordId(savedId);
  };

  const buildPDF = (skipDownload: boolean) => generateTestPDF({
    title: "Slump Test",
    ...project,
    dateTested: sample.dateTested,
    testedBy: sample.testedBy,
    skipDownload,
    fields: [
      { label: "Sample ID", value: sample.sampleId || "—" },
      { label: "Sample No.", value: sample.sampleNumber || "—" },
      { label: "Slump Value (mm)", value: slump || "—" },
      { label: "Remarks", value: remarks || "—" },
    ],
  });

  const exportPDF = async () => {
    await buildPDF(false);
  };

  const printPDF = async () => printPDFDocument(await buildPDF(true));

  return (
    <TestSection title="Slump Test" testKey={testKey} onSave={save} onClear={() => { setSlump(""); setRemarks(""); }} onExportPDF={exportPDF} onPrint={printPDF}>
      {!hasProjectSelected && !slump ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <p className="text-sm text-muted-foreground mb-2">No project selected</p>
            <p className="text-xs text-muted-foreground">Select an existing project or create a new one to begin testing</p>
          </div>
        </div>
      ) : (
        <>
          {sample.sampleId && (
            <p className="mb-3 text-xs text-muted-foreground">
              Sample ID: <strong className="text-foreground">{sample.sampleId}</strong>
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Slump Value (mm)</Label>
              <Input type="number" min="0" max="300" step="any" value={slump} onChange={(e) => setSlump(e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Remarks</Label>
              <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="e.g. True slump, collapse..." className="resize-none h-9 min-h-[36px]" />
            </div>
          </div>
        </>
      )}
    </TestSection>
  );
};

export default SlumpTest;
