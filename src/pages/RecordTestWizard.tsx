import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, X, Mountain, Hammer, TestTubeDiagonal, FlaskConical, FolderOpen, Plus, Layers, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import WizardStepper, { type WizardStep } from "@/components/WizardStepper";
import FormCard from "@/components/wizard/FormCard";
import { listRecords, fetchCurrentUser, setSessionToken, logoutUser, fetchFullProject, createRecord, listCompressiveTests } from "@/lib/api";
import { type ApiProjectRow } from "@/types/api";
import { cn } from "@/lib/utils";
import { useTestData } from "@/context/TestDataContext";
import Navigation from "@/components/Navigation";
import { toast } from "sonner";

type Material = "soil" | "concrete" | "rock" | "special";

interface TestOption {
  key: string;
  name: string;
  description: string;
}

const MATERIAL_OPTIONS: { id: Material; label: string; emoji: string; description: string; icon: typeof Mountain }[] = [
  { id: "soil", label: "Soil", emoji: "🪨", description: "Atterberg, CBR, Compaction, Grading…", icon: Mountain },
  { id: "concrete", label: "Concrete", emoji: "🏗️", description: "Slump, Cubes, UPVT, Schmidt…", icon: Hammer },
  { id: "rock", label: "Rock", emoji: "⛰️", description: "UCS, Point Load, Porosity", icon: Mountain },
  { id: "special", label: "Special", emoji: "🧪", description: "SPT, DCP and field tests", icon: TestTubeDiagonal },
];

const TESTS_BY_MATERIAL: Record<Material, TestOption[]> = {
  soil: [
    { key: "atterberg", name: "Atterberg Limits", description: "Liquid limit, plastic limit, plasticity index, linear shrinkage" },
    { key: "grading", name: "Particle Size Distribution", description: "Sieve analysis and grading curve" },
    { key: "proctor", name: "Compaction (Proctor)", description: "Maximum dry density and optimum moisture" },
    { key: "cbr", name: "California Bearing Ratio", description: "Soaked / unsoaked CBR" },
    { key: "shear", name: "Direct Shear", description: "Cohesion and friction angle" },
    { key: "consolidation", name: "Consolidation", description: "One-dimensional settlement" },
  ],
  concrete: [
    { key: "slump", name: "Slump Test", description: "Workability of fresh concrete" },
    { key: "cubes", name: "Concrete Cubes", description: "Fresh & cured cube specimen records" },
    { key: "compressive", name: "Compressive Strength", description: "28-day cube/cylinder strength" },
    { key: "upvt", name: "Ultrasonic Pulse Velocity", description: "Non-destructive quality assessment" },
    { key: "schmidt", name: "Schmidt Hammer", description: "Surface hardness rebound" },
    { key: "coring", name: "Coring", description: "Core specimen records" },
  ],
  rock: [
    { key: "ucs", name: "Unconfined Compressive Strength", description: "Intact rock strength" },
    { key: "pointload", name: "Point Load Index", description: "Strength index Is(50)" },
    { key: "porosity", name: "Porosity & Density", description: "Bulk density and absorption" },
  ],
  special: [
    { key: "spt", name: "SPT", description: "Standard penetration test" },
    { key: "dcp", name: "DCP", description: "Dynamic cone penetrometer" },
  ],
};

const getSteps = (material: Material | null, testKey: string | null, hasExistingTests: boolean): WizardStep[] => {
  const isCompressiveStrengthTest = material === "concrete" && testKey === "compressive";
  const steps: WizardStep[] = [
    { id: "material", label: "Material" },
    { id: "test", label: "Test type" },
  ];

  if (isCompressiveStrengthTest && hasExistingTests) {
    steps.push({ id: "existing", label: "Select test" });
  }

  steps.push(
    { id: "project", label: "Project" },
    { id: "sample", label: isCompressiveStrengthTest ? "Concrete cube details" : "Sample" },
    { id: "entry", label: "Record" },
  );

  return steps;
};

interface WizardState {
  material: Material | null;
  testKey: string | null;
  projectId: number | null;
  projectName: string;
  clientName: string;
  projectDate: string;
  contractor: string;
  county: string;
  submittedBy: string;
  dateSubmitted: string;
  customFields: Array<{ name: string; value: string }>;
  sampleId: string;
  sampleDepthFrom: string;
  sampleDepthTo: string;
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
  projectName: "",
  clientName: "",
  projectDate: new Date().toISOString().split("T")[0],
  contractor: "",
  county: "",
  submittedBy: "",
  dateSubmitted: new Date().toISOString().split("T")[0],
  customFields: [],
  sampleId: "",
  sampleDepthFrom: "",
  sampleDepthTo: "",
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

const getExpectedTestType = (material: Material | null, testKey: string | null): string | null => {
  if (material === "soil" && testKey === "atterberg") return "atterberg";
  if (material === "concrete" && testKey === "compressive") return "compressive";
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
  const initialStep = initialMaterial && initialTest ? 2 : 0;
  const [step, setStep] = useState(initialStep);
  const [projects, setProjects] = useState<ApiProjectRow[]>([]);
  const [creatingNewProject, setCreatingNewProject] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [projectsLoadError, setProjectsLoadError] = useState<string | null>(null);
  const [projectsReloadKey, setProjectsReloadKey] = useState(0);
  const [compressiveTests, setCompressiveTests] = useState<CompressiveTestRow[]>([]);
  const [loadingCompressiveTests, setLoadingCompressiveTests] = useState(false);
  const [compressiveTestsError, setCompressiveTestsError] = useState<string | null>(null);
  const [selectedExistingTestId, setSelectedExistingTestId] = useState<number | null>(null);

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
          projectName: fullProject.name,
          clientName: fullProject.client_name || "",
          projectDate: fullProject.project_date || prev.projectDate,
          contractor: (fullProject as any).contractor || prev.contractor,
          county: (fullProject as any).county || prev.county,
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
    const isCompressiveStrengthTest = state.material === "concrete" && state.testKey === "compressive";
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

  const tests = useMemo<TestOption[]>(
    () => (state.material ? TESTS_BY_MATERIAL[state.material] : []),
    [state.material],
  );

  const isCompressiveStrengthTest = state.material === "concrete" && state.testKey === "compressive";
  const hasExistingCompressiveTests = isCompressiveStrengthTest && compressiveTests.length > 0;
  const steps = getSteps(state.material, state.testKey, hasExistingCompressiveTests);

  const canAdvance = useMemo(() => {
    const currentStepId = steps[step]?.id;

    switch (currentStepId) {
      case "material": return !!state.material;
      case "test": return !!state.testKey;
      case "existing":
        // Can advance if either an existing test is selected OR we're creating new
        return true;
      case "project":
        if (creatingNewProject) {
          const hasProjectName = state.projectName.trim().length > 0;
          if (isCompressiveStrengthTest) {
            return hasProjectName && state.contractor.trim().length > 0 && state.county.trim().length > 0;
          }
          return hasProjectName;
        } else {
          if (isCompressiveStrengthTest) {
            return state.projectId !== null && state.contractor.trim().length > 0 && state.county.trim().length > 0;
          }
          return state.projectId !== null;
        }
      case "sample":
        if (state.material === "concrete") {
          return state.cement.trim().length > 0;
        } else {
          return state.sampleId.trim().length > 0 && state.sampleDepthFrom.trim().length > 0 && state.sampleDepthTo.trim().length > 0;
        }
      case "entry": return true;
      default: return false;
    }
  }, [step, steps, state, creatingNewProject, isCompressiveStrengthTest, selectedExistingTestId]);

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
    const expectedTestType = getExpectedTestType(state.material, state.testKey);
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

  const handleFinish = async () => {
    // If creating a new project (projectId is null), save it first for compressive strength tests
    let finalProjectId = state.projectId;
    if (isCompressiveStrengthTest && finalProjectId === null) {
      try {
        const projectPayload: Record<string, unknown> = {
          name: state.projectName,
          client_name: state.clientName,
          project_date: state.projectDate,
          contractor: state.contractor,
          county: state.county,
          test_type: getExpectedTestType(state.material, state.testKey),
        };
        const createResponse = await createRecord<{ id: number }>("projects", projectPayload);
        finalProjectId = createResponse.data?.id ?? null;
        if (!finalProjectId) {
          toast.error("Failed to create project");
          return;
        }
        console.log(`[RecordTestWizard] Created new project with ID: ${finalProjectId}`);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error("[RecordTestWizard] Failed to create project:", errorMsg);
        toast.error("Failed to create project");
        return;
      }
    }

    // Push project info into TestDataContext so the test screens have it
    const projectMetadata: any = {
      projectName: state.projectName,
      clientName: state.clientName,
      currentProjectId: finalProjectId,
    };

    if (isCompressiveStrengthTest) {
      projectMetadata.contractor = state.contractor;
      projectMetadata.county = state.county;
      projectMetadata.submittedBy = state.submittedBy;
      projectMetadata.dateSubmitted = state.dateSubmitted;
      projectMetadata.customFields = state.customFields;
    }

    testData.updateProjectMetadata(projectMetadata);

    // If concrete material, also push concrete test details to context
    if (state.material === "concrete") {
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
    // If wizard was launched against an existing project (not creating a new one),
    // signal the test screen to start a fresh record under that project.
    // Always force a fresh record when an existing project is selected.
    // (Creating a new project leaves projectId null until first save, so this
    // condition cleanly distinguishes the two flows.)
    const fromExisting = finalProjectId !== null;
    const suffix = fromExisting ? `?newRecord=1&fromProject=${finalProjectId}` : "";
    navigate(`/tests${suffix}#${state.testKey}`);
  };

  // Pick existing compressive test and populate wizard state
  const selectCompressiveTest = (testId: number) => {
    const test = compressiveTests.find((t) => t.id === testId);
    if (!test) return;

    setSelectedExistingTestId(testId);

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

  // Create new compressive test (deselect existing)
  const createNewCompressiveTest = () => {
    setSelectedExistingTestId(null);
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
  };

  // Pick existing project: prepopulate the editable details card on this same step
  // (don't auto-skip ahead). The user reviews/edits, then clicks Next.
  const pickProject = (id: number) => {
    const p = projects.find((x) => x.id === id);
    if (!p) return;

    setState((prev) => ({
      ...prev,
      projectId: p.id,
      projectName: p.name,
      clientName: p.client_name || "",
      projectDate: p.project_date || prev.projectDate,
      contractor: "",
      county: "",
    }));

    setCreatingNewProject(true);

    testData.updateProjectMetadata({
      projectName: p.name,
      clientName: p.client_name || "",
      projectDate: p.project_date || "",
      currentProjectId: id,
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
          currentProjectId: id,
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
                {MATERIAL_OPTIONS.map((mat) => {
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
                          <p className="text-sm text-muted-foreground mt-0.5">{mat.description}</p>
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
                Available tests for {MATERIAL_OPTIONS.find((m) => m.id === state.material)?.label}.
              </p>
            </div>
            <FormCard>
              {tests.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
                    <Layers className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="text-lg font-medium text-foreground mb-1">
                    Coming soon
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {MATERIAL_OPTIONS.find((m) => m.id === state.material)?.label} testing is not yet available.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {tests.map((t) => {
                    const selected = state.testKey === t.key;
                    const isDisabled = state.material === "rock" || state.material === "special" || (state.material === "concrete" && t.key !== "compressive") || (state.material === "soil" && t.key !== "atterberg");
                    return (
                      <button
                        key={t.key}
                        type="button"
                        disabled={isDisabled}
                        onClick={() => {
                          update("testKey", t.key);
                          setTimeout(() => setStep(step + 1), 0);
                        }}
                        className={cn(
                          "text-left rounded-xl border-2 p-4 bg-card transition-all hover:border-primary/50",
                          selected ? "border-primary ring-2 ring-primary/20" : "border-border",
                          isDisabled && "opacity-50 cursor-not-allowed",
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <div className={cn(
                            "h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0",
                            selected ? "bg-primary text-primary-foreground" : "bg-accent text-accent-foreground",
                          )}>
                            <FlaskConical className="h-4 w-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="text-sm font-semibold text-foreground">{t.name}</h3>
                            <p className="text-xs text-muted-foreground mt-1 leading-snug">{t.description}</p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </FormCard>
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
                  <Button onClick={createNewCompressiveTest}>Create new test</Button>
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

                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-xs uppercase tracking-wider text-muted-foreground">or</span>
                    <div className="flex-1 h-px bg-border" />
                  </div>

                  <Button variant="outline" className="w-full justify-start gap-2 h-11" onClick={createNewCompressiveTest}>
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
              <p className="text-sm text-muted-foreground mt-1">Pick an existing project or create a new one.</p>
            </div>

            <FormCard>
              {creatingNewProject ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-sm">{state.projectId ? "Project details" : "New project details"}</h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setCreatingNewProject(false);
                        setState((prev) => ({ ...prev, projectId: null, projectName: "", clientName: "", contractor: "", county: "", submittedBy: "", dateSubmitted: prev.dateSubmitted, customFields: [] }));
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="proj-name">Project name *</Label>
                    <Input id="proj-name" value={state.projectName} onChange={(e) => update("projectName", e.target.value)} placeholder="e.g. Thika Road Bridge Foundation" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="proj-client">Client name *</Label>
                      <Input id="proj-client" value={state.clientName} onChange={(e) => update("clientName", e.target.value)} placeholder="e.g. Kenya National Highways Authority" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="proj-date">Project date</Label>
                      <Input id="proj-date" type="date" value={state.projectDate} onChange={(e) => update("projectDate", e.target.value)} />
                    </div>
                  </div>

                  {isCompressiveStrengthTest && (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label htmlFor="proj-contractor">Contractor *</Label>
                          <Input id="proj-contractor" value={state.contractor} onChange={(e) => update("contractor", e.target.value)} placeholder="e.g. BuildWell Contractors Ltd" />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="proj-county">County *</Label>
                          <Input id="proj-county" value={state.county} onChange={(e) => update("county", e.target.value)} placeholder="e.g. Nairobi" />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label htmlFor="proj-submitted-by">Submitted by</Label>
                          <Input id="proj-submitted-by" value={state.submittedBy} onChange={(e) => update("submittedBy", e.target.value)} placeholder="Name of submitting engineer" />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="proj-date-submitted">Date submitted</Label>
                          <Input id="proj-date-submitted" type="date" value={state.dateSubmitted} onChange={(e) => update("dateSubmitted", e.target.value)} />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-medium">Custom fields (optional)</h4>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-auto px-2 py-1 text-xs"
                            onClick={() => {
                              setState((prev) => ({
                                ...prev,
                                customFields: [...prev.customFields, { name: "", value: "" }]
                              }));
                            }}
                          >
                            <Plus className="h-3 w-3 mr-1" /> Add custom field
                          </Button>
                        </div>
                        {state.customFields.length > 0 && (
                          <div className="space-y-2 pt-2">
                            {state.customFields.map((field, idx) => (
                              <div key={idx} className="flex items-end gap-2">
                                <div className="flex-1 space-y-1">
                                  <Input
                                    placeholder="Field name"
                                    value={field.name}
                                    onChange={(e) => {
                                      setState((prev) => {
                                        const updated = [...prev.customFields];
                                        updated[idx].name = e.target.value;
                                        return { ...prev, customFields: updated };
                                      });
                                    }}
                                    className="text-xs h-8"
                                  />
                                </div>
                                <div className="flex-1 space-y-1">
                                  <Input
                                    placeholder="Field value"
                                    value={field.value}
                                    onChange={(e) => {
                                      setState((prev) => {
                                        const updated = [...prev.customFields];
                                        updated[idx].value = e.target.value;
                                        return { ...prev, customFields: updated };
                                      });
                                    }}
                                    className="text-xs h-8"
                                  />
                                </div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0"
                                  onClick={() => {
                                    setState((prev) => ({
                                      ...prev,
                                      customFields: prev.customFields.filter((_, i) => i !== idx)
                                    }));
                                  }}
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              ) : (
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
                          <SelectValue
                            placeholder={
                              projectsLoadError
                                ? "Couldn't load projects"
                                : projects.length === 0
                                  ? "No saved projects yet"
                                  : "Select an existing project"
                            }
                          />
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
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setProjectsReloadKey((k) => k + 1)}
                        >
                          Retry
                        </Button>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Selecting an existing project opens it directly for editing.
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-xs uppercase tracking-wider text-muted-foreground">or</span>
                    <div className="flex-1 h-px bg-border" />
                  </div>

                  <Button
                    variant="outline"
                    className="w-full justify-start gap-2 h-11"
                    onClick={() => {
                      setCreatingNewProject(true);
                      setState((p) => ({ ...p, projectId: null, projectName: "", clientName: "", contractor: "", county: "", submittedBy: "", dateSubmitted: p.dateSubmitted, customFields: [] }));
                    }}
                  >
                    <Plus className="h-4 w-4" /> Create new project
                  </Button>
                </div>
              )}
            </FormCard>
          </section>
              )}

              {steps[step]?.id === "sample" && (
                <section className="space-y-6 animate-fade-in max-w-2xl">
            {state.material === "concrete" ? (
              <>
                <div>
                  <h2 className="text-2xl font-semibold tracking-tight">{isCompressiveStrengthTest ? "Concrete cube details" : "Test details"}</h2>
                  <p className="text-sm text-muted-foreground mt-1">Enter the concrete sample details.</p>
                </div>
                <FormCard>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs font-medium mb-1 block">Sample ID</Label>
                      <Input value={state.sampleId} onChange={(e) => update("sampleId", e.target.value)} className="h-8 text-sm" placeholder="e.g. BH-01 / S-3" />
                    </div>
                    <div>
                      <Label className="text-xs font-medium mb-1 block">Cement</Label>
                      <Input value={state.cement} onChange={(e) => update("cement", e.target.value)} className="h-8 text-sm" />
                    </div>
                    <div>
                      <Label className="text-xs font-medium mb-1 block">Fine Aggregate</Label>
                      <Input value={state.fineAggregate} onChange={(e) => update("fineAggregate", e.target.value)} className="h-8 text-sm" />
                    </div>
                    <div>
                      <Label className="text-xs font-medium mb-1 block">Coarse Aggregate</Label>
                      <Input value={state.coarseAggregate} onChange={(e) => update("coarseAggregate", e.target.value)} className="h-8 text-sm" />
                    </div>
                    {!isCompressiveStrengthTest && (
                      <div>
                        <Label className="text-xs font-medium mb-1 block">Contractor</Label>
                        <Input value={state.contractor} onChange={(e) => update("contractor", e.target.value)} className="h-8 text-sm" />
                      </div>
                    )}
                    <div>
                      <Label className="text-xs font-medium mb-1 block">Concrete Class</Label>
                      <Input value={state.concreteClass} onChange={(e) => update("concreteClass", e.target.value)} className="h-8 text-sm" />
                    </div>
                    <div>
                      <Label className="text-xs font-medium mb-1 block">Section</Label>
                      <Input value={state.section} onChange={(e) => update("section", e.target.value)} className="h-8 text-sm" />
                    </div>
                    <div>
                      <Label className="text-xs font-medium mb-1 block">Made By</Label>
                      <Input value={state.madeBy} onChange={(e) => update("madeBy", e.target.value)} className="h-8 text-sm" />
                    </div>
                    <div>
                      <Label className="text-xs font-medium mb-1 block">Slump</Label>
                      <Input value={state.slump} onChange={(e) => update("slump", e.target.value)} className="h-8 text-sm" />
                    </div>
                    <div>
                      <Label className="text-xs font-medium mb-1 block">Client Ref</Label>
                      <Input value={state.clientRef} onChange={(e) => update("clientRef", e.target.value)} className="h-8 text-sm" />
                    </div>
                    <div>
                      <Label className="text-xs font-medium mb-1 block">Date Tested</Label>
                      <Input type="date" value={state.dateTested} onChange={(e) => update("dateTested", e.target.value)} className="h-8 text-sm" />
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
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="border-t border-border bg-card">
          <div className="px-4 md:px-8 py-3 max-w-5xl mx-auto w-full flex items-center justify-between gap-3">
            <Button variant="outline" onClick={handleBack} className="gap-1.5">
              <ArrowLeft className="h-4 w-4" /> {step === 0 ? "Cancel" : "Back"}
            </Button>
            {step < steps.length - 1 ? (
              <Button onClick={handleNext} disabled={!canAdvance} className="gap-1.5">
                Next <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={handleFinish} className="gap-1.5">
                Start recording <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </footer>
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
