import { Fragment, useState, useMemo, useEffect, useCallback, useRef, useContext } from "react";
import TestSection from "@/components/TestSection";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import CalculatedInput from "@/components/CalculatedInput";
import { Plus, X, Upload, Trash2, ArrowLeft, FilePlus, Loader2, AlertCircle, CheckCircle, Save, Printer } from "lucide-react";
import { useProject } from "@/context/ProjectContext";
import { loadTestResult, saveTestResult } from "@/lib/testResultPersistence";
import type { jsPDF } from "jspdf";
import { buildCoringReportPDF, type CoringCoreReport } from "@/lib/coringReportPdf";
import { pdfFileName, printPDFDocument } from "@/lib/pdfGenerator";
import { formatReportDate } from "@/lib/compressivePdfGenerator";
import { useTestReport } from "@/hooks/useTestReport";
import { useNavigate } from "react-router-dom";
import { API_BASE_URL, buildApiUrl, getSessionToken, saveReceptionConsignment, listRecords, readRecord, uploadCoringPhoto, discardCoringPhoto } from "@/lib/api";
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
const detailLabelClass = "w-2/5 shrink-0 border-r-2 border-primary/30 pr-3 text-xs font-medium leading-tight text-foreground";
const detailInputClass = "h-8 min-w-0 flex-1 text-xs pl-2";

const FAILURE_MODES = [
  "Sparsely distributed aggregates with maximum size approximately 20mm",
  "Dense aggregates with maximum size approximately 20mm",
  "Aggregate crushing",
  "Cement paste failure",
  "Mixed failure",
  "Custom"
];

const CORING_TEST_NAME = "Concrete Coring: Core Compressive Strength";

const CORING_ROW_DEFAULTS: CoringRow = {
  coreId: "CR1",
  diameter: "82",
  lengthBefore: "150",
  lengthAfter: "82",
  weightInAir: "1200",
  load: "300",
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

const coringImageUrl = (path: string): string => {
  // Normalise coring image paths so they always resolve to
  // https://lab.wayrus.co.ke/uploads/coring/filename.jpg
  // regardless of how the path is stored in the database.
  let p = path.startsWith("/") ? path : "/" + path;
  if (p.startsWith("/uploads/") && !p.startsWith("/uploads/coring/")) {
    const afterUploads = p.slice("/uploads/".length);
    p = "/uploads/coring/" + afterUploads;
  }
  // Use serve-image endpoint with session token for proper CORS/auth headers
  const apiUrl = new URL(buildApiUrl());
  apiUrl.searchParams.set("action", "serve-image");
  apiUrl.searchParams.set("file_path", p);
  return apiUrl.toString();
};

const loadImageAsDataUrl = async (path: string | undefined): Promise<string | undefined> => {
  if (!path) return undefined;
   
  // Normalise coring image paths so they always resolve to
  // https://lab.wayrus.co.ke/uploads/coring/filename.jpg
  let p = path.startsWith("/") ? path : "/" + path;
  if (p.startsWith("/uploads/") && !p.startsWith("/uploads/coring/")) {
    const afterUploads = p.slice("/uploads/".length);
    p = "/uploads/coring/" + afterUploads;
  }
  const apiUrl = new URL(buildApiUrl());
  apiUrl.searchParams.set("action", "serve-image");
  apiUrl.searchParams.set("file_path", p);
  const url = apiUrl.toString();
  const sessionToken = getSessionToken();
  
  try {
    const response = await fetch(url, {
      credentials: "include",
      headers: sessionToken ? { "X-Session-Token": sessionToken } : {}
    });
    if (!response.ok) throw new Error(`Image request failed with status ${response.status}`);
    const blob = await response.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") resolve(reader.result);
        else reject(new Error("Image could not be converted to a data URL"));
      };
      reader.onerror = () => reject(reader.error ?? new Error("Image could not be read"));
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    const errorMsg = `[CoringTest] Failed to load test image ${path}: ${error instanceof Error ? error.message : String(error)}`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }
};

const sanitizeInput = (input: string): string => {
  // Remove potentially dangerous characters and limit length
  return input
    .replace(/<script[^>]*>.*?<\/script>/gi, "")
    .replace(/javascript:/gi, "")
    .replace(/on\w+=/gi, "")
    .trim()
    .substring(0, 500); // Limit length to prevent DoS
};

const validateInputNumber = (value: string, min: number = 0, max: number = 1000000): boolean => {
  const num = parseFloat(value);
  return !isNaN(num) && isFinite(num) && num >= min && num <= max;
};

const validateInputString = (value: string, minLength: number = 1, maxLength: number = 200): boolean => {
  return value.length >= minLength && value.length <= maxLength;
};

export const CoringTest = ({ testKey }: CoringTestProps) => {
  const project = useProject();
const projectId = project.currentProjectId ?? null;
  const navigate = useNavigate();
  const user = useContext(SessionContext)?.user;
  const [rows, setRows] = useState<CoringRow[]>([
    { ...CORING_ROW_DEFAULTS, coreId: "CR1" },
    { ...CORING_ROW_DEFAULTS, coreId: "CR2" },
    { ...CORING_ROW_DEFAULTS, coreId: "CR3" },
  ]);
  const [activeCoreIndex, setActiveCoreIndex] = useState(0);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [reportAction, setReportAction] = useState<"pdf" | "print" | null>(null);
  const [selectedReportCores, setSelectedReportCores] = useState<Set<number>>(new Set());
  const [isBuildingReport, setIsBuildingReport] = useState(false);
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
    dateOfTest: "",
    dateReported: "",
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

  // Both load effects below hit the API (one lists every test_result, which can take a
  // few seconds). If the user uploads/deletes a photo or edits a field before the slow
  // response lands, applying it would silently revert their change — which makes uploads
  // and deletes look like they "only work in the front end". Once the user has touched
  // the form, late loaders must not overwrite their state.
  const userTouchedRef = useRef(false);
  const markUserTouched = useCallback(() => {
    userTouchedRef.current = true;
  }, []);

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

          // A late response must not clobber edits/uploads the user already made.
          if (userTouchedRef.current) return;
          
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
                  coreId: (core.coreId as string) || (core.mark as string) || `CR${i + 1}`,
                  diameter: String(core.diameter ?? ""),
                  lengthBefore: String(core.lengthBefore ?? ""),
                  lengthAfter: String(core.lengthAfter ?? ""),
                  weightInAir: String(core.weightInAir ?? core.weight ?? ""),
                  load: String(core.load ?? ""),
                  depth: (core.depth as string) || "0.0-2.0",
                  failureMode: (core.failureMode as string) || "Sparsely distributed aggregates with maximum size approximately 20mm",
                  comments: (core.comments as string) ?? "",
                  pileBeforeImage: (core.pileBeforeImage as string) ?? (core.beforeImage as string) ?? "",
                  pileAfterImage: (core.pileAfterImage as string) ?? (core.afterImage as string) ?? "",
                  area: String(core.area ?? ""),
                  volume: String(core.volume ?? ""),
                  cylinderToCubeRatio: String(core.cylinderToCubeRatio ?? core.cylCubeRatio ?? "1.25"),
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
        // Same guard as the other loader: keep whatever the user has already changed.
        if (userTouchedRef.current) return;
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
    const getLDRatio = useCallback((row: CoringRow) => {
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
    markUserTouched();
    // Sanitize input to prevent XSS and injection attacks
    const sanitizedVal = sanitizeInput(val);
    
    // Additional validation for different fields
    if (field === "coreId") {
      if (!validateInputString(sanitizedVal, 1, 50)) {
        console.warn(`[CoringTestEnhanced] Core ID format invalid or out of range: ${sanitizedVal}`);
        return;
      }
    }
    
    if (field === "diameter" && !validateInputNumber(sanitizedVal, 1, 1000)) {
      console.warn(`[CoringTestEnhanced] Diameter invalid or out of range: ${sanitizedVal}`);
      return;
    }
    
    if (field === "lengthAfter" && !validateInputNumber(sanitizedVal, 1, 1000)) {
      console.warn(`[CoringTestEnhanced] Length after trimming invalid or out of range: ${sanitizedVal}`);
      return;
    }
    
    if (field === "weightInAir" && !validateInputNumber(sanitizedVal, 0, 100000)) {
      console.warn(`[CoringTestEnhanced] Weight in air invalid or out of range: ${sanitizedVal}`);
      return;
    }
    
    if (field === "load" && !validateInputNumber(sanitizedVal, 0, 100000)) {
      console.warn(`[CoringTestEnhanced] Load invalid or out of range: ${sanitizedVal}`);
      return;
    }

    setRows(prev => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: sanitizedVal };
      return next;
    });
    // Clear validation error for this field when user types
    setValidationErrors(prev => prev.filter(e => !(e.rowIndex === i && e.field === field)));
  }, [markUserTouched]);

  const updateProjectDetail = useCallback((field: string, val: string) => {
    // Sanitize input and validate project details
    const sanitizedVal = sanitizeInput(val);
    
    if (field === "projectName") {
      if (!validateInputString(sanitizedVal, 1, 200)) {
        console.warn(`[CoringTestEnhanced] Project name invalid: ${sanitizedVal}`);
        return;
      }
    }
    
    if (field === "tower") {
      if (!validateInputString(sanitizedVal, 1, 100)) {
        console.warn(`[CoringTestEnhanced] Tower/location invalid: ${sanitizedVal}`);
        return;
      }
    }
    
    setProjectDetails(prev => ({ ...prev, [field]: sanitizedVal }));
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

const removeCoringImage = (index: number, field: "pileBeforeImage" | "pileAfterImage") => {
    const path = rows[index]?.[field];
    update(index, field, "");
    if (path) void discardCoringPhoto(path);
  };

  const removeCoringRow = (index: number) => {
    markUserTouched();
    const paths = [rows[index]?.pileBeforeImage, rows[index]?.pileAfterImage].filter((p): p is string => Boolean(p));
    setRows(rows.filter((_, j) => j !== index));
    setActiveCoreIndex((activeIndex) => {
      if (rows.length <= 1) return 0;
      if (index < activeIndex) return activeIndex - 1;
      if (index === activeIndex) return Math.min(index, rows.length - 2);
      return activeIndex;
    });
    paths.forEach((path) => void discardCoringPhoto(path));
  };

const handleImageUpload = async (index: number, field: "pileBeforeImage" | "pileAfterImage", file: File) => {
    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Image too large. Maximum size is 10MB.");
      return;
    }
    
    // Validate file type - only allow common image formats
    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      toast.error("Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed.");
      return;
    }
    
    // Validate file name to prevent path traversal
    const fileName = file.name;
    if (!fileName || fileName.includes("..") || fileName.includes("/") || fileName.includes("\\")) {
      toast.error("Invalid file name.");
      return;
    }
    
    // Check file extension as additional security
    const fileExtension = fileName.split(".").pop()?.toLowerCase();
    if (!fileExtension || !["jpg", "jpeg", "png", "gif", "webp"].includes(fileExtension)) {
      toast.error("Invalid file extension. Only .jpg, .jpeg, .png, .gif, and .webp are allowed.");
      return;
    }
    
    try {
      // Replace: delete the existing image before uploading the new one
      const existingPath = rows[index]?.[field];
      if (existingPath) {
        await discardCoringPhoto(existingPath);
      }

      const filePath = await uploadCoringPhoto(file, field === "pileBeforeImage" ? "before" : "after");

      if (filePath.includes("..") || filePath.includes("//")) {
        toast.error("Invalid file path returned. Please try again.");
        return;
      }

      markUserTouched();
      setRows(prev => {
        const next = [...prev];
        next[index] = { ...next[index], [field]: filePath };
        return next;
      });
      toast.success(`${field === "pileBeforeImage" ? "Before" : "After"} test image uploaded`);    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error("Image upload failed:", error);
      toast.error(`Upload failed: ${errorMessage}`);
    }
  };

  const buildCoringRecord = (status: "in-progress" | "completed") => ({
    test_key: "coring",
    name: CORING_TEST_NAME,
    category: "concrete",
    status,
    data_points: rows.length,
    key_results_json: [
      { label: "Avg Corrected Strength", value: (rows.map(r => parseFloat(getCorrectedStrength(r))).filter(Boolean).reduce((a,b)=>a+b,0)/rows.length || 0).toFixed(2) + " MPa" },
      { label: "Cores Tested", value: String(rows.length) },
    ].filter(r => r.value),
    payload_json: { test: { testKey: "coring", dataPoints: rows.length, coring: true, cores: rows, projectDetails }, rows, projectDetails },
  });

  const handleSave = async () => {
    const errors = [...validateAllRows(), ...validateProjectDetails()];
    if (errors.length > 0) {
      setValidationErrors(errors);
      setSaveStatus("error");
      toast.error("Please fix validation errors before saving");
      return;
    }
    
    // Additional security validation
    if (!projectDetails.projectName.trim()) {
      toast.error("Project Name cannot be empty");
      setSaveStatus("error");
      return;
    }
    
    if (!projectDetails.tower.trim()) {
      toast.error("Tower/Location cannot be empty");
      setSaveStatus("error");
      return;
    }
    
    if (projectDetails.projectName.length > 200) {
      toast.error("Project Name is too long (maximum 200 characters)");
      setSaveStatus("error");
      return;
    }
    
    if (projectDetails.tower.length > 100) {
      toast.error("Tower/Location is too long (maximum 100 characters)");
      setSaveStatus("error");
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
      
      // Validate data before saving
      if (!saveData.rows || saveData.rows.length === 0) {
        throw new Error("No test data to save");
      }
      
      localStorage.setItem(`coring_test_${testKey || "default"}`, JSON.stringify(saveData));

      if (projectId) {
        const savedId = await saveTestResult(projectId, recordId, buildCoringRecord("completed"));
        setRecordId(savedId);
      }

      setIsSaved(true);
      setSaveStatus("saved");
      toast.success("Test data saved");
      
      // Reset save status after a delay
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (error) {
      console.error("[CoringTestEnhanced] Save failed:", error);
      setSaveStatus("error");
      toast.error("Save failed. Please try again.");
    }
  };

  const handleCreateProject = async () => {
    const errors = [...validateAllRows(), ...validateProjectDetails()];
    if (errors.length > 0) {
      setValidationErrors(errors);
      toast.error("Please fix validation errors before creating project");
      return;
    }
    
    // Additional validation for project details
    if (!projectDetails.projectName.trim()) {
      toast.error("Project Name cannot be empty");
      return;
    }
    
    if (!projectDetails.tower.trim()) {
      toast.error("Tower/Location cannot be empty");
      return;
    }
    
    if (projectDetails.projectName.length > 200) {
      toast.error("Project Name is too long (maximum 200 characters)");
      return;
    }
    
    if (projectDetails.tower.length > 100) {
      toast.error("Tower/Location is too long (maximum 100 characters)");
      return;
    }
    
    setIsProcessing(true);
    try {
      // Create reception consignment with additional validation
      const consignments = await listRecords<{ rc_no: string }>("reception_consignments", { limit: 500 });
      const newRcNo = nextRcNo(consignments.data?.map(c => c.rc_no) || []);
      
      // Validate RC number format
      if (!newRcNo || newRcNo.length === 0) {
        console.error("[CoringTestEnhanced] Failed to generate RC number");
        toast.error("Failed to generate project reference number. Please try again.");
        return;
      }
      
      const consignment: ReceptionConsignmentInput = emptyReceptionConsignment(newRcNo);
      consignment.jobNo = projectDetails.projectName.trim();
      consignment.project = projectDetails.tower.trim();
      consignment.client = "NSSF";
      consignment.receivedAt = new Date().toISOString().slice(0, 16);
      consignment.receivedBy = user?.name || "PUAL N";
      consignment.methodSet = "BS EN 12504-1:2009";
      consignment.status = "processed";
      
      // Validate and create samples from rows
      if (rows.length < 1) {
        toast.error("At least one core is required to create a project");
        return;
      }
      
      const samples = rows.map((row, i) => {
        const sample = emptyReceptionSample(`CR${i + 1}`);
        
        // Validate sample data
        if (!row.coreId.trim()) {
          console.error(`[CoringTestEnhanced] Core ${i + 1} missing ID`);
        }
        
        sample.clientMark = row.coreId.trim() || `CR${i + 1}`;
        sample.location = projectDetails.tower.trim();
        sample.depthLabel = row.depth || "0.0-2.0";
        sample.sampleType = "Concrete core";
        sample.container = "Core sample";
        sample.tests = ["CORE"];
        sample.massKg = row.weightInAir ? String(parseFloat(row.weightInAir) / 1000) : "";
        sample.condition = "Intact";
        return sample;
      });
      
      consignment.samples = samples;
      
      await saveReceptionConsignment(consignment);
      
      // Create project from consignment
      try {
        const { processReceptionToProject, linkCoringPhotos } = await import("@/lib/api");
        const result = await processReceptionToProject(consignment, "coring", buildCoringRecord("in-progress"));

        const coringTestResultId = result.testResultIds.coring;
        const photoPaths = rows.flatMap(row => [row.pileBeforeImage, row.pileAfterImage]).filter((p): p is string => Boolean(p));
        if (result.projectId && coringTestResultId && photoPaths.length > 0) {
          try {
            await linkCoringPhotos(result.projectId, coringTestResultId, photoPaths);
          } catch (linkError) {
            console.error("[CoringTestEnhanced] Failed to link Coring photos", linkError);
            toast.error("Project created, but photos could not be linked to it");
          }
        }

        if (result.projectId) {
          setRecordId(result.testResultIds.coring ?? null);
          setReceptionMode(false);
          toast.success("Project created successfully");
          navigate(`/projects/${result.projectId}`);
        } else {
          console.error("[CoringTestEnhanced] processReceptionToProject returned no project ID");
          toast.error("Project created but ID could not be retrieved. Please check your projects list.");
        }
      } catch (error) {
        console.error("[CoringTestEnhanced] Process reception to project failed:", error);
        toast.error("Failed to create project. Please try again.");
      }
    } catch (error) {
      console.error("Project creation failed:", error);
      toast.error("Failed to create project. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const buildReport = async (reportRows: CoringRow[]): Promise<jsPDF | null> => {
    const reportErrors: ValidationError[] = [];
    const seenIds = new Set<string>();
    reportRows.forEach((row) => {
      const rowIndex = rows.indexOf(row);
      if (seenIds.has(row.coreId.trim())) {
        reportErrors.push({ rowIndex, field: "coreId", message: "Duplicate core ID" });
      }
      seenIds.add(row.coreId.trim());
      reportErrors.push(...validateRow(row, rowIndex));
    });
    if (reportRows.length === rows.length && rows.length < 3) {
      reportErrors.push({ rowIndex: -1, field: "rows", message: "At least 3 cores are required to report a mean strength" });
    }
    const errors = [...reportErrors, ...validateProjectDetails()];
    if (errors.length > 0) {
      setValidationErrors(errors);
      toast.error("Please fix validation errors before generating the report");
      return null;
    }

    // Additional validation for PDF generation
    if (!projectDetails.projectName.trim()) {
      toast.error("Project Name cannot be empty for the report");
      return null;
    }
    
    if (!projectDetails.sampleNo.trim()) {
      toast.error("Sample Number cannot be empty for the report");
      return null;
    }

    try {
      const dateOfTest = formatReportDate(projectDetails.dateOfTest);
      const cores: CoringCoreReport[] = await Promise.all(reportRows.map(async (row) => {
        let beforeImage: string | undefined;
        let afterImage: string | undefined;
        try {
          beforeImage = await loadImageAsDataUrl(row.pileBeforeImage);
        } catch (e) {
          toast.error(`Failed to load before image for ${row.coreId}: ${e instanceof Error ? e.message : String(e)}`);
        }
        try {
          afterImage = await loadImageAsDataUrl(row.pileAfterImage);
        } catch (e) {
          toast.error(`Failed to load after image for ${row.coreId}: ${e instanceof Error ? e.message : String(e)}`);
        }
        return {
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
          beforeImage,
          afterImage,
        };
      }));

      return await buildCoringReportPDF({
        title: "Compressive Strength of Concrete Cores",
        standard: "BS EN 12504-1:2009",
        projectName: projectDetails.projectName.trim(),
        sampleNo: projectDetails.sampleNo.trim(),
        concreteClass: projectDetails.concreteClass,
        ageOfConcrete: projectDetails.ageOfConcrete,
        location: projectDetails.tower,
        testedBy: projectDetails.testedBy,
        checkedBy: projectDetails.checkedBy,
        dateReported: formatReportDate(projectDetails.dateReported),
      }, cores);
    } catch (error) {
      console.error("Report generation failed:", error);
      toast.error(`Report generation failed: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  };

  const openReportSelection = (action: "pdf" | "print") => {
    if (rows.length === 0) {
      toast.info("No cores to include in the report");
      return false;
    }
    setSelectedReportCores(new Set(rows.map((_, index) => index)));
    setReportAction(action);
    setReportDialogOpen(true);
    return false;
  };

  const exportPDF = () => openReportSelection("pdf");

  const handlePrint = () => {
    openReportSelection("print");
  };

  const confirmReportSelection = async () => {
    if (!reportAction || selectedReportCores.size === 0 || isBuildingReport) return;
    const action = reportAction;
    const reportRows = rows.filter((_, index) => selectedReportCores.has(index));
    setIsBuildingReport(true);
    try {
      const doc = await buildReport(reportRows);
      if (!doc) {
        setReportDialogOpen(false);
        return;
      }
      if (action === "pdf") {
        doc.save(pdfFileName(projectDetails.projectName, "Coring_Report"));
        toast.success("PDF generated successfully");
        setReportDialogOpen(false);
      } else {
        setReportDialogOpen(false);
        printPDFDocument(doc);
      }
    } catch (error) {
      console.error("Report generation failed:", error);
      toast.error(`Report generation failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsBuildingReport(false);
    }
  };

  const strengths = rows.map(r => parseFloat(getCorrectedStrength(r))).filter(Boolean);
  const avgStrength = strengths.length ? (strengths.reduce((a, b) => a + b, 0) / strengths.length).toFixed(2) : "";

  const results = useMemo(() => [
    { label: "Avg Corrected Strength", value: avgStrength ? `${avgStrength} MPa` : "" },
    { label: "Cores Tested", value: strengths.length ? String(strengths.length) : "" },
  ], [avgStrength, strengths.length]);
  useTestReport("coring", strengths.length, results);

  const canExport = !!project.currentProjectId || isSaved;
  const hasValidationErrors = validationErrors.length > 0;
  const selectedCoreIndex = Math.min(activeCoreIndex, Math.max(rows.length - 1, 0));
  const activeCore = rows[selectedCoreIndex];

  return (
    <TestSection 
      title="Concrete Core Testing (BS EN 12504-1:2009)" 
      testKey={testKey} 
      onSave={handleSave} 
      onClear={() => { markUserTouched(); setRows([{ ...CORING_ROW_DEFAULTS, coreId: "CR1" }, { ...CORING_ROW_DEFAULTS, coreId: "CR2" }, { ...CORING_ROW_DEFAULTS, coreId: "CR3" }]); setActiveCoreIndex(0); }}
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

      <div className="mb-4 flex items-center gap-2 print:hidden" data-testid="coring-core-strip">
        <span className="shrink-0 text-xs text-muted-foreground">
          {rows.length ? `Core ${selectedCoreIndex + 1} of ${rows.length}` : "No cores"}
        </span>
        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto pb-1">
          {rows.map((row, index) => {
            const isActive = index === selectedCoreIndex;
            const strength = getCorrectedStrength(row);
            return (
              <button
                key={`${row.coreId}-${index}`}
                type="button"
                onClick={() => setActiveCoreIndex(index)}
                aria-current={isActive}
                title={row.coreId}
                data-testid={`coring-core-${index + 1}`}
                data-active={isActive ? "true" : "false"}
                className={`shrink-0 whitespace-nowrap rounded-md border px-2.5 py-1 text-left text-[11px] leading-tight transition-colors ${isActive ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:bg-muted/40"}`}
              >
                <span className="font-medium">{index + 1}. {row.coreId || `CR${index + 1}`}</span>
                {strength ? <span className="ml-1.5 text-[10px] opacity-80">{strength} MPa</span> : null}
              </button>
            );
          })}
          <Button
            type="button"
            onClick={() => {
              markUserTouched();
              const nextRows = [...rows, { ...CORING_ROW_DEFAULTS, coreId: `CR${rows.length + 1}` }];
              setRows(nextRows);
              setActiveCoreIndex(nextRows.length - 1);
            }}
            size="sm"
            variant="outline"
            className="shrink-0 gap-1.5"
            data-testid="coring-add-core"
          >
            <Plus className="h-3.5 w-3.5" /> Add Core
          </Button>
        </div>
      </div>

      {/* Core Data Entry */}
      {rows.length > 0 && <div className="overflow-x-auto mb-4">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="text-left py-1.5 px-1.5 font-medium text-muted-foreground border-r border-border/50">Core ID *</th>
              <th className="text-left py-1.5 px-1.5 font-medium text-muted-foreground border-r border-border/50">Depth (m) *</th>
              <th className="text-left py-1.5 px-1.5 font-medium text-muted-foreground border-r border-border/50">Dia (mm) *</th>
              <th className="text-left py-1.5 px-1.5 font-medium text-muted-foreground border-r border-border/50">L Before (mm)</th>
              <th className="text-left py-1.5 px-1.5 font-medium text-muted-foreground border-r border-border/50">L After (mm) *</th>
              <th className="text-left py-1.5 px-1.5 font-medium text-muted-foreground border-r border-border/50">L/D</th>
              <th className="text-left py-1.5 px-1.5 font-medium text-muted-foreground border-r border-border/50">Area (m²)</th>
              <th className="text-left py-1.5 px-1.5 font-medium text-muted-foreground border-r border-border/50">Volume (m³)</th>
              <th className="text-left py-1.5 px-1.5 font-medium text-muted-foreground border-r border-border/50">Wt Air (g) *</th>
              <th className="text-left py-1.5 px-1.5 font-medium text-muted-foreground border-r border-border/50">Load (kN) *</th>
              <th className="text-left py-1.5 px-1.5 font-medium text-muted-foreground border-r border-border/50">Core Str (MPa)</th>
              <th className="text-left py-1.5 px-1.5 font-medium text-muted-foreground border-r border-border/50">Cd Factor</th>
              <th className="text-left py-1.5 px-1.5 font-medium text-muted-foreground border-r border-border/50">Cyl/Cube Ratio</th>
              <th className="text-left py-1.5 px-1.5 font-medium text-muted-foreground border-r border-border/50">Ca Factor</th>
              <th className="text-left py-1.5 px-1.5 font-medium text-muted-foreground border-r border-border/50">Cdia Factor</th>
              <th className="text-left py-1.5 px-1.5 font-medium text-muted-foreground border-r border-border/50">Cd Accuracy</th>
              <th className="text-left py-1.5 px-1.5 font-medium text-muted-foreground border-r border-border/50">Conversion Ratio</th>
              <th className="text-left py-1.5 px-1.5 font-medium text-muted-foreground border-r border-border/50">Corrected (MPa)</th>
              <th className="text-left py-1.5 px-1.5 font-medium text-muted-foreground border-r border-border/50">Density (kg/m³)</th>
              <th className="text-left py-1.5 px-1.5 font-medium text-muted-foreground border-r border-border/50">Excess Voidage (%)</th>
              <th className="text-left py-1.5 px-1.5 font-medium text-muted-foreground border-r border-border/50">Failure Mode</th>
              <th className="w-12"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              if (i !== selectedCoreIndex) return null;
              const rowErrors = validationErrors.filter(e => e.rowIndex === i);
              const hasRowError = rowErrors.length > 0;
              return (
                <Fragment key={i}>
                <tr className={`border-b border-border/50 ${hasRowError ? "bg-destructive/5" : ""}`}>
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
                  <td className="py-1 px-1.5"><CalculatedInput value={getLDRatio(row)} className="h-7 w-24 px-1.5" /></td>
                  <td className="py-1 px-1.5"><CalculatedInput value={getArea(row)} className="h-7 w-28 px-1.5 text-xs" /></td>
                  <td className="py-1 px-1.5"><CalculatedInput value={getVolume(row)} className="h-7 w-28 px-1.5 text-xs" /></td>
                  <td className="py-1 px-1.5"><Input type="number" value={row.weightInAir} onChange={(e) => update(i, "weightInAir", e.target.value)} className={`h-7 w-20 text-xs ${validationErrors.some(e => e.rowIndex === i && e.field === "weightInAir") ? "border-destructive" : ""}`} placeholder="0" /></td>
                  <td className="py-1 px-1.5"><Input type="number" value={row.load} onChange={(e) => update(i, "load", e.target.value)} className={`h-7 w-20 text-xs ${validationErrors.some(e => e.rowIndex === i && e.field === "load") ? "border-destructive" : ""}`} placeholder="0" /></td>
                  <td className="py-1 px-1.5"><CalculatedInput value={getCoreStrength(row)} className="h-7 w-24 px-1.5" /></td>
                  <td className="py-1 px-1.5"><CalculatedInput value={getCdFactor(row)} className="h-7 w-24 px-1.5" /></td>
                  <td className="py-1 px-1.5"><Input type="number" value={row.cylinderToCubeRatio} onChange={(e) => update(i, "cylinderToCubeRatio", e.target.value)} className="h-7 w-20 text-xs" placeholder="1.25" step="0.01" /></td>
                  <td className="py-1 px-1.5"><Input type="number" value={row.caFactor} onChange={(e) => update(i, "caFactor", e.target.value)} className="h-7 w-20 text-xs" placeholder="1.00" step="0.01" /></td>
                  <td className="py-1 px-1.5"><Input type="number" value={row.cdcFactor} onChange={(e) => update(i, "cdcFactor", e.target.value)} className="h-7 w-20 text-xs" placeholder="1.00" step="0.01" /></td>
                  <td className="py-1 px-1.5"><Input type="number" value={row.cdAccuracyFactor} onChange={(e) => update(i, "cdAccuracyFactor", e.target.value)} className="h-7 w-20 text-xs" placeholder="1.00" step="0.01" /></td>
                  <td className="py-1 px-1.5"><Input type="number" value={row.conversionRatio} onChange={(e) => update(i, "conversionRatio", e.target.value)} className="h-7 w-20 text-xs" step="0.01" /></td>
                  <td className="py-1 px-1.5"><CalculatedInput value={getCorrectedStrength(row)} className="h-7 w-24 px-1.5 font-medium" /></td>
                  <td className="py-1 px-1.5"><CalculatedInput value={getDensity(row)} className="h-7 w-24 px-1.5" /></td>
                  <td className="py-1 px-1.5"><Input type="number" value={row.excessVoidage} onChange={(e) => update(i, "excessVoidage", e.target.value)} className="h-7 w-20 text-xs" placeholder="1.00" step="0.01" /></td>
                  <td className="py-1 px-1.5">
                    <Select value={row.failureMode} onValueChange={(v) => update(i, "failureMode", v)}>
                      <SelectTrigger className="h-7 w-full text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {FAILURE_MODES.map(f => <SelectItem key={f} value={f} className="text-xs">{f}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="py-1 px-1"><Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeCoringRow(i)}><X className="h-3 w-3" /></Button></td>
                </tr>
                <tr className="border-b border-border/50 bg-muted/20">
                  <td colSpan={22} className="py-2 px-1.5">
                    <div className="flex gap-6">
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-medium text-muted-foreground">Before test</span>
                        {row.pileBeforeImage ? (
                          <div className="relative w-28 h-20">
                            <img src={coringImageUrl(row.pileBeforeImage)} alt="Before" className="w-full h-full object-cover rounded border" />
                            <Button variant="ghost" size="icon" className="absolute top-1 right-1 h-5 w-5 p-0" onClick={() => removeCoringImage(i, "pileBeforeImage")}><Trash2 className="h-3 w-3" /></Button>
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
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-medium text-muted-foreground">After test</span>
                        {row.pileAfterImage ? (
                          <div className="relative w-28 h-20">
                            <img src={coringImageUrl(row.pileAfterImage)} alt="After" className="w-full h-full object-cover rounded border" />
                            <Button variant="ghost" size="icon" className="absolute top-1 right-1 h-5 w-5 p-0" onClick={() => removeCoringImage(i, "pileAfterImage")}><Trash2 className="h-3 w-3" /></Button>
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
                    </div>
                  </td>
                </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>}

      {/* Comments */}
      {activeCore && <div className="mb-4 grid grid-cols-2 gap-4">
        {rows.map((row, i) => i === selectedCoreIndex && (
          <div key={i} className="space-y-1">
            <Label className="text-xs">Comments - Core {row.coreId}</Label>
            <Input value={row.comments} onChange={(e) => update(i, "comments", e.target.value)} className="h-8 text-xs" placeholder="Sparsely distributed aggregates..." />
          </div>
        ))}
      </div>}

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

      <Dialog open={reportDialogOpen} onOpenChange={(open) => { if (!isBuildingReport) setReportDialogOpen(open); }}>
        <DialogContent className="max-w-md" data-testid="coring-report-selection">
          <DialogHeader>
            <DialogTitle>{reportAction === "print" ? "Print cores" : "Export cores as PDF"}</DialogTitle>
            <DialogDescription>
              Select which cores to include. A report will be generated for the selected cores.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-between text-xs">
            <button type="button" className="text-primary hover:underline" onClick={() => setSelectedReportCores(new Set(rows.map((_, index) => index)))}>
              Select all
            </button>
            <button type="button" className="text-primary hover:underline" onClick={() => setSelectedReportCores(new Set())}>
              Clear
            </button>
          </div>
          <div className="max-h-72 space-y-2 overflow-y-auto">
            {rows.map((row, index) => (
              <label key={`${row.coreId}-${index}`} className="flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm">
                <Checkbox
                  checked={selectedReportCores.has(index)}
                  onCheckedChange={(checked) => {
                    setSelectedReportCores((previous) => {
                      const next = new Set(previous);
                      if (checked === true) next.add(index);
                      else next.delete(index);
                      return next;
                    });
                  }}
                />
                <span className="font-medium">{index + 1}. {row.coreId}</span>
                <span className="ml-auto text-xs text-muted-foreground">Depth {row.depth} m</span>
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setReportDialogOpen(false)} disabled={isBuildingReport}>Cancel</Button>
            <Button type="button" onClick={confirmReportSelection} disabled={selectedReportCores.size === 0 || isBuildingReport}>
              {isBuildingReport ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Generating…</> : reportAction === "print" ? `Print ${selectedReportCores.size} selected` : `Generate PDF (${selectedReportCores.size})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TestSection>
  );
};

export default CoringTest;
