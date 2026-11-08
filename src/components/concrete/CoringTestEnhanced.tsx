import { useState, useMemo, useEffect, useCallback, useRef, useContext } from "react";
import TestSection from "@/components/TestSection";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import CalculatedInput from "@/components/CalculatedInput";
import { Plus, X, Upload, Trash2, ArrowLeft, FilePlus, Loader2, AlertCircle, CheckCircle, Save, Printer } from "lucide-react";
import { useProject } from "@/context/ProjectContext";
import { loadTestResult, saveTestResult } from "@/lib/testResultPersistence";
import type { jsPDF } from "jspdf";
import { buildCoringReportPDF, type CoringCoreReport } from "@/lib/coringReportPdf";
import { pdfFileName, printPDFDocument } from "@/lib/pdfGenerator";
import { useTestReport } from "@/hooks/useTestReport";
import { useNavigate } from "react-router-dom";
import { saveReceptionConsignment, listRecords, readRecord } from "@/lib/api";
import { emptyReceptionConsignment, nextRcNo, emptyReceptionSample, type ReceptionConsignmentInput, type ReceptionSampleInput } from "@/lib/reception";
import { SessionContext } from "@/context/SessionContext";
import { toast } from "sonner";

interface CoringRow {
  coreId: string;
  diameter: string;
  lengthBefore: string;
  lengthAfter: string;
  weightInAir: string;
  load: string;
  depth: string;
  failureMode: string;
  comments: string;
  pileBeforeImage?: string;
  pileAfterImage?: string;
  // Additional fields matching PDF
  area?: string;           // Area (m²)
  volume?: string;         // Volume (m³)
  cylinderToCubeRatio?: string;  // Cylinder Strength to Cube Strength (1.25)
  caFactor?: string;       // Ca correction factor for steel presence
  excessVoidage?: string;  // Excess Voidage (%)
  cdcFactor?: string;      // Cdia correction factor for core diameter
  cdAccuracyFactor?: string; // Cd correction factor for core extraction accuracy
  conversionRatio?: string;
}

interface CoringTestProps {
  testKey?: string;
}

interface ValidationError {
  rowIndex: number;
  field: string;
  message: string;
}

const DEPTH_OPTIONS = [
  "0.0-2.0",
  "2.0-15.0",
  "15.0-20.6",
  "Custom"
];

const CONCRETE_CLASSES = ["45 MPA", "40 MPA", "35 MPA", "30 MPA", "25 MPA", "20 MPA", "Custom"];
const detailLabelClass = "w-2/5 shrink-0 border-r border-border pr-3 text-xs font-normal leading-tight text-foreground";
const detailInputClass = "h-8 min-w-0 flex-1 text-xs";

const FAILURE_MODES = [
  "Sparsely distributed aggregates with maximum size approximately 20mm",
  "Dense aggregates with maximum size approximately 20mm",
  "Aggregate crushing",
  "Cement paste failure",
  "Mixed failure",
  "Custom"
];

const CORING_ROW_DEFAULTS: CoringRow = {
  coreId: "CR1",
  diameter: "82",
  lengthBefore: "150",
  lengthAfter: "82",
  weightInAir: "",
  load: "",
  depth: "0.0-2.0",
  failureMode: "Sparsely distributed aggregates with maximum size approximately 20mm",
  comments: "",
  pileBeforeImage: "",
  pileAfterImage: "",
  area: "",
  volume: "",
  cylinderToCubeRatio: "1.25",
  caFactor: "1.00",
  excessVoidage: "1.00",
  cdcFactor: "1.00",
  cdAccuracyFactor: "1.00",
  conversionRatio: "",
};

const loadImageAsDataUrl = async (path: string | undefined): Promise<string | undefined> => {
  if (!path) return undefined;
  const url = path.startsWith("http") ? path : `${window.location.origin}${path}`;
  try {
    const response = await fetch(url, { credentials: "include" });
    if (!response.ok) return undefined;
    const blob = await response.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.warn("Failed to load test image", path, error);
    return undefined;
  }
};

const formatReportDate = (isoDate: string, options: Intl.DateTimeFormatOptions) => {
  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", options).replace(/ /g, "-");
};

export const CoringTest = ({ testKey }: CoringTestProps) => {
  const project = useProject();
const projectId = project.currentProjectId ?? null;
  const navigate = useNavigate();
  const user = useContext(SessionContext)?.user;
  const [rows, setRows] = useState<CoringRow[]>([
    { ...CORING_ROW_DEFAULTS, coreId: "CR1" },
    { ...CORING_ROW_DEFAULTS, coreId: "CR2" },
  ]);
  const [isSaved, setIsSaved] = useState(false);
const [recordId, setRecordId] = useState<number | null>(null);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [isLoading, setIsLoading] = useState(false);
  const [projectDetails, setProjectDetails] = useState({
    projectName: "PROPOSED NSSF TWIN TOWERS, NAIROBI COUNTY",
    tower: "TOWER A",
    concreteClass: "45 MPA",
    ageOfConcrete: "over 28 days",
    dateOfTest: "2026-10-09",
    dateReported: "2026-10-17",
    testedBy: "PUAL N",
    checkedBy: "PUAL N",
    location: "",
    sampleNo: "PILE 03 BH2",
  });
  const [receptionMode, setReceptionMode] = useState(false);
  const [rcNo, setRcNo] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  // Load existing test data from resultId URL parameter
  const loadStartedRef = useRef<number | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const resultIdParam = Number.parseInt(params.get("resultId") || "", 10);
    const projectIdParam = Number.parseInt(params.get("projectId") || "", 10);

    if (!Number.isInteger(resultIdParam) || resultIdParam <= 0) return;
    if (!Number.isInteger(projectIdParam) || projectIdParam <= 0) return;
    if (loadStartedRef.current === resultIdParam) return;

    loadStartedRef.current = resultIdParam;
    const active = true;

    const loadData = async () => {
      setIsLoading(true);
      try {
        const record = await readRecord("test_results", resultIdParam);
        const row = (record as { data?: unknown }).data;
        if (row && typeof row === "object") {
          const data = row as Record<string, unknown>;
          
          // Load project details from payload_json
          if (data.payload_json && typeof data.payload_json === "object") {
            const payload = data.payload_json as Record<string, unknown>;
            if (payload.test && typeof payload.test === "object") {
              const test = payload.test as Record<string, unknown>;
              setProjectDetails(prev => ({
                ...prev,
                projectName: (test.projectName as string) || prev.projectName,
                tower: (test.tower as string) || prev.tower,
                concreteClass: (test.concreteClass as string) || prev.concreteClass,
                ageOfConcrete: (test.ageAtTest as string) || prev.ageOfConcrete,
                dateOfTest: (test.dateTested as string) || prev.dateOfTest,
                dateReported: (test.dateReported as string) || prev.dateReported,
                testedBy: (test.testedBy as string) || prev.testedBy,
                checkedBy: (test.checkedBy as string) || prev.checkedBy,
                sampleNo: (data.sample_label as string) || prev.sampleNo,
              }));
            }
            
            // Load cores from payload_json
            if (payload.test && typeof payload.test === "object") {
              const testData = payload.test as Record<string, unknown>;
              if (testData.cores && Array.isArray(testData.cores)) {
                const cores = testData.cores as Array<Record<string, unknown>>;
                const loadedRows = cores.map((core, i) => ({
                  coreId: (core.mark as string) || `CR${i + 1}`,
                  diameter: String(core.diameter ?? ""),
                  lengthBefore: String(core.lengthBefore ?? ""),
                  lengthAfter: String(core.lengthAfter ?? ""),
                  weightInAir: String(core.weight ?? ""),
                  load: String(core.load ?? ""),
                  depth: (core.depth as string) || "0.0-2.0",
                  failureMode: (core.failureMode as string) || "Sparsely distributed aggregates with maximum size approximately 20mm",
                  comments: (core.comments as string) ?? "",
                  pileBeforeImage: (core.pileBeforeImage as string) ?? (core.beforeImage as string) ?? "",
                  pileAfterImage: (core.pileAfterImage as string) ?? (core.afterImage as string) ?? "",
                  area: String(core.area ?? ""),
                  volume: String(core.volume ?? ""),
                  cylinderToCubeRatio: String(core.cylCubeRatio ?? "1.25"),
                  caFactor: String(core.caFactor ?? "1.00"),
                  excessVoidage: String(core.excessVoidage ?? "1.00"),
                  cdcFactor: String(core.cdcFactor ?? "1.00"),
                  cdAccuracyFactor: String(core.cdAccuracyFactor ?? "1.00"),
                  conversionRatio: String(core.conversionRatio ?? ""),
                }));
                setRows(loadedRows);
              }
            }
          }
        }
      } catch (error) {
        console.error("[CoringTestEnhanced] Failed to load saved test:", error);
        toast.error("Couldn't load the saved test data");
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
    return () => { /* cleanup */ };
  }, []);

  useEffect(() => {
    if (!projectId) return;
    let active = true;
    loadTestResult(projectId, "coring")
      .then((result) => {
        if (!active || !result) return;
        setRecordId(result.id);
        setIsSaved(true);
        const saved = result.payload_json as Record<string, unknown> | null;
        if (saved && typeof saved === "object") {
          if (Array.isArray(saved.rows)) {
            const loadedRows = (saved.rows as Array<Record<string, unknown>>).map((core, i) => ({
              coreId: (core.coreId as string) || `CR${i + 1}`,
              diameter: String(core.diameter ?? ""),
              lengthBefore: String(core.lengthBefore ?? ""),
              lengthAfter: String(core.lengthAfter ?? ""),
              weightInAir: String(core.weightInAir ?? ""),
              load: String(core.load ?? ""),
              depth: (core.depth as string) || "0.0-2.0",
              failureMode: (core.failureMode as string) || "Sparsely distributed aggregates with maximum size approximately 20mm",
              comments: (core.comments as string) ?? "",
              pileBeforeImage: (core.pileBeforeImage as string) ?? "",
              pileAfterImage: (core.pileAfterImage as string) ?? "",
              area: String(core.area ?? ""),
              volume: String(core.volume ?? ""),
              cylinderToCubeRatio: String(core.cylinderToCubeRatio ?? "1.25"),
              caFactor: String(core.caFactor ?? "1.00"),
              excessVoidage: String(core.excessVoidage ?? "1.00"),
              cdcFactor: String(core.cdcFactor ?? "1.00"),
              cdAccuracyFactor: String(core.cdAccuracyFactor ?? "1.00"),
              conversionRatio: String(core.conversionRatio ?? ""),
            }));
            setRows(loadedRows);
          }
          if (saved.projectDetails && typeof saved.projectDetails === "object") {
            setProjectDetails((prev) => ({ ...prev, ...(saved.projectDetails as Record<string, unknown>) }));
          }
        }
      })
      .catch((error) => console.error("Failed to load coring result", error));
    return () => { active = false; };
  }, [projectId]);
    const d = parseFloat(row.diameter);
    const l = parseFloat(row.lengthAfter);
    if (!d || !l) return "";
    return (l / d).toFixed(2);
  }, []);

  const getCoreStrength = useCallback((row: CoringRow) => {
    const d = parseFloat(row.diameter);
    const load = parseFloat(row.load);
    if (!d || !load) return "";
    const area = Math.PI * (d / 2) ** 2;
    return ((load * 1000) / area).toFixed(2);
  }, []);

  const getCorrectedStrength = useCallback((row: CoringRow) => {
    const d = parseFloat(row.diameter);
    const load = parseFloat(row.load);
    const l = parseFloat(row.lengthAfter);
    if (!d || !load || !l) return "";
    const area = Math.PI * (d / 2) ** 2;
    const strength = (load * 1000) / area;
    const ld = l / d;
    if (!Number.isFinite(strength) || !Number.isFinite(ld)) return "";
    if (ld < 1.0 || ld > 2.0) return "";
    let factor = 1.0;
    if (ld < 2.0) factor = 0.87 + 0.065 * ld;
    return (strength * factor).toFixed(2);
  }, []);

  const getDensity = useCallback((row: CoringRow) => {
    const weight = parseFloat(row.weightInAir);
    const d = parseFloat(row.diameter);
    const l = parseFloat(row.lengthAfter);
    if (!weight || !d || !l) return "";
    const volume = (Math.PI * (d / 2) ** 2 * l) / 1000000000;
    if (volume <= 0) return "";
    return (weight / 1000 / volume).toFixed(0);
  }, []);

  const getCdFactor = useCallback((row: CoringRow) => {
    const d = parseFloat(row.diameter);
    const l = parseFloat(row.lengthAfter);
    if (!d || !l) return "";
    const ld = l / d;
    if (ld >= 2.0) return "1.00";
    if (ld < 1.0) return "";
    return (0.87 + 0.065 * ld).toFixed(2);
  }, []);

  const getArea = useCallback((row: CoringRow) => {
    const d = parseFloat(row.diameter);
    if (!d) return "";
    const areaMm2 = Math.PI * (d / 2) ** 2;
    return (areaMm2 / 1000000).toFixed(6); // m²
  }, []);

  const getVolume = useCallback((row: CoringRow) => {
    const d = parseFloat(row.diameter);
    const l = parseFloat(row.lengthAfter);
    if (!d || !l) return "";
    const volumeMm3 = Math.PI * (d / 2) ** 2 * l;
    return (volumeMm3 / 1000000000).toFixed(6); // m³
  }, []);

  const update = useCallback((i: number, field: keyof CoringRow, val: string) => {
    setRows(prev => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: val };
      return next;
    });
    // Clear validation error for this field when user types
    setValidationErrors(prev => prev.filter(e => !(e.rowIndex === i && e.field === field)));
  }, []);

  const updateProjectDetail = useCallback((field: string, val: string) => {
    setProjectDetails(prev => ({ ...prev, [field]: val }));
  }, []);

  const validateRow = useCallback((row: CoringRow, index: number): ValidationError[] => {
    const errors: ValidationError[] = [];
    
    if (!row.coreId.trim()) {
      errors.push({ rowIndex: index, field: "coreId", message: "Core ID is required" });
    }
    if (!row.diameter || parseFloat(row.diameter) <= 0) {
      errors.push({ rowIndex: index, field: "diameter", message: "Diameter must be > 0" });
    }
    if (!row.lengthAfter || parseFloat(row.lengthAfter) <= 0) {
      errors.push({ rowIndex: index, field: "lengthAfter", message: "Length after trimming is required" });
    }
    const ld = row.diameter && row.lengthAfter ? parseFloat(row.lengthAfter) / parseFloat(row.diameter) : 0;
    if (ld && (ld < 1.0 || ld > 2.0)) {
      errors.push({ rowIndex: index, field: "lengthAfter", message: "L/D ratio must be between 1.0 and 2.0" });
    }
    if (row.lengthBefore && row.lengthAfter && parseFloat(row.lengthAfter) > parseFloat(row.lengthBefore)) {
      errors.push({ rowIndex: index, field: "lengthAfter", message: "Length after trimming cannot exceed length before" });
    }
    if (!row.load || parseFloat(row.load) <= 0) {
      errors.push({ rowIndex: index, field: "load", message: "Load is required" });
    }
    if (!row.weightInAir || parseFloat(row.weightInAir) <= 0) {
      errors.push({ rowIndex: index, field: "weightInAir", message: "Weight in air is required" });
    }
    if (!row.cylinderToCubeRatio || parseFloat(row.cylinderToCubeRatio) <= 0) {
      errors.push({ rowIndex: index, field: "cylinderToCubeRatio", message: "Cylinder/Cube ratio is required" });
    }
    if (!row.caFactor || parseFloat(row.caFactor) <= 0) {
      errors.push({ rowIndex: index, field: "caFactor", message: "Ca factor is required" });
    }
    if (!row.depth.trim()) {
      errors.push({ rowIndex: index, field: "depth", message: "Depth is required" });
    }
    
    const correctedStrength = getCorrectedStrength(row);
    if (!correctedStrength) {
      errors.push({ rowIndex: index, field: "correctedStrength", message: "Cannot calculate corrected strength - check inputs" });
    }
    
    return errors;
  }, [getCorrectedStrength]);

  const validateAllRows = useCallback((): ValidationError[] => {
    const allErrors: ValidationError[] = [];
    const seenIds = new Set<string>();
    rows.forEach((row, i) => {
      if (seenIds.has(row.coreId.trim())) {
        allErrors.push({ rowIndex: i, field: "coreId", message: "Duplicate core ID" });
      }
      seenIds.add(row.coreId.trim());
      allErrors.push(...validateRow(row, i));
    });
    if (rows.length < 3) {
      allErrors.push({ rowIndex: -1, field: "rows", message: "At least 3 cores are required to report a mean strength" });
    }
    return allErrors;
  }, [rows, validateRow]);

  const validateProjectDetails = useCallback((): ValidationError[] => {
    const errors: ValidationError[] = [];
    if (!projectDetails.projectName.trim()) {
      errors.push({ rowIndex: -1, field: "projectName", message: "Project Name is required" });
    }
    if (!projectDetails.tower.trim()) {
      errors.push({ rowIndex: -1, field: "tower", message: "Tower/Location is required" });
    }
    if (!projectDetails.dateOfTest.trim()) {
      errors.push({ rowIndex: -1, field: "dateOfTest", message: "Date of Test is required" });
    }
    return errors;
  }, [projectDetails]);

  const handleImageUpload = async (index: number, field: "pileBeforeImage" | "pileAfterImage", file: File) => {
    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Image too large. Maximum size is 10MB.");
      return;
    }
    
    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("image_type", field === "pileBeforeImage" ? "pile_before" : "pile_after");
    
    try {
      const response = await fetch("/api.php?action=upload-admin-image", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.file_path) {
          setRows(prev => {
            const next = [...prev];
            next[index] = { ...next[index], [field]: data.file_path };
            return next;
          });
          toast.success(`${field === "pileBeforeImage" ? "Before" : "After"} test image uploaded`);
        } else {
          toast.error("Upload succeeded but no file path returned");
        }
      } else {
        const error = await response.json().catch(() => ({ message: "Upload failed" }));
        toast.error(`Upload failed: ${error.message || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Image upload failed:", error);
      toast.error("Image upload failed. Please try again.");
    }
  };

  const handleSave = async () => {
    const errors = [...validateAllRows(), ...validateProjectDetails()];
    if (errors.length > 0) {
      setValidationErrors(errors);
      setSaveStatus("error");
      toast.error("Please fix validation errors before saving");
      return;
    }
    
    setSaveStatus("saving");
    try {
      // Save to localStorage for persistence (can be extended to API)
      const saveData = {
        rows,
        projectDetails,
        savedAt: new Date().toISOString(),
        testKey,
      };
      localStorage.setItem(`coring_test_${testKey || "default"}`, JSON.stringify(saveData));

      if (projectId) {
        const savedId = await saveTestResult(projectId, recordId, {
          test_key: "coring",
          name: "Compressive Strength of Concrete Cores",
          category: "concrete",
          status: "completed",
          data_points: rows.length,
          key_results_json: [
            { label: "Avg Corrected Strength", value: (rows.map(r => parseFloat(getCorrectedStrength(r))).filter(Boolean).reduce((a,b)=>a+b,0)/rows.length || 0).toFixed(2) + " MPa" },
            { label: "Cores Tested", value: String(rows.length) },
          ].filter(r => r.value),
          payload_json: { test: { testKey: "coring", compressiveTestId: recordId, dataPoints: rows.length, coring: true, cores: rows, projectDetails }, rows, projectDetails },
        });
        setRecordId(savedId);
      }

      setIsSaved(true);
      setSaveStatus("saved");
      toast.success("Test data saved");
      
      // Reset save status after a delay
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (error) {
      setSaveStatus("error");
      toast.error("Save failed");
    }
  };

  const handleCreateProject = async () => {
    const errors = [...validateAllRows(), ...validateProjectDetails()];
    if (errors.length > 0) {
      setValidationErrors(errors);
      toast.error("Please fix validation errors before creating project");
      return;
    }
    
    setIsProcessing(true);
    try {
      // Create reception consignment
      const consignments = await listRecords<{ rc_no: string }>("reception_consignments", { limit: 500 });
      const newRcNo = nextRcNo(consignments.data?.map(c => c.rc_no) || []);
      
      const consignment: ReceptionConsignmentInput = emptyReceptionConsignment(newRcNo);
      consignment.jobNo = projectDetails.projectName;
      consignment.project = projectDetails.tower;
      consignment.client = "NSSF";
      consignment.receivedAt = new Date().toISOString().slice(0, 16);
      consignment.receivedBy = user?.name || "PUAL N";
      consignment.methodSet = "BS EN 12504-1:2009";
      consignment.status = "processed";
      consignment.cubeCastDate = projectDetails.dateOfTest;
      
      // Create samples from rows
      consignment.samples = rows.map((row, i) => {
        const sample = emptyReceptionSample(`CR${i + 1}`);
        sample.clientMark = row.coreId;
        sample.location = projectDetails.tower;
        sample.depthLabel = row.depth;
        sample.sampleType = "Concrete core";
        sample.container = "Core sample";
        sample.tests = ["CMP"];
        sample.massKg = row.weightInAir;
        sample.condition = "Intact";
        return sample;
      });
      
      await saveReceptionConsignment(consignment);
      
      // Create project from consignment
      const { processReceptionToProject } = await import("@/lib/api");
      const result = await processReceptionToProject(consignment, "coring");
      
      if (result.projectId) {
        setReceptionMode(false);
        toast.success("Project created successfully");
        navigate(`/projects/${result.projectId}`);
      }
    } catch (error) {
      console.error("Project creation failed:", error);
      toast.error("Failed to create project. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const buildReport = async (): Promise<jsPDF | null> => {
    const errors = [...validateAllRows(), ...validateProjectDetails()];
    if (errors.length > 0) {
      setValidationErrors(errors);
      toast.error("Please fix validation errors before exporting PDF");
      return null;
    }

    try {
      const dateOfTest = formatReportDate(projectDetails.dateOfTest, { day: "numeric", month: "numeric", year: "numeric" });
      const cores: CoringCoreReport[] = await Promise.all(rows.map(async (row) => ({
        depth: row.depth,
        dateOfTest,
        diameter: row.diameter,
        heightBefore: row.lengthBefore,
        heightAfter: row.lengthAfter,
        weightInAir: row.weightInAir,
        density: getDensity(row),
        area: getArea(row),
        volume: getVolume(row),
        load: row.load,
        coreStrength: getCoreStrength(row),
        ldRatio: getLDRatio(row),
        cdFactor: getCdFactor(row),
        cdcFactor: row.cdcFactor ?? "",
        cdAccuracyFactor: row.cdAccuracyFactor ?? "",
        cylinderToCube: row.cylinderToCubeRatio ?? "",
        caFactor: row.caFactor ?? "",
        conversionRatio: row.conversionRatio ?? "",
        correctedStrength: getCorrectedStrength(row),
        excessVoidage: row.excessVoidage ?? "",
        failureMode: row.failureMode,
        comments: row.comments,
        beforeImage: await loadImageAsDataUrl(row.pileBeforeImage),
        afterImage: await loadImageAsDataUrl(row.pileAfterImage),
      })));

      return await buildCoringReportPDF({
        title: "Compressive Strength of Concrete Cores",
        standard: "BS EN 12504-1:2009",
        projectName: projectDetails.projectName,
        sampleNo: projectDetails.sampleNo,
        concreteClass: projectDetails.concreteClass,
        ageOfConcrete: projectDetails.ageOfConcrete,
        location: projectDetails.tower,
        testedBy: projectDetails.testedBy,
        checkedBy: projectDetails.checkedBy,
        dateReported: formatReportDate(projectDetails.dateReported, { day: "2-digit", month: "short", year: "2-digit" }),
      }, cores);
    } catch (error) {
      console.error("PDF export failed:", error);
      toast.error("PDF export failed. Please try again.");
      return null;
    }
  };

  const exportPDF = async () => {
    const doc = await buildReport();
    if (!doc) return false;
    doc.save(pdfFileName(projectDetails.projectName, "Coring_Report"));
    toast.success("PDF generated successfully");
    return true;
  };

  const strengths = rows.map(r => parseFloat(getCorrectedStrength(r))).filter(Boolean);
  const avgStrength = strengths.length ? (strengths.reduce((a, b) => a + b, 0) / strengths.length).toFixed(2) : "";

  const results = useMemo(() => [
    { label: "Avg Corrected Strength", value: avgStrength ? `${avgStrength} MPa` : "" },
    { label: "Cores Tested", value: strengths.length ? String(strengths.length) : "" },
  ], [avgStrength, strengths.length]);
  useTestReport("coring", strengths.length, results);

  const handlePrint = async () => {
    const doc = await buildReport();
    if (doc) printPDFDocument(doc);
  };

  const canExport = !!project.currentProjectId || isSaved;
  const hasValidationErrors = validationErrors.length > 0;

  return (
    <TestSection 
      title="Compressive Strength of Concrete Cores (BS EN 12504-1:2009)" 
      testKey={testKey} 
      onSave={handleSave} 
      onClear={() => setRows([{ ...CORING_ROW_DEFAULTS, coreId: "CR1" }, { ...CORING_ROW_DEFAULTS, coreId: "CR2" }])}
      onExportPDF={exportPDF}
      onPrint={handlePrint}
      canExport={canExport}
      saveStatus={saveStatus}
      actionsPlacement="footer"
    >
      {/* Validation Error Banner */}
      {hasValidationErrors && (
        <div className="mb-4 p-3 bg-destructive/10 border border-destructive/30 rounded-lg">
          <div className="flex items-center gap-2 text-sm text-destructive mb-2">
            <AlertCircle className="h-4 w-4" />
            <span className="font-medium">Validation Errors ({validationErrors.length})</span>
          </div>
          <ul className="text-xs text-destructive space-y-1">
            {validationErrors.slice(0, 5).map((err, i) => (
              <li key={i}>
                {err.rowIndex >= 0 ? `Core ${err.rowIndex + 1} - ` : ""}
                {err.field}: {err.message}
              </li>
            ))}
            {validationErrors.length > 5 && (
              <li>...and {validationErrors.length - 5} more errors</li>
            )}
          </ul>
        </div>
      )}

      {/* Project Details */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-sm">Project & Sample Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="flex items-center gap-3">
            <Label htmlFor="projectName" className={detailLabelClass}>Project Name *</Label>
            <Input id="projectName" value={projectDetails.projectName} onChange={(e) => updateProjectDetail("projectName", e.target.value)} className={detailInputClass} />
          </div>
          <div className="flex items-center gap-3">
            <Label htmlFor="tower" className={detailLabelClass}>Tower / Location *</Label>
            <Input id="tower" value={projectDetails.tower} onChange={(e) => updateProjectDetail("tower", e.target.value)} className={detailInputClass} />
          </div>
          <div className="flex items-center gap-3">
            <Label htmlFor="concreteClass" className={detailLabelClass}>Concrete Class</Label>
            <Select value={projectDetails.concreteClass} onValueChange={(v) => updateProjectDetail("concreteClass", v)}>
              <SelectTrigger className={detailInputClass}><SelectValue /></SelectTrigger>
              <SelectContent>
                {CONCRETE_CLASSES.map(c => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-3">
            <Label htmlFor="ageOfConcrete" className={detailLabelClass}>Age of Concrete</Label>
            <Input id="ageOfConcrete" value={projectDetails.ageOfConcrete} onChange={(e) => updateProjectDetail("ageOfConcrete", e.target.value)} className={detailInputClass} placeholder="over 28 days" />
          </div>
          <div className="flex items-center gap-3">
            <Label htmlFor="dateOfTest" className={detailLabelClass}>Date of Test *</Label>
            <Input id="dateOfTest" type="date" value={projectDetails.dateOfTest} onChange={(e) => updateProjectDetail("dateOfTest", e.target.value)} className={detailInputClass} />
          </div>
          <div className="flex items-center gap-3">
            <Label htmlFor="dateReported" className={detailLabelClass}>Date Reported</Label>
            <Input id="dateReported" type="date" value={projectDetails.dateReported} onChange={(e) => updateProjectDetail("dateReported", e.target.value)} className={detailInputClass} />
          </div>
          <div className="flex items-center gap-3">
            <Label htmlFor="testedBy" className={detailLabelClass}>Tested By</Label>
            <Input id="testedBy" value={projectDetails.testedBy} onChange={(e) => updateProjectDetail("testedBy", e.target.value)} className={detailInputClass} />
          </div>
          <div className="flex items-center gap-3">
            <Label htmlFor="checkedBy" className={detailLabelClass}>Checked By</Label>
            <Input id="checkedBy" value={projectDetails.checkedBy} onChange={(e) => updateProjectDetail("checkedBy", e.target.value)} className={detailInputClass} />
          </div>
          <div className="flex items-center gap-3">
            <Label htmlFor="sampleNo" className={detailLabelClass}>Sample No.</Label>
            <Input id="sampleNo" value={projectDetails.sampleNo} onChange={(e) => updateProjectDetail("sampleNo", e.target.value)} className={detailInputClass} />
          </div>
        </CardContent>
      </Card>

      {/* Core Data Entry */}
      <div className="overflow-x-auto mb-4">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="text-left py-1.5 px-1.5 font-medium text-muted-foreground">Core ID *</th>
              <th className="text-left py-1.5 px-1.5 font-medium text-muted-foreground">Depth (m) *</th>
              <th className="text-left py-1.5 px-1.5 font-medium text-muted-foreground">Dia (mm) *</th>
              <th className="text-left py-1.5 px-1.5 font-medium text-muted-foreground">L Before (mm)</th>
              <th className="text-left py-1.5 px-1.5 font-medium text-muted-foreground">L After (mm) *</th>
              <th className="text-left py-1.5 px-1.5 font-medium text-muted-foreground">L/D</th>
              <th className="text-left py-1.5 px-1.5 font-medium text-muted-foreground">Area (m²)</th>
              <th className="text-left py-1.5 px-1.5 font-medium text-muted-foreground">Volume (m³)</th>
              <th className="text-left py-1.5 px-1.5 font-medium text-muted-foreground">Wt Air (g) *</th>
              <th className="text-left py-1.5 px-1.5 font-medium text-muted-foreground">Load (kN) *</th>
              <th className="text-left py-1.5 px-1.5 font-medium text-muted-foreground">Core Str (MPa)</th>
              <th className="text-left py-1.5 px-1.5 font-medium text-muted-foreground">Cd Factor</th>
              <th className="text-left py-1.5 px-1.5 font-medium text-muted-foreground">Cyl/Cube Ratio</th>
              <th className="text-left py-1.5 px-1.5 font-medium text-muted-foreground">Ca Factor</th>
              <th className="text-left py-1.5 px-1.5 font-medium text-muted-foreground">Cdia Factor</th>
              <th className="text-left py-1.5 px-1.5 font-medium text-muted-foreground">Cd Accuracy</th>
              <th className="text-left py-1.5 px-1.5 font-medium text-muted-foreground">Conversion Ratio</th>
              <th className="text-left py-1.5 px-1.5 font-medium text-muted-foreground">Corrected (MPa)</th>
              <th className="text-left py-1.5 px-1.5 font-medium text-muted-foreground">Density (kg/m³)</th>
              <th className="text-left py-1.5 px-1.5 font-medium text-muted-foreground">Excess Voidage (%)</th>
              <th className="text-left py-1.5 px-1.5 font-medium text-muted-foreground">Failure Mode</th>
              <th className="text-left py-1.5 px-1.5 font-medium text-muted-foreground w-32">Before Test</th>
              <th className="text-left py-1.5 px-1.5 font-medium text-muted-foreground w-32">After Test</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const rowErrors = validationErrors.filter(e => e.rowIndex === i);
              const hasRowError = rowErrors.length > 0;
              return (
                <tr key={i} className={`border-b border-border/50 ${hasRowError ? "bg-destructive/5" : ""}`}>
                  <td className="py-1 px-1.5"><Input value={row.coreId} onChange={(e) => update(i, "coreId", e.target.value)} className={`h-7 w-16 text-xs ${validationErrors.some(e => e.rowIndex === i && e.field === "coreId") ? "border-destructive" : ""}`} /></td>
                  <td className="py-1 px-1.5">
                    <Select value={row.depth} onValueChange={(v) => update(i, "depth", v)}>
                      <SelectTrigger className={`h-7 w-24 text-xs ${validationErrors.some(e => e.rowIndex === i && e.field === "depth") ? "border-destructive" : ""}`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {DEPTH_OPTIONS.map(d => <SelectItem key={d} value={d} className="text-xs">{d}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="py-1 px-1.5"><Input type="number" value={row.diameter} onChange={(e) => update(i, "diameter", e.target.value)} className={`h-7 w-16 text-xs ${validationErrors.some(e => e.rowIndex === i && e.field === "diameter") ? "border-destructive" : ""}`} placeholder="82" /></td>
                  <td className="py-1 px-1.5"><Input type="number" value={row.lengthBefore} onChange={(e) => update(i, "lengthBefore", e.target.value)} className="h-7 w-20 text-xs" placeholder="150" /></td>
                  <td className="py-1 px-1.5"><Input type="number" value={row.lengthAfter} onChange={(e) => update(i, "lengthAfter", e.target.value)} className={`h-7 w-20 text-xs ${validationErrors.some(e => e.rowIndex === i && e.field === "lengthAfter") ? "border-destructive" : ""}`} placeholder="82" /></td>
                  <td className="py-1 px-1.5"><CalculatedInput value={getLDRatio(row)} className="h-7" /></td>
                  <td className="py-1 px-1.5"><CalculatedInput value={getArea(row)} className="h-7" /></td>
                  <td className="py-1 px-1.5"><CalculatedInput value={getVolume(row)} className="h-7" /></td>
                  <td className="py-1 px-1.5"><Input type="number" value={row.weightInAir} onChange={(e) => update(i, "weightInAir", e.target.value)} className={`h-7 w-20 text-xs ${validationErrors.some(e => e.rowIndex === i && e.field === "weightInAir") ? "border-destructive" : ""}`} placeholder="0" /></td>
                  <td className="py-1 px-1.5"><Input type="number" value={row.load} onChange={(e) => update(i, "load", e.target.value)} className={`h-7 w-20 text-xs ${validationErrors.some(e => e.rowIndex === i && e.field === "load") ? "border-destructive" : ""}`} placeholder="0" /></td>
                  <td className="py-1 px-1.5"><CalculatedInput value={getCoreStrength(row)} className="h-7" /></td>
                  <td className="py-1 px-1.5"><CalculatedInput value={getCdFactor(row)} className="h-7" /></td>
                  <td className="py-1 px-1.5"><Input type="number" value={row.cylinderToCubeRatio} onChange={(e) => update(i, "cylinderToCubeRatio", e.target.value)} className="h-7 w-20 text-xs" placeholder="1.25" step="0.01" /></td>
                  <td className="py-1 px-1.5"><Input type="number" value={row.caFactor} onChange={(e) => update(i, "caFactor", e.target.value)} className="h-7 w-20 text-xs" placeholder="1.00" step="0.01" /></td>
                  <td className="py-1 px-1.5"><Input type="number" value={row.cdcFactor} onChange={(e) => update(i, "cdcFactor", e.target.value)} className="h-7 w-20 text-xs" placeholder="1.00" step="0.01" /></td>
                  <td className="py-1 px-1.5"><Input type="number" value={row.cdAccuracyFactor} onChange={(e) => update(i, "cdAccuracyFactor", e.target.value)} className="h-7 w-20 text-xs" placeholder="1.00" step="0.01" /></td>
                  <td className="py-1 px-1.5"><Input type="number" value={row.conversionRatio} onChange={(e) => update(i, "conversionRatio", e.target.value)} className="h-7 w-20 text-xs" step="0.01" /></td>
                  <td className="py-1 px-1.5"><CalculatedInput value={getCorrectedStrength(row)} className="h-7 font-medium" /></td>
                  <td className="py-1 px-1.5"><CalculatedInput value={getDensity(row)} className="h-7" /></td>
                  <td className="py-1 px-1.5"><Input type="number" value={row.excessVoidage} onChange={(e) => update(i, "excessVoidage", e.target.value)} className="h-7 w-20 text-xs" placeholder="1.00" step="0.01" /></td>
                  <td className="py-1 px-1.5">
                    <Select value={row.failureMode} onValueChange={(v) => update(i, "failureMode", v)}>
                      <SelectTrigger className="h-7 w-full text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {FAILURE_MODES.map(f => <SelectItem key={f} value={f} className="text-xs">{f}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="py-1 px-1.5">
                    <div className="flex flex-col gap-1">
                      {row.pileBeforeImage ? (
                        <div className="relative w-28 h-20">
                          <img src={row.pileBeforeImage} alt="Before" className="w-full h-full object-cover rounded border" />
                          <Button variant="ghost" size="icon" className="absolute top-1 right-1 h-5 w-5 p-0" onClick={() => update(i, "pileBeforeImage", "")}><Trash2 className="h-3 w-3" /></Button>
                        </div>
                      ) : (
                        <label className="relative cursor-pointer">
                          <input type="file" accept="image/*" className="sr-only" onChange={(e) => e.target.files[0] && handleImageUpload(i, "pileBeforeImage", e.target.files[0])} />
                          <div className="w-28 h-20 border-2 border-dashed border-border rounded flex items-center justify-center bg-muted/50">
                            <Upload className="h-4 w-4 text-muted-foreground" />
                            <span className="text-[10px] text-muted-foreground">Before</span>
                          </div>
                        </label>
                      )}
                    </div>
                  </td>
                  <td className="py-1 px-1.5">
                    <div className="flex flex-col gap-1">
                      {row.pileAfterImage ? (
                        <div className="relative w-28 h-20">
                          <img src={row.pileAfterImage} alt="After" className="w-full h-full object-cover rounded border" />
                          <Button variant="ghost" size="icon" className="absolute top-1 right-1 h-5 w-5 p-0" onClick={() => update(i, "pileAfterImage", "")}><Trash2 className="h-3 w-3" /></Button>
                        </div>
                      ) : (
                        <label className="relative cursor-pointer">
                          <input type="file" accept="image/*" className="sr-only" onChange={(e) => e.target.files[0] && handleImageUpload(i, "pileAfterImage", e.target.files[0])} />
                          <div className="w-28 h-20 border-2 border-dashed border-border rounded flex items-center justify-center bg-muted/50">
                            <Upload className="h-4 w-4 text-muted-foreground" />
                            <span className="text-[10px] text-muted-foreground">After</span>
                          </div>
                        </label>
                      )}
                    </div>
                  </td>
                  <td className="py-1 px-1"><Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setRows(rows.filter((_, j) => j !== i))}><X className="h-3 w-3" /></Button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Button variant="outline" size="sm" className="mb-4" onClick={() => setRows([...rows, { ...CORING_ROW_DEFAULTS, coreId: `CR${rows.length + 1}` }])}>
        <Plus className="h-3.5 w-3.5 mr-1" /> Add Core
      </Button>

      {/* Comments */}
      <div className="mb-4 grid grid-cols-2 gap-4">
        {rows.map((row, i) => (
          <div key={i} className="space-y-1">
            <Label className="text-xs">Comments - Core {row.coreId}</Label>
            <Input value={row.comments} onChange={(e) => update(i, "comments", e.target.value)} className="h-8 text-xs" placeholder="Sparsely distributed aggregates..." />
          </div>
        ))}
      </div>

      {/* Reception / Project Creation Actions */}
      <Card className="mb-4 border-primary">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <FilePlus className="h-4 w-4" />
            Reception & Project Creation
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <Label className="text-xs">RC No.</Label>
            <Input value={rcNo} onChange={(e) => setRcNo(e.target.value)} className="h-8 w-40 text-xs" placeholder="Auto-generated" readOnly />
            <Button variant="outline" size="sm" onClick={async () => {
              const consignments = await listRecords<{ rc_no: string }>("reception_consignments", { limit: 500 });
              setRcNo(nextRcNo(consignments.data?.map(c => c.rc_no) || []));
            }}>
              Generate RC No.
            </Button>
          </div>
          
          <div className="flex gap-2">
            <Button 
              variant="default" 
              className="gap-2 bg-[#0f6b5c] hover:bg-[#0c5a4a]"
              onClick={handleCreateProject}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating Project...
                </>
              ) : (
                <>
                  <FilePlus className="h-4 w-4" />
                  Create Project from Reception
                </>
              )}
            </Button>
            <Button variant="outline" onClick={() => setReceptionMode(!receptionMode)}>
              {receptionMode ? (<><ArrowLeft className="h-4 w-4 mr-1" /> Back</>) : (<><ArrowLeft className="h-4 w-4 mr-1" /> Reception Dashboard</>)}
            </Button>
          </div>

          {receptionMode && (
            <div className="p-3 bg-muted/50 rounded text-xs text-muted-foreground">
              Reception mode: Go to <strong>/reception/new</strong> to log a consignment, or use the dashboard at <strong>/reception</strong>.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Test Photographs */}
      {rows.some(r => r.pileBeforeImage || r.pileAfterImage) && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-sm">Test Photographs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {rows.filter(r => r.pileBeforeImage || r.pileAfterImage).map(row => (
              <div key={row.coreId} className="space-y-2">
                <Label className="text-xs">Core {row.coreId}</Label>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { src: row.pileBeforeImage, label: "Before test" },
                    { src: row.pileAfterImage, label: "After test" },
                  ].map(({ src, label }) => (
                    <div key={label} className="space-y-1">
                      <div className="flex h-48 items-center justify-center overflow-hidden rounded border bg-muted/30">
                        {src ? (
                          <img src={src} alt={`Core ${row.coreId} ${label.toLowerCase()}`} className="h-full w-full object-contain" />
                        ) : (
                          <span className="text-xs text-muted-foreground">No photo</span>
                        )}
                      </div>
                      <p className="text-center text-xs text-muted-foreground">{label}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </TestSection>
  );
};

export default CoringTest;
