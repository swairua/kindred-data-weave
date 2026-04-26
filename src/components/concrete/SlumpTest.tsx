import { useState, useMemo } from "react";
import TestSection from "@/components/TestSection";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useProject } from "@/context/ProjectContext";
import { generateTestPDF } from "@/lib/pdfGenerator";
import { generateTestCSV } from "@/lib/csvExporter";
import { generateTestExcel } from "@/lib/genericExcelExporter";
import { useTestReport } from "@/hooks/useTestReport";

interface SlumpTestProps {
  testKey?: string;
}

const SlumpTest = ({ testKey }: SlumpTestProps) => {
  const project = useProject();
  const [slump, setSlump] = useState("");
  const [remarks, setRemarks] = useState("");
  const hasProjectSelected = !!project.currentProjectId;

  const dataPoints = slump ? 1 : 0;
  const slumpResults = useMemo(() => [
    { label: "Slump", value: slump ? `${slump} mm` : "" },
  ], [slump]);
  useTestReport("slump", dataPoints, slumpResults);

  const exportPDF = () => {
    generateTestPDF({ title: "Slump Test", ...project, fields: [{ label: "Slump Value (mm)", value: slump }, { label: "Remarks", value: remarks }] });
  };

  const exportXLSX = () => {
    generateTestExcel({
      data: {
        title: "Slump Test",
        fields: [
          { label: "Slump Value (mm)", value: slump || "—" },
          { label: "Remarks", value: remarks || "—" },
        ],
      },
      projectName: project.projectName,
      clientName: project.clientName,
      date: project.date,
      labOrganization: project.labOrganization,
      dateReported: project.dateReported,
      checkedBy: project.checkedBy,
    });
  };

  return (
    <TestSection title="Slump Test" testKey={testKey} onSave={() => {}} onClear={() => { setSlump(""); setRemarks(""); }} onExportPDF={exportPDF} onExportXLSX={exportXLSX}>
      {!hasProjectSelected && !slump ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <p className="text-sm text-muted-foreground mb-2">No project selected</p>
            <p className="text-xs text-muted-foreground">Select an existing project or create a new one to begin testing</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Slump Value (mm)</Label>
            <Input type="number" value={slump} onChange={(e) => setSlump(e.target.value)} placeholder="0" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Remarks</Label>
            <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="e.g. True slump, collapse..." className="resize-none h-9 min-h-[36px]" />
          </div>
        </div>
      )}
    </TestSection>
  );
};

export default SlumpTest;
