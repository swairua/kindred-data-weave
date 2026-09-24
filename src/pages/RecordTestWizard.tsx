import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, X, FlaskConical, FolderOpen, Plus, Layers, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import WizardStepper, { type WizardStep } from "@/components/WizardStepper";
import FormCard from "@/components/wizard/FormCard";
import { listRecords, fetchCurrentUser, setSessionToken, logoutUser, fetchFullProject, createRecord, listCompressiveTests } from "@/lib/api";
import { type ApiProjectRow } from "@/types/api";
import { cn } from "@/lib/utils";
import { useTestData } from "@/context/TestDataContext";
import { registry } from "@/lib/testRegistry";
import Navigation from "@/components/Navigation";
import { toast } from "sonner";

type Material = "soil" | "concrete" | "rock" | "special";

interface TestOption {
  key: string;
  name: string;
  isRegistered: boolean;
}

const MATERIAL_PRESENTATION: Record<Material, { label: string; emoji: string }> = {
  soil: { label: "Soil", emoji: "🪨" },
  concrete: { label: "Concrete", emoji: "🏗️" },
  rock: { label: "Rock", emoji: "⛰️" },
  special: { label: "Special", emoji: "🧪" },
};

const getSteps = (
  testKey: string | null,
  hasExistingTests: boolean,
  selectedExistingTestId: number | null,
): WizardStep[] => {
  const isCompressiveStrengthTest = testKey === "compressive";
  // Only skip project step if a specific existing test instance has been selected
  const existingTestSelected = selectedExistingTestId !== null;

  const steps: WizardStep[] = [
    { id: "material", label: "Material" },
    { id: "test", label: "Test type" },
  ];

  if (isCompressiveStrengthTest && hasExistingTests) {
    steps.push({ id: "existing", label: "Select test" });
  }

  // Skip project step only if an existing test instance has been selected
  if (!existingTestSelected) {
    steps.push({ id: "project", label: "Project" });
  }

  steps.push(
    { id: "sample", label: isCompressiveStrengthTest ? "Concrete cube details" : "Sample" },
    { id: "entry", label: "Record" },
  );

  return steps;
};

interface WizardState {
  material: Material | null;
  testKey: string | null;
  projectId: number | null;
  templateProjectId: number | null;
  projectName: string;
  clientName: string;
  projectDate: string;
  contractor: string;
  county: string;
  submittedBy: string;
  dateSubmitted: string;
  customFields: Array<{ name: string; value: string }>;
  sampleId: string;
  sampleNo: string;
  sampleDepthFrom: string;
  sampleDepthTo: string;
  sampledSubmittedBy: string;
  sampleDateSubmitted: string;
  sampleDateTested: string;
  sampleNotes: string;
  cement: string;
  fineAggregate: string;
  coarseAggregate: string;
  concreteClass: string;
  section: string;
  madeBy: string;
  slump: string;
  clientRef: string;
  dateTested: string;
}

const STORAGE_KEY = "cransfield_record_wizard";

const emptyState: WizardState = {
  material: null,
  testKey: null,
  projectId: null,
  templateProjectId: null,
  projectName: "",
  clientName: "",
  projectDate: new Date().toISOString().split("T")[0],
  contractor: "",
  county: "",
  submittedBy: "",
  dateSubmitted: new Date().toISOString().split("T")[0],
  customFields: [],
  sampleId: "",
  sampleNo: "",
  sampleDepthFrom: "",
  sampleDepthTo: "",
  sampledSubmittedBy: "Cransfield",
  sampleDateSubmitted: "",
  sampleDateTested: "",
  sampleNotes: "",
  cement: "",
  fineAggregate: "",
  coarseAggregate: "",
  concreteClass: "",
  section: "",
  madeBy: "",
  slump: "",
  clientRef: "",
  dateTested: new Date().toISOString().split("T")[0],
};


interface CompressiveTestRow {
  id: number;
  project_id: number;
  test_key: string;
  date_tested: string;
  cement: string;
  fine_aggregate: string;
  coarse_aggregate: string;
  contractor: string;
  concrete_class: string;
  section: string;
  made_by: string;
  slump: string;
  client_ref: string;
  created_at: string;
  updated_at: string;
}

const getExpectedTestType = (testKey: string | null): string | null => {
  if (testKey === "atterberg") return "atterberg";
  if (testKey === "grading") return "grading";
  if (testKey === "compressive") return "compressive";
  return null;
};

const filterProjectsByTestType = (projects: ApiProjectRow[], expectedTestType: string | null): ApiProjectRow[] => {
  if (!expectedTestType) return projects;
  return projects.filter(p => !p.test_type || p.test_type === expectedTestType);
};

const RecordTestWizard = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialMaterial = searchParams.get("material") as Material | null;
  const initialTest = searchParams.get("test") as string | null;
  const projectIdParam = searchParams.get("projectId");
  const projectIdFromParam = projectIdParam ? parseInt(projectIdParam, 10) : null;
  const testData = useTestData();

  useEffect(() => {
    void testData.refreshTestDefinitions();
  }, [testData.refreshTestDefinitions]);

  const [authChecking, setAuthChecking] = useState(true);

  // Validate session against backend on mount. A local token is not enough —
  // it may be stale (backend session expired), in which case downstream API
  // calls fail and the user gets bounced mid-wizard.
  useEffect(() => {
    let active = true;
    const checkAuth = async () => {
      const redirectToLogin = () => {
        setSessionToken(null);
        const next = encodeURIComponent(location.pathname + location.search);
        navigate(`/login?next=${next}`, { replace: true });
      };
      try {
        const user = await fetchCurrentUser(15000); // Increased timeout to 15 seconds
        if (!active) return;
        if (user) {
          setAuthChecking(false);
          return;
        }
        redirectToLogin();
      } catch (error) {
        if (!active) return;
        console.warn("[RecordTestWizard] Auth check failed:", error instanceof Error ? error.message : error);
        redirectToLogin();
      }
    };
    checkAuth();
    return () => { active = false; };
  }, [navigate]);

  const [state, setState] = useState<WizardState>(() => {
    const defaults = { ...emptyState, material: initialMaterial, testKey: initialTest };
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) return { ...defaults, ...JSON.parse(raw) } as WizardState;
    } catch {}
    return defaults;
  });

  // If both material and test are pre-selected via query params, skip to project step
  const [step, setStep] = useState(0);
  const [projects, setProjects] = useState<ApiProjectRow[]>([]);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [projectsLoadError, setProjectsLoadError] = useState<string | null>(null);
  const [projectsReloadKey, setProjectsReloadKey] = useState(0);
  const [compressiveTests, setCompressiveTests] = useState<CompressiveTestRow[]>([]);
  const [loadingCompressiveTests, setLoadingCompressiveTests] = useState(false);
  const [compressiveTestsError, setCompressiveTestsError] = useState<string | null>(null);
  const [selectedExistingTestId, setSelectedExistingTestId] = useState<number | null>(null);
  const [showTestDetails, setShowTestDetails] = useState(false);

  // Persist
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {}
  }, [state]);

  // Preload project from URL parameter when component mounts
  useEffect(() => {
    if (authChecking) return;
    if (!projectIdFromParam) return;
    let active = true;
    const preloadProjectFromParam = async () => {
      try {
        console.log(`[RecordTestWizard] Preloading project from URL param: ${projectIdFromParam}`);
        const fullProject = await fetchFullProject(projectIdFromParam);

        if (!active) return;

        // Update wizard state with project data
        setState((prev) => ({
          ...prev,
          projectId: fullProject.id,
          templateProjectId: prev.testKey === "grading" ? fullProject.id : null,
          projectName: fullProject.name,
          clientName: fullProject.client_name || "",
          projectDate: fullProject.project_date || prev.projectDate,
          contractor: (fullProject as any).contractor || prev.contractor,
          county: (fullProject as any).county || prev.county,
          submittedBy: fullProject.submitted_by || prev.submittedBy,
          dateSubmitted: fullProject.date_submitted || prev.dateSubmitted,
          customFields: Array.isArray(fullProject.custom_fields) ? fullProject.custom_fields : prev.customFields,
        }));

        // Update context with complete metadata
        testData.updateProjectMetadata({
          projectName: fullProject.name,
          clientName: fullProject.client_name || "",
          projectDate: fullProject.project_date || "",
          labOrganization: fullProject.lab_organization || "",
          dateReported: fullProject.date_reported || "",
          checkedBy: fullProject.checked_by || "",
          contractor: (fullProject as any).contractor || "",
          county: (fullProject as any).county || "",
          submittedBy: fullProject.submitted_by || "",
          dateSubmitted: fullProject.date_submitted || "",
          customFields: Array.isArray(fullProject.custom_fields) ? fullProject.custom_fields : [],
        });

        console.log(`[RecordTestWizard] ✓ Project preloaded from URL param`);
      } catch (error) {
        if (!active) return;
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.warn(`[RecordTestWizard] Failed to preload project from URL param:`, errorMsg);
        toast.error("Couldn't load project from URL");
      }
    };
    preloadProjectFromParam();
    return () => { active = false; };
  }, [projectIdFromParam, authChecking, testData]);

  // Load compressive tests when selecting compressive strength test
  useEffect(() => {
    if (authChecking) return;
    const isCompressiveStrengthTest = state.testKey === "compressive";
    if (!isCompressiveStrengthTest) {
      setCompressiveTests([]);
      setCompressiveTestsError(null);
      return;
    }

    let active = true;
    setLoadingCompressiveTests(true);
    setCompressiveTestsError(null);

    listCompressiveTests()
      .then((res) => {
        if (!active) return;
        setCompressiveTests(res.data || []);
      })
      .catch((err) => {
        if (!active) return;
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[RecordTestWizard] Failed to load compressive tests:", msg);
        setCompressiveTestsError(msg || "Couldn't load compressive tests");
        toast.error("Couldn't load compressive tests");
      })
      .finally(() => active && setLoadingCompressiveTests(false));

    return () => { active = false; };
  }, [authChecking, state.material, state.testKey]);

  const update = <K extends keyof WizardState>(key: K, value: WizardState[K]) => {
    setState((prev) => ({ ...prev, [key]: value }));
  };

  const materialOptions = useMemo(() => {
    const categories = new Set(testData.testDefinitions
      .filter((definition) => definition.enabled !== false && definition.enabled !== 0)
      .map((definition) => definition.category));
    return (Object.keys(MATERIAL_PRESENTATION) as Material[])
      .filter((category) => categories.has(category))
      .map((category) => ({ id: category, ...MATERIAL_PRESENTATION[category] }));
  }, [testData.testDefinitions]);

  useEffect(() => {
    if (testData.testDefinitionsLoading) return;
    const selectedDefinition = testData.testDefinitions.find(
      (definition) => definition.test_key === state.testKey && definition.category === state.material,
    );
    const selectedDefinitionEnabled = selectedDefinition && selectedDefinition.enabled !== false && selectedDefinition.enabled !== 0;
    if (state.testKey && (!selectedDefinitionEnabled || !registry.hasTest(state.testKey))) {
      setState((prev) => ({ ...prev, material: null, testKey: null }));
      setStep(0);
      return;
    }
    if (!testData.testDefinitionsError && initialMaterial && initialTest && selectedDefinitionEnabled && registry.hasTest(initialTest)) {
      setStep(2);
    }
  }, [testData.testDefinitionsLoading, testData.testDefinitions, testData.testDefinitionsError, state.material, state.testKey, initialMaterial, initialTest]);

  const tests = useMemo<TestOption[]>(() => {
    if (!state.material) return [];
    return testData.testDefinitions
      .filter((definition) => definition.category === state.material && definition.enabled !== false && definition.enabled !== 0)
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
      .map((definition) => ({
        key: definition.test_key,
        name: definition.name,
        isRegistered: registry.hasTest(definition.test_key),
      }));
  }, [state.material, testData.testDefinitions]);

  const isCompressiveStrengthTest = state.testKey === "compressive";
  const isGradingTest = state.testKey === "grading";
  const hasExistingCompressiveTests = isCompressiveStrengthTest && compressiveTests.length > 0;
  const steps = getSteps(state.testKey, hasExistingCompressiveTests, selectedExistingTestId);

  const canAdvance = useMemo(() => {
    const currentStepId = steps[step]?.id;

    switch (currentStepId) {
      case "material": return !!state.material;
      case "test": return !!state.testKey;
      case "existing":
        // If an existing test is selected, contractor and county must be filled in accordion
        if (selectedExistingTestId !== null) {
          return state.contractor.trim().length > 0 && state.county.trim().length > 0;
        }
        // If creating new test, can advance without contractor/county (they're in Project step)
        return true;
      case "project":
        if (isGradingTest) {
          return state.projectId !== null
            && (state.templateProjectId === null || (
              state.projectName.trim().length > 0
              && state.clientName.trim().length > 0
              && state.contractor.trim().length > 0
              && state.county.trim().length > 0
            ));
        }
        if (isCompressiveStrengthTest) {
          return state.projectId !== null && state.contractor.trim().length > 0 && state.county.trim().length > 0;
        }
        return state.projectId !== null;
      case "sample":
        if (isCompressiveStrengthTest) {
          return state.cement.trim().length > 0;
        }
        if (isGradingTest) {
          return state.sampleId.trim().length > 0
            && state.sampleNo.trim().length > 0
            && state.sampleDepthFrom.trim().length > 0
            && state.sampleDepthTo.trim().length > 0
            && state.sampledSubmittedBy.trim().length > 0
            && state.sampleDateSubmitted.trim().length > 0
            && state.sampleDateTested.trim().length > 0;
        }
        return state.sampleId.trim().length > 0 && state.sampleDepthFrom.trim().length > 0 && state.sampleDepthTo.trim().length > 0;
      case "entry": return true;
      default: return false;
    }
  }, [step, steps, state, isCompressiveStrengthTest, isGradingTest, selectedExistingTestId]);

  // Load projects when reaching project step (and after retry)
  useEffect(() => {
    if (authChecking) return;
    const stepMap: Record<string, number> = { material: 0, test: 1, existing: 2, project: 3, sample: 4, entry: 5 };
    const currentStepId = steps[step]?.id;
    const projectStepIndex = steps.findIndex((s) => s.id === "project");
    if (step !== projectStepIndex) return;
    if (projects.length > 0 && projectsReloadKey === 0) return;
    let active = true;
    setLoadingProjects(true);
    setProjectsLoadError(null);
    const expectedTestType = getExpectedTestType(state.testKey);
    listRecords<ApiProjectRow>("projects", { limit: 100 })
      .then((res) => {
        if (!active) return;
        const allProjects = res.data || [];
        const filteredProjects = filterProjectsByTestType(allProjects, expectedTestType);
        if (active) setProjects(filteredProjects);
      })
      .catch((err) => {
        if (!active) return;
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[RecordTestWizard] Failed to load projects:", msg);
        // 401 is handled globally (token cleared in apiRequest); send user back to login
        if (/401|unauthor/i.test(msg)) {
          const next = encodeURIComponent(location.pathname + location.search);
          navigate(`/login?next=${next}`, { replace: true });
          return;
        }
        setProjectsLoadError(msg || "Couldn't load projects");
        toast.error("Couldn't load projects");
      })
      .finally(() => active && setLoadingProjects(false));
    return () => { active = false; };
  }, [step, projectsReloadKey, authChecking, navigate, state.material, state.testKey, steps]);

  const handleNext = () => {
    if (step < steps.length - 1) setStep(step + 1);
  };

  const handleBack = () => {
    if (step > 0) setStep(step - 1);
    else handleCancel();
  };

  const handleCancel = () => {
    sessionStorage.removeItem(STORAGE_KEY);
    navigate(-1);
  };

  const resetNewProjectForm = () => {
    setState((prev) => ({
      ...prev,
      projectId: null,
      templateProjectId: null,
      projectName: "",
      clientName: "",
      projectDate: "",
      contractor: "",
      county: "",
      submittedBy: "",
      dateSubmitted: "",
      customFields: [],
    }));
  };

  const openNewProjectDialog = () => {
    resetNewProjectForm();
    setNewProjectOpen(true);
  };

  const cancelNewProject = () => {
    setNewProjectOpen(false);
    resetNewProjectForm();
  };

  const handleCreateProject = async () => {
    const hasRequiredFields = state.projectName.trim().length > 0
      && state.clientName.trim().length > 0
      && (!(isCompressiveStrengthTest || isGradingTest) || (state.contractor.trim().length > 0 && state.county.trim().length > 0));
    if (!hasRequiredFields) return;

    setIsCreatingProject(true);
    try {
      const projectPayload: Record<string, unknown> = {
        name: state.projectName.trim(),
        client_name: state.clientName.trim(),
        project_date: state.projectDate || null,
        test_type: getExpectedTestType(state.testKey),
      };

      if (isCompressiveStrengthTest || isGradingTest) {
        projectPayload.contractor = state.contractor.trim();
        projectPayload.county = state.county.trim();
        projectPayload.submitted_by = state.submittedBy.trim();
        projectPayload.date_submitted = state.dateSubmitted || null;
        projectPayload.custom_fields = state.customFields
          .filter((field) => field.name.trim() || field.value.trim())
          .map((field) => ({ name: field.name.trim(), value: field.value.trim() }));
      }

      const response = await createRecord<{ id: number }>("projects", projectPayload);
      const projectId = response.data?.id;
      if (!projectId) throw new Error("Project creation returned no ID");

      setState((prev) => ({
        ...prev,
        projectId,
        projectName: state.projectName.trim(),
        clientName: state.clientName.trim(),
      }));
      setProjects((prev) => [{
        id: projectId,
        name: state.projectName.trim(),
        client_name: state.clientName.trim(),
        project_date: state.projectDate || null,
        test_type: getExpectedTestType(state.testKey),
      }, ...prev.filter((project) => project.id !== projectId)]);
      testData.updateProjectMetadata({
        projectName: state.projectName.trim(),
        clientName: state.clientName.trim(),
        projectDate: state.projectDate,
        currentProjectId: projectId,
        contractor: state.contractor,
        county: state.county,
        submittedBy: state.submittedBy,
        dateSubmitted: state.dateSubmitted,
        customFields: state.customFields,
      });
      setNewProjectOpen(false);
      if (isGradingTest) {
        const sampleStepIndex = steps.findIndex((wizardStep) => wizardStep.id === "sample");
        setStep(sampleStepIndex);
      }
      toast.success("Project created");
    } catch (error) {
      console.error("[RecordTestWizard] Failed to create project:", error);
      toast.error("Failed to create project");
    } finally {
      setIsCreatingProject(false);
    }
  };

  const canCreateProject = state.projectName.trim().length > 0
    && state.clientName.trim().length > 0
    && (!(isCompressiveStrengthTest || isGradingTest) || (state.contractor.trim().length > 0 && state.county.trim().length > 0));

  const handleFinish = async () => {
    let finalProjectId = state.projectId;
    let sourceProjectId: number | null = null;

    if (isGradingTest && state.templateProjectId !== null) {
      try {
        const createResponse = await createRecord<{ id: number }>("projects", {
          name: state.projectName.trim(),
          client_name: state.clientName.trim(),
          project_date: state.projectDate || null,
          test_type: "grading",
          contractor: state.contractor.trim(),
          county: state.county.trim(),
          submitted_by: state.submittedBy.trim(),
          date_submitted: state.dateSubmitted || null,
          custom_fields: state.customFields,
        });
        finalProjectId = createResponse.data?.id ?? null;
        if (!finalProjectId) {
          toast.error("Failed to create project");
          return;
        }
        sourceProjectId = state.templateProjectId;
      } catch (error) {
        console.error("[RecordTestWizard] Failed to create project from template:", error);
        toast.error("Failed to create project");
        return;
      }
    }

    if (isCompressiveStrengthTest && finalProjectId === null) {
      try {
        const createResponse = await createRecord<{ id: number }>("projects", {
          name: state.projectName,
          client_name: state.clientName,
          project_date: state.projectDate,
          contractor: state.contractor,
          county: state.county,
          test_type: getExpectedTestType(state.testKey),
        });
        finalProjectId = createResponse.data?.id ?? null;
        if (!finalProjectId) {
          toast.error("Failed to create project");
          return;
        }
      } catch (error) {
        console.error("[RecordTestWizard] Failed to create project:", error);
        toast.error("Failed to create project");
        return;
      }
    }

    // Push project info into TestDataContext so the test screens have it
    const projectMetadata: any = {
      projectName: state.projectName,
      clientName: state.clientName,
      projectDate: state.projectDate,
      currentProjectId: finalProjectId,
      contractor: state.contractor,
      county: state.county,
      submittedBy: state.submittedBy,
      dateSubmitted: state.dateSubmitted,
      customFields: state.customFields,
    };

    testData.updateProjectMetadata(projectMetadata);

    if (isGradingTest) {
      testData.updateRecordMetadata("grading", {
        sampleId: state.sampleId,
        sampleNumber: state.sampleNo,
        sampleDepthFrom: state.sampleDepthFrom,
        sampleDepthTo: state.sampleDepthTo,
        sampledSubmittedBy: state.sampledSubmittedBy,
        sampleNotes: state.sampleNotes,
        dateSubmitted: state.sampleDateSubmitted,
        dateTested: state.sampleDateTested,
        testedBy: state.sampledSubmittedBy,
      });
    }

    // If concrete material, also push concrete test details to context
    if (isCompressiveStrengthTest) {
      const concreteMetadata: any = {
        cement: state.cement,
        fineAggregate: state.fineAggregate,
        coarseAggregate: state.coarseAggregate,
        concreteClass: state.concreteClass,
        section: state.section,
        madeBy: state.madeBy,
        slump: state.slump,
        clientRef: state.clientRef,
        dateTested: state.dateTested,
        sampleId: state.sampleId,
      };

      if (!isCompressiveStrengthTest) {
        concreteMetadata.contractor = state.contractor;
      }

      testData.updateConcreteTestMetadata(concreteMetadata);
    }

    sessionStorage.removeItem(STORAGE_KEY);
    toast.success(`Started ${tests.find((t) => t.key === state.testKey)?.name ?? "test"} record`);
    const fromExisting = finalProjectId !== null;
    const sourceParam = sourceProjectId !== null ? `&sourceProjectId=${sourceProjectId}` : "";
    const suffix = fromExisting ? `?newRecord=1&fromProject=${finalProjectId}${sourceParam}` : "";
    navigate(`/tests${suffix}#${state.testKey}`);
  };

  // Pick existing compressive test and populate wizard state
  const selectCompressiveTest = (testId: number) => {
    const test = compressiveTests.find((t) => t.id === testId);
    if (!test) return;

    setSelectedExistingTestId(testId);
    setShowTestDetails(true);
    // Auto-expand test details accordion so user can fill in contractor/county
    setTimeout(() => setShowTestDetails(true), 0);

    // Populate state with test data
    setState((prev) => ({
      ...prev,
      projectId: test.project_id,
      cement: test.cement,
      fineAggregate: test.fine_aggregate,
      coarseAggregate: test.coarse_aggregate,
      contractor: test.contractor,
      concreteClass: test.concrete_class,
      section: test.section,
      madeBy: test.made_by,
      slump: test.slump,
      clientRef: test.client_ref,
      dateTested: test.date_tested,
    }));

    // Load full project data in the background
    (async () => {
      try {
        const fullProject = await fetchFullProject(test.project_id);
        setState((prev) => ({
          ...prev,
          projectId: fullProject.id,
          projectName: fullProject.name,
          clientName: fullProject.client_name || "",
          projectDate: fullProject.project_date || prev.projectDate,
        }));
        testData.updateProjectMetadata({
          projectName: fullProject.name,
          clientName: fullProject.client_name || "",
          projectDate: fullProject.project_date || "",
          currentProjectId: fullProject.id,
          contractor: test.contractor,
          county: (fullProject as any).county || "",
        });
      } catch (error) {
        console.warn("[RecordTestWizard] Failed to load project for selected test:", error);
        toast.error("Couldn't load project details");
      }
    })();
  };

  // Create new compressive test (deselect existing) and advance directly to sample step
  const createNewCompressiveTest = () => {
    setSelectedExistingTestId(null);
    setShowTestDetails(false);
    setState((prev) => ({
      ...prev,
      projectId: null,
      cement: "",
      fineAggregate: "",
      coarseAggregate: "",
      contractor: "",
      concreteClass: "",
      section: "",
      madeBy: "",
      slump: "",
      clientRef: "",
      dateTested: new Date().toISOString().split("T")[0],
    }));
    // Skip Project step and go directly to Sample step
    setTimeout(() => {
      const sampleStepIndex = steps.findIndex((s) => s.id === "sample");
      setStep(sampleStepIndex !== -1 ? sampleStepIndex : step + 1);
    }, 0);
  };

  const pickProject = (id: number) => {
    const p = projects.find((x) => x.id === id);
    if (!p) return;

    setState((prev) => ({
      ...prev,
      projectId: p.id,
      templateProjectId: isGradingTest ? p.id : null,
      projectName: p.name,
      clientName: p.client_name || "",
      projectDate: p.project_date || prev.projectDate,
      contractor: "",
      county: "",
    }));

    testData.updateProjectMetadata({
      projectName: p.name,
      clientName: p.client_name || "",
      projectDate: p.project_date || "",
    });

    // Background: load full project record to get contractor/county and sync into both state and context
    (async () => {
      try {
        const fullProject = await fetchFullProject(id);
        setState((prev) => ({
          ...prev,
          projectName: fullProject.name,
          clientName: fullProject.client_name || "",
          projectDate: fullProject.project_date || prev.projectDate,
          contractor: (fullProject as any).contractor || prev.contractor,
          county: (fullProject as any).county || prev.county,
          submittedBy: fullProject.submitted_by || prev.submittedBy,
          dateSubmitted: fullProject.date_submitted || prev.dateSubmitted,
          customFields: Array.isArray(fullProject.custom_fields) ? fullProject.custom_fields : prev.customFields,
        }));
        testData.updateProjectMetadata({
          projectName: fullProject.name,
          clientName: fullProject.client_name || "",
          projectDate: fullProject.project_date || "",
          labOrganization: fullProject.lab_organization || "",
          dateReported: fullProject.date_reported || "",
          checkedBy: fullProject.checked_by || "",
          contractor: (fullProject as any).contractor || "",
          county: (fullProject as any).county || "",
          submittedBy: fullProject.submitted_by || "",
          dateSubmitted: fullProject.date_submitted || "",
          customFields: Array.isArray(fullProject.custom_fields) ? fullProject.custom_fields : [],
        });
      } catch (error) {
        console.warn("[RecordTestWizard] Background project preload failed:", error);
      }
    })();
  };

  if (authChecking) {
    return (
      <div className="min-h-svh flex items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Checking your session…</p>
      </div>
    );
  }

  const handleLogout = async () => {
    try {
      await logoutUser();
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      setSessionToken(null);
      navigate("/login", { replace: true });
    }
  };

  return (
    <SidebarProvider>
      <Navigation
        currentView="tests"
        onViewChange={() => {}}
        onLogout={handleLogout}
        userName=""
        userEmail=""
      />
      <SidebarInset className="flex flex-col min-h-svh">
        {/* Header */}
        <header className="border-b sticky top-0 z-10" style={{ borderColor: "#E3E1D9", backgroundColor: "#FFFFFF" }}>
          <div className="px-4 md:px-6 py-3">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <SidebarTrigger className="h-9 w-9" />
                <div className="hidden sm:block">
                  <h1 className="text-base font-semibold text-foreground tracking-tight leading-tight">Record test</h1>
                  <p className="text-xs text-muted-foreground leading-tight">
                    Cransfield Geotechnical Laboratory
                  </p>
                </div>
              </div>
            </div>
          </div>
          <div className="px-4 md:px-8 pb-4 max-w-5xl mx-auto w-full">
            <WizardStepper
              steps={steps}
              currentIndex={step}
              onStepClick={setStep}
              disabledSteps={state.material !== "soil" ? [1, 2, 3, 4] : []}
            />
          </div>
        </header>

        {/* Body */}
        <main className="flex-1 overflow-y-auto px-0 py-4">
          <div className="w-full md:max-w-6xl md:mx-auto md:px-4">
            <div className="px-4 md:px-0">
              {step === 0 && (
          <section className="space-y-6 animate-fade-in">
            <div className="text-center">
              <h2 className="text-2xl font-semibold tracking-tight">What are you testing?</h2>
              <p className="text-sm text-muted-foreground mt-1">Pick the material you'll be working with.</p>
            </div>
            <FormCard>
              <div className="grid grid-cols-1 gap-4 mx-auto">
                {testData.testDefinitionsLoading ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">Loading test options…</p>
                ) : testData.testDefinitionsError ? (
                  <p className="py-8 text-center text-sm text-destructive">Could not load test options: {testData.testDefinitionsError}</p>
                ) : materialOptions.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">No enabled tests are currently available.</p>
                ) : materialOptions.map((mat) => {
                  const selected = state.material === mat.id;
                  return (
                    <button
                      key={mat.id}
                      type="button"
                      onClick={() => {
                        update("material", mat.id);
                        setTimeout(() => setStep(1), 0);
                      }}
                      className={cn(
                        "text-left rounded-2xl border-2 p-6 bg-card transition-all hover:border-primary/50 hover:shadow-sm",
                        selected ? "border-primary ring-2 ring-primary/20" : "border-border",
                      )}
                    >
                      <div className="flex items-center gap-4">
                        <span className="text-4xl">{mat.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-lg font-semibold text-foreground">{mat.label}</h3>
                          <p className="text-sm text-muted-foreground mt-0.5">{testData.testDefinitions.filter((definition) => definition.category === mat.id && definition.enabled !== false && definition.enabled !== 0).length} available tests</p>
                        </div>
                        <ArrowRight className={cn("h-5 w-5 transition-colors", selected ? "text-primary" : "text-muted-foreground")} />
                      </div>
                    </button>
                  );
                })}
              </div>
            </FormCard>
          </section>
              )}

              {step === 1 && (
                <section className="space-y-6 animate-fade-in max-w-2xl">
                  <div>
                    <h2 className="text-2xl font-semibold tracking-tight">Choose the test</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      Available tests for {state.material ? MATERIAL_PRESENTATION[state.material].label : "this material"}.
                    </p>
                  </div>
                  {testData.testDefinitionsLoading ? (
                    <div className="rounded-xl border border-border bg-card py-12 text-center text-sm text-muted-foreground">Loading test options…</div>
                  ) : testData.testDefinitionsError ? (
                    <div className="rounded-xl border border-border bg-card py-12 text-center text-sm text-destructive">Could not load test options: {testData.testDefinitionsError}</div>
                  ) : tests.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card py-12 text-center">
                      <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
                        <Layers className="h-6 w-6 text-muted-foreground" />
                      </div>
                      <p className="text-lg font-medium text-foreground mb-1">
                        No enabled tests
                      </p>
                      <p className="text-sm text-muted-foreground">
                        There are no enabled test definitions for this category.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {tests.map((t) => {
                        const selected = state.testKey === t.key;
                        const isDisabled = !t.isRegistered;
                        return (
                          <button
                            key={t.key}
                            type="button"
                            disabled={isDisabled}
                            onClick={() => {
                              if (isDisabled) return;
                              update("testKey", t.key);
                              setTimeout(() => setStep(step + 1), 0);
                            }}
                            className={cn(
                              "group flex w-full items-center gap-3 rounded-xl border bg-card px-4 py-3 text-left transition-colors",
                              "border-border hover:border-primary/50 hover:bg-accent/30",
                              selected && "border-primary bg-primary/5",
                              isDisabled && "cursor-not-allowed opacity-50 hover:border-border hover:bg-card",
                            )}
                          >
                            <div className={cn(
                              "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                              selected ? "bg-primary text-primary-foreground" : "bg-accent text-accent-foreground",
                            )}>
                              <FlaskConical className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <h3 className="text-sm font-semibold text-foreground">{t.name}</h3>
                              {!t.isRegistered && <p className="mt-0.5 text-xs leading-snug text-muted-foreground">Test component unavailable</p>}
                            </div>
                            <ArrowRight className={cn(
                              "h-4 w-4 shrink-0 text-muted-foreground transition-colors",
                              selected && "text-primary",
                              !isDisabled && "group-hover:text-primary",
                            )} />
                          </button>
                        );
                      })}
                    </div>
                  )}
                </section>
              )}

              {steps[step]?.id === "existing" && (
                <section className="space-y-6 animate-fade-in max-w-2xl">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Select test to edit</h2>
              <p className="text-sm text-muted-foreground mt-1">Choose an existing compressive strength test to edit, or create a new one.</p>
            </div>

            <FormCard>
              {loadingCompressiveTests ? (
                <div className="flex items-center justify-center py-8">
                  <div className="text-center">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Loading tests…</p>
                  </div>
                </div>
              ) : compressiveTestsError ? (
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-destructive">{compressiveTestsError}</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setLoadingCompressiveTests(true);
                      setCompressiveTestsError(null);
                      listCompressiveTests()
                        .then((res) => {
                          setCompressiveTests(res.data || []);
                        })
                        .catch((err) => {
                          setCompressiveTestsError(err instanceof Error ? err.message : String(err));
                        })
                        .finally(() => setLoadingCompressiveTests(false));
                    }}
                  >
                    Retry
                  </Button>
                </div>
              ) : compressiveTests.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
                    <Layers className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="text-lg font-medium text-foreground mb-1">No tests found</p>
                  <p className="text-sm text-muted-foreground mb-4">No existing compressive strength tests. Create a new one.</p>
                  <Button type="button" onClick={createNewCompressiveTest}>Create new test</Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Existing tests</Label>
                    <Select value={selectedExistingTestId ? String(selectedExistingTestId) : ""} onValueChange={(value) => selectCompressiveTest(Number(value))}>
                      <SelectTrigger className="h-11">
                        <SelectValue placeholder="Select a test to edit" />
                      </SelectTrigger>
                      <SelectContent>
                        {compressiveTests.map((test) => (
                          <SelectItem key={test.id} value={String(test.id)}>
                            <div className="flex flex-col">
                              <span>{test.client_ref || `Test #${test.id}`}</span>
                              <span className="text-xs text-muted-foreground">
                                {test.contractor} • {test.date_tested}
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedExistingTestId !== null && (
                    <Accordion value={showTestDetails ? "test-details" : ""} onValueChange={(v) => setShowTestDetails(v === "test-details")}>
                      <AccordionItem value="test-details">
                        <AccordionTrigger className="text-sm font-medium">Test details</AccordionTrigger>
                        <AccordionContent className="pt-4">
                          <div className="space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div className="space-y-2">
                                <Label htmlFor="test-contractor">Contractor *</Label>
                                <Input id="test-contractor" value={state.contractor} onChange={(e) => update("contractor", e.target.value)} placeholder="e.g. BuildWell Contractors Ltd" />
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="test-county">County *</Label>
                                <Input id="test-county" value={state.county} onChange={(e) => update("county", e.target.value)} placeholder="e.g. Nairobi" />
                              </div>
                            </div>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  )}

                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-xs uppercase tracking-wider text-muted-foreground">or</span>
                    <div className="flex-1 h-px bg-border" />
                  </div>

                  <Button type="button" variant="outline" className="w-full justify-start gap-2 h-11" onClick={createNewCompressiveTest}>
                    <Plus className="h-4 w-4" /> Create new test
                  </Button>
                </div>
              )}
            </FormCard>
          </section>
              )}

              {steps[step]?.id === "project" && (
                <section className="space-y-6 animate-fade-in max-w-2xl">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Project</h2>
              <p className="text-sm text-muted-foreground mt-1">{isGradingTest ? "Use an existing project as a template or create a new one." : "Pick an existing project or create a new one."}</p>
            </div>

            <FormCard>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Existing project</Label>
                  <Select
                    value={state.projectId ? String(state.projectId) : ""}
                    onValueChange={(v) => pickProject(Number(v))}
                    disabled={loadingProjects || !!projectsLoadError || projects.length === 0}
                  >
                    <SelectTrigger className="h-11">
                      {loadingProjects ? (
                        <div className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          <span className="text-muted-foreground">Loading projects…</span>
                        </div>
                      ) : state.projectId ? (
                        <div className="flex items-center gap-2">
                          <FolderOpen className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{state.projectName}</span>
                          <span className="text-xs text-muted-foreground">
                            · {state.clientName || "No client"}{state.projectDate ? ` · ${state.projectDate}` : ""}
                          </span>
                        </div>
                      ) : (
                        <SelectValue placeholder={projectsLoadError ? "Couldn't load projects" : projects.length === 0 ? "No saved projects yet" : "Select an existing project"} />
                      )}
                    </SelectTrigger>
                    <SelectContent>
                      {projects.map((p) => (
                        <SelectItem key={p.id} value={String(p.id)}>
                          <div className="flex items-center gap-2">
                            <FolderOpen className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{p.name}</span>
                            <span className="text-xs text-muted-foreground">
                              · {p.client_name || "No client"}{p.project_date ? ` · ${p.project_date}` : ""}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {projectsLoadError ? (
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="text-destructive">{projectsLoadError}</span>
                      <Button type="button" variant="outline" size="sm" onClick={() => setProjectsReloadKey((k) => k + 1)}>Retry</Button>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">{isGradingTest ? "A separate project will be created for this record using the selected project as a template." : "Selecting an existing project opens it directly for editing."}</p>
                  )}
                </div>

                {isGradingTest && state.templateProjectId !== null && (
                  <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
                    <p className="text-sm font-medium">New project details</p>
                    <div className="space-y-2">
                      <Label htmlFor="template-project-name">Project name *</Label>
                      <Input id="template-project-name" value={state.projectName} onChange={(e) => update("projectName", e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="template-project-client">Client name *</Label>
                      <Input id="template-project-client" value={state.clientName} onChange={(e) => update("clientName", e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="template-project-date">Project date</Label>
                      <Input id="template-project-date" type="date" value={state.projectDate} onChange={(e) => update("projectDate", e.target.value)} />
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="template-project-contractor">Contractor *</Label>
                        <Input id="template-project-contractor" value={state.contractor} onChange={(e) => update("contractor", e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="template-project-county">County *</Label>
                        <Input id="template-project-county" value={state.county} onChange={(e) => update("county", e.target.value)} />
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs uppercase tracking-wider text-muted-foreground">or</span>
                  <div className="flex-1 h-px bg-border" />
                </div>

                <Button type="button" variant="outline" className="w-full justify-start gap-2 h-11" onClick={openNewProjectDialog}>
                  <Plus className="h-4 w-4" /> Create new project
                </Button>
              </div>
            </FormCard>
          </section>
              )}

              {steps[step]?.id === "sample" && (
                <section className="space-y-6 animate-fade-in max-w-2xl">
            {isCompressiveStrengthTest ? (
              <>
                <div>
                  <h2 className="text-2xl font-semibold tracking-tight">{isCompressiveStrengthTest ? "Concrete cube details" : "Test details"}</h2>
                  <p className="text-sm text-muted-foreground mt-1">Enter the concrete sample details.</p>
                </div>
                <FormCard>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs font-medium mb-1 block">Sample ID</Label>
                      <Input value={state.sampleId} onChange={(e) => update("sampleId", e.target.value)} className="h-10 text-sm" placeholder="e.g. BH-01 / S-3" />
                    </div>
                    <div>
                      <Label className="text-xs font-medium mb-1 block">Cement</Label>
                      <Input value={state.cement} onChange={(e) => update("cement", e.target.value)} className="h-10 text-sm" />
                    </div>
                    <div>
                      <Label className="text-xs font-medium mb-1 block">Fine Aggregate</Label>
                      <Input value={state.fineAggregate} onChange={(e) => update("fineAggregate", e.target.value)} className="h-10 text-sm" />
                    </div>
                    <div>
                      <Label className="text-xs font-medium mb-1 block">Coarse Aggregate</Label>
                      <Input value={state.coarseAggregate} onChange={(e) => update("coarseAggregate", e.target.value)} className="h-10 text-sm" />
                    </div>
                    {!isCompressiveStrengthTest && (
                      <div>
                        <Label className="text-xs font-medium mb-1 block">Contractor</Label>
                        <Input value={state.contractor} onChange={(e) => update("contractor", e.target.value)} className="h-10 text-sm" />
                      </div>
                    )}
                    <div>
                      <Label className="text-xs font-medium mb-1 block">Concrete Class</Label>
                      <Input value={state.concreteClass} onChange={(e) => update("concreteClass", e.target.value)} className="h-10 text-sm" />
                    </div>
                    <div>
                      <Label className="text-xs font-medium mb-1 block">Section</Label>
                      <Input value={state.section} onChange={(e) => update("section", e.target.value)} className="h-10 text-sm" />
                    </div>
                    <div>
                      <Label className="text-xs font-medium mb-1 block">Made By</Label>
                      <Input value={state.madeBy} onChange={(e) => update("madeBy", e.target.value)} className="h-10 text-sm" />
                    </div>
                    <div>
                      <Label className="text-xs font-medium mb-1 block">Slump</Label>
                      <Input value={state.slump} onChange={(e) => update("slump", e.target.value)} className="h-10 text-sm" />
                    </div>
                    <div>
                      <Label className="text-xs font-medium mb-1 block">Client Ref</Label>
                      <Input value={state.clientRef} onChange={(e) => update("clientRef", e.target.value)} className="h-10 text-sm" />
                    </div>
                    <div>
                      <Label className="text-xs font-medium mb-1 block">Date Tested</Label>
                      <Input type="date" value={state.dateTested} onChange={(e) => update("dateTested", e.target.value)} className="h-10 text-sm" />
                    </div>
                  </div>
                </FormCard>
              </>
            ) : isGradingTest ? (
              <>
                <div>
                  <h2 className="text-2xl font-semibold tracking-tight">Particle size distribution — sample details</h2>
                </div>
                <FormCard>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="grading-sample-id">Sample ID *</Label>
                      <Input
                        id="grading-sample-id"
                        value={state.sampleId}
                        onChange={(e) => update("sampleId", e.target.value)}
                        placeholder="e.g. BH04"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="grading-sample-no">Sample No. *</Label>
                      <Input
                        id="grading-sample-no"
                        value={state.sampleNo}
                        onChange={(e) => update("sampleNo", e.target.value)}
                        placeholder="e.g. 1"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="grading-depth-from">Sample Depth From (m) *</Label>
                      <Input
                        id="grading-depth-from"
                        value={state.sampleDepthFrom}
                        onChange={(e) => update("sampleDepthFrom", e.target.value)}
                        placeholder="e.g. 18.2"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="grading-depth-to">Sample Depth To (m) *</Label>
                      <Input
                        id="grading-depth-to"
                        value={state.sampleDepthTo}
                        onChange={(e) => update("sampleDepthTo", e.target.value)}
                        placeholder="e.g. 20.0"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="grading-sampled-submitted-by">Sampled &amp; Submitted by *</Label>
                      <Input
                        id="grading-sampled-submitted-by"
                        value={state.sampledSubmittedBy}
                        onChange={(e) => update("sampledSubmittedBy", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="grading-date-submitted">Date Submitted *</Label>
                      <Input
                        id="grading-date-submitted"
                        type="date"
                        value={state.sampleDateSubmitted}
                        onChange={(e) => update("sampleDateSubmitted", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="grading-date-tested">Date Tested *</Label>
                      <Input
                        id="grading-date-tested"
                        type="date"
                        value={state.sampleDateTested}
                        onChange={(e) => update("sampleDateTested", e.target.value)}
                      />
                    </div>
                  </div>
                </FormCard>
              </>
            ) : (
              <>
                <div>
                  <h2 className="text-2xl font-semibold tracking-tight">Sample setup</h2>
                  <p className="text-sm text-muted-foreground mt-1">Identify the sample you're testing.</p>
                </div>
                <FormCard>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="sample-id">Sample ID *</Label>
                      <Input
                        id="sample-id"
                        value={state.sampleId}
                        onChange={(e) => update("sampleId", e.target.value)}
                        placeholder="e.g. BH-01 / S-3"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label htmlFor="depth-from">Depth from *</Label>
                        <Input
                          id="depth-from"
                          value={state.sampleDepthFrom}
                          onChange={(e) => update("sampleDepthFrom", e.target.value)}
                          placeholder="e.g. 1.5-2.0"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="depth-to">Depth to *</Label>
                        <Input
                          id="depth-to"
                          value={state.sampleDepthTo}
                          onChange={(e) => update("sampleDepthTo", e.target.value)}
                          placeholder="e.g. 2.0"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="notes">Notes (optional)</Label>
                      <Textarea
                        id="notes"
                        value={state.sampleNotes}
                        onChange={(e) => update("sampleNotes", e.target.value)}
                        placeholder="Visual description, conditions…"
                        rows={4}
                      />
                    </div>
                  </div>
                </FormCard>
              </>
            )}
          </section>
              )}

              {steps[step]?.id === "entry" && (
                <section className="space-y-6 animate-fade-in max-w-2xl">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Ready to record</h2>
              <p className="text-sm text-muted-foreground mt-1">Review and start data entry.</p>
            </div>
            <Card>
              <CardContent className="p-5 space-y-3 text-sm">
                <Row label="Material" value={MATERIAL_OPTIONS.find((m) => m.id === state.material)?.label ?? "—"} />
                <Row label="Test" value={tests.find((t) => t.key === state.testKey)?.name ?? "—"} />
                <Row label="Project" value={state.projectName || "—"} />
                {state.clientName && <Row label="Client" value={state.clientName} />}
                <Row label="Sample ID" value={state.sampleId || "—"} />
                {(state.sampleDepthFrom || state.sampleDepthTo) && <Row label="Depth" value={`${state.sampleDepthFrom || "—"} to ${state.sampleDepthTo || "—"}`} />}
                {state.sampleNotes && <Row label="Notes" value={state.sampleNotes} />}
              </CardContent>
            </Card>
          </section>
              )}

              <div className="mt-6 flex w-full max-w-2xl items-center justify-between gap-3">
                <Button type="button" variant="outline" onClick={handleBack} className="gap-1.5">
                  <ArrowLeft className="h-4 w-4" /> {step === 0 ? "Cancel" : "Back"}
                </Button>
                {step < steps.length - 1 ? (
                  <Button type="button" onClick={handleNext} disabled={!canAdvance} className="gap-1.5">
                    Next <ArrowRight className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button type="button" onClick={handleFinish} className="gap-1.5">
                    Start recording <ArrowRight className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        </main>

        <Dialog
          open={newProjectOpen}
          onOpenChange={(open) => {
            if (open) {
              setNewProjectOpen(true);
            } else if (!isCreatingProject) {
              cancelNewProject();
            }
          }}
        >
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[520px]">
            <DialogHeader>
              <DialogTitle>New project</DialogTitle>
              <DialogDescription>Fill in the project details below.</DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="new-project-name">Project name *</Label>
                <Input
                  id="new-project-name"
                  value={state.projectName}
                  onChange={(e) => update("projectName", e.target.value)}
                  placeholder="e.g. Thika Road Bridge Foundation"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="new-project-client">Client name *</Label>
                <Input
                  id="new-project-client"
                  value={state.clientName}
                  onChange={(e) => update("clientName", e.target.value)}
                  placeholder="e.g. Kenya National Highways Authority"
                />
              </div>

              {!isGradingTest && (
                <div className="space-y-2">
                  <Label htmlFor="new-project-date">Project date</Label>
                  <Input
                    id="new-project-date"
                    type="date"
                    value={state.projectDate}
                    onChange={(e) => update("projectDate", e.target.value)}
                  />
                </div>
              )}

              {(isCompressiveStrengthTest || isGradingTest) && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="new-project-contractor">Contractor *</Label>
                    <Input
                      id="new-project-contractor"
                      value={state.contractor}
                      onChange={(e) => update("contractor", e.target.value)}
                      placeholder="e.g. BuildWell Contractors Ltd"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="new-project-county">County *</Label>
                    <Input
                      id="new-project-county"
                      value={state.county}
                      onChange={(e) => update("county", e.target.value)}
                      placeholder="e.g. Nairobi"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="new-project-submitted-by">Submitted by</Label>
                    <Input
                      id="new-project-submitted-by"
                      value={state.submittedBy}
                      onChange={(e) => update("submittedBy", e.target.value)}
                      placeholder="Name of submitting engineer"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="new-project-date-submitted">Date submitted</Label>
                    <Input
                      id="new-project-date-submitted"
                      type="date"
                      value={state.dateSubmitted}
                      onChange={(e) => update("dateSubmitted", e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Custom fields (optional)</Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setState((prev) => ({
                          ...prev,
                          customFields: [...prev.customFields, { name: "", value: "" }],
                        }))}
                      >
                        <Plus className="mr-1 h-3 w-3" /> Add custom field
                      </Button>
                    </div>
                    {state.customFields.map((field, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <Input
                          aria-label={`Custom field ${index + 1} name`}
                          placeholder="Field name"
                          value={field.name}
                          onChange={(e) => setState((prev) => ({
                            ...prev,
                            customFields: prev.customFields.map((item, itemIndex) => itemIndex === index ? { ...item, name: e.target.value } : item),
                          }))}
                        />
                        <Input
                          aria-label={`Custom field ${index + 1} value`}
                          placeholder="Field value"
                          value={field.value}
                          onChange={(e) => setState((prev) => ({
                            ...prev,
                            customFields: prev.customFields.map((item, itemIndex) => itemIndex === index ? { ...item, value: e.target.value } : item),
                          }))}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Remove custom field ${index + 1}`}
                          onClick={() => setState((prev) => ({
                            ...prev,
                            customFields: prev.customFields.filter((_, itemIndex) => itemIndex !== index),
                          }))}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={cancelNewProject} disabled={isCreatingProject}>
                Cancel
              </Button>
              <Button type="button" onClick={handleCreateProject} disabled={!canCreateProject || isCreatingProject}>
                {isCreatingProject ? "Creating…" : "Create project"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </SidebarInset>
    </SidebarProvider>
  );
};

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-start justify-between gap-4 py-1.5 border-b border-border last:border-0">
    <span className="text-muted-foreground">{label}</span>
    <span className="text-foreground font-medium text-right">{value}</span>
  </div>
);

export default RecordTestWizard;
