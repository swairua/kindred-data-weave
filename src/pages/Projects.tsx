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
import { Layers, Plus, Loader2 } from "lucide-react";
import Navigation from "@/components/Navigation";
import { useProject } from "@/context/ProjectContext";
import { listRecords } from "@/lib/api";
import { toast } from "sonner";

interface ApiProjectRow {
  id: number;
  name: string;
  client_name: string | null;
  project_date: string | null;
}

const Projects = () => {
  const navigate = useNavigate();
  const project = useProject();
  const [searchQuery, setSearchQuery] = useState("");
  const [apiProjects, setApiProjects] = useState<ApiProjectRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load projects from API
  useEffect(() => {
    const loadProjects = async () => {
      try {
        setIsLoading(true);
        const response = await listRecords<ApiProjectRow>("projects", { limit: 100 });
        setApiProjects(response.data || []);
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
        samples: 0,
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

  const handleLogout = () => {
    toast.success("Logged out");
    navigate("/login", { replace: true });
  };

  const handleNewProject = () => {
    navigate("/record");
  };

  const handleOpenProject = (projectId: number) => {
    // Navigate to tests page to view/edit the project
    navigate("/tests");
  };

  const currentUser = project?.user || null;

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
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Projects</CardTitle>
                      <CardDescription>
                        {filteredProjects.length} project{filteredProjects.length !== 1 ? "s" : ""}
                      </CardDescription>
                    </div>
                    <Button
                      onClick={handleNewProject}
                      className="gap-2 h-10"
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
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/40 hover:bg-muted/40">
                            <TableHead className="font-semibold">PROJECT</TableHead>
                            <TableHead className="font-semibold">DATE CREATED</TableHead>
                            <TableHead className="font-semibold text-center">SAMPLES</TableHead>
                            <TableHead className="font-semibold text-right">ACTION</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredProjects.map((project) => (
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
                                </div>
                              </TableCell>
                              <TableCell className="text-sm">
                                {formatDate(project.created_at)}
                              </TableCell>
                              <TableCell className="text-center font-medium">
                                {project.samples || "0"}
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8"
                                  onClick={() => handleOpenProject(project.id)}
                                >
                                  Open →
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
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
