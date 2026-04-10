import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Download, Plus, Trash2, Upload, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

import TestSection from "@/components/TestSection";
import AtterbergTestCard from "./AtterbergTestCard";
import PlasticityChart from "./PlasticityChart";
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
  type LiquidLimitTrial,
  type PlasticLimitTrial,
  type ShrinkageLimitTrial,
} from "@/context/TestDataContext";
import { generateTestCSV } from "@/lib/csvExporter";
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

const STORAGE_KEY = "atterbergProjectState";

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
      isExpanded: true,
      trials: [createLiquidLimitTrial(0)],
      result: {},
    };
  }

  if (type === "plasticLimit") {
    return {
      id: makeId("test"),
      title: buildTestTitle(type, tests),
      type,
      isExpanded: true,
      trials: [createPlasticLimitTrial(0)],
      result: {},
    };
  }

  return {
    id: makeId("test"),
    title: buildTestTitle(type, tests),
    type,
    isExpanded: true,
    trials: [createShrinkageLimitTrial(0)],
    result: {},
  };
};

const createRecord = (index: number): AtterbergRecord => ({
  id: makeId("record"),
  title: `Record ${index + 1}`,
  label: "",
  note: "",
  isExpanded: true,
  tests: [],
  results: {},
});

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

let atterbergSaveQueue: Promise<void> = Promise.resolve();

const getAtterbergResultsForProject = (rows: ApiAtterbergResultRow[], projectId: number) =>
  rows.filter((row) => row.test_key === "atterberg" && Number(row.project_id) === projectId);

const isDuplicateResultError = (error: unknown) => error instanceof Error && /duplicate|unique|uq_test_results_project/i.test(error.message);

const loadAtterbergProjectFromApi = async (lookup: AtterbergProjectLookup) => {
  try {
    const [projectsResponse, resultsResponse] = await Promise.all([
      listRecords<ApiProjectRow>("projects", { limit: 1000, orderBy: "updated_at", direction: "DESC" }),
      listRecords<ApiAtterbergResultRow>("test_results", { limit: 1000, orderBy: "updated_at", direction: "DESC" }),
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
    // If API is unavailable or unauthorized, return null to allow fallback to localStorage
    if (error instanceof Error && (error.message.includes("Unauthorized") || error.message.includes("Forbidden"))) {
      console.warn("API authentication failed, using localStorage fallback");
      return null;
    }
    throw error;
  }
};

const persistAtterbergProjectToApi = async ({
  lookup,
  payload,
  dataPoints,
  status,
  keyResults,
}: {
  lookup: AtterbergProjectLookup;
  payload: AtterbergExportPayload;
  dataPoints: number;
  status: string;
  keyResults: Array<{ label: string; value: string }>;
}): Promise<string | null> => {
  try {
    const [projectsResponse, resultsResponse] = await Promise.all([
      listRecords<ApiProjectRow>("projects", { limit: 1000, orderBy: "updated_at", direction: "DESC" }),
      listRecords<ApiAtterbergResultRow>("test_results", { limit: 1000, orderBy: "updated_at", direction: "DESC" }),
    ]);

    let projectRow = hasLookupCriteria(lookup)
      ? projectsResponse.data.find((row) => matchesProjectLookup(row, lookup)) ?? null
      : projectsResponse.data[0] ?? null;
    const projectName = normalizeLookupValue(payload.project.title) || "Atterberg Limits Testing";
    const clientName = normalizeLookupValue(payload.project.clientName);
    const projectDate = normalizeLookupValue(payload.project.date);

    let lastSavedAt: string | null = null;

    if (!projectRow) {
      const createdProject = await createApiRecord<ApiProjectRow>("projects", {
        name: projectName,
        client_name: clientName || null,
        project_date: projectDate || null,
      });
      projectRow = createdProject.data;
      lastSavedAt = createdProject.last_saved_at ?? null;
    } else {
      const updatedProject = await updateApiRecord<ApiProjectRow>("projects", projectRow.id, {
        name: projectName,
        client_name: clientName || null,
        project_date: projectDate || null,
      });
      projectRow = updatedProject.data ?? projectRow;
      lastSavedAt = updatedProject.last_saved_at ?? null;
    }

    if (!projectRow) {
      throw new Error("Unable to save project");
    }

    let matchingResults = getAtterbergResultsForProject(resultsResponse.data, projectRow.id);
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

    // Always try to find and update existing record
    // If multiple exist, update the most recent one (highest ID)
    if (matchingResults.length > 0) {
      const mostRecent = matchingResults.reduce((prev, curr) => (curr.id > prev.id ? curr : prev));

      // Try to update the most recent record
      const updateResponse = await updateApiRecord("test_results", mostRecent.id, resultPayload);
      if (updateResponse.last_saved_at) {
        lastSavedAt = updateResponse.last_saved_at;
      }

      // Clean up other duplicates in the background (don't block if they fail)
      if (matchingResults.length > 1) {
        const toDelete = matchingResults.filter((r) => r.id !== mostRecent.id);
        Promise.allSettled(toDelete.map((row) => deleteApiRecord("test_results", row.id))).catch(() => {
          // Silently ignore cleanup failures - the important data is saved
        });
      }
    } else {
      // No record exists, try to create one
      try {
        const createResponse = await createApiRecord("test_results", resultPayload);
        if (createResponse.last_saved_at) {
          lastSavedAt = createResponse.last_saved_at;
        }
      } catch (error) {
        // If duplicate error, another process may have created it while we were saving
        if (!isDuplicateResultError(error)) {
          throw error;
        }

        // Refetch latest data and try to update instead
        const latestResultsResponse = await listRecords<ApiAtterbergResultRow>("test_results", {
          limit: 1000,
          orderBy: "updated_at",
          direction: "DESC",
        });
        const refetchedResults = getAtterbergResultsForProject(latestResultsResponse.data, projectRow.id);

        if (!refetchedResults[0]) {
          // Still no record found, something is wrong
          throw error;
        }

        // Update the most recent record
        const mostRecent = refetchedResults.reduce((prev, curr) => (curr.id > prev.id ? curr : prev));
        const updateResponse = await updateApiRecord("test_results", mostRecent.id, resultPayload);
        if (updateResponse.last_saved_at) {
          lastSavedAt = updateResponse.last_saved_at;
        }

        // Clean up duplicates in background
        if (refetchedResults.length > 1) {
          const toDelete = refetchedResults.filter((r) => r.id !== mostRecent.id);
          Promise.allSettled(toDelete.map((row) => deleteApiRecord("test_results", row.id))).catch(() => {
            // Silently ignore cleanup failures
          });
        }
      }
    }

    return lastSavedAt;
  } catch (error) {
    // If auth fails, silently continue (auto-save is non-critical)
    if (error instanceof Error && (error.message.includes("Unauthorized") || error.message.includes("Forbidden"))) {
      console.warn("API save skipped due to authentication, data is preserved locally");
      return null;
    }

    // Duplicate errors should have been handled in the inner catch block
    // If we still have a duplicate error here, log it and continue silently
    if (error instanceof Error && isDuplicateResultError(error)) {
      console.warn("Atterberg project: duplicate record was attempted but handled by update logic");
      return null;
    }
    throw error;
  }
};

const saveAtterbergProjectToApi = (args: {
  lookup: AtterbergProjectLookup;
  payload: AtterbergExportPayload;
  dataPoints: number;
  status: string;
  keyResults: Array<{ label: string; value: string }>;
}) => {
  const queuedSave = atterbergSaveQueue.then(() => persistAtterbergProjectToApi(args), () => persistAtterbergProjectToApi(args));
  atterbergSaveQueue = queuedSave.then(() => undefined, () => undefined);
  return queuedSave;
};

const clearAtterbergProjectFromApi = async (lookup: AtterbergProjectLookup) => {
  try {
    const [projectsResponse, resultsResponse] = await Promise.all([
      listRecords<ApiProjectRow>("projects", { limit: 1000, orderBy: "updated_at", direction: "DESC" }),
      listRecords<ApiAtterbergResultRow>("test_results", { limit: 1000, orderBy: "updated_at", direction: "DESC" }),
    ]);

    let resultRows: ApiAtterbergResultRow[] = [];

    if (hasLookupCriteria(lookup)) {
      const projectRow = projectsResponse.data.find((row) => matchesProjectLookup(row, lookup)) ?? null;
      if (projectRow) {
        resultRows = getAtterbergResultsForProject(resultsResponse.data, projectRow.id);
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
  const [projectState, setProjectState] = useState<AtterbergProjectState>({ records: [] });
  const [isClearDialogOpen, setIsClearDialogOpen] = useState(false);
  const [smokeCheckStatus, setSmokeCheckStatus] = useState<SmokeCheckStatus | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [lastSaveError, setLastSaveError] = useState<string | null>(null);
  const saveStatusTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hydratedRef = useRef(false);
  const loadAttemptedRef = useRef(false);
  const skipNextPersistRef = useRef(false);

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
    () => getAtterbergLookup(project.projectName || projectState.projectName || "Atterberg Limits Testing", project.clientName || projectState.clientName, project.date),
    [project.clientName, project.date, project.projectName, projectState.clientName, projectState.projectName],
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

  const { totalDataPoints, aggregateResults, aggregateProjectResults, status, totalCompletedTests } = useMemo(() => {
    const totalPoints = computedRecords.reduce((sum, record) => sum + record.dataPoints, 0);
    const completedTests = computedRecords.reduce((sum, record) => sum + record.completedTests, 0);
    const totalTests = computedRecords.reduce((sum, record) => sum + record.tests.length, 0);
    const projectResults = calculateProjectResults(computedRecords);

    return {
      totalDataPoints: totalPoints,
      totalCompletedTests: completedTests,
      aggregateProjectResults: projectResults,
      status: deriveAtterbergStatus(totalPoints, completedTests, totalTests),
      aggregateResults: buildAtterbergSummaryFields(projectResults, computedRecords.length, totalPoints),
    };
  }, [computedRecords]);

  useTestReport("atterberg", totalDataPoints, aggregateResults, status);

  useEffect(() => {
    if (!hydratedRef.current) return;
    if (skipNextPersistRef.current) {
      skipNextPersistRef.current = false;
      return;
    }

    // Only set "saving" status for auto-save if not already in a manual save flow
    if (saveStatus === "idle") {
      setSaveStatus("saving");
    }

    void saveAtterbergProjectToApi({
      lookup: effectiveProjectLookup,
      payload: buildExportPayload(),
      dataPoints: totalDataPoints,
      status,
      keyResults: aggregateResults,
    }).then((apiTimestamp) => {
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

      // Auto-clear status after 2 seconds for auto-save
      if (saveStatusTimeoutRef.current) {
        clearTimeout(saveStatusTimeoutRef.current);
      }
      saveStatusTimeoutRef.current = setTimeout(() => {
        setSaveStatus("idle");
      }, 2000);
    }).catch((error) => {
      // Report actual errors to user - backend handles duplicate detection properly
      setSaveStatus("error");
      setLastSaveError(error instanceof Error ? error.message : 'Unknown error');
      console.error("Failed to save Atterberg project to API:", error);
    });
  }, [persistedState, effectiveProjectLookup, aggregateResults, status, totalDataPoints]);

  const updateProjectMetadata = useCallback((updater: (state: AtterbergProjectState) => Partial<AtterbergProjectState>) => {
    setProjectState((prev) => ({
      ...prev,
      ...updater(prev),
    }));
  }, []);

  const updateRecord = useCallback((recordId: string, updater: (record: AtterbergRecord) => AtterbergRecord) => {
    setProjectState((prev) => ({
      ...prev,
      records: prev.records.map((record) => (record.id === recordId ? updater(record) : record)),
    }));
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
      updateRecord(recordId, (record) => ({
        ...record,
        isExpanded: true,
        tests: [...record.tests, createTest(type, record.tests)],
      }));
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
            isExpanded: true,
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

      // Auto-clear success status after 2 seconds
      saveStatusTimeoutRef.current = setTimeout(() => {
        setSaveStatus("idle");
      }, 2000);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setSaveStatus("error");
      setLastSaveError(errorMessage);
      console.error("Failed to save Atterberg project:", error);
    }
  }, [persistedState, effectiveProjectLookup, aggregateResults, status, totalDataPoints]);

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

    await generateAtterbergPDF({
      projectName: project.projectName,
      clientName: project.clientName || projectState.clientName,
      date: project.date,
      projectState,
      records: computedRecords,
    });

    return true;
  }, [computedRecords, project.clientName, project.date, project.projectName, projectState]);

  const handleExportCSV = useCallback(() => {
    if (computedRecords.length === 0) {
      toast.error("No records to export");
      return false;
    }

    generateTestCSV({
      title: "Atterberg Limits Testing",
      projectName: project.projectName,
      clientName: project.clientName || projectState.clientName,
      date: project.date,
      labOrganization: projectState.labOrganization,
      dateReported: projectState.dateReported,
      checkedBy: projectState.checkedBy,
      fields: aggregateResults,
      tables: exportTables,
    });

    return true;
  }, [aggregateResults, computedRecords.length, exportTables, project.clientName, project.date, project.projectName, projectState.clientName, projectState.labOrganization, projectState.dateReported, projectState.checkedBy]);

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

  const handleRecordExportXLSX = useCallback(
    async (recordId: string) => {
      const record = computedRecords.find((r) => r.id === recordId);
      if (!record) {
        toast.error("Record not found");
        return false;
      }

      await generateAtterbergXLSX({
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

    await generateAtterbergXLSX({
      projectName: project.projectName,
      clientName: project.clientName || projectState.clientName,
      date: project.date,
      projectState,
      records: computedRecords,
    });

    return true;
  }, [computedRecords, project.clientName, project.date, project.projectName, projectState]);

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
        onClear={handleClearRequest}
        onExportPDF={handleExportPDF}
        onExportCSV={handleExportCSV}
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
}: RecordCardProps) => {
  const [nextTestType, setNextTestType] = useState<AtterbergTestType>("liquidLimit");
  const [isExporting, setIsExporting] = useState<"pdf" | "xlsx" | "json" | null>(null);

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

              {record.results.liquidLimit !== undefined || record.results.plasticityIndex !== undefined ? (
                <PlasticityChart
                  liquidLimit={record.results.liquidLimit ?? null}
                  plasticityIndex={record.results.plasticityIndex ?? null}
                />
              ) : null}
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
