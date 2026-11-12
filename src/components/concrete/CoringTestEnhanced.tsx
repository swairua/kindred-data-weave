import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Check, ChevronDown, FileDown, Loader2, Printer, Save, Trash2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import MoistureDensityChart from "@/components/soil/MoistureDensityChart";
import { useProject } from "@/context/ProjectContext";
import { useGridArrowNavigation } from "@/hooks/useGridArrowNavigation";
import { useTestData } from "@/context/TestDataContext";
import {
  airVoidsCurve,
  assessFieldCompaction,
  calculateProctor,
  calculateProctorPoint,
  compactionEnergy,
  correctForOversize,
  createProctorPayload,
  emptyProctorRecord,
  getProctorRecord,
  isReportableOptimum,
  parseAirVoidsTargets,
  sampleCompactionCurve,
  zeroAirVoidsCurve,
  type FieldAcceptance,
  type ProctorCurvePoint,
  type ProctorEffort,
  type ProctorMethod,
  type ProctorPointCalculation,
  type ProctorRecord,
  type ProctorRow,
} from "@/lib/proctorRecords";
import type { McVoidLine } from "@/lib/mcChartGeometry";
import { loadProctorResult, saveProctorResult } from "@/lib/proctorPersistence";
import { toast } from "sonner";
import { useTestReport } from "@/hooks/useTestReport";
import { generateMoistureDensityPDF } from "@/lib/mcPdfGenerator";
import { captureChartAsBase64 } from "@/lib/chartCapture";

interface ProctorTestProps {
  testKey?: string;
}

type ProctorInputField = Exclude<keyof ProctorRow, "legacy">;
type ProctorRecordTextField =
  | "testedBy"
  | "specificGravity"
  | "airVoidsTarget"
  | "oversizePercent"
  | "oversizeSpecificGravity"
  | "fieldDryDensity"
  | "requiredRelativeCompaction"
  | "reportedOmc"
  | "reportedMdd";

const POINT_LABELS = ["A", "B", "C", "D", "E", "F"];
/** BS 1377-4:1990, 3.3 is the 2.5 kg rammer method and 3.5 the 4.5 kg rammer method. */
const methodClause = (method: ProctorMethod) => method === "standard" ? "3.3" : "3.5";
const methodLabel = (method: ProctorMethod) => method === "standard" ? "Standard" : "Modified";
const MAX_POINTS = 10;
const displayValue = (value: number | null) => value === null ? "—" : value.toFixed(2);
const displayMoisture = (value: number | null) => value === null ? "—" : value.toFixed(1);
const displayDensity = (value: number | null) => value === null ? "—" : value.toFixed(0);
const hasValue = (value: string) => value.trim() !== "";
const optionalNumber = (value: string | null | undefined) => {
  if (value == null) return null;
  const parsed = value.trim() === "" ? null : Number(value);
  return parsed === null || !Number.isFinite(parsed) ? null : parsed;
}
const isRowStarted = (row: ProctorRow) => {
  const { legacy, ...inputs } = row;
  return Object.values(inputs).some(hasValue) || (legacy !== undefined && Object.values(legacy).some(hasValue));
};
const pointLabel = (index: number) => POINT_LABELS[index] || String(index + 1);

const ProctorTest = ({ testKey }: ProctorTestProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const project = useProject();
  const testData = useTestData();
  const projectId = project.currentProjectId ?? null;
  const metadata = useMemo(() => testData.recordMetadata.proctor || {}, [testData.recordMetadata.proctor]);
  const metadataKey = JSON.stringify(metadata);
  const [record, setRecord] = useState<ProctorRecord>(() => emptyProctorRecord(metadata));
  const [recordId, setRecordId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(projectId));
  const [isEditingProject, setIsEditingProject] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  // Arrow keys walk the weighing grid instead of leaving the technician to drag
  // the pointer across a table this wide.
  const gridNav = useGridArrowNavigation<HTMLDivElement>();
  const type = record.type;
  const rows = type === "standard" ? record.standardRows : record.modifiedRows;
  const mouldVolume = type === "standard" ? record.standardMouldVolume : record.modifiedMouldVolume;
  const setRowsKey = type === "standard" ? "standardRows" : "modifiedRows";
  const setVolumeKey = type === "standard" ? "standardMouldVolume" : "modifiedMouldVolume";
  const effort = type === "standard" ? record.standardEffort : record.modifiedEffort;
  const setEffortKey = type === "standard" ? "standardEffort" : "modifiedEffort";
  const displayedBulkDensity = optionalNumber(record.reportedBulkDensity);
  const displayedMdd = record.reportedMdd ?? optimum.mdd;
  const displayedOmc = record.reportedOmc ?? optimum.omc;
  const energy = compactionEnergy(effort, mouldVolume);

  useEffect(() => {
    // A record started from an existing project (?newRecord=1) opens blank with no row id,
    // so the first save creates a fresh row instead of overwriting the stored record.
    const isNewRecordLaunch = new URLSearchParams(location.search).get("newRecord") === "1";
    if (!projectId || isNewRecordLaunch) {
      setRecord(emptyProctorRecord(metadata));
      setRecordId(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    let active = true;
    setRecord(emptyProctorRecord(metadata));
    setRecordId(null);
    setIsLoading(true);
    setError(null);
    loadProctorResult(projectId)
      .then((result) => {
        if (!active) return;
        setRecordId(result?.id ?? null);
        setRecord(getProctorRecord(result?.payload_json, metadata));
      })
      .catch((loadError) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "Unable to load this record");
      })
      .finally(() => active && setIsLoading(false));
    return () => { active = false; };
  }, [projectId, location]);

  useEffect(() => {
    // Load initially if there's a projectId in the URL
    if (projectId) {
      let active = true;
      setIsLoading(true);
      loadProctorResult(projectId)
        .then((result) => {
          if (!active) return;
          setRecordId(result?.id ?? null);
          setRecord(getProctorRecord(result?.payload_json, metadata));
        })
        .catch((loadError) => {
          if (!active) return;
          setError(loadError instanceof Error ? loadError.message : "Unable to load this record");
        })
        .finally(() => active && setIsLoading(false));
      return () => { active = false; };
    }
  }, [projectId, metadata]);

  const handleSave = async () => {
    setSaveStatus("saving");
    try {
      const payload = await createProctorPayload(record);
      await saveProctorResult(payload);
      setSaveStatus("saved");
    } catch (err) {
      setSaveStatus("error");
      setError("Save failed");
      toast.error("Save failed");
    }
  };

  const handleClear = () => {
    setRecord(emptyProctorRecord(metadata));
    setRecordId(null);
    setSaveStatus("idle");
    setError(null);
  };

  return (
    <div className="proctor-record">
      {/* Project & Sample Details card - appears before core data entry */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-sm">Project & Sample Details</CardTitle>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setIsEditingProject(!isEditingProject)}
            className="absolute right-2 text-[10px] text-muted-foreground hover:text-foreground"
          >
            {isEditingProject ? "View Project" : "Edit Tests"}
          </Button>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="flex items-center gap-3">
            <Label htmlFor="projectName" className="text-xs font-medium text-muted-foreground">
              Project Name *
            </Label>
            <Input id="projectName" className="detail-input" />
          </div>
          <div className="flex items-center gap-3">
            <Label htmlFor="tower" className="text-xs font-medium text-muted-foreground">
              Tower / Location *
            </Label>
            <Input id="tower" className="detail-input" />
          </div>
          <div className="flex items-center gap-3">
            <Label htmlFor="concreteClass" className="text-xs font-medium text-muted-foreground">
              Concrete Class
            </Label>
            <Select value="" onValueChange={() => {}}>
              <SelectTrigger className="detail-input"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["Standard", "Modified"].map((c) => (
                  <SelectItem key={c} value={c} className="text-xs">
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-3">
            <Label htmlFor="ageOfConcrete" className="text-xs font-medium text-muted-foreground">
              Age of Concrete
            </Label>
            <Input id="ageOfConcrete" placeholder="over 28 days" className="detail-input" />
          </div>
          <div className="flex items-center gap-3">
            <Label htmlFor="dateOfTest" className="text-xs font-medium text-muted-foreground">
              Date of Test *
            </Label>
            <Input id="dateOfTest" type="date" className="detail-input" />
          </div>
          <div className="flex items-center gap-3">
            <Label htmlFor="dateReported" className="text-xs font-medium text-muted-foreground">
              Date Reported
            </Label>
            <Input id="dateReported" type="date" className="detail-input" />
          </div>
          <div className="flex items-center gap-3">
            <Label htmlFor="testedBy" className="text-xs font-medium text-muted-foreground">
              Tested By
            </Label>
            <Input id="testedBy" className="detail-input" />
          </div>
          <div className="flex items-center gap-3">
            <Label htmlFor="checkedBy" className="text-xs font-medium text-muted-foreground">
              Checked By
            </Label>
            <Input id="checkedBy" className="detail-input" />
          </div>
          <div className="flex items-center gap-3">
            <Label htmlFor="sampleNo" className="text-xs font-medium text-muted-foreground">
              Sample No.
            </Label>
            <Input id="sampleNo" className="detail-input" />
          </div>
        </CardContent>
      </Card>

      {/* Core data entry - hidden when editing project details, shown when viewing */}
      {isEditingProject ? null : (
        <div>
          <h1 className="text-sm font-semibold">Test Project</h1>
          <p className="text-[11px] text-muted-foreground">Test Laboratory</p>
          <p className="text-[11px] text-muted-foreground">Test Laboratory</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleClear}
            className="gap-2"
          >
            <Trash2 className="h-3.5 w-3.5" /> Clear
          </Button>
        </div>
      )}
    </div>
  );
};

export default ProctorTest;