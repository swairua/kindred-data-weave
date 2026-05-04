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
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { toast } from "sonner";
import {
  ChevronDown,
  Eye,
  EyeOff,
  Layers,
  FileText,
  FlaskConical,
  Hammer,
  LayoutDashboard,
  Loader2,
  LogOut,
  Mountain,
  TestTubeDiagonal,
  History,
  Plus,
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
import { TestAccordionProvider, useTestAccordion } from "@/context/TestAccordionContext";

import Navigation from "@/components/Navigation";
import { fetchCurrentUser, loginUser, logoutUser, type ApiUser, listRecords, debugAuthState, debugApiConnectivity } from "@/lib/api";
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

type AuthStatus = "authenticated" | "unauthenticated";

type TestCategory = "soil" | "concrete" | "rock" | "special";

// Inner component that uses the accordion context
const TestsViewContent = ({ initialTab }: { initialTab?: string }) => {
  const testData = useTestData();
  const location = useLocation();
  const { setOpenTestKey } = useTestAccordion();

  // Get the test key from hash (e.g., #atterberg)
  const selectedTestFromHash = location.hash.slice(1); // Remove '#'

  // Determine if we're in "focused mode" (showing only one test from wizard)
  const isFocusedMode = selectedTestFromHash && (testData.tests[selectedTestFromHash] !== undefined);

  console.log(`[Index] TestsViewContent - hash: "${selectedTestFromHash}", isFocusedMode: ${isFocusedMode}, tests available: ${Object.keys(testData.tests).length}`);

  // Determine active tab from hash (if present) or initialTab or default to "soil"
  const getActiveTab = (): string => {
    // If hash matches a test key, determine its category
    if (selectedTestFromHash) {
      for (const [testKey, testSummary] of Object.entries(testData.tests)) {
        if (testKey === selectedTestFromHash) {
          const category = testSummary.category as TestCategory;
          if (category && ["soil", "concrete", "rock", "special"].includes(category)) {
            console.log(`[Index] Hash navigation detected: using category "${category}" for test "${selectedTestFromHash}"`);
            return category;
          }
        }
      }
    }

    // Fall back to initialTab or default
    return initialTab || "soil";
  };

  // Auto-open test when hash is present
  useEffect(() => {
    if (selectedTestFromHash) {
      setOpenTestKey(selectedTestFromHash);
      console.log(`[Index] Auto-opening test "${selectedTestFromHash}" from hash`);
    }
  }, [selectedTestFromHash, setOpenTestKey]);

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
      <TabsContent value={category} className="space-y-3">
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
            return <TestComponent key={test.key} testKey={test.key} />;
          })
        )}
      </TabsContent>
    );
  };

  // In focused mode: show only the selected test
  if (isFocusedMode) {
    const testKey = selectedTestFromHash;
    console.log(`[Index] Focused mode: rendering test "${testKey}"`);
    const TestComponent = registry.getTest(testKey);
    console.log(`[Index] TestComponent for "${testKey}":`, TestComponent);
    if (!TestComponent) {
      console.warn(`[Index] Test component not found for key: "${testKey}"`);
      return (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Test component not found: {testKey}</p>
          </CardContent>
        </Card>
      );
    }
    return <TestComponent testKey={testKey} />;
  }

  // Normal mode: show all tests in tabs
  return (
    <div className="space-y-3">
      <Tabs value={getActiveTab()} className="w-full">
        <TabsList className="w-full grid grid-cols-4 mb-4 h-11">
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
    </div>
  );
};

// Component to render tests dynamically from registry
const TestsView = ({ initialTab }: { initialTab?: string }) => {
  return (
    <TestAccordionProvider>
      <TestsViewContent initialTab={initialTab} />
    </TestAccordionProvider>
  );
};

const Index = ({ initialTab }: IndexProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const testData = useTestData();
  const isTestsPage = location.pathname === "/tests";
  const isReportsPage = location.pathname === "/reports";
  const isAdminPage = location.pathname === "/admin";
  const [view, setView] = useState<"dashboard" | "tests" | "reports" | "admin">(
    isAdminPage ? "admin" : isReportsPage ? "reports" : isTestsPage ? "tests" : "dashboard",
  );
  const [projectName, setProjectName] = useState("");
  const [clientName, setClientName] = useState("");
  const [projectDate, setProjectDate] = useState<string | undefined>(undefined);
  const [currentProjectId, setCurrentProjectId] = useState<number | null>(null);
  // Default to unauthenticated to show login immediately, then check session in background
  const [authStatus, setAuthStatus] = useState<AuthStatus>("unauthenticated");
  const [isCheckingAuth, setIsCheckingAuth] = useState(true); // Track if session restoration is in progress
  const [currentUser, setCurrentUser] = useState<ApiUser | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmittingLogin, setIsSubmittingLogin] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [projectHistory, setProjectHistory] = useState<ApiProjectRow[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  
  const today = new Date().toISOString().split("T")[0];

  const isAuthenticated: boolean = authStatus === "authenticated";

  // Initialize from TestDataContext metadata (set by wizard)
  useEffect(() => {
    if (testData.projectMetadata.projectName && !projectName) {
      setProjectName(testData.projectMetadata.projectName);
    }
    if (testData.projectMetadata.clientName && !clientName) {
      setClientName(testData.projectMetadata.clientName);
    }
  }, [testData.projectMetadata.projectName, testData.projectMetadata.clientName, projectName, clientName]);

  // Enable debug logging via URL param (?debug=1)
  const debugMode = new URLSearchParams(location.search).get("debug") === "1";
  const log = (msg: string, ...args: any[]) => {
    if (debugMode) console.log(msg, ...args);
  };
  const warn = (msg: string, ...args: any[]) => {
    if (debugMode) console.warn(msg, ...args);
  };

  // Initialize auth state - restore session if available
  useEffect(() => {
    log("[Index] Page mounted - attempting to restore session");
    const restoreSession = async () => {
      try {
        // Use a shorter timeout for session check (3 seconds) so login page shows quickly
        const user = await fetchCurrentUser(3000);
        log("[Index] Session restored, user:", user.name);
        setCurrentUser(user);
        setAuthStatus("authenticated");
      } catch (error) {
        log("[Index] No active session - user is unauthenticated:", error instanceof Error ? error.message : error);
        setCurrentUser(null);
        setAuthStatus("unauthenticated");
        // Don't navigate here - let the route protection effect handle redirects
        // This prevents race conditions when user navigates directly to protected routes
      } finally {
        setIsCheckingAuth(false);
      }
    };
    restoreSession();
  }, []);

  // Keep session alive while authenticated to prevent backend timeout
  // Pings every 5 minutes to refresh the session on backend
  useSessionKeepAlive(authStatus === "authenticated");

  useEffect(() => {
    log("[Index] authStatus changed to:", authStatus);
  }, [authStatus]);

  // Protect routes - redirect unauthenticated users away from protected pages
  // Skip redirect while checking auth to avoid premature redirect before session is restored
  useEffect(() => {
    if (isCheckingAuth) {
      log("[Index] Skipping route protection - still checking auth status");
      return;
    }

    const protectedRoutes = ["/tests", "/reports", "/admin"];
    const isProtectedRoute = protectedRoutes.includes(location.pathname);

    // Only redirect if auth check is complete AND user is confirmed unauthenticated
    if (isProtectedRoute && !isAuthenticated && !isCheckingAuth) {
      log("[Index] Redirecting unauthenticated user from protected route:", location.pathname);
      navigate("/", { replace: true });
    }
  }, [location.pathname, isAuthenticated, isCheckingAuth, navigate]);

  // Sync view state with URL changes
  useEffect(() => {
    if (isAdminPage) {
      setView("admin");
    } else if (isReportsPage) {
      setView("reports");
    } else if (isTestsPage) {
      setView("tests");
    } else {
      setView("dashboard");
    }
  }, [location.pathname, isAdminPage, isReportsPage, isTestsPage]);

  useEffect(() => {
    if (authStatus !== "authenticated") {
      log("[Index] Skipping project history load: not authenticated yet");
      return;
    }

    if (!currentUser) {
      log("[Index] Skipping project history load: no current user");
      return;
    }

    let isMounted = true;

    const loadProjects = async () => {
      try {
        log("[Index] Loading project history from API...");
        log("[Index] Current auth status:", authStatus);
        log("[Index] Current user:", currentUser);
        setIsLoadingProjects(true);
        const response = await listRecords<ApiProjectRow>("projects", { limit: 100 });

        if (!isMounted) {
          log("[Index] Component unmounted before project history response");
          return;
        }

        const projects = response.data || [];
        log(`[Index] Successfully loaded ${projects.length} projects from API`);
        log("[Index] Projects:", projects);
        setProjectHistory(projects);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);

        // Check if it's a network/API unavailability error
        const isNetworkError = errorMsg.toLowerCase().includes("failed to fetch") ||
                              errorMsg.toLowerCase().includes("unable to reach");

        if (!isNetworkError) {
          warn("[Index] Failed to load project history:", errorMsg);
        } else {
          log("[Index] API server currently unavailable, project history will not load");
        }

        // If it's an authentication error, log additional context
        // Note: Don't auto-logout on 401 from project loading - it's a non-critical background task
        if (errorMsg.includes("401") || errorMsg.includes("Unauthorized")) {
          warn("[Index] ⚠️ Project loading returned 401 - possible session expiration on backend");
          warn("[Index] Keeping user logged in locally - will retry on next action");
          // Don't auto-logout on background task failures - let the user trigger actions that will refresh the session
        }

        if (isMounted && !isNetworkError) {
          warn("[Index] Project history load failed - will show 'No saved projects'");
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
    setProjectDate(project.project_date || undefined);
    setCurrentProjectId(project.id);
    testData.updateProjectMetadata({ projectName: project.name, clientName: project.client_name || "" });
    toast.success(`Loaded project: ${project.name}`);
  };

  const handleStartNewProject = () => {
    const timestamp = new Date().toISOString();
    log(`[Index] ${timestamp} === START NEW PROJECT ===`);
    log("[Index] Clearing project data but PRESERVING user session");

    // Clear form fields
    setProjectName("");
    setClientName("");
    setProjectDate(undefined);
    setCurrentProjectId(null);

    // Clear project-related localStorage (BUT NOT session token)
    log("[Index] Removing project state from localStorage...");
    localStorage.removeItem("atterbergProjectState");
    localStorage.removeItem("enhancedAtterbergTests");
    // ✓ FIXED: Do NOT clear session token when starting a new project
    // The user should remain logged in with a fresh project state

    // Reset all test data context
    testData.resetProjectData();

    // Dispatch custom event for components to listen to (e.g., AtterbergTest)
    window.dispatchEvent(new CustomEvent("resetProject"));

    toast.success("New project started - form cleared and data reset");

    log(`[Index] ${timestamp} New project initialization complete`);
  };

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextEmail = email.trim();
    if (!nextEmail || !password) {
      toast.error("Enter your email and password");
      return;
    }

    setIsSubmittingLogin(true);
    setLoginError(null);

    try {
      const response = await loginUser(nextEmail, password);
      setCurrentUser(response.user);
      setAuthStatus("authenticated");
      setEmail(nextEmail);
      setPassword("");
      toast.success(`Signed in as ${response.user.name}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Login failed";
      setCurrentUser(null);
      setAuthStatus("unauthenticated");
      setLoginError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsSubmittingLogin(false);
    }
  };

  const handleLogout = async () => {
    const timestamp = new Date().toISOString();
    log(`[Index] ${timestamp} === USER-INITIATED LOGOUT ===`);
    log("[Index] Calling logoutUser()...");
    try {
      await logoutUser();
      toast.success("Logged out");
      log(`[Index] ${new Date().toISOString()} Logout successful, clearing auth state`);
    } catch (error) {
      warn(`[Index] ${new Date().toISOString()} Failed to logout:`, error);
      toast.error("Failed to end the remote session");
    } finally {
      setCurrentUser(null);
      setPassword("");
      setAuthStatus("unauthenticated");
      log(`[Index] ${new Date().toISOString()} Auth state cleared (user marked as unauthenticated)`);
    }
  };

  const projectCtx = useMemo(
    () => ({
      projectName,
      clientName,
      date: today,
      currentProjectId,
      projectDate,
      labOrganization: testData.projectMetadata.labOrganization,
      dateReported: testData.projectMetadata.dateReported,
      checkedBy: testData.projectMetadata.checkedBy,
      projectHistory,
      isLoadingProjects,
      projectMetadata: testData.projectMetadata,
      onProjectNameChange: handleProjectNameChange,
      onClientNameChange: handleClientNameChange,
      onLoadProject: handleLoadProject,
      onStartNewProject: handleStartNewProject,
      onMetadataChange: handleMetadataChange,
    }),
    [projectName, clientName, today, currentProjectId, projectDate, testData.projectMetadata, projectHistory, isLoadingProjects],
  );

  // Silent splash while session is being restored — avoids the login-form flash
  // when navigating between protected routes (e.g. wizard → dashboard).
  if (isCheckingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Layers className="h-5 w-5 text-primary animate-pulse" />
        </div>
      </div>
    );
  }

  // Show login form if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center px-0 md:px-4 py-12 bg-background">
        <div className="w-full max-w-md mx-auto px-4 md:px-0">
          <div className="w-full animate-fade-in">
            <div className="flex flex-col items-center gap-3 mb-6">
              <div className="h-12 w-12 rounded-xl bg-primary flex items-center justify-center shadow-sm">
                <Layers className="h-6 w-6 text-primary-foreground" />
              </div>
              <div className="text-center">
                <h1 className="text-2xl font-semibold text-foreground tracking-tight">Cransfield</h1>
                <p className="text-sm text-muted-foreground">Geotechnical Laboratory System</p>
              </div>
            </div>

            <Card className="border border-border shadow-sm rounded-2xl overflow-hidden bg-card">
              <CardHeader className="space-y-1 pb-4">
                <CardTitle className="text-xl font-semibold">Welcome back</CardTitle>
                <CardDescription>Sign in to your lab account</CardDescription>
              </CardHeader>

              <CardContent className="p-6 pt-2 space-y-5">
                <form className="space-y-4" onSubmit={handleLogin}>
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-sm font-medium text-foreground">
                      Email address
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="e.g. john@cransfield.co.ke"
                      autoComplete="email"
                      className="h-11 rounded-lg"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password" className="text-sm font-medium text-foreground">
                        Password
                      </Label>
                      <button type="button" className="text-xs text-primary hover:underline font-medium">
                        Forgot password?
                      </button>
                    </div>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder="Enter your password"
                        autoComplete="current-password"
                        className="h-11 rounded-lg pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((s) => !s)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {loginError && (
                    <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 animate-shake">
                      <p className="text-sm text-destructive font-medium">{loginError}</p>
                    </div>
                  )}

                  <Button
                    type="submit"
                    className="w-full h-11 text-sm font-semibold rounded-lg"
                    disabled={isSubmittingLogin}
                  >
                    {isSubmittingLogin ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Signing in...
                      </>
                    ) : (
                      "Sign in"
                    )}
                  </Button>
                </form>

                <p className="text-center text-xs text-muted-foreground">
                  Don't have an account? Contact your lab administrator.
                </p>
              </CardContent>
            </Card>

            <p className="text-center text-xs text-muted-foreground mt-6">
              Cransfield · Geotechnical Laboratory System
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Render authenticated app with sidebar when authenticated
  return (
    <ProjectContext.Provider value={projectCtx}>
      <SidebarProvider>
        <Navigation
          currentView={view}
          onViewChange={setView}
          onLogout={handleLogout}
          userName={currentUser?.name}
          userEmail={currentUser?.email}
        />
        <SidebarInset className="flex flex-col min-h-svh">
          <header className="border-b sticky top-0 z-10" style={{ borderColor: "#E3E1D9", backgroundColor: "#FFFFFF" }}>
            <div className="px-4 md:px-6 py-3">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <SidebarTrigger className="h-9 w-9" />
                  <div className="hidden sm:block">
                    <h1 className="text-base font-semibold text-foreground tracking-tight leading-tight">
                      {view === "dashboard" ? "Dashboard" : view === "tests" ? "Record test" : view === "reports" ? "Reports" : "Admin"}
                    </h1>
                    <p className="text-xs text-muted-foreground leading-tight">
                      Cransfield Geotechnical Laboratory
                    </p>
                  </div>
                </div>

                {currentUser ? (
                  <div className="flex items-center gap-3">
                    <div className="text-right hidden md:block">
                      <p className="text-xs font-semibold text-foreground leading-tight">{currentUser.name}</p>
                      <p className="text-[11px] text-muted-foreground leading-tight">{currentUser.email}</p>
                    </div>
                    <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={handleLogout}>
                      <LogOut className="h-4 w-4" />
                      <span className="hidden sm:inline">Logout</span>
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
          </header>

          <main className="flex-1 overflow-y-auto px-0 py-4">
            <div className="w-full md:max-w-6xl md:mx-auto md:px-4">
              <div className="px-4 md:px-0">
                {view === "dashboard" ? (
                  <Dashboard />
                ) : view === "reports" ? (
                  <Reports />
                ) : view === "admin" ? (
                  <Admin />
                ) : (
                  <TestsView initialTab={initialTab} />
                )}
              </div>
            </div>
          </main>
        </SidebarInset>
      </SidebarProvider>
    </ProjectContext.Provider>
  );
};

export default Index;
