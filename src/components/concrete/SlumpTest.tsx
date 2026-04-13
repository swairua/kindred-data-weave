import { useState, useMemo } from "react";
import TestSection from "@/components/TestSection";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useProject } from "@/context/ProjectContext";
import { generateTestPDF } from "@/lib/pdfGenerator";
import { generateTestCSV } from "@/lib/csvExporter";
import { useTestReport } from "@/hooks/useTestReport";

const SlumpTest = () => {
  const project = useProject();
  const [slump, setSlump] = useState("");
  const [remarks, setRemarks] = useState("");

  const dataPoints = slump ? 1 : 0;
  const slumpResults = useMemo(() => [
    { label: "Slump", value: slump ? `${slump} mm` : "" },
  ], [slump]);
  useTestReport("slump", dataPoints, slumpResults);

  const exportPDF = () => {
    generateTestPDF({ title: "Slump Test", ...project, fields: [{ label: "Slump Value (mm)", value: slump }, { label: "Remarks", value: remarks }] });
  };

  return (
    <TestSection title="Slump Test" onSave={() => {}} onClear={() => { setSlump(""); setRemarks(""); }} onExportPDF={exportPDF}>
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
    </TestSection>
  );
};

export default SlumpTest;
