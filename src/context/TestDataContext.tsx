import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { listRecords, fetchCurrentUser } from "@/lib/api";

export type TestStatus = "not-started" | "in-progress" | "completed";

export interface TestSummary {
  id: string;
  name: string;
  category: "soil" | "concrete" | "rock" | "special";
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
  labOrganization?: string;
  dateReported?: string;
  checkedBy?: string;
}

// Generic record-level metadata (used across test types)
export interface RecordMetadata {
  sampleNumber?: string;
  dateSubmitted?: string;
  dateTested?: string;
  testedBy?: string;
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
  updateTest: (id: string, data: Partial<Omit<TestSummary, "id">>) => void;
  projectMetadata: ProjectMetadata;
  updateProjectMetadata: (data: Partial<ProjectMetadata>) => void;
  recordMetadata: Record<string, RecordMetadata>;
  updateRecordMetadata: (testId: string, data: Partial<RecordMetadata>) => void;
}

const defaultTests: Record<string, TestSummary> = {
  grading: { id: "grading", name: "Grading (Sieve Analysis)", category: "soil", status: "not-started", dataPoints: 0, keyResults: [] },
  atterberg: { id: "atterberg", name: "Atterberg Limits", category: "soil", status: "not-started", dataPoints: 0, keyResults: [] },
  proctor: { id: "proctor", name: "Proctor Test", category: "soil", status: "not-started", dataPoints: 0, keyResults: [] },
  cbr: { id: "cbr", name: "CBR", category: "soil", status: "not-started", dataPoints: 0, keyResults: [] },
  shear: { id: "shear", name: "Shear Test", category: "soil", status: "not-started", dataPoints: 0, keyResults: [] },
  consolidation: { id: "consolidation", name: "Consolidation", category: "soil", status: "not-started", dataPoints: 0, keyResults: [] },
  slump: { id: "slump", name: "Slump Test", category: "concrete", status: "not-started", dataPoints: 0, keyResults: [] },
  compressive: { id: "compressive", name: "Compressive Strength", category: "concrete", status: "not-started", dataPoints: 0, keyResults: [] },
  upvt: { id: "upvt", name: "UPVT", category: "concrete", status: "not-started", dataPoints: 0, keyResults: [] },
  schmidt: { id: "schmidt", name: "Schmidt Hammer", category: "concrete", status: "not-started", dataPoints: 0, keyResults: [] },
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
  updateTest: () => {},
  projectMetadata: {},
  updateProjectMetadata: () => {},
  recordMetadata: {},
  updateRecordMetadata: () => {},
});

export const useTestData = () => useContext(TestDataContext);

export const TestDataProvider = ({ children }: { children: ReactNode }) => {
  const [tests, setTests] = useState<Record<string, TestSummary>>(defaultTests);
  const [projectMetadata, setProjectMetadata] = useState<ProjectMetadata>({});
  const [recordMetadata, setRecordMetadata] = useState<Record<string, RecordMetadata>>({});

  useEffect(() => {
    const loadTestDefinitions = async () => {
      let retries = 0;
      const maxRetries = 3;
      let authCheckAttempts = 0;
      const maxAuthCheckAttempts = 10; // Wait up to 10 seconds for auth

      const waitForAuthentication = async (): Promise<boolean> => {
        try {
          const user = await fetchCurrentUser();
          return user !== null;
        } catch (error) {
          authCheckAttempts++;
          if (authCheckAttempts < maxAuthCheckAttempts) {
            // Wait 1 second and try again
            await new Promise(resolve => setTimeout(resolve, 1000));
            return waitForAuthentication();
          }
          return false;
        }
      };

      interface TestDefinitionRecord {
        test_key: string;
        name: string;
        category: "soil" | "concrete" | "rock" | "special";
        enabled: boolean | number;
        sort_order: number;
      }

      const attemptLoad = async (): Promise<void> => {
        try {
          const response = await listRecords<TestDefinitionRecord>("test_definitions", { limit: 1000 });
          if (response?.data && Array.isArray(response.data)) {
            const loadedTests: Record<string, TestSummary> = { ...defaultTests };

            for (const record of response.data) {
              const testKey = record.test_key;
              if (testKey && loadedTests[testKey]) {
                // Merge API data with default test
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
            console.log("Successfully loaded test definitions from API");
          }
        } catch (error) {
          retries++;
          if (retries < maxRetries) {
            // Retry with exponential backoff
            const delay = Math.pow(2, retries - 1) * 1000;
            console.warn(`Failed to load test definitions. Retrying in ${delay}ms... (Attempt ${retries}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return attemptLoad();
          } else {
            console.error("Failed to load test definitions from API after 3 attempts:", error);
            // Fall back to defaultTests if API fails
          }
        }
      };

      // Wait for authentication to be established before attempting to load
      console.log("Waiting for authentication before loading test definitions...");
      const isAuthenticated = await waitForAuthentication();

      if (isAuthenticated) {
        console.log("User authenticated, loading test definitions...");
        await attemptLoad();
      } else {
        console.log("No authenticated user found, using default test definitions");
      }
    };

    loadTestDefinitions();
  }, []);

  const updateTest = useCallback((id: string, data: Partial<Omit<TestSummary, "id">>) => {
    setTests((prev) => ({
      ...prev,
      [id]: { ...prev[id], ...data },
    }));
  }, []);

  const updateProjectMetadata = useCallback((data: Partial<ProjectMetadata>) => {
    setProjectMetadata((prev) => ({ ...prev, ...data }));
  }, []);

  const updateRecordMetadata = useCallback((testId: string, data: Partial<RecordMetadata>) => {
    setRecordMetadata((prev) => ({
      ...prev,
      [testId]: { ...prev[testId], ...data },
    }));
  }, []);

  return (
    <TestDataContext.Provider
      value={{ tests, updateTest, projectMetadata, updateProjectMetadata, recordMetadata, updateRecordMetadata }}
    >
      {children}
    </TestDataContext.Provider>
  );
};
