import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { ProjectContext } from "@/context/ProjectContext";
import { useTestData } from "@/context/TestDataContext";
import { useSessionKeepAlive } from "@/hooks/useSessionKeepAlive";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import {
  ChevronDown,
  FileText,
  FlaskConical,
  Hammer,
  LayoutDashboard,
  Loader2,
  LogOut,
  Mountain,
  TestTubeDiagonal,
  History,
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import Dashboard from "@/pages/Dashboard";
import Reports from "@/pages/Reports";
import Admin from "@/pages/Admin";
import { fetchCurrentUser, loginUser, logoutUser, type ApiUser, listRecords, debugAuthState } from "@/lib/api";
import { registerAllTests } from "@/lib/testRegistration";
import { registry } from "@/lib/testRegistry";

interface ApiProjectRow {
  id: number;
  name: string;
  client_name: string | null;
  project_date: string | null;
}

// Initialize test registry once on module load
registerAllTests();

interface IndexProps {
  initialTab?: string;
}

type AuthStatus = "checking" | "authenticated" | "unauthenticated";

type TestCategory = "soil" | "concrete" | "rock" | "special";

// Component to render tests dynamically from registry
const TestsView = ({ initialTab }: { initialTab?: string }) => {
  const testData = useTestData();

  // Group tests by category
  const testsByCategory = useMemo(() => {
    const categories: Record<TestCategory, { key: string; name: string; sortOrder: number }[]> = {
      soil: [],
      concrete: [],
      rock: [],
      special: [],
    };

    // Iterate through test data and build categories
    for (const [testKey, testSummary] of Object.entries(testData.tests)) {
      // Skip disabled tests
      if (testSummary.enabled === false) {
        continue;
      }

      const category = testSummary.category as TestCategory;
      if (categories[category]) {
        categories[category].push({
          key: testKey,
          name: testSummary.name,
          sortOrder: testSummary.sortOrder || 0,
        });
      }
    }

    // Sort within each category by sortOrder
    for (const category of Object.keys(categories) as TestCategory[]) {
      categories[category].sort((a, b) => a.sortOrder - b.sortOrder);
    }

    return categories;
  }, [testData.tests]);

  const renderTestsByCategory = (category: TestCategory) => {
    const tests = testsByCategory[category];
    return (
      <TabsContent value={category} className="space-y-4">
        {tests.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">No tests available for this category</p>
            </CardContent>
          </Card>
        ) : (
          tests.map((test) => {
            const TestComponent = registry.getTest(test.key);
            if (!TestComponent) {
              return null;
            }
            return <TestComponent key={test.key} />;
          })
        )}
      </TabsContent>
    );
  };

  return (
    <Tabs defaultValue={initialTab || "soil"} className="w-full">
      <TabsList className="w-full grid grid-cols-4 mb-6 h-11">
        <TabsTrigger value="soil" className="gap-1.5 text-sm">
          <Mountain className="h-4 w-4" /> Soil
        </TabsTrigger>
        <TabsTrigger value="concrete" className="gap-1.5 text-sm">
          <Hammer className="h-4 w-4" /> Concrete
        </TabsTrigger>
        <TabsTrigger value="rock" className="gap-1.5 text-sm">
          <Mountain className="h-4 w-4" /> Rock
        </TabsTrigger>
        <TabsTrigger value="special" className="gap-1.5 text-sm">
          <TestTubeDiagonal className="h-4 w-4" /> Special
        </TabsTrigger>
      </TabsList>

      {renderTestsByCategory("soil")}
      {renderTestsByCategory("concrete")}
      {renderTestsByCategory("rock")}
      {renderTestsByCategory("special")}
    </Tabs>
  );
};

const Index = ({ initialTab }: IndexProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const testData = useTestData();
  const isTestsPage = location.pathname === "/tests";
  const isReportsPage = location.pathname === "/reports";
  const [view, setView] = useState<"dashboard" | "tests" | "reports" | "admin">(
    isReportsPage ? "reports" : isTestsPage ? "tests" : "dashboard",
  );
  const [projectName, setProjectName] = useState("");
  const [clientName, setClientName] = useState("");
  const [currentProjectId, setCurrentProjectId] = useState<number | null>(null);
  const [showAdvancedMetadata, setShowAdvancedMetadata] = useState(false);
  const [authStatus, setAuthStatus] = useState<AuthStatus>("checking");
  const [currentUser, setCurrentUser] = useState<ApiUser | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmittingLogin, setIsSubmittingLogin] = useState(false);
  const [projectHistory, setProjectHistory] = useState<ApiProjectRow[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const today = new Date().toISOString().split("T")[0];

  const projectCtx = useMemo(() => ({ projectName, clientName, date: today, currentProjectId }), [projectName, clientName, today, currentProjectId]);
  const isAuthenticated = authStatus === "authenticated";

  // Expose debug function to window for console access
  useEffect(() => {
    (window as any).__debugAuth = debugAuthState;
    console.log("[Index] Debug tip: Run debugAuthState() in console to check session token status");
  }, []);

  useEffect(() => {
    let isMounted = true;
    let timeoutId: NodeJS.Timeout;

    const restoreSession = async () => {
      try {
        console.log("[Index] Starting session restore...");
        const user = await fetchCurrentUser();
        console.log("[Index] Session restore complete. User:", user);

        if (!isMounted) return;

        if (user) {
          console.log("[Index] User authenticated, setting authStatus to authenticated");
          setCurrentUser(user);
          setAuthStatus("authenticated");
        } else {
          console.log("[Index] No user, setting authStatus to unauthenticated");
          setCurrentUser(null);
          setAuthStatus("unauthenticated");
        }
      } catch (err) {
        console.error("[Index] Error during session restore:", err);
        if (isMounted) {
          setCurrentUser(null);
          setAuthStatus("unauthenticated");
        }
      }
    };

    // Start the session restore
    restoreSession();

    // Set a timeout to force unauthenticated state if the check takes too long
    timeoutId = setTimeout(() => {
      if (isMounted) {
        console.warn("[Index] Session restore timeout - setting to unauthenticated");
        setCurrentUser(null);
        setAuthStatus("unauthenticated");
      }
    }, 3000);

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, []);

  // Keep session alive while authenticated
  useSessionKeepAlive(isAuthenticated);

  useEffect(() => {
    console.log("[Index] authStatus changed to:", authStatus);
  }, [authStatus]);

  useEffect(() => {
    if (authStatus !== "authenticated") {
      console.log("[Index] Skipping project history load: not authenticated yet");
      return;
    }

    if (!currentUser) {
      console.log("[Index] Skipping project history load: no current user");
      return;
    }

    let isMounted = true;

    const loadProjects = async () => {
      try {
        console.log("[Index] Loading project history from API...");
        console.log("[Index] Current auth status:", authStatus);
        console.log("[Index] Current user:", currentUser);
        setIsLoadingProjects(true);
        const response = await listRecords<ApiProjectRow>("projects", { limit: 100 });

        if (!isMounted) {
          console.log("[Index] Component unmounted before project history response");
          return;
        }

        const projects = response.data || [];
        console.log(`[Index] Successfully loaded ${projects.length} projects from API`);
        console.log("[Index] Projects:", projects);
        setProjectHistory(projects);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error("[Index] Failed to load project history:", errorMsg);

        // If it's an authentication error, log additional context
        if (errorMsg.includes("401") || errorMsg.includes("Unauthorized")) {
          console.error("[Index] ⚠️ AUTHENTICATION ERROR on list endpoint");
          console.error("[Index] This means the session token from login is not being recognized by the server");
          console.error("[Index] Possible causes:");
          console.error("[Index]   1. Session token not being returned by login endpoint");
          console.error("[Index]   2. Backend expecting different header name for token (not X-Session-Token)");
          console.error("[Index]   3. Backend session token expired or invalid");
          console.log("[Index] Auth status:", authStatus);
          console.log("[Index] Current user:", currentUser);

          // Try to refresh the session by verifying current user again
          if (isMounted) {
            console.log("[Index] Attempting to refresh session...");
            try {
              const refreshedUser = await fetchCurrentUser();
              if (refreshedUser && isMounted) {
                console.log("[Index] Session refreshed successfully");
                // Don't retry project loading automatically - let user trigger it
              } else if (isMounted) {
                console.warn("[Index] Session refresh failed - marking as unauthenticated");
                setCurrentUser(null);
                setAuthStatus("unauthenticated");
              }
            } catch (refreshError) {
              console.error("[Index] Session refresh failed:", refreshError);
              if (isMounted) {
                setCurrentUser(null);
                setAuthStatus("unauthenticated");
              }
            }
          }
        }

        if (isMounted) {
          console.warn("[Index] Project history load failed - will show 'No saved projects'");
        }
        // Silently fail - not critical to operation
      } finally {
        if (isMounted) {
          setIsLoadingProjects(false);
        }
      }
    };

    loadProjects();

    return () => {
      isMounted = false;
    };
  }, [authStatus]);

  const handleProjectNameChange = (value: string) => {
    setProjectName(value);
    testData.updateProjectMetadata({ projectName: value });
  };

  const handleClientNameChange = (value: string) => {
    setClientName(value);
    testData.updateProjectMetadata({ clientName: value });
  };

  const handleMetadataChange = (key: keyof typeof testData.projectMetadata, value: string) => {
    testData.updateProjectMetadata({ [key]: value });
  };

  const handleLoadProject = (projectId: string) => {
    const project = projectHistory.find((p) => String(p.id) === projectId);
    if (!project) return;

    setProjectName(project.name);
    setClientName(project.client_name || "");
    setCurrentProjectId(project.id);
    testData.updateProjectMetadata({ projectName: project.name, clientName: project.client_name || "" });
    toast.success(`Loaded project: ${project.name}`);
  };

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextEmail = email.trim();
    if (!nextEmail || !password) {
      toast.error("Enter your email and password");
      return;
    }

    setIsSubmittingLogin(true);

    try {
      const response = await loginUser(nextEmail, password);
      setCurrentUser(response.user);
      setAuthStatus("authenticated");
      setEmail(nextEmail);
      setPassword("");
      toast.success(`Signed in as ${response.user.name}`);
    } catch (error) {
      setCurrentUser(null);
      setAuthStatus("unauthenticated");
      toast.error(error instanceof Error ? error.message : "Login failed");
    } finally {
      setIsSubmittingLogin(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logoutUser();
      toast.success("Logged out");
    } catch (error) {
      console.error("Failed to logout:", error);
      toast.error("Failed to end the remote session");
    } finally {
      setCurrentUser(null);
      setPassword("");
      setAuthStatus("unauthenticated");
    }
  };

  return (
    <ProjectContext.Provider value={projectCtx}>
      <div className="min-h-screen bg-background">
        <header className="border-b bg-card sticky top-0 z-10">
          <div className="container max-w-6xl mx-auto px-4 py-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
                  <FlaskConical className="h-5 w-5 text-primary-foreground" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-foreground tracking-tight">Engineering Material Testing</h1>
                  <p className="text-xs text-muted-foreground">Laboratory Test Data Management</p>
                </div>
              </div>

              {authStatus === "checking" ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Checking session
                </div>
              ) : currentUser ? (
                <div className="flex items-center gap-3 self-start sm:self-auto">
                  <div className="text-left sm:text-right">
                    <p className="text-sm font-medium text-foreground">{currentUser.name}</p>
                    <p className="text-xs text-muted-foreground">{currentUser.email}</p>
                  </div>
                  <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={handleLogout}>
                    <LogOut className="h-4 w-4" /> Logout
                  </Button>
                </div>
              ) : null}
            </div>

            {isAuthenticated && (
              <>
                <div className="mt-4 flex gap-2">
                  <Button
                    variant={view === "dashboard" ? "default" : "outline"}
                    size="sm"
                    className="gap-1.5"
                    onClick={() => {
                      setView("dashboard");
                      navigate("/");
                    }}
                  >
                    <LayoutDashboard className="h-4 w-4" /> Dashboard
                  </Button>
                  <Button
                    variant={view === "tests" ? "default" : "outline"}
                    size="sm"
                    className="gap-1.5"
                    onClick={() => {
                      setView("tests");
                      navigate("/tests");
                    }}
                  >
                    <FlaskConical className="h-4 w-4" /> Tests
                  </Button>
                  <Button
                    variant={view === "reports" ? "default" : "outline"}
                    size="sm"
                    className="gap-1.5"
                    onClick={() => {
                      setView("reports");
                      navigate("/reports");
                    }}
                  >
                    <FileText className="h-4 w-4" /> Reports
                  </Button>
                  <Button
                    variant={view === "admin" ? "default" : "outline"}
                    size="sm"
                    className="gap-1.5"
                    onClick={() => {
                      setView("admin");
                      navigate("/");
                    }}
                  >
                    <Hammer className="h-4 w-4" /> Admin
                  </Button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mt-4">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Project Name</Label>
                    <Input value={projectName} onChange={(e) => handleProjectNameChange(e.target.value)} placeholder="Enter project name" className="h-9" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Client Name</Label>
                    <Input value={clientName} onChange={(e) => handleClientNameChange(e.target.value)} placeholder="Enter client name" className="h-9" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Date</Label>
                    <Input value={today} readOnly className="h-9 calculated-field cursor-default" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <History className="h-3.5 w-3.5" /> History
                    </Label>
                    {projectHistory.length > 0 ? (
                      <Select value="" onValueChange={handleLoadProject}>
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Load a project" />
                        </SelectTrigger>
                        <SelectContent>
                          {projectHistory.map((project) => (
                            <SelectItem key={project.id} value={String(project.id)}>
                              <div className="flex flex-col">
                                <span className="font-medium">{project.name}</span>
                                <span className="text-xs text-muted-foreground">{project.client_name && `${project.client_name} • `}{project.project_date}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="h-9 px-3 py-2 rounded-md border border-input bg-background text-muted-foreground text-sm flex items-center">
                        {isLoadingProjects ? "Loading..." : "No saved projects"}
                      </div>
                    )}
                  </div>
                </div>

                <Collapsible open={showAdvancedMetadata} onOpenChange={setShowAdvancedMetadata} className="mt-3 border-t pt-3">
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="gap-1.5 h-8 px-2 text-xs">
                      <ChevronDown className="h-4 w-4 transition-transform" style={{ transform: showAdvancedMetadata ? "rotate(180deg)" : "rotate(0deg)" }} />
                      Advanced Metadata
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-3 space-y-3 pt-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Lab Organization</Label>
                        <Input
                          value={testData.projectMetadata.labOrganization || ""}
                          onChange={(e) => handleMetadataChange("labOrganization", e.target.value)}
                          placeholder="Enter lab organization"
                          className="h-9"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Date Reported</Label>
                        <Input
                          type="date"
                          value={testData.projectMetadata.dateReported || ""}
                          onChange={(e) => handleMetadataChange("dateReported", e.target.value)}
                          className="h-9"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Checked By</Label>
                        <Input
                          value={testData.projectMetadata.checkedBy || ""}
                          onChange={(e) => handleMetadataChange("checkedBy", e.target.value)}
                          placeholder="Enter name of person who checked"
                          className="h-9"
                        />
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </>
            )}
          </div>
        </header>

        <main className="container max-w-6xl mx-auto px-4 py-6">
          {authStatus === "checking" ? (
            <div className="flex min-h-[60vh] items-center justify-center">
              <Card className="w-full max-w-md shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg">Checking your session</CardTitle>
                  <CardDescription>Connecting to the lab API.</CardDescription>
                </CardHeader>
                <CardContent className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Please wait
                </CardContent>
              </Card>
            </div>
          ) : !isAuthenticated ? (
            <div className="flex min-h-[60vh] items-center justify-center">
              <Card className="w-full max-w-md shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg">Sign in</CardTitle>
                  <CardDescription>Use your lab account to access tests, dashboards, and reports.</CardDescription>
                </CardHeader>
                <CardContent>
                  <form className="space-y-4" onSubmit={handleLogin}>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder="Enter your email"
                        autoComplete="email"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="password">Password</Label>
                      <Input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder="Enter your password"
                        autoComplete="current-password"
                      />
                    </div>
                    <Button type="submit" className="w-full" disabled={isSubmittingLogin}>
                      {isSubmittingLogin ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" /> Signing in
                        </>
                      ) : (
                        "Login"
                      )}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>
          ) : view === "dashboard" ? (
            <Dashboard />
          ) : view === "reports" ? (
            <Reports />
          ) : view === "admin" ? (
            <Admin />
          ) : (
            <TestsView initialTab={initialTab} />
          )}
        </main>
      </div>
    </ProjectContext.Provider>
  );
};

export default Index;
