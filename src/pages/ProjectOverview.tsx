import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CalendarDays, Edit2, FlaskConical, Loader2, Plus, Save, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import Navigation from "@/components/Navigation";
import { useSession } from "@/context/SessionContext";
import { useTestData } from "@/context/TestDataContext";
import { fetchFullProject, listRecords, updateRecord } from "@/lib/api";
import type { ApiProjectRow } from "@/types/api";

type ProjectDetails = ApiProjectRow & {
  lab_organization?: string | null;
  date_reported?: string | null;
  checked_by?: string | null;
  contractor?: string | null;
  county?: string | null;
};

type ProjectDraft = {
  name: string;
  client_name: string;
  project_date: string;
  lab_organization: string;
  date_reported: string;
  checked_by: string;
  contractor: string;
  county: string;
};

type ApiTestResult = {
  id: number;
  project_id: number;
  test_key: string;
  name?: string;
  category?: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
};

const toDraft = (project: ProjectDetails): ProjectDraft => ({
  name: project.name || "",
  client_name: project.client_name || "",
  project_date: project.project_date?.slice(0, 10) || "",
  lab_organization: project.lab_organization || "",
  date_reported: project.date_reported?.slice(0, 10) || "",
  checked_by: project.checked_by || "",
  contractor: project.contractor || "",
  county: project.county || "",
});

const formatDate = (value?: string | null) => {
  if (!value) return "Not set";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
};

const ProjectOverview = () => {
  const { projectId: projectIdParam } = useParams();
  const navigate = useNavigate();
  const { user, logout } = useSession();
  const { updateProjectMetadata } = useTestData();
  const projectId = Number(projectIdParam);
  const [project, setProject] = useState<ProjectDetails | null>(null);
  const [draft, setDraft] = useState<ProjectDraft | null>(null);
  const [testResults, setTestResults] = useState<ApiTestResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    if (!Number.isInteger(projectId) || projectId < 1) {
      setProject(null);
      setDraft(null);
      setTestResults([]);
      setError("Project not found");
      setIsLoading(false);
      return;
    }

    let active = true;
    setIsLoading(true);
    setError(null);

    Promise.all([
      fetchFullProject(projectId),
      listRecords<ApiTestResult>("test_results", { limit: 5000, orderBy: "updated_at", direction: "DESC" }),
    ]).then(([loadedProject, resultsResponse]) => {
      if (!active) return;
      const projectDetails = loadedProject as ProjectDetails;
      setProject(projectDetails);
      setDraft(toDraft(projectDetails));
      setTestResults((resultsResponse.data || []).filter((result) => Number(result.project_id) === projectId));
      updateProjectMetadata({
        projectName: projectDetails.name,
        clientName: projectDetails.client_name || "",
        projectDate: projectDetails.project_date || "",
        labOrganization: projectDetails.lab_organization || "",
        dateReported: projectDetails.date_reported || "",
        checkedBy: projectDetails.checked_by || "",
        contractor: projectDetails.contractor || "",
        county: projectDetails.county || "",
        currentProjectId: projectDetails.id,
      });
    }).catch((loadError: unknown) => {
      if (!active) return;
      setError(loadError instanceof Error ? loadError.message : "Unable to load this project");
    }).finally(() => {
      if (active) setIsLoading(false);
    });

    return () => { active = false; };
  }, [projectId, loadAttempt, updateProjectMetadata]);

  const handleSave = async () => {
    if (!project || !draft) return;
    if (!draft.name.trim()) {
      setError("Project name is required");
      return;
    }

    const fields = {
      name: draft.name.trim(),
      client_name: draft.client_name.trim() || null,
      project_date: draft.project_date || null,
      lab_organization: draft.lab_organization.trim() || null,
      date_reported: draft.date_reported || null,
      checked_by: draft.checked_by.trim() || null,
      contractor: draft.contractor.trim() || null,
      county: draft.county.trim() || null,
    };

    setIsSaving(true);
    setError(null);
    try {
      const response = await updateRecord<ProjectDetails>("projects", project.id, fields);
      const updatedProject = { ...project, ...fields, ...response.data } as ProjectDetails;
      setProject(updatedProject);
      setDraft(toDraft(updatedProject));
      updateProjectMetadata({
        projectName: updatedProject.name,
        clientName: updatedProject.client_name || "",
        projectDate: updatedProject.project_date || "",
        labOrganization: updatedProject.lab_organization || "",
        dateReported: updatedProject.date_reported || "",
        checkedBy: updatedProject.checked_by || "",
        contractor: updatedProject.contractor || "",
        county: updatedProject.county || "",
        currentProjectId: updatedProject.id,
      });
      setIsEditing(false);
      toast.success("Project details saved");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save project details");
    } finally {
      setIsSaving(false);
    }
  };

  const openTest = (testKey: string, resultId?: number) => {
    if (!project) return;
    updateProjectMetadata({
      projectName: project.name,
      clientName: project.client_name || "",
      projectDate: project.project_date || "",
      labOrganization: project.lab_organization || "",
      dateReported: project.date_reported || "",
      checkedBy: project.checked_by || "",
      contractor: project.contractor || "",
      county: project.county || "",
      currentProjectId: project.id,
    });
    const params = new URLSearchParams({ projectId: String(project.id) });
    if (resultId) params.set("resultId", String(resultId));
    navigate(`/tests?${params.toString()}#${testKey}`);
  };

  const handleCancelEdit = () => {
    if (project) setDraft(toDraft(project));
    setError(null);
    setIsEditing(false);
  };

  const handleLogout = async () => {
    await logout();
    toast.success("Logged out");
  };

  const orderedTestResults = [...testResults].sort((a, b) =>
    (b.updated_at || b.created_at || "").localeCompare(a.updated_at || a.created_at || ""),
  );

  return (
    <SidebarProvider>
      <Navigation
        currentView="projects"
        onViewChange={() => {}}
        onLogout={handleLogout}
        userName={user.name}
        userEmail={user.email}
      />
      <SidebarInset>
        <div className="flex min-h-screen flex-col bg-background">
          <header className="sticky top-0 z-10 border-b bg-card">
            <div className="flex h-14 items-center gap-3 px-4">
              <SidebarTrigger />
              <div>
                <h1 className="text-lg font-semibold">Project overview</h1>
                <p className="text-xs text-muted-foreground">Project details and saved test records</p>
              </div>
            </div>
          </header>

          <main className="flex-1 overflow-auto p-4 sm:p-6">
            <div className="mx-auto max-w-5xl space-y-5">
              <Button variant="ghost" className="-ml-3 gap-2" onClick={() => navigate("/projects")}>
                <ArrowLeft className="h-4 w-4" /> Projects
              </Button>

              {isLoading ? (
                <div className="flex min-h-64 items-center justify-center text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading project…
                </div>
              ) : !project ? (
                <Card>
                  <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
                    <p className="text-sm text-destructive">{error || "Project not found"}</p>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => navigate("/projects")}>Back to projects</Button>
                      {Number.isInteger(projectId) && projectId > 0 && (
                        <Button onClick={() => setLoadAttempt((attempt) => attempt + 1)}>Retry</Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <>
                  <Card>
                    <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-1">
                        <CardTitle className="text-2xl">{project.name}</CardTitle>
                        <CardDescription>{project.client_name || "No client assigned"}</CardDescription>
                      </div>
                      {!isEditing ? (
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <Button variant="outline" onClick={() => setIsEditing(true)} className="gap-2" disabled={isSaving}>
                            <Edit2 className="h-4 w-4" /> Edit project
                          </Button>
                          <Button onClick={() => openTest("atterberg")} className="gap-2">
                            <Plus className="h-4 w-4" /> Add Atterberg
                          </Button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <Button variant="outline" onClick={handleCancelEdit} disabled={isSaving} className="gap-2">
                            <X className="h-4 w-4" /> Cancel
                          </Button>
                          <Button onClick={handleSave} disabled={isSaving || !draft} className="gap-2">
                            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            Save changes
                          </Button>
                        </div>
                      )}
                    </CardHeader>
                    <CardContent>
                      {error && <p role="alert" className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
                      {isEditing && draft ? (
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor="project-name">Project name</Label>
                            <Input id="project-name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="client-name">Client</Label>
                            <Input id="client-name" value={draft.client_name} onChange={(event) => setDraft({ ...draft, client_name: event.target.value })} />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="project-date">Project date</Label>
                            <Input id="project-date" type="date" value={draft.project_date} onChange={(event) => setDraft({ ...draft, project_date: event.target.value })} />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="contractor">Contractor</Label>
                            <Input id="contractor" value={draft.contractor} onChange={(event) => setDraft({ ...draft, contractor: event.target.value })} />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="county">County</Label>
                            <Input id="county" value={draft.county} onChange={(event) => setDraft({ ...draft, county: event.target.value })} />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="lab-organization">Laboratory</Label>
                            <Input id="lab-organization" value={draft.lab_organization} onChange={(event) => setDraft({ ...draft, lab_organization: event.target.value })} />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="date-reported">Date reported</Label>
                            <Input id="date-reported" type="date" value={draft.date_reported} onChange={(event) => setDraft({ ...draft, date_reported: event.target.value })} />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="checked-by">Checked by</Label>
                            <Input id="checked-by" value={draft.checked_by} onChange={(event) => setDraft({ ...draft, checked_by: event.target.value })} />
                          </div>
                        </div>
                      ) : (
                        <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
                          {[
                            ["Project date", formatDate(project.project_date)],
                            ["Contractor", project.contractor || "Not set"],
                            ["County", project.county || "Not set"],
                            ["Laboratory", project.lab_organization || "Not set"],
                            ["Date reported", formatDate(project.date_reported)],
                            ["Checked by", project.checked_by || "Not set"],
                          ].map(([label, value]) => (
                            <div key={label} className="space-y-1">
                              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
                              <dd className="text-sm">{value}</dd>
                            </div>
                          ))}
                        </dl>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Saved test records</CardTitle>
                      <CardDescription>
                        {orderedTestResults.length} record{orderedTestResults.length === 1 ? "" : "s"} saved under this project
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {orderedTestResults.length === 0 ? (
                        <div className="rounded-lg border border-dashed p-8 text-center">
                          <FlaskConical className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
                          <p className="font-medium">No tests recorded yet</p>
                          <p className="mt-1 text-sm text-muted-foreground">Add an Atterberg test or choose a saved test from the project list.</p>
                        </div>
                      ) : (
                        <div className="divide-y rounded-lg border">
                          {orderedTestResults.map((result) => (
                            <div key={result.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                              <div className="min-w-0 space-y-1">
                                <p className="font-medium">{result.name || result.test_key}</p>
                                <p className="text-sm text-muted-foreground">
                                  {result.status ? `${result.status} · ` : ""}
                                  <CalendarDays className="mr-1 inline h-3.5 w-3.5" />
                                  Updated {formatDate(result.updated_at || result.created_at)}
                                </p>
                              </div>
                              <Button variant="outline" size="sm" onClick={() => openTest(result.test_key, result.id)} disabled={isEditing}>
                                Edit test
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </>
              )}
            </div>
          </main>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
};

export default ProjectOverview;
