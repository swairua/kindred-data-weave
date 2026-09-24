import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { listRecords } from "@/lib/api";

export type TestStatus = "not-started" | "in-progress" | "completed";
export type TestCategory = "soil" | "concrete" | "rock" | "special";

export interface TestDefinition {
  test_key: string;
  name: string;
  category: TestCategory;
  sort_order: number;
  enabled: boolean | number;
}

export interface TestSummary {
  id: string;
  name: string;
  category: TestCategory;
  status: TestStatus;
  dataPoints: number;
  keyResults: { label: string; value: string }[];
  enabled?: boolean;
  sortOrder?: number;
}

// Generic project-level metadata (used across all test types)
export interface ProjectMetadata {
  clientName?: string;
  projectName?: string;
  projectDate?: string;
  labOrganization?: string;
  dateReported?: string;
  checkedBy?: string;
  currentProjectId?: number | null;
  contractor?: string;
  county?: string;
  submittedBy?: string;
  dateSubmitted?: string;
  customFields?: Array<{ name: string; value: string }>;
}

// Generic record-level metadata (used across test types)
export interface RecordMetadata {
  sampleId?: string;
  sampleNumber?: string;
  sampleDepthFrom?: string;
  sampleDepthTo?: string;
  sampledSubmittedBy?: string;
  sampleNotes?: string;
  dateSubmitted?: string;
  dateTested?: string;
  testedBy?: string;
}

// Concrete-specific test metadata
export interface ConcreteTestMetadata {
  cement?: string;
  fineAggregate?: string;
  coarseAggregate?: string;
  contractor?: string;
  county?: string;
  concreteClass?: string;
  section?: string;
  madeBy?: string;
  slump?: string;
  clientRef?: string;
  dateTested?: string;
  sampleId?: string;
}

export type AtterbergTestType = "liquidLimit" | "plasticLimit" | "shrinkageLimit";

export interface LiquidLimitTrial {
  id: string;
  trialNo: string;
  penetration: string; // Cone penetration depth in mm (BS 1377)
  containerNo?: string;
  containerWetMass?: string; // Container + wet soil (g)
  containerDryMass?: string; // Container + dry soil (g)
  containerMass?: string; // Container mass (g)
  moisture: string; // Auto-calculated or manually entered
}

export interface PlasticLimitTrial {
  id: string;
  trialNo: string;
  containerNo?: string;
  containerWetMass?: string;
  containerDryMass?: string;
  containerMass?: string;
  moisture: string;
}

export interface ShrinkageLimitTrial {
  id: string;
  trialNo: string;
  initialLength: string; // mm (default 140mm mould)
  finalLength: string; // mm
}

export interface CalculatedResults {
  liquidLimit?: number;
  plasticLimit?: number;
  shrinkageLimit?: number;
  linearShrinkage?: number;
  plasticityIndex?: number;
  modulusOfPlasticity?: number;
}

interface AtterbergBaseTest {
  id: string;
  title: string;
  isExpanded: boolean;
  result: CalculatedResults;
}

export interface LiquidLimitTest extends AtterbergBaseTest {
  type: "liquidLimit";
  trials: LiquidLimitTrial[];
}

export interface PlasticLimitTest extends AtterbergBaseTest {
  type: "plasticLimit";
  trials: PlasticLimitTrial[];
}

export interface ShrinkageLimitTest extends AtterbergBaseTest {
  type: "shrinkageLimit";
  trials: ShrinkageLimitTrial[];
}

export type AtterbergTest = LiquidLimitTest | PlasticLimitTest | ShrinkageLimitTest;

export interface AtterbergRecord {
  id: string;
  title: string;
  label: string;
  note: string;
  isExpanded: boolean;
  tests: AtterbergTest[];
  results: CalculatedResults;
  // Record-level metadata
  sampleNumber?: string;
  dateSubmitted?: string;
  dateTested?: string;
  testedBy?: string;
  passing425um?: string; // % passing 425µm sieve for Modulus of Plasticity
}

export interface AtterbergProjectMetadata {
  clientName?: string;
  projectName?: string;
  labOrganization?: string;
  dateReported?: string;
  checkedBy?: string;
}

export interface AtterbergProjectState extends AtterbergProjectMetadata {
  records: AtterbergRecord[];
}

interface TestDataContextType {
  tests: Record<string, TestSummary>;
  testDefinitions: TestDefinition[];
  testDefinitionsLoading: boolean;
  testDefinitionsError: string | null;
  refreshTestDefinitions: () => Promise<void>;
  updateTest: (id: string, data: Partial<Omit<TestSummary, "id">>) => void;
  projectMetadata: ProjectMetadata;
  updateProjectMetadata: (data: Partial<ProjectMetadata>) => void;
  recordMetadata: Record<string, RecordMetadata>;
  updateRecordMetadata: (testId: string, data: Partial<RecordMetadata>) => void;
  concreteTestMetadata: ConcreteTestMetadata | null;
  updateConcreteTestMetadata: (data: ConcreteTestMetadata) => void;
  resetProjectData: () => void;
  currentProjectId: number | null;
}

const defaultTests: Record<string, TestSummary> = {
  grading: { id: "grading", name: "Particle Size Distribution", category: "soil", status: "not-started", dataPoints: 0, keyResults: [] },
  atterberg: { id: "atterberg", name: "Atterberg Limits", category: "soil", status: "not-started", dataPoints: 0, keyResults: [] },
  proctor: { id: "proctor", name: "Proctor Test", category: "soil", status: "not-started", dataPoints: 0, keyResults: [] },
  cbr: { id: "cbr", name: "CBR", category: "soil", status: "not-started", dataPoints: 0, keyResults: [] },
  shear: { id: "shear", name: "Shear Test", category: "soil", status: "not-started", dataPoints: 0, keyResults: [] },
  consolidation: { id: "consolidation", name: "Consolidation", category: "soil", status: "not-started", dataPoints: 0, keyResults: [] },
  slump: { id: "slump", name: "Slump Test", category: "concrete", status: "not-started", dataPoints: 0, keyResults: [] },
  compressive: { id: "compressive", name: "Compressive Strength", category: "concrete", status: "not-started", dataPoints: 0, keyResults: [] },
  upvt: { id: "upvt", name: "UPVT", category: "concrete", status: "not-started", dataPoints: 0, keyResults: [] },
  schmidt: { id: "schmidt", name: "NDT (Rebound Hammer)", category: "concrete", status: "not-started", dataPoints: 0, keyResults: [] },
  coring: { id: "coring", name: "Coring", category: "concrete", status: "not-started", dataPoints: 0, keyResults: [] },
  cubes: { id: "cubes", name: "Concrete Cubes", category: "concrete", status: "not-started", dataPoints: 0, keyResults: [] },
  ucs: { id: "ucs", name: "UCS", category: "rock", status: "not-started", dataPoints: 0, keyResults: [] },
  pointload: { id: "pointload", name: "Point Load", category: "rock", status: "not-started", dataPoints: 0, keyResults: [] },
  porosity: { id: "porosity", name: "Porosity", category: "rock", status: "not-started", dataPoints: 0, keyResults: [] },
  spt: { id: "spt", name: "SPT", category: "special", status: "not-started", dataPoints: 0, keyResults: [] },
  dcp: { id: "dcp", name: "DCP", category: "special", status: "not-started", dataPoints: 0, keyResults: [] },
};

const TestDataContext = createContext<TestDataContextType>({
  tests: defaultTests,
  testDefinitions: [],
  testDefinitionsLoading: true,
  testDefinitionsError: null,
  refreshTestDefinitions: async () => {},
  updateTest: () => {},
  projectMetadata: {},
  updateProjectMetadata: () => {},
  recordMetadata: {},
  updateRecordMetadata: () => {},
  concreteTestMetadata: null,
  updateConcreteTestMetadata: () => {},
  resetProjectData: () => {},
  currentProjectId: null,
});

export const useTestData = () => useContext(TestDataContext);

export const TestDataProvider = ({ children }: { children: ReactNode }) => {
  const [tests, setTests] = useState<Record<string, TestSummary>>(defaultTests);
  const [testDefinitions, setTestDefinitions] = useState<TestDefinition[]>([]);
  const [testDefinitionsLoading, setTestDefinitionsLoading] = useState(true);
  const [testDefinitionsError, setTestDefinitionsError] = useState<string | null>(null);
  const [projectMetadata, setProjectMetadata] = useState<ProjectMetadata>({});
  const [recordMetadata, setRecordMetadata] = useState<Record<string, RecordMetadata>>({});
  const [concreteTestMetadata, setConcreteTestMetadata] = useState<ConcreteTestMetadata | null>(null);
  const [currentProjectId, setCurrentProjectId] = useState<number | null>(null);

  const refreshTestDefinitions = useCallback(async () => {
    setTestDefinitionsLoading(true);
    setTestDefinitionsError(null);
    try {
      console.log("[TestData] Starting to load test definitions");
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("API request took too long")), 8000);
      });
      const response = await Promise.race([
        listRecords<TestDefinition>("test_definitions", { limit: 1000 }),
        timeoutPromise,
      ]);
      const definitions = Array.isArray(response?.data) ? response.data : [];
      setTestDefinitions(definitions);

      const loadedTests: Record<string, TestSummary> = { ...defaultTests };
      for (const record of definitions) {
        const testKey = record.test_key;
        if (testKey && loadedTests[testKey]) {
          loadedTests[testKey] = {
            ...loadedTests[testKey],
            name: record.name || loadedTests[testKey].name,
            category: record.category || loadedTests[testKey].category,
            enabled: record.enabled !== false && record.enabled !== 0,
            sortOrder: record.sort_order || 0,
          };
        }
      }
      setTests(loadedTests);
      console.log("[TestData] Successfully loaded test definitions from API");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setTestDefinitionsError(message);
      console.warn("[TestData] Failed to load test definitions from API:", message);
    } finally {
      setTestDefinitionsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshTestDefinitions();
  }, [refreshTestDefinitions]);

  const updateTest = useCallback((id: string, data: Partial<Omit<TestSummary, "id">>) => {
    setTests((prev) => ({
      ...prev,
      [id]: { ...prev[id], ...data },
    }));
  }, []);

  const updateProjectMetadata = useCallback((data: Partial<ProjectMetadata>) => {
    setProjectMetadata((prev) => ({ ...prev, ...data }));
    // If currentProjectId is included in the update, also update state separately
    if (data.currentProjectId !== undefined) {
      setCurrentProjectId(data.currentProjectId);
    }
  }, []);

  const updateRecordMetadata = useCallback((testId: string, data: Partial<RecordMetadata>) => {
    setRecordMetadata((prev) => ({
      ...prev,
      [testId]: { ...prev[testId], ...data },
    }));
  }, []);

  const updateConcreteTestMetadata = useCallback((data: ConcreteTestMetadata) => {
    setConcreteTestMetadata(data);
  }, []);

  const resetProjectData = useCallback(() => {
    setTests(defaultTests);
    setProjectMetadata({});
    setRecordMetadata({});
    setConcreteTestMetadata(null);
    setCurrentProjectId(null);
  }, []);

  return (
    <TestDataContext.Provider
      value={{ tests, testDefinitions, testDefinitionsLoading, testDefinitionsError, refreshTestDefinitions, updateTest, projectMetadata, updateProjectMetadata, recordMetadata, updateRecordMetadata, concreteTestMetadata, updateConcreteTestMetadata, resetProjectData, currentProjectId }}
    >
      {children}
    </TestDataContext.Provider>
  );
};
