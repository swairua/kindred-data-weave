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
import { useProject } from "@/context/ProjectContext";
import { useTestData } from "@/context/TestDataContext";
import { type ApiProjectRow } from "@/types/api";
import { listRecords, fetchFullProject } from "@/lib/api";
import { toast } from "sonner";

interface ApiTestResult {
  id: number;
  project_id: number;
  test_key: string;
  name: string;
  category: string;
  project_name?: string;
  status?: string;
  payload_json?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

const Projects = () => {
  const navigate = useNavigate();
  const project = useProject();
  const testData = useTestData();
  const [searchQuery, setSearchQuery] = useState("");
  const [apiProjects, setApiProjects] = useState<ApiProjectRow[]>([]);
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

        // Count test results by project_id
        const testCountByProject = new Map<number, number>();
        (testResultsResponse.data || []).forEach((testResult) => {
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

  const handleLogout = () => {
    toast.success("Logged out");
    navigate("/login", { replace: true });
  };

  const handleNewProject = () => {
    navigate("/record");
  };

  const handleOpenProject = (projectId: number) => {
    const projectData = apiProjects.find((p) => p.id === projectId);
    if (!projectData) {
      toast.error("Project not found");
      return;
    }

    // Preload project metadata into TestDataContext
    testData.updateProjectMetadata({
      projectName: projectData.name,
      clientName: projectData.client_name || "",
      projectDate: projectData.project_date || "",
      currentProjectId: projectId,
    });

    toast.success(`Opened ${projectData.name}`);

    // Preload full project data in background for complete metadata
    const preloadFullData = async () => {
      try {
        console.log(`[Projects] Preloading full project data for ID: ${projectId}`);
        const fullProject = await fetchFullProject(projectId);

        // Update context with complete data including advanced metadata
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

        console.log(`[Projects] ✓ Full project data preloaded and context updated`);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.warn(`[Projects] Failed to preload full project data (non-critical):`, errorMsg);
        // Silently fail - basic data is already in context
      }
    };

    // Fire and forget - don't await, navigate immediately
    preloadFullData();
    // Navigate to Atterberg test view with project already loaded for inline editing
    navigate("/tests#atterberg");
  };

  const currentUser: { name?: string; email?: string } | null = null;

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
        userName={currentUser?.name}
        userEmail={currentUser?.email}
      />
      <SidebarInset>
        <div className="flex flex-col min-h-screen bg-background">
          {/* Header */}
          <header className="border-b bg-card sticky top-0 z-10">
            <div className="flex items-center justify-between h-14 px-4 gap-2">
              <div className="flex items-center gap-2">
                <SidebarTrigger />
                <div>
                  <h1 className="text-lg font-semibold">Projects</h1>
                  <p className="text-xs text-muted-foreground">
                    All user engagements
                  </p>
                </div>
              </div>
            </div>
          </header>

          {/* Main Content */}
          <main className="flex-1 overflow-auto">
            <div className="p-6">
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-4">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                      <CardTitle>Projects</CardTitle>
                      <CardDescription>
                        {filteredProjects.length} project{filteredProjects.length !== 1 ? "s" : ""}
                        {totalPages > 1 && ` • Page ${currentPage} of ${totalPages}`}
                      </CardDescription>
                    </div>
                    <Button
                      onClick={handleNewProject}
                      className="gap-2 h-10 w-full sm:w-auto"
                      size="sm"
                    >
                      <Plus className="h-4 w-4" />
                      New project
                    </Button>
                  </div>

                  {/* Search */}
                  <div className="mt-6 max-w-xs">
                    <Input
                      placeholder="Search project name, client or code..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="h-10"
                    />
                  </div>
                </CardHeader>

                <CardContent className="pt-0">
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
                    <div className="space-y-4">
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/40 hover:bg-muted/40">
                              <TableHead className="font-semibold">PROJECT</TableHead>
                              <TableHead className="font-semibold hidden sm:table-cell">DATE CREATED</TableHead>
                              <TableHead className="font-semibold text-center hidden sm:table-cell">SAMPLES</TableHead>
                              <TableHead className="font-semibold text-right">ACTION</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {paginatedProjects.map((project) => (
                              <TableRow
                                key={project.id}
                                className="border-b last:border-0 hover:bg-muted/50"
                              >
                                <TableCell>
                                  <div className="space-y-1">
                                    <p className="font-semibold">{project.name}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {project.client_name || "No client"}
                                    </p>
                                    <p className="text-xs text-muted-foreground sm:hidden">
                                      {formatDate(project.created_at)}
                                    </p>
                                  </div>
                                </TableCell>
                                <TableCell className="text-sm hidden sm:table-cell">
                                  {formatDate(project.created_at)}
                                </TableCell>
                                <TableCell className="text-center font-medium hidden sm:table-cell">
                                  {project.samples || "0"}
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-9"
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
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-2">
                          <p className="text-sm text-muted-foreground">
                            Showing {startIndex + 1} to {Math.min(endIndex, filteredProjects.length)} of {filteredProjects.length}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                              disabled={currentPage === 1}
                              className="gap-1"
                            >
                              <ChevronLeft className="h-4 w-4" />
                              Previous
                            </Button>
                            <div className="flex items-center gap-1">
                              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                                <Button
                                  key={page}
                                  variant={page === currentPage ? "default" : "outline"}
                                  size="sm"
                                  onClick={() => setCurrentPage(page)}
                                  className="w-9 h-9 p-0"
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
                              className="gap-1"
                            >
                              Next
                              <ChevronRight className="h-4 w-4" />
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
