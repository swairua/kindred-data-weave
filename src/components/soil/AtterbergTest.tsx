import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ChevronRight, Download, Plus, Trash2, Upload, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

import TestSection from "@/components/TestSection";
import AtterbergTestCard from "./AtterbergTestCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useProject } from "@/context/ProjectContext";
import {
  type AtterbergProjectState,
  type AtterbergRecord,
  type AtterbergTest,
  type AtterbergTestType,
  type LiquidLimitTest,
  type LiquidLimitTrial,
  type PlasticLimitTest,
  type PlasticLimitTrial,
  type ShrinkageLimitTest,
  type ShrinkageLimitTrial,
} from "@/context/TestDataContext";
import { generateAtterbergPDF } from "@/lib/atterbergPdfGenerator";
import {
  buildAtterbergSummaryFields,
  calculateProjectResults,
  calculateRecordResults,
  calculateTestResult,
  countCompletedTests,
  countRecordDataPoints,
  countRecordStartedDataPoints,
  deriveAtterbergStatus,
  getRecordValidationMessages,
  isLiquidLimitTrialValid,
  isPlasticLimitTrialValid,
  isShrinkageLimitTrialValid,
} from "@/lib/atterbergCalculations";
import { useTestReport } from "@/hooks/useTestReport";
import {
  createRecord as createApiRecord,
  deleteRecord as deleteApiRecord,
  listRecords,
  updateRecord as updateApiRecord,
} from "@/lib/api";
import {
  downloadJSON,
  exportAsJSON,
  importFromJSON,
  normalizeAtterbergProjectState,
  type AtterbergExportPayload,
} from "@/lib/jsonExporter";
import { generateAtterbergXLSX } from "@/lib/xlsxExporter";
import { ExportPreviewModal, type ExportPreviewData } from "@/components/ExportPreviewModal";
import html2canvas from "html2canvas";

const STORAGE_KEY = "atterbergProjectState";

const MAX_RETRY_ATTEMPTS = 3;
const INITIAL_RETRY_DELAY = 1000; // 1 second

// Retry utility with exponential backoff
const retryWithBackoff = async <T,>(
  fn: () => Promise<T>,
  maxAttempts: number = MAX_RETRY_ATTEMPTS,
  initialDelay: number = INITIAL_RETRY_DELAY
): Promise<T> => {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry for auth errors
      if (lastError.message.includes("Unauthorized") || lastError.message.includes("Forbidden")) {
        throw lastError;
      }

      // Only retry on transient failures (timeout, network)
      const isTransientError =
        lastError.message.includes("timeout") ||
        lastError.message.includes("network") ||
        lastError.message.includes("Failed to fetch") ||
        lastError.message.includes("unable to reach");

      if (!isTransientError || attempt === maxAttempts) {
        throw lastError;
      }

      // Exponential backoff: 1s, 2s, 4s
      const delay = initialDelay * Math.pow(2, attempt - 1);
      console.warn(`Attempt ${attempt} failed: ${lastError.message}. Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
};

type ComputedRecord = AtterbergRecord & {
  dataPoints: number;
  startedDataPoints: number;
  completedTests: number;
};

type SmokeCheckStatus = {
  state: "idle" | "running" | "success" | "error";
  pdf: "idle" | "running" | "success" | "error";
  xlsx: "idle" | "running" | "success" | "error";
  message: string;
  detail?: string;
};

const makeId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const testTypeLabels: Record<AtterbergTestType, string> = {
  liquidLimit: "Liquid Limit",
  plasticLimit: "Plastic Limit",
  shrinkageLimit: "Linear Shrinkage",
};

const createLiquidLimitTrial = (index: number): LiquidLimitTrial => ({
  id: makeId("trial"),
  trialNo: String(index + 1),
  penetration: "",
  moisture: "",
});

const createPlasticLimitTrial = (index: number): PlasticLimitTrial => ({
  id: makeId("trial"),
  trialNo: String(index + 1),
  moisture: "",
});

const createShrinkageLimitTrial = (index: number): ShrinkageLimitTrial => ({
  id: makeId("trial"),
  trialNo: String(index + 1),
  initialLength: "140",
  finalLength: "",
});

const createTrialsForType = (type: AtterbergTestType) => {
  switch (type) {
    case "liquidLimit":
      return [createLiquidLimitTrial(0)] as AtterbergTest["trials"];
    case "plasticLimit":
      return [createPlasticLimitTrial(0)] as AtterbergTest["trials"];
    case "shrinkageLimit":
      return [createShrinkageLimitTrial(0)] as AtterbergTest["trials"];
  }
};

const buildTestTitle = (type: AtterbergTestType, tests: AtterbergTest[]) => {
  const order = tests.filter((test) => test.type === type).length + 1;
  return `${testTypeLabels[type]} ${order}`;
};

const createTest = (type: AtterbergTestType, tests: AtterbergTest[]): AtterbergTest => {
  if (type === "liquidLimit") {
    return {
      id: makeId("test"),
      title: buildTestTitle(type, tests),
      type,
      isExpanded: false,
      trials: [createLiquidLimitTrial(0)],
      result: {},
    };
  }

  if (type === "plasticLimit") {
    return {
      id: makeId("test"),
      title: buildTestTitle(type, tests),
      type,
      isExpanded: false,
      trials: [createPlasticLimitTrial(0)],
      result: {},
    };
  }

  return {
    id: makeId("test"),
    title: buildTestTitle(type, tests),
    type,
    isExpanded: false,
    trials: [createShrinkageLimitTrial(0)],
    result: {},
  };
};

const createRecord = (index: number): AtterbergRecord => ({
  id: makeId("record"),
  title: `Record ${index + 1}`,
  label: "",
  note: "",
  isExpanded: false,
  tests: [],
  results: {},
});

// Create default sample record with realistic test data for quick testing
const createDefaultRecord = (index: number): AtterbergRecord => {
  const recordId = makeId("record");

  // Liquid Limit Test with 2 trials - realistic soil sample data
  const liquidLimitTest: LiquidLimitTest = {
    id: makeId("test"),
    title: `Liquid Limit ${index + 1}`,
    type: "liquidLimit",
    isExpanded: false,
    trials: [
      {
        id: makeId("trial"),
        trialNo: "1",
        penetration: "15",
        containerNo: "101",
        containerWetMass: "23.8",
        containerDryMass: "17.6",
        containerMass: "5.0",
        moisture: "",
      },
      {
        id: makeId("trial"),
        trialNo: "2",
        penetration: "18",
        containerNo: "102",
        containerWetMass: "25.1",
        containerDryMass: "18.0",
        containerMass: "5.1",
        moisture: "",
      },
      {
        id: makeId("trial"),
        trialNo: "3",
        penetration: "22",
        containerNo: "103",
        containerWetMass: "27.3",
        containerDryMass: "18.8",
        containerMass: "5.0",
        moisture: "",
      },
      {
        id: makeId("trial"),
        trialNo: "4",
        penetration: "27",
        containerNo: "104",
        containerWetMass: "29.8",
        containerDryMass: "19.6",
        containerMass: "5.2",
        moisture: "",
      },
    ],
    result: {},
  };

  // Plastic Limit Test with 2 trials
  const plasticLimitTest: PlasticLimitTest = {
    id: makeId("test"),
    title: `Plastic Limit ${index + 1}`,
    type: "plasticLimit",
    isExpanded: false,
    trials: [
      {
        id: makeId("trial"),
        trialNo: "1",
        containerNo: "201",
        containerWetMass: "22.0",
        containerDryMass: "16.5",
        containerMass: "4.8",
        moisture: "",
      },
      {
        id: makeId("trial"),
        trialNo: "2",
        containerNo: "202",
        containerWetMass: "23.4",
        containerDryMass: "17.2",
        containerMass: "4.9",
        moisture: "",
      },
    ],
    result: {},
  };

  // Shrinkage Limit Test with 2 trials
  const shrinkageLimitTest: ShrinkageLimitTest = {
    id: makeId("test"),
    title: `Linear Shrinkage ${index + 1}`,
    type: "shrinkageLimit",
    isExpanded: false,
    trials: [
      {
        id: makeId("trial"),
        trialNo: "1",
        initialLength: "140",
        finalLength: "125",
      },
      {
        id: makeId("trial"),
        trialNo: "2",
        initialLength: "140",
        finalLength: "124",
      },
    ],
    result: {},
  };

  return {
    id: recordId,
    title: `Record ${index + 1}`,
    label: `Sample ${index + 1}`,
    note: "Sample soil specimen",
    isExpanded: false,
    tests: [liquidLimitTest, plasticLimitTest, shrinkageLimitTest],
    results: {},
    sampleNumber: `00${index + 1}`,
    dateSubmitted: new Date().toISOString().split("T")[0],
    dateTested: new Date().toISOString().split("T")[0],
    testedBy: "Lab Technician",
  };
};

const buildPersistedState = (records: ComputedRecord[]): AtterbergProjectState => ({
  records: records.map(({ dataPoints, completedTests, ...record }) => record),
});

type ApiProjectRow = {
  id: number;
  name: string;
  client_name: string | null;
  project_date: string | null;
};

type ApiAtterbergResultRow = {
  id: number;
  project_id: number;
  test_key: string;
  payload_json: unknown;
};

type AtterbergProjectLookup = {
  projectName: string;
  clientName: string;
  projectDate: string;
};

const normalizeLookupValue = (value: string | null | undefined) => value?.trim() ?? "";

const isRecordObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const matchesProjectLookup = (row: ApiProjectRow, lookup: AtterbergProjectLookup) =>
  normalizeLookupValue(row.name) === lookup.projectName &&
  normalizeLookupValue(row.client_name) === lookup.clientName &&
  normalizeLookupValue(row.project_date) === lookup.projectDate;

const extractAtterbergPayload = (value: unknown) => {
  if (!isRecordObject(value)) return value;
  if (isRecordObject(value.project)) return value.project;
  return value;
};

const getAtterbergLookup = (projectName: string, clientName: string, projectDate: string): AtterbergProjectLookup => ({
  projectName: normalizeLookupValue(projectName),
  clientName: normalizeLookupValue(clientName),
  projectDate: normalizeLookupValue(projectDate),
});

const hasLookupCriteria = (lookup: AtterbergProjectLookup) => lookup.projectName !== "" || lookup.clientName !== "" || lookup.projectDate !== "";


const loadAtterbergProjectFromApi = async (lookup: AtterbergProjectLookup) => {
  try {
    // Increased limit from 1000 to 5000 to reduce chance of missing existing records
    const [projectsResponse, resultsResponse] = await Promise.all([
      listRecords<ApiProjectRow>("projects", { limit: 5000, orderBy: "updated_at", direction: "DESC" }),
      listRecords<ApiAtterbergResultRow>("test_results", { limit: 5000, orderBy: "updated_at", direction: "DESC" }),
    ]);

    if (!hasLookupCriteria(lookup)) {
      const latestResult = resultsResponse.data.find((row) => row.test_key === "atterberg" && row.payload_json);
      return latestResult ? normalizeAtterbergProjectState(extractAtterbergPayload(latestResult.payload_json)) : null;
    }

    const projectRow = projectsResponse.data.find((row) => matchesProjectLookup(row, lookup));
    if (!projectRow) return null;

    const resultRow = resultsResponse.data.find((row) => row.test_key === "atterberg" && Number(row.project_id) === projectRow.id && row.payload_json);
    if (!resultRow) return null;

    return normalizeAtterbergProjectState(extractAtterbergPayload(resultRow.payload_json));
  } catch (error) {
    // If API is unavailable, unauthorized, or network error - return null to allow fallback to localStorage
    if (error instanceof Error) {
      const errorMsg = error.message.toLowerCase();
      if (
        errorMsg.includes("unauthorized") ||
        errorMsg.includes("forbidden") ||
        errorMsg.includes("failed to fetch") ||
        errorMsg.includes("unable to reach") ||
        errorMsg.includes("network")
      ) {
        console.debug("API unavailable, falling back to localStorage for Atterberg project");
        return null;
      }
    }
    // Re-throw unexpected errors
    throw error;
  }
};

const persistAtterbergProjectToApi = async ({
  lookup,
  payload,
  dataPoints,
  status,
  keyResults,
  projectId,
}: {
  lookup: AtterbergProjectLookup;
  payload: AtterbergExportPayload;
  dataPoints: number;
  status: string;
  keyResults: Array<{ label: string; value: string }>;
  projectId?: number | null;
}): Promise<string | null> => {
  try {
    // Load project data
    const projectsResponse = await retryWithBackoff(
      () => listRecords<ApiProjectRow>("projects", { limit: 5000, orderBy: "updated_at", direction: "DESC" })
    );

    // Find or create project
    let projectRow = projectId
      ? projectsResponse.data.find((row) => row.id === projectId) ?? null
      : hasLookupCriteria(lookup)
        ? projectsResponse.data.find((row) => matchesProjectLookup(row, lookup)) ?? null
        : projectsResponse.data[0] ?? null;

    const projectName = normalizeLookupValue(payload.project.title) || "Atterberg Limits Testing";
    const clientName = normalizeLookupValue(payload.project.clientName);
    const projectDate = normalizeLookupValue(payload.project.date);

    console.log(`[Atterberg Save] Lookup criteria:`, lookup);
    console.log(`[Atterberg Save] Found ${projectsResponse.data.length} projects`);

    let lastSavedAt: string | null = null;

    if (!projectRow) {
      console.log(`[Atterberg Save] No matching project found, creating new one`);
      const createdProject = await retryWithBackoff(
        () => createApiRecord<ApiProjectRow>("projects", {
          name: projectName,
          client_name: clientName || null,
          project_date: projectDate || null,
        })
      );
      projectRow = createdProject.data;
      lastSavedAt = createdProject.last_saved_at ?? null;
    } else {
      console.log(`[Atterberg Save] Using project ID ${projectRow.id}`);
      const updatedProject = await retryWithBackoff(
        () => updateApiRecord<ApiProjectRow>("projects", projectRow.id, {
          name: projectName,
          client_name: clientName || null,
          project_date: projectDate || null,
        })
      );
      projectRow = updatedProject.data ?? projectRow;
      lastSavedAt = updatedProject.last_saved_at ?? null;
    }

    if (!projectRow) {
      throw new Error("Unable to save project");
    }

    console.log(`[Atterberg Save] === PHASE 1: CLEANUP ===`);
    console.log(`[Atterberg Save] Project saved with ID ${projectRow.id}, now cleaning up orphaned test_results...`);

    // Clean up orphaned test results for this project before creating a new one
    try {
      console.log(`[Atterberg Save] Step 1: Querying existing test_results...`);
      const existingResultsResponse = await retryWithBackoff(
        () => listRecords<ApiAtterbergResultRow>("test_results", { limit: 5000, orderBy: "updated_at", direction: "DESC" })
      );
      console.log(`[Atterberg Save] Step 1 complete: Found ${existingResultsResponse.data.length} total test_results records`);

      const projectTestResults = existingResultsResponse.data.filter(
        (row) => row.project_id === projectRow.id && row.test_key === "atterberg"
      );
      console.log(`[Atterberg Save] Step 2: Filtered to ${projectTestResults.length} orphaned records for project ${projectRow.id}`);

      if (projectTestResults.length > 0) {
        console.log(`[Atterberg Save] Step 3: Deleting ${projectTestResults.length} orphaned records...`);
        const deleteResults = await Promise.all(
          projectTestResults.map((row) =>
            retryWithBackoff(() => deleteApiRecord("test_results", row.id)).catch(err => {
              console.error(`[Atterberg Save] Failed to delete record ${row.id}:`, err);
              return null;
            })
          )
        );
        const successCount = deleteResults.filter(r => r !== null).length;
        console.log(`[Atterberg Save] Step 3 complete: Successfully deleted ${successCount} of ${projectTestResults.length} orphaned records`);
      } else {
        console.log(`[Atterberg Save] Step 2: No orphaned records found, skipping delete phase`);
      }
      console.log(`[Atterberg Save] === CLEANUP PHASE COMPLETE ===`);
    } catch (cleanupError) {
      console.warn(`[Atterberg Save] Warning: Cleanup phase had errors:`, cleanupError);
      // Don't fail the entire save operation if cleanup fails, just warn and continue
    }

    // Always create a new test result record
    console.log(`[Atterberg Save] === PHASE 2: CREATE NEW TEST RESULT ===`);
    const resultPayload = {
      project_id: projectRow.id,
      test_key: "atterberg",
      name: projectName,
      category: "soil",
      status,
      data_points: dataPoints,
      key_results_json: keyResults,
      payload_json: payload,
    };

    console.log(`[Atterberg Save] Step 4: Preparing to create new test_results record...`);
    console.log(`[Atterberg Save] Step 4a: Project ID = ${projectRow.id}`);
    console.log(`[Atterberg Save] Step 4b: Test status = ${status}`);
    console.log(`[Atterberg Save] Step 4c: Data points = ${dataPoints}`);
    console.log(`[Atterberg Save] Step 4d: Payload has ${Object.keys(payload).length} keys`);

    try {
      console.log(`[Atterberg Save] Step 5: Sending POST request to create test_results...`);
      const createResponse = await retryWithBackoff(
        () => createApiRecord<{ id: number }>("test_results", resultPayload)
      );
      console.log(`[Atterberg Save] Step 5 complete: POST request successful`);
      console.log(`[Atterberg Save] Successfully created test_results record ID ${createResponse.data?.id}`);
      if (createResponse.last_saved_at) {
        lastSavedAt = createResponse.last_saved_at;
      }
      console.log(`[Atterberg Save] === SAVE COMPLETE ===`);
    } catch (createError) {
      console.error(`[Atterberg Save] === CRITICAL ERROR IN PHASE 2 ===`);
      console.error(`[Atterberg Save] Failed to create test_results record`);
      console.error(`[Atterberg Save] Error type:`, createError instanceof Error ? createError.constructor.name : typeof createError);
      console.error(`[Atterberg Save] Error message:`, createError instanceof Error ? createError.message : String(createError));
      console.error(`[Atterberg Save] Full error:`, createError);
      throw new Error(`Failed to save test results: ${createError instanceof Error ? createError.message : String(createError)}`);
    }

    return lastSavedAt;
  } catch (error) {
    console.error(`[Atterberg Save] Error:`, error);
    throw error;
  }
};

const saveAtterbergProjectToApi = (args: {
  lookup: AtterbergProjectLookup;
  payload: AtterbergExportPayload;
  dataPoints: number;
  status: string;
  keyResults: Array<{ label: string; value: string }>;
  projectId?: number | null;
}) => persistAtterbergProjectToApi(args);

const clearAtterbergProjectFromApi = async (lookup: AtterbergProjectLookup) => {
  try {
    // Increased limit from 1000 to 5000 to reduce chance of missing records
    const [projectsResponse, resultsResponse] = await Promise.all([
      listRecords<ApiProjectRow>("projects", { limit: 5000, orderBy: "updated_at", direction: "DESC" }),
      listRecords<ApiAtterbergResultRow>("test_results", { limit: 5000, orderBy: "updated_at", direction: "DESC" }),
    ]);

    let resultRows: ApiAtterbergResultRow[] = [];

    if (hasLookupCriteria(lookup)) {
      const projectRow = projectsResponse.data.find((row) => matchesProjectLookup(row, lookup)) ?? null;
      if (projectRow) {
        // Find all atterberg test results for this project
        resultRows = resultsResponse.data.filter(
          (row) => row.project_id === projectRow.id && row.test_key === "atterberg"
        );
      }
    } else {
      const latestResult = resultsResponse.data.find((row) => row.test_key === "atterberg" && row.payload_json) ?? null;
      resultRows = latestResult ? [latestResult] : [];
    }

    if (resultRows.length > 0) {
      await Promise.all(resultRows.map((row) => deleteApiRecord("test_results", row.id)));
    }
  } catch (error) {
    // If auth fails, log warning but still allow local clear
    if (error instanceof Error && (error.message.includes("Unauthorized") || error.message.includes("Forbidden"))) {
      console.warn("API clear skipped due to authentication, local data will be cleared");
      return;
    }
    throw error;
  }
};

const updateTrialsForType = (test: AtterbergTest, trials: AtterbergTest["trials"]): AtterbergTest => {
  switch (test.type) {
    case "liquidLimit":
      return { ...test, trials: trials as LiquidLimitTrial[] };
    case "plasticLimit":
      return { ...test, trials: trials as PlasticLimitTrial[] };
    case "shrinkageLimit":
      return { ...test, trials: trials as ShrinkageLimitTrial[] };
  }
};

const AtterbergTest = () => {
  const project = useProject();
  // Initialize with 3 sample records containing complete test data for quick testing
  const [projectState, setProjectState] = useState<AtterbergProjectState>({
    records: [
      createDefaultRecord(0),
      createDefaultRecord(1),
      createDefaultRecord(2),
    ],
  });
  const [isClearDialogOpen, setIsClearDialogOpen] = useState(false);
  const [smokeCheckStatus, setSmokeCheckStatus] = useState<SmokeCheckStatus | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [lastSaveError, setLastSaveError] = useState<string | null>(null);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewData, setPreviewData] = useState<ExportPreviewData | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const saveStatusTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hydratedRef = useRef(false);
  const loadAttemptedRef = useRef(false);
  const skipNextPersistRef = useRef(false);
  const isSavingRef = useRef(false);
  const chartRefsMap = useRef<Map<string, HTMLDivElement | null>>(new Map());

  const computedRecords = useMemo<ComputedRecord[]>(() => {
    return projectState.records.map((record) => {
      const tests = record.tests.map((test) => ({
        ...test,
        result: calculateTestResult(test),
      })) as AtterbergTest[];

      const recordWithComputedTests: AtterbergRecord = {
        ...record,
        tests,
        results: calculateRecordResults({ ...record, tests }),
      };

      return {
        ...recordWithComputedTests,
        dataPoints: countRecordDataPoints(recordWithComputedTests),
        startedDataPoints: countRecordStartedDataPoints(recordWithComputedTests),
        completedTests: countCompletedTests(recordWithComputedTests),
      };
    });
  }, [projectState.records]);

  const persistedState = useMemo(() => buildPersistedState(computedRecords), [computedRecords]);
  const effectiveProjectLookup = useMemo(
    () => getAtterbergLookup(project.projectName || projectState.projectName || "Atterberg Limits Testing", project.clientName || projectState.clientName, project.projectDate || project.date),
    [project.clientName, project.date, project.projectDate, project.projectName, projectState.clientName, projectState.projectName],
  );

  useEffect(() => {
    if (loadAttemptedRef.current) return;
    loadAttemptedRef.current = true;

    let cancelled = false;

    const restoreProject = async () => {
      try {
        const remoteState = await loadAtterbergProjectFromApi(effectiveProjectLookup);
        if (cancelled) return;

        if (remoteState) {
          skipNextPersistRef.current = true;
          setProjectState(remoteState);
          hydratedRef.current = true;
          return;
        }
      } catch (error) {
        console.error("Failed to restore Atterberg project from API:", error);
      }

      if (cancelled) return;

      const saved = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem("enhancedAtterbergTests");
      if (saved) {
        try {
          const parsed = normalizeAtterbergProjectState(JSON.parse(saved));
          if (parsed) {
            skipNextPersistRef.current = true;
            setProjectState(parsed);
          }
        } catch (error) {
          console.error("Failed to restore Atterberg project:", error);
        }
      }

      hydratedRef.current = true;
    };

    void restoreProject();

    return () => {
      cancelled = true;
    };
  }, [effectiveProjectLookup]);

  // Cleanup save status timeout on unmount
  useEffect(() => {
    return () => {
      if (saveStatusTimeoutRef.current) {
        clearTimeout(saveStatusTimeoutRef.current);
      }
    };
  }, []);

  const { totalDataPoints, totalStartedDataPoints, aggregateResults, aggregateProjectResults, status, totalCompletedTests } = useMemo(() => {
    const totalPoints = computedRecords.reduce((sum, record) => sum + record.dataPoints, 0);
    const totalStartedPoints = computedRecords.reduce((sum, record) => sum + record.startedDataPoints, 0);
    const completedTests = computedRecords.reduce((sum, record) => sum + record.completedTests, 0);
    const totalTests = computedRecords.reduce((sum, record) => sum + record.tests.length, 0);
    const projectResults = calculateProjectResults(computedRecords);

    return {
      totalDataPoints: totalPoints,
      totalStartedDataPoints: totalStartedPoints,
      totalCompletedTests: completedTests,
      aggregateProjectResults: projectResults,
      status: deriveAtterbergStatus(totalPoints, completedTests, totalTests),
      aggregateResults: buildAtterbergSummaryFields(projectResults, computedRecords.length, totalPoints),
    };
  }, [computedRecords]);

  useTestReport("atterberg", totalDataPoints, aggregateResults, undefined, totalStartedDataPoints);

  // Save state to localStorage for local persistence (no auto API save during active work)
  useEffect(() => {
    if (!hydratedRef.current) {
      console.log("[AtterbergTest] Skipping localStorage save: not hydrated yet");
      return;
    }
    if (skipNextPersistRef.current) {
      console.log("[AtterbergTest] Skipping localStorage save: flagged to skip");
      skipNextPersistRef.current = false;
      return;
    }

    // Persist to localStorage only - no API calls during active work
    try {
      const persistedState = buildPersistedState(computedRecords);
      console.log(`[AtterbergTest] Persisting ${computedRecords.length} records to localStorage`);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(persistedState));
      console.log("[AtterbergTest] Successfully saved to localStorage");
    } catch (error) {
      console.error("[AtterbergTest] Failed to save to localStorage:", error);
    }
  }, [computedRecords]);

  const updateProjectMetadata = useCallback((updater: (state: AtterbergProjectState) => Partial<AtterbergProjectState>) => {
    setProjectState((prev) => ({
      ...prev,
      ...updater(prev),
    }));
  }, []);

  const updateRecord = useCallback((recordId: string, updater: (record: AtterbergRecord) => AtterbergRecord) => {
    try {
      setProjectState((prev) => {
        const updatedRecords = prev.records.map((record) => {
          if (record.id === recordId) {
            const updated = updater(record);
            console.log(`[AtterbergTest] Updated record "${recordId}":`, updated);
            return updated;
          }
          return record;
        });
        console.log(`[AtterbergTest] Project state updated with ${updatedRecords.length} records`);
        return {
          ...prev,
          records: updatedRecords,
        };
      });
    } catch (error) {
      console.error(`[AtterbergTest] Error updating record "${recordId}":`, error);
      throw error;
    }
  }, []);

  const updateTest = useCallback(
    (recordId: string, testId: string, updater: (test: AtterbergTest) => AtterbergTest) => {
      updateRecord(recordId, (record) => ({
        ...record,
        tests: record.tests.map((test) => (test.id === testId ? updater(test) : test)),
      }));
    },
    [updateRecord],
  );

  const addRecord = useCallback(() => {
    setProjectState((prev) => ({
      records: [...prev.records, createRecord(prev.records.length)],
    }));
  }, []);

  const removeRecord = useCallback((recordId: string) => {
    setProjectState((prev) => ({
      records: prev.records.filter((record) => record.id !== recordId),
    }));
  }, []);

  const addTest = useCallback(
    (recordId: string, type: AtterbergTestType = "liquidLimit") => {
      try {
        console.log(`[AtterbergTest] Adding test of type "${type}" to record "${recordId}"`);
        updateRecord(recordId, (record) => {
          const newTest = createTest(type, record.tests);
          console.log(`[AtterbergTest] Created new test:`, newTest);
          return {
            ...record,
            tests: [...record.tests, newTest],
          };
        });
        console.log(`[AtterbergTest] Test added successfully`);
      } catch (error) {
        console.error(`[AtterbergTest] Error adding test:`, error);
        throw error;
      }
    },
    [updateRecord],
  );

  const removeTest = useCallback(
    (recordId: string, testId: string) => {
      updateRecord(recordId, (record) => ({
        ...record,
        tests: record.tests.filter((test) => test.id !== testId),
      }));
    },
    [updateRecord],
  );

  const updateTestType = useCallback(
    (recordId: string, testId: string, type: AtterbergTestType) => {
      updateRecord(recordId, (record) => ({
        ...record,
        tests: record.tests.map((test) => {
          if (test.id !== testId) return test;

          return {
            ...test,
            title: buildTestTitle(type, record.tests.filter((item) => item.id !== testId)),
            type,
            isExpanded: false,
            trials: createTrialsForType(type) as AtterbergTest["trials"],
            result: {},
          } as AtterbergTest;
        }),
      }));
    },
    [updateRecord],
  );

  const syncComputedTest = useCallback(
    (recordId: string, nextTest: AtterbergTest) => {
      updateTest(recordId, nextTest.id, () => nextTest);
    },
    [updateTest],
  );

  const updateTestTrials = useCallback(
    (recordId: string, testId: string, trials: AtterbergTest["trials"]) => {
      updateTest(recordId, testId, (test) => updateTrialsForType(test, trials));
    },
    [updateTest],
  );

  const handleSave = useCallback(async () => {
    // Track save state for UI feedback (no longer blocking concurrent saves)
    // The API layer already has retry logic with backoff to handle multiple concurrent requests
    isSavingRef.current = true;
    setSaveStatus("saving");
    setLastSaveError(null);

    if (saveStatusTimeoutRef.current) {
      clearTimeout(saveStatusTimeoutRef.current);
    }

    try {
      const apiTimestamp = await saveAtterbergProjectToApi({
        lookup: effectiveProjectLookup,
        payload: buildExportPayload(),
        dataPoints: totalDataPoints,
        status,
        keyResults: aggregateResults,
        projectId: project.currentProjectId,
      });

      setSaveStatus("saved");
      // Use the API timestamp if available, otherwise use client timestamp
      if (apiTimestamp) {
        const displayTime = new Date(apiTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        setLastSavedAt(displayTime);
      } else {
        const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        setLastSavedAt(now);
      }
      setLastSaveError(null);

      // Auto-clear success status after 4 seconds (gives users time to continue editing)
      saveStatusTimeoutRef.current = setTimeout(() => {
        setSaveStatus("idle");
      }, 4000);
    } catch (error) {
      let errorMessage = 'Failed to save project';

      if (error instanceof Error) {
        errorMessage = error.message;

        // Provide helpful messages for common errors
        if (error.message.includes('Unauthorized') || error.message.includes('Forbidden')) {
          errorMessage = 'Authentication failed. Please ensure you are logged in with valid credentials.';
        } else if (error.message.includes('timeout')) {
          errorMessage = 'Request timed out. The API server may be slow or unreachable.';
        } else if (error.message.includes('Unable to reach')) {
          errorMessage = 'Cannot reach the API server. Check your internet connection.';
        }
      }

      setSaveStatus("error");
      setLastSaveError(errorMessage);
      console.error("Failed to save Atterberg project:", error);
    } finally {
      isSavingRef.current = false;
    }
  }, [persistedState, effectiveProjectLookup, aggregateResults, status, totalDataPoints, project.currentProjectId]);

  const navigate = useNavigate();

  const handleFinalSave = useCallback(async () => {
    await handleSave();
    // Only navigate if save was successful (saveStatus will be "saved")
    toast.success("Project saved. Redirecting to dashboard...");
    setTimeout(() => {
      navigate("/");
    }, 500);
  }, [handleSave, navigate]);


  const handleClearAll = useCallback(async () => {
    try {
      skipNextPersistRef.current = true;
      await clearAtterbergProjectFromApi(effectiveProjectLookup);
      setProjectState({ records: [] });
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem("enhancedAtterbergTests");
      setIsClearDialogOpen(false);
      toast.success("Atterberg project cleared");
    } catch (error) {
      console.error("Failed to clear Atterberg project:", error);
      toast.error("Failed to clear Atterberg project");
    }
  }, [effectiveProjectLookup]);

  const handleClearRequest = useCallback(() => {
    setIsClearDialogOpen(true);
  }, []);

  const buildExportPayload = useCallback((): AtterbergExportPayload => {
    return {
      exportDate: new Date().toISOString(),
      version: "3.0",
      project: {
        title: project.projectName || "Atterberg Limits Testing",
        clientName: project.clientName || projectState.clientName,
        date: project.date,
        labOrganization: projectState.labOrganization,
        dateReported: projectState.dateReported,
        checkedBy: projectState.checkedBy,
        records: persistedState.records,
      },
    };
  }, [persistedState.records, project.clientName, project.date, project.projectName, projectState.clientName, projectState.labOrganization, projectState.dateReported, projectState.checkedBy]);

  const handleExportJSON = useCallback(() => {
    if (computedRecords.length === 0) {
      toast.error("No records to export");
      return;
    }

    const jsonString = exportAsJSON(buildExportPayload());
    downloadJSON(jsonString, `atterberg-limits-${new Date().toISOString().split("T")[0]}.json`);
    toast.success("Atterberg project exported");
  }, [buildExportPayload, computedRecords.length]);

  const handleImportJSON = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = (event: Event) => {
      const target = event.target as HTMLInputElement;
      const file = target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        const imported = importFromJSON(String(reader.result ?? ""));
        if (!imported) {
          toast.error("Invalid JSON file format");
          return;
        }

        setProjectState(imported);
        toast.success(`Imported ${imported.records.length} record(s)`);
      };
      reader.readAsText(file);
    };
    input.click();
  }, []);

  const exportTables = useMemo(() => buildTablesForExport(computedRecords), [computedRecords]);

  const handleExportPDF = useCallback(async () => {
    if (computedRecords.length === 0) {
      toast.error("No records to export");
      return false;
    }

    setIsPreviewLoading(true);
    try {
      const blob = await generateAtterbergPDF({
        projectName: project.projectName,
        clientName: project.clientName || projectState.clientName,
        date: project.date,
        projectState,
        records: computedRecords,
        skipDownload: true,
      });

      if (blob) {
        setPreviewData({
          type: "pdf",
          fileName: `Atterberg_Limits_${(project.projectName || "export").replace(/\s+/g, "_")}.pdf`,
          blob,
          summary: {
            title: "Atterberg Limits Testing",
            projectName: project.projectName,
            clientName: project.clientName || projectState.clientName,
            date: project.date,
            pageCount: computedRecords.length,
          },
        });
        setPreviewModalOpen(true);
      }
    } finally {
      setIsPreviewLoading(false);
    }

    return true;
  }, [computedRecords, project.clientName, project.date, project.projectName, projectState]);


  const handleRecordExportPDF = useCallback(
    async (recordId: string) => {
      const record = computedRecords.find((r) => r.id === recordId);
      if (!record) {
        toast.error("Record not found");
        return false;
      }

      await generateAtterbergPDF({
        projectName: project.projectName,
        clientName: project.clientName || projectState.clientName,
        date: project.date,
        projectState,
        records: [record],
      });

      return true;
    },
    [computedRecords, project.clientName, project.date, project.projectName, projectState],
  );

  const captureAllChartImages = useCallback(async (recordIds: string[], expandRecords?: (ids: string[]) => void): Promise<{ [key: string]: string }> => {
    const chartImages: { [key: string]: string } = {};

    // Expand all records before capturing to ensure charts are visible
    if (expandRecords) {
      expandRecords(recordIds);
      console.log(`[Chart Capture] Expanded records for visibility`);
      // Wait for the expand animation/render to complete
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    for (const recordId of recordIds) {
      // Capture the liquid limit chart (by class selector)
      const liquidLimitChartElement = document.querySelector(`.liquid-limit-export-chart-${recordId}`);
      console.log(`[Chart Capture] Attempting to capture liquid limit chart for record ${recordId}`, {
        elementFound: !!liquidLimitChartElement,
        elementVisible: liquidLimitChartElement ? (liquidLimitChartElement as HTMLElement).offsetParent !== null : false,
      });

      if (liquidLimitChartElement) {
        const llElement = liquidLimitChartElement as HTMLElement;
        // Make it visible temporarily for capture (it's hidden by default with display: none)
        const originalDisplay = llElement.style.display;
        llElement.style.display = "block";

        // Force a small delay to ensure display:block is applied
        await new Promise((resolve) => setTimeout(resolve, 50));

        const svg = llElement.querySelector('svg');
        if (svg) {
          const svgWidth = svg.getAttribute('width');
          const svgHeight = svg.getAttribute('height');
          if (svgWidth && svgHeight) {
            try {
              await new Promise((resolve) => setTimeout(resolve, 150));

              console.log(`[Chart Capture] Starting html2canvas for liquid limit chart of record ${recordId}`, {
                element: llElement,
                hasSvg: !!svg,
                svgDimensions: { width: svgWidth, height: svgHeight },
                elementDimensions: {
                  width: llElement.offsetWidth,
                  height: llElement.offsetHeight,
                },
              });

              const canvas = await html2canvas(llElement, {
                backgroundColor: "#ffffff",
                scale: 2,
                logging: false,
                useCORS: true,
                allowTaint: true,
              });

              const imageData = canvas.toDataURL("image/png");
              chartImages[`${recordId}-liquidLimit`] = imageData;
              console.log(`[Chart Capture] Successfully captured liquid limit chart for record ${recordId}`, {
                imageDataLength: imageData.length,
                canvasWidth: canvas.width,
                canvasHeight: canvas.height,
              });
            } catch (error) {
              console.error(`[Chart Capture] Failed to capture liquid limit chart for record ${recordId}:`, {
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
              });
            } finally {
              // Restore original display state
              llElement.style.display = originalDisplay;
            }
          } else {
            console.warn(`[Chart Capture] Liquid limit chart SVG missing dimensions for record ${recordId}`, { svgWidth, svgHeight });
          }
        } else {
          console.warn(`[Chart Capture] No SVG found in liquid limit chart for record ${recordId}`);
        }
      }
    }

    console.log(`[Chart Capture] Completed capturing charts for ${Object.keys(chartImages).length} chart types`);
    return chartImages;
  }, []);

  const waitForChartsToBeFullyRendered = useCallback(async (recordIds: string[], maxWaitTime: number = 3000): Promise<void> => {
    console.log(`[Chart Render] Waiting for charts to be fully rendered`, { recordIds, maxWaitTime });
    const pollInterval = 50;
    const maxAttempts = Math.ceil(maxWaitTime / pollInterval);

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const allReady = recordIds.every((recordId) => {
        const chartRef = chartRefsMap.current.get(recordId);

        // Check 1: Element is visible
        if (!chartRef || chartRef.offsetParent === null) {
          return false;
        }

        // Check 2: SVG elements are rendered (Recharts renders SVG charts)
        const svg = chartRef.querySelector('svg');
        if (!svg) {
          console.log(`[Chart Render] No SVG found yet for record ${recordId}`);
          return false;
        }

        // Check 3: SVG has dimensions (width and height)
        const svgWidth = svg.getAttribute('width');
        const svgHeight = svg.getAttribute('height');
        if (!svgWidth || !svgHeight) {
          console.log(`[Chart Render] SVG has no dimensions yet for record ${recordId}`);
          return false;
        }

        // Check 4: SVG has content (child elements)
        if (svg.children.length === 0) {
          console.log(`[Chart Render] SVG has no content yet for record ${recordId}`);
          return false;
        }

        return true;
      });

      if (allReady) {
        console.log(`[Chart Render] All charts are fully rendered after ${attempt * pollInterval}ms`);
        // Additional safety wait to ensure rendering is truly complete
        await new Promise((resolve) => setTimeout(resolve, 100));
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    // Log diagnostic info about charts that aren't ready
    const notReady = recordIds.filter((recordId) => {
      const chartRef = chartRefsMap.current.get(recordId);
      if (!chartRef || chartRef.offsetParent === null) {
        console.warn(`[Chart Render] Chart not visible for record ${recordId}`);
        return true;
      }
      const svg = chartRef.querySelector('svg');
      if (!svg) {
        console.warn(`[Chart Render] No SVG found for record ${recordId}`);
        return true;
      }
      const svgWidth = svg.getAttribute('width');
      const svgHeight = svg.getAttribute('height');
      if (!svgWidth || !svgHeight) {
        console.warn(`[Chart Render] SVG has no dimensions for record ${recordId}:`, { svgWidth, svgHeight });
        return true;
      }
      if (svg.children.length === 0) {
        console.warn(`[Chart Render] SVG has no content for record ${recordId}`);
        return true;
      }
      return false;
    });

    console.warn(`[Chart Render] Some charts are still not fully rendered after ${maxWaitTime}ms:`, notReady);
  }, []);

  const registerChartRef = useCallback((recordId: string, ref: HTMLDivElement | null) => {
    if (ref) {
      chartRefsMap.current.set(recordId, ref);
      console.log(`[Chart Ref] Registered chart ref for record ${recordId}`, {
        refTagName: ref.tagName,
        refClassName: ref.className,
        refId: ref.id,
      });
    } else {
      chartRefsMap.current.delete(recordId);
      console.log(`[Chart Ref] Unregistered chart ref for record ${recordId}`);
    }
    console.log(`[Chart Ref] Total registered charts:`, chartRefsMap.current.size);
  }, []);

  const ensureRecordsExpanded = useCallback((recordIds: string[]) => {
    console.log(`[Expand] Ensuring records are expanded:`, recordIds);
    setProjectState((prev) => ({
      ...prev,
      records: prev.records.map((record) => {
        if (recordIds.includes(record.id) && !record.isExpanded) {
          console.log(`[Expand] Expanding record ${record.id}`);
          return { ...record, isExpanded: true };
        }
        return record;
      }),
    }));
  }, []);

  const handleRecordExportXLSX = useCallback(
    async (recordId: string) => {
      const record = computedRecords.find((r) => r.id === recordId);
      if (!record) {
        toast.error("Record not found");
        return false;
      }

      console.log(`[Export] Starting Excel export for record ${recordId}`);

      // Ensure record is expanded and wait for chart to be fully rendered
      ensureRecordsExpanded([recordId]);

      // Wait for charts to be fully rendered before capturing
      await waitForChartsToBeFullyRendered([recordId]);

      // Capture chart image for this record
      const chartImages = await captureAllChartImages([recordId]);

      console.log(`[Export] Chart images captured for record:`, Object.keys(chartImages));

      // Ensure we have chart images before generating Excel
      if (Object.keys(chartImages).length === 0) {
        console.warn(`[Export] No chart images captured for record ${recordId}, but continuing with export`);
      }

      await generateAtterbergXLSX({
        projectName: project.projectName,
        clientName: project.clientName || projectState.clientName,
        date: project.date,
        projectState,
        records: [record],
        chartImages: Object.keys(chartImages).length > 0 ? chartImages : undefined,
      });

      return true;
    },
    [computedRecords, project.clientName, project.date, project.projectName, projectState, captureAllChartImages, ensureRecordsExpanded, waitForChartsToBeFullyRendered],
  );

  const handleRecordExportJSON = useCallback(
    (recordId: string) => {
      const record = persistedState.records.find((r) => r.id === recordId);
      if (!record) {
        toast.error("Record not found");
        return false;
      }

      const singleRecordPayload: AtterbergExportPayload = {
        exportDate: new Date().toISOString(),
        version: "3.0",
        project: {
          title: project.projectName || "Atterberg Limits Testing",
          clientName: project.clientName || projectState.clientName,
          date: project.date,
          labOrganization: projectState.labOrganization,
          dateReported: projectState.dateReported,
          checkedBy: projectState.checkedBy,
          records: [record],
        },
      };

      const jsonString = exportAsJSON(singleRecordPayload);
      downloadJSON(jsonString, `atterberg-record-${record.label || record.title || "export"}-${new Date().toISOString().split("T")[0]}.json`);
      toast.success("Record exported as JSON");

      return true;
    },
    [persistedState.records, project.clientName, project.date, project.projectName, projectState.clientName, projectState.labOrganization, projectState.dateReported, projectState.checkedBy],
  );

  const handleExportXLSX = useCallback(async () => {
    if (computedRecords.length === 0) {
      toast.error("No records to export");
      return false;
    }

    setIsPreviewLoading(true);
    try {
      console.log(`[Export] Starting Excel export for ${computedRecords.length} records`);
      console.log(`[Export] Registered chart refs:`, Array.from(chartRefsMap.current.keys()));

      // Ensure all records are expanded
      const recordIds = computedRecords.map((r) => r.id);
      ensureRecordsExpanded(recordIds);

      // Wait for all charts to be fully rendered before capturing
      await waitForChartsToBeFullyRendered(recordIds);

      // Capture all chart images
      const chartImages = await captureAllChartImages(recordIds);

      console.log(`[Export] Captured ${Object.keys(chartImages).length} charts out of ${recordIds.length}`);

      const blob = await generateAtterbergXLSX({
        projectName: project.projectName,
        clientName: project.clientName || projectState.clientName,
        date: project.date,
        projectState,
        records: computedRecords,
        skipDownload: true,
        chartImages: Object.keys(chartImages).length > 0 ? chartImages : undefined,
      });

      if (blob) {
        setPreviewData({
          type: "excel",
          fileName: `Atterberg_Limits_${(project.projectName || "export").replace(/\s+/g, "_")}.xlsx`,
          blob,
          summary: {
            title: "Atterberg Limits Testing",
            projectName: project.projectName,
            clientName: project.clientName || projectState.clientName,
            date: project.date,
            rowCount: computedRecords.length,
          },
        });
        setPreviewModalOpen(true);
      }
    } finally {
      setIsPreviewLoading(false);
    }

    return true;
  }, [computedRecords, project.clientName, project.date, project.projectName, projectState, captureAllChartImages, ensureRecordsExpanded, waitForChartsToBeFullyRendered]);

  const handleExportSmokeCheck = useCallback(async () => {
    if (computedRecords.length === 0) {
      setSmokeCheckStatus({
        state: "error",
        pdf: "idle",
        xlsx: "idle",
        message: "Smoke check unavailable",
        detail: "Add at least one record before running the export check.",
      });
      return false;
    }

    setSmokeCheckStatus({
      state: "running",
      pdf: "running",
      xlsx: "idle",
      message: "Running export smoke check",
      detail: "Generating the PDF and Excel downloads with the same image flow.",
    });

    const pdfExported = await handleExportPDF();
    if (pdfExported === false) {
      setSmokeCheckStatus({
        state: "error",
        pdf: "error",
        xlsx: "idle",
        message: "Smoke check failed",
        detail: "PDF export did not complete.",
      });
      return false;
    }

    setSmokeCheckStatus({
      state: "running",
      pdf: "success",
      xlsx: "running",
      message: "PDF export complete",
      detail: "Generating the Excel download next.",
    });

    const xlsxExported = await handleExportXLSX();
    if (xlsxExported === false) {
      setSmokeCheckStatus({
        state: "error",
        pdf: "success",
        xlsx: "error",
        message: "Smoke check failed",
        detail: "Excel export did not complete.",
      });
      return false;
    }

    setSmokeCheckStatus({
      state: "success",
      pdf: "success",
      xlsx: "success",
      message: "Smoke check complete",
      detail: "PDF and Excel downloads were generated. Verify the header images in both files.",
    });

    return true;
  }, [computedRecords.length, handleExportPDF, handleExportXLSX]);

  return (
    <>
      <TestSection
        title="Atterberg Limits Testing"
        onSave={handleSave}
        onFinalSave={handleFinalSave}
        onClear={handleClearRequest}
        onExportPDF={handleExportPDF}
        onExportXLSX={handleExportXLSX}
        onExportSmokeCheck={handleExportSmokeCheck}
        exportSmokeCheckDisabled={computedRecords.length === 0}
        smokeCheckStatus={smokeCheckStatus}
        saveStatus={saveStatus}
        lastSavedAt={lastSavedAt}
        lastSaveError={lastSaveError}
      >
      <div className="space-y-4 print:space-y-3">
        <Card className="border bg-muted/20 shadow-none print:border-border print:bg-transparent">
          <CardContent className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
            <OverviewMetric label="Project" value={project.projectName || "Current project"} />
            <OverviewMetric label="Client" value={project.clientName || "-"} />
            <OverviewMetric label="Date" value={project.date || "-"} />
            <OverviewMetric label="Records" value={String(computedRecords.length)} />
            <OverviewMetric label="Completed Tests" value={String(totalCompletedTests)} />
            <OverviewMetric label="Valid Data Points" value={String(totalDataPoints)} />
            <OverviewMetric label="Avg PI" value={aggregateProjectResults.plasticityIndex !== undefined ? `${aggregateProjectResults.plasticityIndex}%` : "-"} />
            <OverviewMetric label="Status" value={status} className="capitalize" />
          </CardContent>
        </Card>

        <Collapsible defaultOpen={false}>
          <Card className="border shadow-sm print:shadow-none">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Project Metadata</h3>
                <Button type="button" variant="ghost" size="sm">
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CollapsibleContent>
              <CardContent className="space-y-4 pt-0">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Lab Organization</label>
                    <Input
                      value={projectState.labOrganization || ""}
                      onChange={(e) => updateProjectMetadata(() => ({ labOrganization: e.target.value }))}
                      placeholder="Laboratory name or organization"
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Date Reported</label>
                    <Input
                      type="date"
                      value={projectState.dateReported || ""}
                      onChange={(e) => updateProjectMetadata(() => ({ dateReported: e.target.value }))}
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Checked By</label>
                    <Input
                      value={projectState.checkedBy || ""}
                      onChange={(e) => updateProjectMetadata(() => ({ checkedBy: e.target.value }))}
                      placeholder="Technician or engineer name"
                      className="h-9"
                    />
                  </div>
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <Button type="button" onClick={addRecord} className="gap-2">
            <Plus className="h-4 w-4" /> Add Record
          </Button>

          <div className="ml-auto flex gap-2">
            <Button type="button" onClick={handleExportJSON} variant="outline" size="sm" className="gap-2" disabled={computedRecords.length === 0}>
              <Download className="h-4 w-4" /> Export JSON
            </Button>
            <Button type="button" onClick={handleImportJSON} variant="outline" size="sm" className="gap-2">
              <Upload className="h-4 w-4" /> Import JSON
            </Button>
          </div>
        </div>

        {computedRecords.length === 0 ? (
          <div className="rounded-lg border bg-muted/20 py-10 text-center text-muted-foreground">
            <p className="text-sm">No records yet. Add a record to begin capturing Atterberg limit tests.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {computedRecords.map((record, index) => (
              <RecordCard
                key={record.id}
                record={record}
                recordIndex={index}
                onRemove={() => removeRecord(record.id)}
                onToggleExpanded={() => updateRecord(record.id, (current) => ({ ...current, isExpanded: !current.isExpanded }))}
                onUpdateTitle={(title) => updateRecord(record.id, (current) => ({ ...current, title }))}
                onUpdateLabel={(label) => updateRecord(record.id, (current) => ({ ...current, label }))}
                onUpdateNote={(note) => updateRecord(record.id, (current) => ({ ...current, note }))}
                onUpdateSampleNumber={(sampleNumber) => updateRecord(record.id, (current) => ({ ...current, sampleNumber }))}
                onUpdateDateSubmitted={(dateSubmitted) => updateRecord(record.id, (current) => ({ ...current, dateSubmitted }))}
                onUpdateDateTested={(dateTested) => updateRecord(record.id, (current) => ({ ...current, dateTested }))}
                onUpdateTestedBy={(testedBy) => updateRecord(record.id, (current) => ({ ...current, testedBy }))}
                onAddTest={(type) => addTest(record.id, type)}
                onRemoveTest={(testId) => removeTest(record.id, testId)}
                onToggleTestExpanded={(testId) => updateTest(record.id, testId, (test) => ({ ...test, isExpanded: !test.isExpanded }))}
                onUpdateTestTitle={(testId, title) => updateTest(record.id, testId, (test) => ({ ...test, title }))}
                onUpdateTestType={(testId, type) => updateTestType(record.id, testId, type)}
                onUpdateLiquidLimitTrials={(testId, trials) => updateTestTrials(record.id, testId, trials)}
                onUpdatePlasticLimitTrials={(testId, trials) => updateTestTrials(record.id, testId, trials)}
                onUpdateShrinkageLimitTrials={(testId, trials) => updateTestTrials(record.id, testId, trials)}
                onSyncTest={(test) => syncComputedTest(record.id, test)}
                onExportPDF={handleRecordExportPDF}
                onExportXLSX={handleRecordExportXLSX}
                onExportJSON={handleRecordExportJSON}
                onRegisterChartRef={registerChartRef}
              />
            ))}
          </div>
        )}
      </div>
      </TestSection>

      <AlertDialog open={isClearDialogOpen} onOpenChange={setIsClearDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear Atterberg project?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove every Atterberg record, test, and saved draft from this browser. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleClearAll}>Clear project</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ExportPreviewModal
        open={previewModalOpen}
        onOpenChange={setPreviewModalOpen}
        data={previewData}
        isLoading={isPreviewLoading}
      />
    </>
  );
};

interface OverviewMetricProps {
  label: string;
  value: string;
  className?: string;
}

const OverviewMetric = ({ label, value, className }: OverviewMetricProps) => (
  <div className="rounded-lg border bg-card px-3 py-2 print:border-none print:bg-transparent print:px-0 print:py-0">
    <div className="text-xs font-medium text-muted-foreground">{label}</div>
    <div className={cn("mt-1 text-sm font-semibold text-foreground", className)}>{value || "-"}</div>
  </div>
);

interface RecordCardProps {
  record: ComputedRecord;
  recordIndex: number;
  onRemove: () => void;
  onToggleExpanded: () => void;
  onUpdateTitle: (title: string) => void;
  onUpdateLabel: (label: string) => void;
  onUpdateNote: (note: string) => void;
  onUpdateSampleNumber: (sampleNumber: string) => void;
  onUpdateDateSubmitted: (dateSubmitted: string) => void;
  onUpdateDateTested: (dateTested: string) => void;
  onUpdateTestedBy: (testedBy: string) => void;
  onAddTest: (type?: AtterbergTestType) => void;
  onRemoveTest: (testId: string) => void;
  onToggleTestExpanded: (testId: string) => void;
  onUpdateTestTitle: (testId: string, title: string) => void;
  onUpdateTestType: (testId: string, type: AtterbergTestType) => void;
  onUpdateLiquidLimitTrials: (testId: string, trials: LiquidLimitTrial[]) => void;
  onUpdatePlasticLimitTrials: (testId: string, trials: PlasticLimitTrial[]) => void;
  onUpdateShrinkageLimitTrials: (testId: string, trials: ShrinkageLimitTrial[]) => void;
  onSyncTest: (test: AtterbergTest) => void;
  onExportPDF: (recordId: string) => Promise<boolean>;
  onExportXLSX: (recordId: string) => Promise<boolean>;
  onExportJSON: (recordId: string) => boolean;
  onRegisterChartRef: (recordId: string, ref: HTMLDivElement | null) => void;
}

const RecordCard = ({
  record,
  recordIndex,
  onRemove,
  onToggleExpanded,
  onUpdateTitle,
  onUpdateLabel,
  onUpdateNote,
  onUpdateSampleNumber,
  onUpdateDateSubmitted,
  onUpdateDateTested,
  onUpdateTestedBy,
  onAddTest,
  onRemoveTest,
  onToggleTestExpanded,
  onUpdateTestTitle,
  onUpdateTestType,
  onUpdateLiquidLimitTrials,
  onUpdatePlasticLimitTrials,
  onUpdateShrinkageLimitTrials,
  onSyncTest,
  onExportPDF,
  onExportXLSX,
  onExportJSON,
  onRegisterChartRef,
}: RecordCardProps) => {
  const [nextTestType, setNextTestType] = useState<AtterbergTestType>("liquidLimit");
  const [isExporting, setIsExporting] = useState<"pdf" | "xlsx" | "json" | null>(null);
  const liquidLimitChartRef = useRef<HTMLDivElement>(null);

  // Register chart refs with parent when they change
  useEffect(() => {
    // Unregister when unmounting
    return () => {
      console.log(`[RecordCard] Cleaning up chart ref for record ${record.id}`);
      onRegisterChartRef(record.id, null);
    };
  }, [record.id, onRegisterChartRef]);

  // Store liquid limit chart ref for later access
  useEffect(() => {
    // Update the liquid limit chart ref - this is primarily for access by the export mechanism
    if (liquidLimitChartRef.current) {
      console.log(`[RecordCard] Liquid limit chart ref found for record ${record.id}`);
    }
  }, [record.id, record.tests]);

  const handleExportRecordPDF = useCallback(async () => {
    setIsExporting("pdf");
    try {
      await onExportPDF(record.id);
      toast.success(`${record.title || "Record"} exported as PDF`);
    } catch (error) {
      console.error("Failed to export record as PDF:", error);
      toast.error("Failed to export as PDF");
    } finally {
      setIsExporting(null);
    }
  }, [record.id, record.title, onExportPDF]);

  const handleExportRecordXLSX = useCallback(async () => {
    setIsExporting("xlsx");
    try {
      await onExportXLSX(record.id);
      toast.success(`${record.title || "Record"} exported as Excel`);
    } catch (error) {
      console.error("Failed to export record as XLSX:", error);
      toast.error("Failed to export as Excel");
    } finally {
      setIsExporting(null);
    }
  }, [record.id, record.title, onExportXLSX]);

  const handleExportRecordJSON = useCallback(() => {
    try {
      onExportJSON(record.id);
    } catch (error) {
      console.error("Failed to export record as JSON:", error);
      toast.error("Failed to export as JSON");
    }
  }, [record.id, onExportJSON]);

  const resultCards = [
    { label: "LL", value: record.results.liquidLimit, tone: "blue" },
    { label: "PL", value: record.results.plasticLimit, tone: "emerald" },
    { label: "SL", value: record.results.shrinkageLimit, tone: "amber" },
    { label: "PI", value: record.results.plasticityIndex, tone: "violet" },
  ];

  return (
    <Collapsible open={record.isExpanded} onOpenChange={onToggleExpanded}>
      <Card className="border shadow-sm print:break-inside-avoid print:shadow-none">
        <CardHeader className="space-y-3 pb-3">
          <div className="flex items-start gap-3">
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0" onClick={onToggleExpanded}>
              {record.isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>

            <div className="min-w-0 flex-1 space-y-3">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
                  <span className="text-sm font-semibold text-muted-foreground">Record {recordIndex + 1}</span>
                  <Input value={record.title} onChange={(event) => onUpdateTitle(event.target.value)} className="h-9 max-w-xl" placeholder="Record title, borehole, or sample group" />
                </div>

                <div className="flex flex-wrap items-center gap-2 print:hidden">
                  <Select value={nextTestType} onValueChange={(value) => setNextTestType(value as AtterbergTestType)}>
                    <SelectTrigger className="h-9 w-[180px] bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="liquidLimit">Liquid Limit</SelectItem>
                      <SelectItem value="plasticLimit">Plastic Limit</SelectItem>
                      <SelectItem value="shrinkageLimit">Shrinkage Limit</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button type="button" variant="outline" className="gap-2" onClick={() => onAddTest(nextTestType)}>
                    <Plus className="h-4 w-4" /> Add Test
                  </Button>

                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="gap-1 text-xs"
                      onClick={handleExportRecordPDF}
                      disabled={isExporting === "pdf"}
                      title="Export this record as PDF"
                    >
                      <Download className="h-3 w-3" /> PDF
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="gap-1 text-xs"
                      onClick={handleExportRecordXLSX}
                      disabled={isExporting === "xlsx"}
                      title="Export this record as Excel"
                    >
                      <Download className="h-3 w-3" /> Excel
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="gap-1 text-xs"
                      onClick={handleExportRecordJSON}
                      disabled={isExporting === "json"}
                      title="Export this record as JSON"
                    >
                      <Download className="h-3 w-3" /> JSON
                    </Button>
                  </div>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={onRemove}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">Identifier / Borehole / Sample Group</div>
                  <Input value={record.label} onChange={(event) => onUpdateLabel(event.target.value)} className="h-9" placeholder="Sample ID, borehole, depth, etc." />
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">Sample Number</div>
                  <Input value={record.sampleNumber || ""} onChange={(event) => onUpdateSampleNumber(event.target.value)} className="h-9" placeholder="Laboratory sample number" />
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">Date Submitted</div>
                  <Input type="date" value={record.dateSubmitted || ""} onChange={(event) => onUpdateDateSubmitted(event.target.value)} className="h-9" />
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">Date Tested</div>
                  <Input type="date" value={record.dateTested || ""} onChange={(event) => onUpdateDateTested(event.target.value)} className="h-9" />
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">Tested By</div>
                  <Input value={record.testedBy || ""} onChange={(event) => onUpdateTestedBy(event.target.value)} className="h-9" placeholder="Technician name" />
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">Note</div>
                  <Textarea value={record.note} onChange={(event) => onUpdateNote(event.target.value)} className="min-h-[72px] resize-y" placeholder="Optional workflow note or descriptor" />
                </div>
              </div>
            </div>
          </div>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="space-y-4 pt-0">
            {record.tests.length === 0 ? (
              <div className="rounded-lg border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
                No tests added yet. Add one or more liquid, plastic, or shrinkage limit tests for this borehole or sample record.
              </div>
            ) : (
              <div className="space-y-3">
                {record.tests.map((test) => (
                  <AtterbergTestCard
                    key={test.id}
                    test={test}
                    recordId={record.id}
                    onDelete={() => onRemoveTest(test.id)}
                    onUpdateTitle={(title) => onUpdateTestTitle(test.id, title)}
                    onUpdateType={(type) => onUpdateTestType(test.id, type)}
                    onToggleExpanded={() => onToggleTestExpanded(test.id)}
                    onUpdateLiquidLimitTrials={(trials) => onUpdateLiquidLimitTrials(test.id, trials)}
                    onUpdatePlasticLimitTrials={(trials) => onUpdatePlasticLimitTrials(test.id, trials)}
                    onUpdateShrinkageLimitTrials={(trials) => onUpdateShrinkageLimitTrials(test.id, trials)}
                    onSyncResult={onSyncTest}
                  />
                ))}
              </div>
            )}

            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/20 p-4">
                <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <h4 className="text-sm font-semibold">Record Summary</h4>
                  <div className="text-xs text-muted-foreground">
                    {record.dataPoints} valid data point{record.dataPoints === 1 ? "" : "s"} • {record.completedTests} completed test{record.completedTests === 1 ? "" : "s"}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {resultCards.map((item) => (
                    <div
                      key={item.label}
                      className={cn(
                        "rounded-lg border p-3",
                        item.tone === "blue" && "border-blue-200 bg-blue-50/60 dark:border-blue-900 dark:bg-blue-950/20",
                        item.tone === "emerald" && "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/20",
                        item.tone === "amber" && "border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/20",
                        item.tone === "violet" && "border-violet-200 bg-violet-50/60 dark:border-violet-900 dark:bg-violet-950/20",
                      )}
                    >
                      <div className="text-xs font-medium text-muted-foreground">{item.label}</div>
                      <div className="mt-1 text-lg font-bold">{item.value !== undefined ? `${item.value}%` : "-"}</div>
                    </div>
                  ))}
                </div>
              </div>

              {(() => {
                const { warnings } = getRecordValidationMessages(record);
                return warnings.length > 0 ? (
                  <div className="flex gap-2 rounded-lg border border-amber-200/50 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/30 dark:bg-amber-950/20 dark:text-amber-200">
                    <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      {warnings.map((warn, i) => (
                        <div key={i}>{warn}</div>
                      ))}
                    </div>
                  </div>
                ) : null;
              })()}

            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
};

const buildTablesForExport = (records: ComputedRecord[]) => {
  const recordSummaryTable = {
    title: "Record Summary",
    headers: ["Record", "Identifier", "Sample #", "Date Tested", "Tested By", "LL (%)", "PL (%)", "SL (%)", "PI (%)", "Valid Points"],
    rows: records.map((record) => [
      record.title,
      record.label || "-",
      record.sampleNumber || "-",
      record.dateTested || "-",
      record.testedBy || "-",
      record.results.liquidLimit !== undefined ? String(record.results.liquidLimit) : "-",
      record.results.plasticLimit !== undefined ? String(record.results.plasticLimit) : "-",
      record.results.shrinkageLimit !== undefined ? String(record.results.shrinkageLimit) : "-",
      record.results.plasticityIndex !== undefined ? String(record.results.plasticityIndex) : "-",
      String(record.dataPoints),
    ]),
  };

  const trialTables = records.flatMap((record) =>
    record.tests
      .map((test) => {
        if (test.type === "liquidLimit") {
          const rows = test.trials
            .filter(isLiquidLimitTrialValid)
            .map((trial) => [
              record.title,
              record.label || "-",
              record.note || "-",
              test.title,
              "Liquid Limit",
              trial.trialNo,
              trial.penetration,
              trial.moisture,
              trial.containerNo || "-",
              trial.containerMass || "-",
              trial.containerWetMass || "-",
              trial.containerDryMass || "-",
              test.result.liquidLimit !== undefined ? String(test.result.liquidLimit) : "-",
            ]);

          return rows.length > 0
            ? {
                title: `${record.title} - ${test.title} (Liquid Limit)`,
                headers: ["Record", "Identifier", "Note", "Test", "Type", "Trial", "Penetration (mm)", "Moisture (%)", "Container No", "Container (g)", "Container+Wet (g)", "Container+Dry (g)", "LL (%)"],
                rows,
              }
            : null;
        }

        if (test.type === "plasticLimit") {
          const rows = test.trials
            .filter(isPlasticLimitTrialValid)
            .map((trial) => [
              record.title,
              record.label || "-",
              record.note || "-",
              test.title,
              "Plastic Limit",
              trial.trialNo,
              trial.moisture,
              trial.containerNo || "-",
              trial.containerMass || "-",
              trial.containerWetMass || "-",
              trial.containerDryMass || "-",
              test.result.plasticLimit !== undefined ? String(test.result.plasticLimit) : "-",
            ]);

          return rows.length > 0
            ? {
                title: `${record.title} - ${test.title} (Plastic Limit)`,
                headers: ["Record", "Identifier", "Note", "Test", "Type", "Trial", "Moisture (%)", "Container No", "Container (g)", "Container+Wet (g)", "Container+Dry (g)", "PL (%)"],
                rows,
              }
            : null;
        }

        const rows = test.trials
          .filter(isShrinkageLimitTrialValid)
          .map((trial) => [
            record.title,
            record.label || "-",
            record.note || "-",
            test.title,
            "Linear Shrinkage",
            trial.trialNo,
            trial.initialLength,
            trial.finalLength,
            test.result.linearShrinkage !== undefined ? String(test.result.linearShrinkage) : "-",
          ]);

        return rows.length > 0
          ? {
              title: `${record.title} - ${test.title} (Linear Shrinkage)`,
              headers: ["Record", "Identifier", "Note", "Test", "Type", "Trial", "Initial Length (mm)", "Final Length (mm)", "LS (%)"],
              rows,
            }
          : null;
      })
      .filter((table): table is NonNullable<typeof table> => Boolean(table)),
  );

  return [recordSummaryTable, ...trialTables];
};

export default AtterbergTest;
