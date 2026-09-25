import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { Layers, Plus, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import Navigation from "@/components/Navigation";
import { type ApiProjectRow } from "@/types/api";
import { listRecords } from "@/lib/api";
import { useSession } from "@/context/SessionContext";
import { toast } from "sonner";

interface ApiTestResult {
  id: number;
  project_id: number;
  test_key: string;
  name: string;
  category: string;
  project_name?: string;
  status?: string;
  payload_json?: unknown;
  created_at?: string;
  updated_at?: string;
}

const hasResumableGradingPayload = (payload: unknown) => {
  let parsedPayload = payload;
  if (typeof parsedPayload === "string") {
    try {
      parsedPayload = JSON.parse(parsedPayload) as unknown;
    } catch {
      return false;
    }
  }
  if (typeof parsedPayload !== "object" || parsedPayload === null || Array.isArray(parsedPayload)) return false;

  const root = parsedPayload as Record<string, unknown>;
  const project = typeof root.project === "object" && root.project !== null && !Array.isArray(root.project)
    ? root.project as Record<string, unknown>
    : root;
  const firstRecord = Array.isArray(project.records) ? project.records[0] : null;
  return typeof firstRecord === "object" && firstRecord !== null && !Array.isArray(firstRecord);
};

const Projects = () => {
  const navigate = useNavigate();
  const { user, logout } = useSession();
  const [searchQuery, setSearchQuery] = useState("");
  const [apiProjects, setApiProjects] = useState<ApiProjectRow[]>([]);
  const [apiTestResults, setApiTestResults] = useState<ApiTestResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Load projects and test results from API
  useEffect(() => {
    const loadProjects = async () => {
      try {
        setIsLoading(true);
        const [projectsResponse, testResultsResponse] = await Promise.all([
          listRecords<ApiProjectRow>("projects", { limit: 100 }),
          listRecords<ApiTestResult>("test_results", { limit: 1000 }),
        ]);

        const testResults = testResultsResponse.data || [];
        setApiTestResults(testResults);

        // Count test results by project_id
        const testCountByProject = new Map<number, number>();
        testResults.forEach((testResult) => {
          const count = testCountByProject.get(testResult.project_id) || 0;
          testCountByProject.set(testResult.project_id, count + 1);
        });

        // Enrich projects with sample counts
        const enrichedProjects = (projectsResponse.data || []).map((p) => ({
          ...p,
          sample_count: testCountByProject.get(p.id) || 0,
        }));

        setApiProjects(enrichedProjects);
      } catch (error) {
        console.error("Failed to load projects:", error);
        setApiProjects([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadProjects();
  }, []);

  // Map API data to display format
  const projects = useMemo(() => {
    if (apiProjects.length > 0) {
      return apiProjects.map((p) => ({
        id: p.id,
        name: p.name,
        client_name: p.client_name || undefined,
        created_at: p.project_date || new Date().toISOString(),
        test_type: p.test_type,
        samples: p.sample_count || 0,
      }));
    }
    return [];
  }, [apiProjects]);

  // Filter projects based on search query
  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      const searchMatch =
        searchQuery === "" ||
        p.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.client_name?.toLowerCase().includes(searchQuery.toLowerCase());
      return searchMatch;
    });
  }, [projects, searchQuery]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  // Calculate pagination
  const totalPages = Math.ceil(filteredProjects.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedProjects = filteredProjects.slice(startIndex, endIndex);

  const handleLogout = async () => {
    await logout();
    toast.success("Logged out");
  };

  const handleNewProject = () => {
    navigate("/record");
  };

  const handleOpenProject = (projectId: number) => {
    const selectedProject = apiProjects.find((project) => project.id === projectId);
    if (selectedProject?.test_type === "grading") {
      const latestGradingResult = apiTestResults
        .filter((result) => Number(result.project_id) === projectId
          && result.test_key === "grading"
          && hasResumableGradingPayload(result.payload_json))
        .sort((a, b) => (b.updated_at || b.created_at || "").localeCompare(a.updated_at || a.created_at || ""))[0];

      if (latestGradingResult) {
        navigate(`/tests?projectId=${projectId}&resultId=${latestGradingResult.id}#grading`);
      } else {
        navigate(`/tests?newRecord=1&fromProject=${projectId}#grading`);
      }
      return;
    }

    navigate(`/projects/${projectId}`);
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "-";
    try {
      const date = new Date(dateString);
      return date.toLocaleString("en-US", {
        month: "short",
        day: "2-digit",
        year: "numeric",
      });
    } catch {
      return dateString;
    }
  };

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
        <div className="flex flex-col min-h-screen bg-background">
          {/* Header */}
          <header className="border-b bg-card sticky top-0 z-10">
            <div className="flex items-center justify-between h-11 px-3 sm:px-4 gap-2">
              <div className="flex items-center gap-2">
                <SidebarTrigger />
                <div>
                  <h1 className="text-sm font-semibold leading-4">Projects</h1>
                  <p className="text-[10px] leading-3 text-muted-foreground">
                    All user engagements
                  </p>
                </div>
              </div>
            </div>
          </header>

          {/* Main Content */}
          <main className="flex-1 overflow-auto">
            <div className="p-3 sm:p-4">
              <Card className="rounded-md border border-border shadow-none">
                <CardHeader className="px-3 py-2.5 sm:px-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <div className="shrink-0">
                      <CardTitle className="text-sm font-semibold leading-5">Projects</CardTitle>
                      <CardDescription className="text-[11px] leading-4">
                        {filteredProjects.length} project{filteredProjects.length !== 1 ? "s" : ""}
                        {totalPages > 1 && ` • Page ${currentPage} of ${totalPages}`}
                      </CardDescription>
                    </div>
                    <div className="w-full sm:flex-1">
                      <Input
                        placeholder="Search project name, client or code..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                    <Button
                      onClick={handleNewProject}
                      className="h-8 w-full gap-1.5 px-3 text-xs sm:w-auto sm:shrink-0"
                      size="sm"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      New project
                    </Button>
                  </div>
                </CardHeader>

                <CardContent className="px-3 pb-3 pt-0 sm:px-4 sm:pb-4">
                  {isLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                  ) : filteredProjects.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
                        <Layers className="h-6 w-6 text-muted-foreground" />
                      </div>
                      <p className="text-lg font-medium text-foreground mb-1">
                        {projects.length === 0
                          ? "No projects yet"
                          : "No projects found"}
                      </p>
                      <p className="text-sm text-muted-foreground mb-4">
                        {projects.length === 0
                          ? "Create a new project to get started."
                          : "Try adjusting your search query."}
                      </p>
                      {projects.length === 0 && (
                        <Button
                          onClick={handleNewProject}
                          className="gap-2"
                          size="sm"
                        >
                          <Plus className="h-4 w-4" />
                          Create First Project
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/40 hover:bg-muted/40">
                              <TableHead className="h-8 px-2 text-[10px] font-semibold tracking-wide text-muted-foreground">PROJECT</TableHead>
                              <TableHead className="hidden h-8 px-2 text-[10px] font-semibold tracking-wide text-muted-foreground sm:table-cell">DATE CREATED</TableHead>
                              <TableHead className="hidden h-8 px-2 text-center text-[10px] font-semibold tracking-wide text-muted-foreground sm:table-cell">SAMPLES</TableHead>
                              <TableHead className="h-8 px-2 text-right text-[10px] font-semibold tracking-wide text-muted-foreground">ACTION</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {paginatedProjects.map((project) => (
                              <TableRow
                                key={project.id}
                                className="border-b last:border-0 hover:bg-muted/50"
                              >
                                <TableCell className="px-2 py-1.5">
                                  <div>
                                    <p className="text-xs font-medium leading-4">{project.name}</p>
                                    <p className="text-[10px] leading-3 text-muted-foreground">
                                      {project.client_name || "No client"}
                                    </p>
                                    <p className="text-[10px] leading-3 text-muted-foreground sm:hidden">
                                      {formatDate(project.created_at)}
                                    </p>
                                  </div>
                                </TableCell>
                                <TableCell className="hidden px-2 py-1.5 text-xs sm:table-cell">
                                  {formatDate(project.created_at)}
                                </TableCell>
                                <TableCell className="hidden px-2 py-1.5 text-center font-medium sm:table-cell">
                                  <span className="inline-flex min-w-5 justify-center rounded-sm bg-muted px-1 py-0.5 text-[10px] leading-none">
                                    {project.samples || "0"}
                                  </span>
                                </TableCell>
                                <TableCell className="px-2 py-1.5 text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-7 px-2.5 text-[11px]"
                                      onClick={() => handleOpenProject(project.id)}
                                    >
                                      Open →
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>

                      {/* Pagination Controls */}
                      {totalPages > 1 && (
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-t pt-2">
                          <p className="text-[10px] text-muted-foreground">
                            {startIndex + 1}-{Math.min(endIndex, filteredProjects.length)} of {filteredProjects.length}
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                              disabled={currentPage === 1}
                              className="h-7 gap-1 px-2 text-[10px]"
                            >
                              <ChevronLeft className="h-3 w-3" />
                              Previous
                            </Button>
                            <div className="flex items-center gap-1">
                              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                                <Button
                                  key={page}
                                  variant={page === currentPage ? "default" : "outline"}
                                  size="sm"
                                  onClick={() => setCurrentPage(page)}
                                  className="h-7 w-7 p-0 text-[10px]"
                                >
                                  {page}
                                </Button>
                              ))}
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                              disabled={currentPage === totalPages}
                              className="h-7 gap-1 px-2 text-[10px]"
                            >
                              Next
                              <ChevronRight className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </main>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
};

export default Projects;
