import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, X, Mountain, Hammer, TestTubeDiagonal, FlaskConical, FolderOpen, Plus, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import WizardStepper, { type WizardStep } from "@/components/WizardStepper";
import { listRecords, fetchCurrentUser, setSessionToken, logoutUser, fetchFullProject } from "@/lib/api";
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

const STEPS: WizardStep[] = [
  { id: "material", label: "Material" },
  { id: "test", label: "Test type" },
  { id: "project", label: "Project" },
  { id: "sample", label: "Sample" },
  { id: "entry", label: "Record" },
];

interface WizardState {
  material: Material | null;
  testKey: string | null;
  projectId: number | null;
  projectName: string;
  clientName: string;
  projectDate: string;
  sampleId: string;
  sampleDepthFrom: string;
  sampleDepthTo: string;
  sampleNotes: string;
  cement: string;
  fineAggregate: string;
  coarseAggregate: string;
  contractor: string;
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
  sampleId: "",
  sampleDepthFrom: "",
  sampleDepthTo: "",
  sampleNotes: "",
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
};

interface ApiProjectRow {
  id: number;
  name: string;
  client_name: string | null;
  project_date: string | null;
}

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
        }));

        // Update context with complete metadata
        testData.updateProjectMetadata({
          projectName: fullProject.name,
          clientName: fullProject.client_name || "",
          projectDate: fullProject.project_date || "",
          labOrganization: fullProject.lab_organization || "",
          dateReported: fullProject.date_reported || "",
          checkedBy: fullProject.checked_by || "",
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

  // Load projects when reaching project step (and after retry)
  useEffect(() => {
    if (authChecking) return;
    if (step !== 2) return;
    if (projects.length > 0 && projectsReloadKey === 0) return;
    let active = true;
    setLoadingProjects(true);
    setProjectsLoadError(null);
    listRecords<ApiProjectRow>("projects", { limit: 100 })
      .then(async (res) => {
        if (!active) return;

        let filteredProjects = res.data || [];

        // If a material is selected, filter projects to only those with test results for that material
        if (state.material) {
          const projectsWithMaterial: ApiProjectRow[] = [];

          for (const project of filteredProjects) {
            try {
              const testResults = await listRecords<any>("test_results", { project_id: project.id, limit: 1 });
              const hasResultForMaterial = testResults.data?.some((r: any) => r.category === state.material);
              if (hasResultForMaterial) {
                projectsWithMaterial.push(project);
              }
            } catch {
              // If we can't check test results for this project, include it anyway
              projectsWithMaterial.push(project);
            }
          }

          filteredProjects = projectsWithMaterial;
        }

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
  }, [step, projectsReloadKey, authChecking, navigate, state.material]);

  const update = <K extends keyof WizardState>(key: K, value: WizardState[K]) => {
    setState((prev) => ({ ...prev, [key]: value }));
  };

  const tests = useMemo<TestOption[]>(
    () => (state.material ? TESTS_BY_MATERIAL[state.material] : []),
    [state.material],
  );

  const canAdvance = useMemo(() => {
    switch (step) {
      case 0: return !!state.material;
      case 1: return !!state.testKey;
      case 2: return creatingNewProject ? state.projectName.trim().length > 0 : state.projectId !== null;
      case 3: return state.material === "concrete" ? state.cement.trim().length > 0 : true;
      case 4: return true;
      default: return false;
    }
  }, [step, state, creatingNewProject]);

  const handleNext = () => {
    if (step < STEPS.length - 1) setStep(step + 1);
  };

  const handleBack = () => {
    if (step > 0) setStep(step - 1);
    else handleCancel();
  };

  const handleCancel = () => {
    sessionStorage.removeItem(STORAGE_KEY);
    navigate(-1);
  };

  const handleFinish = () => {
    // Push project info into TestDataContext so the test screens have it
    testData.updateProjectMetadata({
      projectName: state.projectName,
      clientName: state.clientName,
    });
    sessionStorage.removeItem(STORAGE_KEY);
    toast.success(`Started ${tests.find((t) => t.key === state.testKey)?.name ?? "test"} record`);
    // If wizard was launched against an existing project (not creating a new one),
    // signal the test screen to start a fresh record under that project.
    // Always force a fresh record when an existing project is selected.
    // (Creating a new project leaves projectId null until first save, so this
    // condition cleanly distinguishes the two flows.)
    const fromExisting = state.projectId !== null;
    const suffix = fromExisting ? `?newRecord=1&fromProject=${state.projectId}` : "";
    navigate(`/tests${suffix}#${state.testKey}`);
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
    }));

    // Show the same details card the "Create new project" path uses
    setCreatingNewProject(true);

    testData.updateProjectMetadata({
      projectName: p.name,
      clientName: p.client_name || "",
      projectDate: p.project_date || "",
      currentProjectId: id,
    });

    // Background: load full project record and sync into both state and context
    (async () => {
      try {
        const fullProject = await fetchFullProject(id);
        setState((prev) => ({
          ...prev,
          projectName: fullProject.name,
          clientName: fullProject.client_name || "",
          projectDate: fullProject.project_date || prev.projectDate,
        }));
        testData.updateProjectMetadata({
          projectName: fullProject.name,
          clientName: fullProject.client_name || "",
          projectDate: fullProject.project_date || "",
          labOrganization: fullProject.lab_organization || "",
          dateReported: fullProject.date_reported || "",
          checkedBy: fullProject.checked_by || "",
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
              steps={STEPS}
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
          </section>
              )}

              {step === 1 && (
                <section className="space-y-6 animate-fade-in">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Choose the test</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Available tests for {MATERIAL_OPTIONS.find((m) => m.id === state.material)?.label}.
              </p>
            </div>
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
                        setTimeout(() => setStep(2), 0);
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
          </section>
              )}

              {step === 2 && (
                <section className="space-y-6 animate-fade-in max-w-2xl">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Project</h2>
              <p className="text-sm text-muted-foreground mt-1">Pick an existing project or create a new one.</p>
            </div>

            {creatingNewProject ? (
              <Card>
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-sm">{state.projectId ? "Project details" : "New project details"}</h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setCreatingNewProject(false);
                        setState((prev) => ({ ...prev, projectId: null, projectName: "", clientName: "" }));
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="proj-name">Project name *</Label>
                    <Input id="proj-name" value={state.projectName} onChange={(e) => update("projectName", e.target.value)} placeholder="e.g. Highway A14 Section 2" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="proj-client">Client</Label>
                      <Input id="proj-client" value={state.clientName} onChange={(e) => update("clientName", e.target.value)} placeholder="Client name" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="proj-date">Date</Label>
                      <Input id="proj-date" type="date" value={state.projectDate} onChange={(e) => update("projectDate", e.target.value)} />
                    </div>
                  </div>
                </CardContent>
              </Card>
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
                      <SelectValue
                        placeholder={
                          loadingProjects
                            ? "Loading projects…"
                            : projectsLoadError
                              ? "Couldn't load projects"
                              : projects.length === 0
                                ? "No saved projects yet"
                                : "Select an existing project"
                        }
                      />
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
                    setState((p) => ({ ...p, projectId: null, projectName: "", clientName: "" }));
                  }}
                >
                  <Plus className="h-4 w-4" /> Create new project
                </Button>
              </div>
            )}
          </section>
              )}

              {step === 3 && (
                <section className="space-y-6 animate-fade-in max-w-2xl">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Test details</h2>
              <p className="text-sm text-muted-foreground mt-1">
                {state.material === "concrete" ? "Enter the concrete sample details." : "Sample details will be entered in the next step."}
              </p>
            </div>
            {state.material === "concrete" && (
              <div className="grid grid-cols-2 gap-4 mb-6 p-4 bg-muted/30 rounded-lg">
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
                <div>
                  <Label className="text-xs font-medium mb-1 block">Contractor</Label>
                  <Input value={state.contractor} onChange={(e) => update("contractor", e.target.value)} className="h-8 text-sm" />
                </div>
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
            )}
          </section>
              )}

              {step === 4 && (
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
            {step < STEPS.length - 1 ? (
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
