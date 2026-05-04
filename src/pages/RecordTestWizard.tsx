import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, X, Mountain, Hammer, TestTubeDiagonal, FlaskConical, FolderOpen, Plus, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import WizardStepper, { type WizardStep } from "@/components/WizardStepper";
import { listRecords } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useTestData } from "@/context/TestDataContext";
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
  sampleDepth: string;
  sampleLocation: string;
  sampleNotes: string;
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
  sampleDepth: "",
  sampleLocation: "",
  sampleNotes: "",
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
  const testData = useTestData();

  const [state, setState] = useState<WizardState>(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) return { ...emptyState, ...JSON.parse(raw) } as WizardState;
    } catch {}
    return { ...emptyState, material: initialMaterial, testKey: initialTest };
  });

  // If both material and test are pre-selected via query params, skip to project step
  const initialStep = initialMaterial && initialTest ? 2 : 0;
  const [step, setStep] = useState(initialStep);
  const [projects, setProjects] = useState<ApiProjectRow[]>([]);
  const [creatingNewProject, setCreatingNewProject] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(false);

  // Persist
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {}
  }, [state]);

  // Load projects when reaching project step
  useEffect(() => {
    if (step !== 2 || projects.length > 0) return;
    let active = true;
    setLoadingProjects(true);
    listRecords<ApiProjectRow>("projects", { limit: 100 })
      .then((res) => {
        if (active) setProjects(res.data || []);
      })
      .catch(() => {})
      .finally(() => active && setLoadingProjects(false));
    return () => { active = false; };
  }, [step, projects.length]);

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
      case 3: return state.sampleId.trim().length > 0;
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
    navigate("/");
  };

  const handleFinish = () => {
    // Push project info into TestDataContext so the test screens have it
    testData.updateProjectMetadata({
      projectName: state.projectName,
      clientName: state.clientName,
    });
    sessionStorage.removeItem(STORAGE_KEY);
    toast.success(`Started ${tests.find((t) => t.key === state.testKey)?.name ?? "test"} record`);
    navigate(`/tests#${state.testKey}`);
  };

  // Pick existing project: load metadata AND finish the wizard immediately
  // (skip Sample + Record steps, jump straight to /tests#testKey for editing).
  const pickProject = (id: number) => {
    const p = projects.find((x) => x.id === id);
    if (!p) return;
    setCreatingNewProject(false);
    setState((prev) => ({
      ...prev,
      projectId: p.id,
      projectName: p.name,
      clientName: p.client_name || "",
      projectDate: p.project_date || prev.projectDate,
    }));
    testData.updateProjectMetadata({
      projectName: p.name,
      clientName: p.client_name || "",
    });
    sessionStorage.removeItem(STORAGE_KEY);
    toast.success(`Opened ${p.name}`);
    navigate(`/tests#${state.testKey}`);
  };

  return (
    <div className="min-h-svh bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="px-4 md:px-8 py-4 flex items-center justify-between gap-4 max-w-5xl mx-auto w-full">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center">
              <Layers className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-base font-semibold leading-tight">Record a test</h1>
              <p className="text-xs text-muted-foreground leading-tight">Step {step + 1} of {STEPS.length}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={handleCancel} className="gap-1.5">
            <X className="h-4 w-4" /> Cancel
          </Button>
        </div>
        <div className="px-4 md:px-8 pb-4 max-w-5xl mx-auto w-full">
          <WizardStepper steps={STEPS} currentIndex={step} onStepClick={setStep} />
        </div>
      </header>

      {/* Body */}
      <main className="flex-1 px-4 md:px-8 py-8 max-w-5xl mx-auto w-full">
        {step === 0 && (
          <section className="space-y-6 animate-fade-in">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">What are you testing?</h2>
              <p className="text-sm text-muted-foreground mt-1">Pick the material you'll be working with.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {MATERIAL_OPTIONS.map((mat) => {
                const selected = state.material === mat.id;
                return (
                  <button
                    key={mat.id}
                    type="button"
                    onClick={() => update("material", mat.id)}
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {tests.map((t) => {
                const selected = state.testKey === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => update("testKey", t.key)}
                    className={cn(
                      "text-left rounded-xl border-2 p-4 bg-card transition-all hover:border-primary/50",
                      selected ? "border-primary ring-2 ring-primary/20" : "border-border",
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
                    <h3 className="font-semibold text-sm">New project details</h3>
                    <Button variant="ghost" size="sm" onClick={() => setCreatingNewProject(false)}>Cancel</Button>
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
                    disabled={loadingProjects || projects.length === 0}
                  >
                    <SelectTrigger className="h-11">
                      <SelectValue
                        placeholder={
                          loadingProjects
                            ? "Loading projects…"
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
                  <p className="text-xs text-muted-foreground">
                    Selecting an existing project opens it directly for editing.
                  </p>
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
              <h2 className="text-2xl font-semibold tracking-tight">Sample setup</h2>
              <p className="text-sm text-muted-foreground mt-1">Identify the sample you're testing.</p>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="sample-id">Sample ID *</Label>
                <Input id="sample-id" value={state.sampleId} onChange={(e) => update("sampleId", e.target.value)} placeholder="e.g. BH-01 / S-3" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="sample-depth">Depth (m)</Label>
                  <Input id="sample-depth" inputMode="decimal" value={state.sampleDepth} onChange={(e) => update("sampleDepth", e.target.value)} placeholder="e.g. 1.5–2.0" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sample-location">Borehole / Location</Label>
                  <Input id="sample-location" value={state.sampleLocation} onChange={(e) => update("sampleLocation", e.target.value)} placeholder="e.g. BH-01" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="sample-notes">Notes (optional)</Label>
                <Textarea id="sample-notes" value={state.sampleNotes} onChange={(e) => update("sampleNotes", e.target.value)} placeholder="Visual description, conditions…" rows={3} />
              </div>
            </div>
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
                {state.sampleDepth && <Row label="Depth" value={state.sampleDepth} />}
                {state.sampleLocation && <Row label="Location" value={state.sampleLocation} />}
                {state.sampleNotes && <Row label="Notes" value={state.sampleNotes} />}
              </CardContent>
            </Card>
          </section>
        )}
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
    </div>
  );
};

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-start justify-between gap-4 py-1.5 border-b border-border last:border-0">
    <span className="text-muted-foreground">{label}</span>
    <span className="text-foreground font-medium text-right">{value}</span>
  </div>
);

export default RecordTestWizard;
