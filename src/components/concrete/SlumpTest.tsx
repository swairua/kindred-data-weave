import { useState, useMemo, useEffect } from "react";
import TestSection from "@/components/TestSection";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useProject } from "@/context/ProjectContext";
import { generateTestPDF, printPDFDocument } from "@/lib/pdfGenerator";
import { useTestReport } from "@/hooks/useTestReport";
import { loadTestResult, saveTestResult } from "@/lib/testResultPersistence";
import { useGridArrowNavigation } from "@/hooks/useGridArrowNavigation";
import { rederiveSlumpEntry, type SlumpEntry } from "@/lib/slumpCalculations";

interface SlumpTestProps {
  testKey?: string;
}

interface SavedPayload {
  mouldHeight?: string; // mm - cone height, 300 unless a non-standard cone is used
  measuredHeight?: string; // mm - height after subsidence
  targetSlump?: string; // mm - optional specification target
  slump?: string; // mm - legacy payloads carry the value directly
  remarks?: string;
  testedBy?: string;
  dateTested?: string;
}

const SlumpTest = ({ testKey }: SlumpTestProps) => {
  const project = useProject();
  const formNav = useGridArrowNavigation<HTMLDivElement>();
  const [entry, setEntry] = useState<SlumpEntry>({ mouldHeight: "300", measuredHeight: "", targetSlump: "", slump: "" });
  const [remarks, setRemarks] = useState("");
  const [testedBy, setTestedBy] = useState("");
  const [dateTested, setDateTested] = useState("");
  const hasProjectSelected = !!project.currentProjectId;
  const projectId = project.currentProjectId ?? null;
  const [recordId, setRecordId] = useState<number | null>(null);
  const [isSaved, setIsSaved] = useState(false);

  // Slump, class, workability, compliance and validity are all derived from
  // the raw readings, recomputed on every edit as one consistent bundle.
  const derived = useMemo(() => rederiveSlumpEntry(entry), [entry]);

  const update = (field: keyof SlumpEntry, val: string) => {
    setEntry((prev) => rederiveSlumpEntry({ ...prev, [field]: val }).entry);
  };

  const dataPoints = derived.slump ? 1 : 0;
  const slumpResults = useMemo(() => [
    { label: "Slump", value: derived.slump ? `${derived.slump} mm` : "" },
    { label: "Slump Class", value: derived.slumpClass },
    { label: "Workability", value: derived.workability },
    { label: "Target Compliance", value: derived.compliance },
  ], [derived]);
  useTestReport("slump", dataPoints, slumpResults);

  useEffect(() => {
    if (!projectId) return;
    let active = true;
    loadTestResult(projectId, "slump")
      .then((result) => {
        if (!active || !result) return;
        setRecordId(result.id);
        setIsSaved(true);
        const saved = result.payload_json as SavedPayload | null;
        if (saved) {
          // Legacy payloads carry only the slump value (e.g. the production
          // dump) - back-compute the height after subsidence so every field
          // on the form is consistent and editable, then re-derive all
          // derived fields on load.
          const mouldHeight = saved.mouldHeight ?? "300";
          const next: SlumpEntry = {
            mouldHeight,
            measuredHeight: saved.measuredHeight ?? "",
            targetSlump: saved.targetSlump ?? "",
            slump: saved.slump ?? "",
          };
          if (!saved.measuredHeight && saved.slump) {
            const mould = parseFloat(mouldHeight) || 300;
            const slump = parseFloat(saved.slump);
            if (Number.isFinite(slump) && slump >= 0 && slump <= mould) {
              next.measuredHeight = String(mould - slump);
            }
          }
          setEntry(rederiveSlumpEntry(next).entry);
          if (saved.remarks) setRemarks(saved.remarks);
          if (saved.testedBy) setTestedBy(saved.testedBy);
          if (saved.dateTested) setDateTested(saved.dateTested);
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
      status: derived.slump ? "completed" : "not-started",
      data_points: dataPoints,
      key_results_json: slumpResults.filter((result) => result.value),
      payload_json: { ...derived.entry, remarks, testedBy, dateTested },
    });
    setRecordId(savedId);
    setIsSaved(true);
  };

  const buildPDF = (skipDownload: boolean) => generateTestPDF({
    title: "Slump Test",
    standard: "BS EN 12350-2:2019 / ASTM C143 / AASHTO T 119",
    ...project,
    dateTested: dateTested || project.projectDate,
    testedBy,
    compactSummary: true,
    fields: [
      { label: "Cone Height", value: `${derived.entry.mouldHeight} mm` },
      { label: "Height After Subsidence", value: derived.entry.measuredHeight ? `${derived.entry.measuredHeight} mm` : "—" },
      { label: "Target Slump", value: derived.entry.targetSlump ? `${derived.entry.targetSlump} mm` : "—" },
      { label: "Target Compliance", value: derived.compliance || "—" },
    ],
    skipDownload,
    tables: [{ headers: ["Property", "Value"], rows: [
      ["Slump Value (mm)", derived.slump || "—"],
      ["Slump Class (EN 206)", derived.slumpClass || "—"],
      ["Workability", derived.workability || "—"],
      ["Validity Notes", derived.notes || "Valid true slump"],
      ["Remarks", remarks || "—"],
    ] }]
  });

  const exportPDF = async () => {
    await buildPDF(false);
  };

  const printPDF = async () => printPDFDocument(await buildPDF(true));

  const canExport = !!projectId || isSaved;

  const derivedField = (label: string, value: string) => (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input value={value} readOnly tabIndex={-1} className="h-8 bg-muted/50" />
    </div>
  );

  return (
    <TestSection title="Slump Test" testKey={testKey} onSave={save} onClear={() => { setEntry({ mouldHeight: "300", measuredHeight: "", targetSlump: "", slump: "" }); setRemarks(""); setTestedBy(""); setDateTested(""); }} onExportPDF={exportPDF} onPrint={printPDF} canExport={canExport}>
      {!hasProjectSelected && !derived.slump ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <p className="text-sm text-muted-foreground mb-2">No project selected</p>
            <p className="text-xs text-muted-foreground">Select an existing project or create a new one to begin testing</p>
          </div>
        </div>
      ) : (
        <>
          <div ref={formNav.ref} onKeyDown={formNav.onKeyDown} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Cone Height (mm)</Label>
              <Input type="number" value={entry.mouldHeight} onChange={(e) => update("mouldHeight", e.target.value)} placeholder="300" className="h-8" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Height After Subsidence (mm)</Label>
              <Input type="number" value={entry.measuredHeight} onChange={(e) => update("measuredHeight", e.target.value)} placeholder="225" className="h-8" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Target Slump (mm, optional)</Label>
              <Input type="number" value={entry.targetSlump} onChange={(e) => update("targetSlump", e.target.value)} placeholder="e.g. 75" className="h-8" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Remarks</Label>
              <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="e.g. True slump, shear, collapse..." className="h-8" />
            </div>
            {derivedField("Slump Value (mm)", derived.slump)}
            {derivedField("Slump Class (EN 206)", derived.slumpClass)}
            {derivedField("Workability", derived.workability)}
            {derivedField("Target Compliance", derived.compliance)}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Tested By</Label>
              <Input value={testedBy} onChange={(e) => setTestedBy(e.target.value)} placeholder="Technician name" className="h-8" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Date Tested</Label>
              <Input type="date" value={dateTested} onChange={(e) => setDateTested(e.target.value)} className="h-8" />
            </div>
          </div>
          {derived.notes && <p className="text-xs text-amber-600 mt-2">{derived.notes}</p>}
        </>
      )}
    </TestSection>
  );
};

export default SlumpTest;
