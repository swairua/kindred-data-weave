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
import { TestAccordionProvider } from "@/context/TestAccordionContext";

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
      <TestAccordionProvider>
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
      </TestAccordionProvider>
    );
  };

  return (
    <div className="space-y-3">
      <Tabs defaultValue={initialTab || "soil"} className="w-full">
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
  const [authStatus, setAuthStatus] = useState<AuthStatus>("checking");
  const [currentUser, setCurrentUser] = useState<ApiUser | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmittingLogin, setIsSubmittingLogin] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [projectHistory, setProjectHistory] = useState<ApiProjectRow[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [showLoginForm, setShowLoginForm] = useState(false);
  const today = new Date().toISOString().split("T")[0];

  const isAuthenticated = authStatus === "authenticated";

  // Enable debug logging via URL param (?debug=1)
  const debugMode = new URLSearchParams(location.search).get("debug") === "1";
  const log = (msg: string, ...args: any[]) => {
    if (debugMode) console.log(msg, ...args);
  };
  const warn = (msg: string, ...args: any[]) => {
    if (debugMode) console.warn(msg, ...args);
  };

  useEffect(() => {
    let isMounted = true;
    let timeoutId: NodeJS.Timeout;

    const restoreSession = async () => {
      try {
        log("[Index] Starting session restore...");

        // Race the session restore against a 3-second timeout
        const sessionPromise = fetchCurrentUser();
        const timeoutPromise = new Promise<null>((_, reject) =>
          setTimeout(() => reject(new Error("Session restore timeout")), 3000)
        );

        const user = await Promise.race([sessionPromise, timeoutPromise]);
        log("[Index] Session restore complete. User:", user);

        if (!isMounted) return;

        if (user) {
          log("[Index] User authenticated, setting authStatus to authenticated");
          setCurrentUser(user);
          setAuthStatus("authenticated");
        } else {
          log("[Index] No user, setting authStatus to unauthenticated");
          setCurrentUser(null);
          setAuthStatus("unauthenticated");
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        warn("[Index] Session restore failed:", errorMessage);
        if (isMounted) {
          setCurrentUser(null);
          setAuthStatus("unauthenticated");
        }
      } finally {
        // Clear the fallback timeout once session restore completes
        clearTimeout(timeoutId);
      }
    };

    // Start the session restore
    restoreSession();

    // Fallback timeout (should rarely be needed now with Promise.race)
    timeoutId = setTimeout(() => {
      if (isMounted) {
        warn("[Index] Fallback timeout - setting to unauthenticated");
        setCurrentUser(null);
        setAuthStatus("unauthenticated");
      }
    }, 5000);

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, []);

  // Keep session alive while authenticated to prevent backend timeout
  // Pings every 5 minutes to refresh the session on backend
  useSessionKeepAlive(authStatus === "authenticated");

  useEffect(() => {
    log("[Index] authStatus changed to:", authStatus);
  }, [authStatus]);

  // Protect routes - redirect unauthenticated users away from protected pages
  useEffect(() => {
    if (authStatus === "checking") {
      return; // Still checking, don't redirect yet
    }

    const protectedRoutes = ["/tests", "/reports", "/admin"];
    const isProtectedRoute = protectedRoutes.includes(location.pathname);

    if (isProtectedRoute && !isAuthenticated) {
      log("[Index] Redirecting unauthenticated user from protected route:", location.pathname);
      navigate("/", { replace: true });
    }
  }, [authStatus, location.pathname, isAuthenticated, navigate]);

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

  return (
    <ProjectContext.Provider value={projectCtx}>
      {isAuthenticated ? (
        <SidebarProvider>
          <Navigation
            currentView={view}
            onViewChange={setView}
            onLogout={handleLogout}
            userName={currentUser?.name}
            userEmail={currentUser?.email}
          />
          <SidebarInset className="flex flex-col min-h-svh">
            <header className="border-b bg-gradient-to-r from-white to-blue-50 dark:from-slate-950 dark:to-blue-950/20 sticky top-0 z-10 shadow-sm">
              <div className="px-4 md:px-6 py-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-4">
                    <SidebarTrigger className="md:hidden h-10 w-10" />
                    <div className="h-11 w-11 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center overflow-hidden shadow-lg flex-shrink-0">
                      <img
                        src="https://cdn.builder.io/api/v1/image/assets%2Fedb7c735e72a41328e7ab97a48a7676d%2Fe8eac870f9c84f0c869c7c6ece6e38e5?format=webp&width=800&height=1200"
                        alt="Cransfield Materials Testing Center"
                        className="h-8 w-8 object-contain"
                      />
                    </div>
                    <div className="hidden sm:block">
                      <h1 className="text-lg font-bold text-foreground tracking-tight">Cransfield CMTC</h1>
                      <p className="text-xs text-muted-foreground">Materials Testing Center</p>
                    </div>
                  </div>

                  {authStatus === "checking" ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Checking session
                    </div>
                  ) : currentUser ? (
                    <div className="flex items-center gap-4">
                      <div className="text-right hidden sm:block">
                        <p className="text-sm font-semibold text-foreground">{currentUser.name}</p>
                        <p className="text-xs text-muted-foreground">{currentUser.email}</p>
                      </div>
                      <Button type="button" variant="outline" size="sm" className="gap-1.5 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={handleLogout}>
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
            <div className="min-h-[calc(100vh-200px)] flex items-center justify-center px-0 md:px-4 py-12 relative overflow-hidden">
              {/* Animated background gradient elements */}
              <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
                <div className="absolute top-1/4 right-0 w-96 h-96 bg-gradient-to-bl from-blue-500/8 to-transparent rounded-full blur-3xl animate-pulse"></div>
                <div className="absolute bottom-1/4 left-0 w-96 h-96 bg-gradient-to-tr from-indigo-500/8 to-transparent rounded-full blur-3xl animate-pulse animation-delay-2000"></div>
                <div className="absolute top-0 left-1/2 w-96 h-96 bg-gradient-to-b from-purple-500/5 to-transparent rounded-full blur-3xl animate-pulse animation-delay-4000"></div>
              </div>

              <div className="w-full max-w-md mx-auto relative z-0 px-4 md:px-0">
                {/* Right side - Login form with enhanced design */}
                <div className="w-full animate-fade-in animation-delay-200">
                  <Card className="border-0 shadow-2xl rounded-2xl overflow-hidden bg-card backdrop-blur-sm">
                    {/* Card header with gradient */}
                    <div className="bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 px-4 md:px-8 py-8 md:py-10 text-white relative overflow-hidden">
                      <div className="absolute inset-0 opacity-20">
                        <div className="absolute top-0 right-0 w-40 h-40 bg-white rounded-full blur-3xl opacity-20"></div>
                      </div>
                      <div className="space-y-2 relative z-10">
                        <h1 className="text-4xl font-bold">Welcome Back</h1>
                        <p className="text-blue-100 text-lg">Sign in to your lab account</p>
                      </div>
                    </div>

                    <CardContent className="p-4 md:p-8 space-y-5">
                      <form className="space-y-5" onSubmit={handleLogin}>
                        {/* Email field */}
                        <div className="space-y-2.5">
                          <Label htmlFor="email" className="text-sm font-semibold text-foreground">
                            Email Address
                          </Label>
                          <Input
                            id="email"
                            type="email"
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            placeholder="your@email.com"
                            autoComplete="email"
                            className="h-12 px-4 rounded-lg border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 hover:border-slate-300"
                          />
                        </div>

                        {/* Password field */}
                        <div className="space-y-2.5">
                          <Label htmlFor="password" className="text-sm font-semibold text-foreground">
                            Password
                          </Label>
                          <Input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            placeholder="••••••••"
                            autoComplete="current-password"
                            className="h-12 px-4 rounded-lg border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 hover:border-slate-300"
                          />
                        </div>

                        {/* Error message */}
                        {loginError && (
                          <div className="p-4 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 animate-shake">
                            <p className="text-sm text-red-700 dark:text-red-200 font-medium">{loginError}</p>
                          </div>
                        )}

                        {/* Submit button */}
                        <Button
                          type="submit"
                          className="w-full h-12 text-base font-semibold rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105 active:scale-95"
                          disabled={isSubmittingLogin}
                        >
                          {isSubmittingLogin ? (
                            <>
                              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Signing in...
                            </>
                          ) : (
                            "Sign In"
                          )}
                        </Button>
                      </form>

                      {/* Divider */}
                      <div className="flex items-center gap-3 my-6">
                        <div className="flex-1 border-t border-slate-200 dark:border-slate-700"></div>
                        <span className="text-xs text-muted-foreground font-medium">Admin Access</span>
                        <div className="flex-1 border-t border-slate-200 dark:border-slate-700"></div>
                      </div>

                      {/* Admin CTA Button */}
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full h-12 text-base font-semibold rounded-lg border-2 border-slate-300 dark:border-slate-600 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/20 text-foreground transition-all duration-300 transform hover:scale-105"
                      >
                        <Hammer className="h-5 w-5 mr-2" />
                        Admin Panel
                      </Button>

                      {/* Help text */}
                      <p className="text-center text-sm text-muted-foreground bg-blue-50 dark:bg-blue-950/20 rounded-lg p-3 border border-blue-200 dark:border-blue-800">
                        Don't have an account? Contact your lab administrator to request access
                      </p>
                    </CardContent>
                  </Card>

                  {/* Footer text */}
                  <p className="text-center text-xs text-muted-foreground mt-8">
                    © 2024 Cransfield CMTC. All rights reserved. | Secure • Reliable • Trusted
                  </p>
                </div>
              </div>
            </div>
          ) : (
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
          )}
              </div>
            </main>
          </SidebarInset>
        </SidebarProvider>
      ) : (
        <main className="flex min-h-svh flex-col bg-gradient-to-br from-white via-slate-50 to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
          <header className="border-b border-slate-200/30 dark:border-slate-800/50 bg-gradient-to-r from-white/60 via-blue-50/40 to-slate-50/60 dark:from-slate-950/60 dark:via-slate-900/40 dark:to-slate-950/60 backdrop-blur-lg text-foreground sticky top-0 z-10 shadow-sm">
            <div className="px-4 md:px-6 py-3 md:py-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 max-w-7xl mx-auto">
                <div className="flex items-center gap-3 min-w-0 flex-shrink-0">
                  <div className="h-10 w-10 md:h-12 md:w-12 rounded-lg bg-gradient-to-br from-slate-700 to-slate-800 dark:from-slate-600 dark:to-slate-700 flex items-center justify-center overflow-hidden shadow-md flex-shrink-0">
                    <img
                      src="https://cdn.builder.io/api/v1/image/assets%2Fedb7c735e72a41328e7ab97a48a7676d%2Fe8eac870f9c84f0c869c7c6ece6e38e5?format=webp&width=800&height=1200"
                      alt="Cransfield Materials Testing Center"
                      className="h-7 w-7 md:h-8 md:w-8 object-contain"
                    />
                  </div>
                  <div className="min-w-0">
                    <h1 className="text-xl md:text-2xl font-bold text-foreground tracking-tight truncate">Cransfield CMTC</h1>
                    <p className="text-xs md:text-sm text-muted-foreground truncate">Materials Testing Center</p>
                  </div>
                </div>

                {!showLoginForm && (
                  <Button
                    onClick={() => setShowLoginForm(true)}
                    className="h-10 px-6 text-sm font-semibold rounded-lg bg-gradient-to-r from-slate-700 to-slate-800 hover:from-slate-800 hover:to-slate-900 text-white shadow-md hover:shadow-lg transition-all duration-300 transform hover:scale-105 whitespace-nowrap flex-shrink-0"
                  >
                    Sign In
                  </Button>
                )}
              </div>
            </div>
          </header>
          <div className="flex-1 overflow-y-auto px-0 py-6 md:px-4">
            <div className="w-full md:container md:max-w-6xl md:mx-auto md:px-4">
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
              ) : (
                <div className="min-h-[calc(100vh-200px)] flex items-center justify-center px-0 py-12 relative">
                  {/* Background gradient elements - subtle */}
                  <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
                    <div className="absolute top-1/4 right-0 w-96 h-96 bg-gradient-to-bl from-slate-400/3 to-transparent rounded-full blur-3xl"></div>
                    <div className="absolute bottom-1/4 left-0 w-96 h-96 bg-gradient-to-tr from-slate-400/3 to-transparent rounded-full blur-3xl"></div>
                  </div>

                  <div className="w-full max-w-6xl relative z-0 px-4 sm:px-6 md:px-0">
                    {/* Login form or welcome message */}
                    <div className="w-full flex flex-col items-center justify-center">
                      {!showLoginForm ? (
                        <div className="flex flex-col items-center justify-center space-y-8 py-8 md:py-12 w-full">
                          {/* About CMTC Section */}
                          <div className="space-y-6 px-4 md:px-0">
                            <div className="space-y-4 text-center max-w-3xl mx-auto">
                              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground leading-tight tracking-tight">
                                About <span className="bg-gradient-to-r from-slate-900 to-slate-700 dark:from-slate-100 dark:to-slate-300 bg-clip-text text-transparent">CMTC</span>
                              </h2>
                              <p className="text-base sm:text-lg text-muted-foreground leading-relaxed">
                                Cransfield Materials Testing Center is a professional laboratory management system dedicated to materials science and construction testing. We provide comprehensive solutions for soil, concrete, rock, and specialized materials testing with industry-leading accuracy and compliance standards.
                              </p>
                            </div>

                            {/* About Cards */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              <div className="p-6 rounded-2xl bg-gradient-to-br from-blue-50/80 to-blue-50/40 dark:from-blue-900/20 dark:to-blue-900/10 border border-blue-200/60 dark:border-blue-700/40 hover:shadow-lg transition-all duration-300">
                                <div className="flex items-center gap-3 mb-3">
                                  <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-gradient-to-br from-blue-100 to-blue-50 dark:from-blue-900/40 dark:to-blue-800/20">
                                    <span className="text-lg">🔬</span>
                                  </div>
                                  <h3 className="font-semibold text-foreground">Precision Testing</h3>
                                </div>
                                <p className="text-sm text-muted-foreground leading-relaxed">Accurate, reliable testing methods following international standards and specifications for all material types.</p>
                              </div>

                              <div className="p-6 rounded-2xl bg-gradient-to-br from-emerald-50/80 to-emerald-50/40 dark:from-emerald-900/20 dark:to-emerald-900/10 border border-emerald-200/60 dark:border-emerald-700/40 hover:shadow-lg transition-all duration-300">
                                <div className="flex items-center gap-3 mb-3">
                                  <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-gradient-to-br from-emerald-100 to-emerald-50 dark:from-emerald-900/40 dark:to-emerald-800/20">
                                    <span className="text-lg">📋</span>
                                  </div>
                                  <h3 className="font-semibold text-foreground">Compliance Ready</h3>
                                </div>
                                <p className="text-sm text-muted-foreground leading-relaxed">Full compliance with industry standards, regulations, and quality assurance protocols for professional reporting.</p>
                              </div>

                              <div className="p-6 rounded-2xl bg-gradient-to-br from-purple-50/80 to-purple-50/40 dark:from-purple-900/20 dark:to-purple-900/10 border border-purple-200/60 dark:border-purple-700/40 hover:shadow-lg transition-all duration-300">
                                <div className="flex items-center gap-3 mb-3">
                                  <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-gradient-to-br from-purple-100 to-purple-50 dark:from-purple-900/40 dark:to-purple-800/20">
                                    <span className="text-lg">🎯</span>
                                  </div>
                                  <h3 className="font-semibold text-foreground">Expert Driven</h3>
                                </div>
                                <p className="text-sm text-muted-foreground leading-relaxed">Trusted by professionals worldwide for dependable results, detailed analysis, and actionable insights.</p>
                              </div>
                            </div>

                            {/* System Capabilities */}
                            <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-100/80 to-slate-50/80 dark:from-slate-800/40 dark:to-slate-900/40 border border-slate-200/60 dark:border-slate-700/40">
                              <h3 className="text-lg font-semibold text-foreground mb-4">Our Testing Capabilities</h3>
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                                <div className="flex items-center gap-2 text-foreground">
                                  <span className="text-base">✓</span>
                                  <span>Soil Testing</span>
                                </div>
                                <div className="flex items-center gap-2 text-foreground">
                                  <span className="text-base">✓</span>
                                  <span>Concrete Analysis</span>
                                </div>
                                <div className="flex items-center gap-2 text-foreground">
                                  <span className="text-base">✓</span>
                                  <span>Rock Properties</span>
                                </div>
                                <div className="flex items-center gap-2 text-foreground">
                                  <span className="text-base">✓</span>
                                  <span>Specialized Tests</span>
                                </div>
                                <div className="flex items-center gap-2 text-foreground">
                                  <span className="text-base">✓</span>
                                  <span>Data Analysis</span>
                                </div>
                                <div className="flex items-center gap-2 text-foreground">
                                  <span className="text-base">✓</span>
                                  <span>Report Generation</span>
                                </div>
                                <div className="flex items-center gap-2 text-foreground">
                                  <span className="text-base">✓</span>
                                  <span>Quality Assurance</span>
                                </div>
                                <div className="flex items-center gap-2 text-foreground">
                                  <span className="text-base">✓</span>
                                  <span>Secure Storage</span>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Test Categories / System Capabilities */}
                          <div className="w-full px-4 md:px-0 space-y-4">
                            <h3 className="text-sm font-bold text-foreground uppercase tracking-widest">Supported Test Categories</h3>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full">
                              <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-50 to-amber-50/50 dark:from-amber-900/20 dark:to-amber-900/10 border border-amber-200/60 dark:border-amber-700/40 text-center hover:border-amber-400 dark:hover:border-amber-500 hover:shadow-xl hover:shadow-amber-200/30 dark:hover:shadow-amber-900/30 transition-all duration-300 transform hover:scale-105 hover:-translate-y-2 cursor-pointer group" onClick={() => navigate('/tests')}>
                                <p className="text-3xl mb-2 group-hover:scale-130 transition-transform duration-300 block">🏜️</p>
                                <p className="text-xs font-semibold text-foreground">Soil Tests</p>
                              </div>
                              <div className="p-4 rounded-2xl bg-gradient-to-br from-blue-50 to-blue-50/50 dark:from-blue-900/20 dark:to-blue-900/10 border border-blue-200/60 dark:border-blue-700/40 text-center hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-xl hover:shadow-blue-200/30 dark:hover:shadow-blue-900/30 transition-all duration-300 transform hover:scale-105 hover:-translate-y-2 cursor-pointer group" onClick={() => navigate('/tests')}>
                                <p className="text-3xl mb-2 group-hover:scale-130 transition-transform duration-300 block">🏗️</p>
                                <p className="text-xs font-semibold text-foreground">Concrete Tests</p>
                              </div>
                              <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-50 to-slate-50/50 dark:from-slate-700/20 dark:to-slate-700/10 border border-slate-200/60 dark:border-slate-700/40 text-center hover:border-slate-400 dark:hover:border-slate-500 hover:shadow-xl hover:shadow-slate-200/30 dark:hover:shadow-slate-900/30 transition-all duration-300 transform hover:scale-105 hover:-translate-y-2 cursor-pointer group" onClick={() => navigate('/tests')}>
                                <p className="text-3xl mb-2 group-hover:scale-130 transition-transform duration-300 block">⛰️</p>
                                <p className="text-xs font-semibold text-foreground">Rock Tests</p>
                              </div>
                              <div className="p-4 rounded-2xl bg-gradient-to-br from-purple-50 to-purple-50/50 dark:from-purple-900/20 dark:to-purple-900/10 border border-purple-200/60 dark:border-purple-700/40 text-center hover:border-purple-400 dark:hover:border-purple-500 hover:shadow-xl hover:shadow-purple-200/30 dark:hover:shadow-purple-900/30 transition-all duration-300 transform hover:scale-105 hover:-translate-y-2 cursor-pointer group" onClick={() => navigate('/tests')}>
                                <p className="text-3xl mb-2 group-hover:scale-130 transition-transform duration-300 block">🧪</p>
                                <p className="text-xs font-semibold text-foreground">Special Tests</p>
                              </div>
                            </div>
                          </div>

                          {/* Feature highlights for unauthenticated users */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full px-4 md:px-0">
                            <div className="p-6 rounded-2xl bg-gradient-to-br from-slate-100/80 to-slate-50/80 dark:from-slate-800/40 dark:to-slate-900/40 border border-slate-200/60 dark:border-slate-700/40 hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-lg hover:shadow-slate-200/50 dark:hover:shadow-slate-900/50 transition-all duration-300 transform hover:scale-105 hover:-translate-y-1 group">
                              <p className="text-2xl mb-3 group-hover:scale-125 group-hover:rotate-12 transition-all duration-300">📊</p>
                              <p className="text-sm font-semibold text-foreground">Real-time Tracking</p>
                              <p className="text-xs text-muted-foreground mt-2">Monitor test progress instantly with live updates</p>
                            </div>
                            <div className="p-6 rounded-2xl bg-gradient-to-br from-slate-100/80 to-slate-50/80 dark:from-slate-800/40 dark:to-slate-900/40 border border-slate-200/60 dark:border-slate-700/40 hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-lg hover:shadow-slate-200/50 dark:hover:shadow-slate-900/50 transition-all duration-300 transform hover:scale-105 hover:-translate-y-1 group">
                              <p className="text-2xl mb-3 group-hover:scale-125 group-hover:rotate-12 transition-all duration-300">📈</p>
                              <p className="text-sm font-semibold text-foreground">Smart Reports</p>
                              <p className="text-xs text-muted-foreground mt-2">Auto-generate professional reports in seconds</p>
                            </div>
                            <div className="p-6 rounded-2xl bg-gradient-to-br from-slate-100/80 to-slate-50/80 dark:from-slate-800/40 dark:to-slate-900/40 border border-slate-200/60 dark:border-slate-700/40 hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-lg hover:shadow-slate-200/50 dark:hover:shadow-slate-900/50 transition-all duration-300 transform hover:scale-105 hover:-translate-y-1 group">
                              <p className="text-2xl mb-3 group-hover:scale-125 group-hover:rotate-12 transition-all duration-300">🔒</p>
                              <p className="text-sm font-semibold text-foreground">Data Protection</p>
                              <p className="text-xs text-muted-foreground mt-2">Enterprise-grade encryption & compliance</p>
                            </div>
                            <div className="p-6 rounded-2xl bg-gradient-to-br from-slate-100/80 to-slate-50/80 dark:from-slate-800/40 dark:to-slate-900/40 border border-slate-200/60 dark:border-slate-700/40 hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-lg hover:shadow-slate-200/50 dark:hover:shadow-slate-900/50 transition-all duration-300 transform hover:scale-105 hover:-translate-y-1 group">
                              <p className="text-2xl mb-3 group-hover:scale-125 group-hover:rotate-12 transition-all duration-300">⚙️</p>
                              <p className="text-sm font-semibold text-foreground">Easy Integration</p>
                              <p className="text-xs text-muted-foreground mt-2">Seamless workflow integration with your system</p>
                            </div>
                          </div>

                          {/* How it Works */}
                          <div className="w-full px-4 md:px-0 space-y-4">
                            <h3 className="text-sm font-bold text-foreground uppercase tracking-widest">Quick Workflow</h3>
                            <div className="flex items-center justify-between gap-2 sm:gap-3 text-xs sm:text-sm px-2 py-4 rounded-2xl bg-gradient-to-r from-slate-100/50 to-slate-50/50 dark:from-slate-800/30 dark:to-slate-900/30 border border-slate-200/40 dark:border-slate-700/30">
                              <div className="flex-1 text-center">
                                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-slate-300 to-slate-400 dark:from-slate-600 dark:to-slate-700 flex items-center justify-center mx-auto mb-2 font-bold text-white dark:text-slate-100 shadow-md">1</div>
                                <p className="font-semibold text-foreground">Login</p>
                              </div>
                              <div className="flex-shrink-0 text-slate-400">→</div>
                              <div className="flex-1 text-center">
                                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-slate-300 to-slate-400 dark:from-slate-600 dark:to-slate-700 flex items-center justify-center mx-auto mb-2 font-bold text-white dark:text-slate-100 shadow-md">2</div>
                                <p className="font-semibold text-foreground">Create Test</p>
                              </div>
                              <div className="flex-shrink-0 text-slate-400">→</div>
                              <div className="flex-1 text-center">
                                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-slate-300 to-slate-400 dark:from-slate-600 dark:to-slate-700 flex items-center justify-center mx-auto mb-2 font-bold text-white dark:text-slate-100 shadow-md">3</div>
                                <p className="font-semibold text-foreground">Add Data</p>
                              </div>
                              <div className="flex-shrink-0 text-slate-400">→</div>
                              <div className="flex-1 text-center">
                                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-slate-300 to-slate-400 dark:from-slate-600 dark:to-slate-700 flex items-center justify-center mx-auto mb-2 font-bold text-white dark:text-slate-100 shadow-md">4</div>
                                <p className="font-semibold text-foreground">Report</p>
                              </div>
                            </div>
                          </div>

                          <p className="text-sm text-muted-foreground px-4 md:px-0 text-center">
                            Don't have an account? <span className="font-semibold">Contact your administrator</span>
                          </p>
                        </div>
                      ) : (
                        <Card className="border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden bg-card w-full max-w-md mx-auto sm:mx-0 shadow-sm">
                          {/* Card header - flat design */}
                          <div className="bg-white dark:bg-slate-900 px-6 sm:px-8 py-6 sm:py-8 border-b border-slate-100 dark:border-slate-800">
                            <div className="space-y-3">
                              <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Sign In</h1>
                              <p className="text-muted-foreground text-sm sm:text-base">Welcome back to CMTC</p>
                            </div>
                          </div>

                          <CardContent className="p-6 sm:p-8">
                            <form className="space-y-4" onSubmit={handleLogin}>
                              {/* Email field */}
                              <div className="space-y-2">
                                <Label htmlFor="email" className="text-sm font-medium text-foreground">
                                  Email
                                </Label>
                                <Input
                                  id="email"
                                  type="email"
                                  value={email}
                                  onChange={(event) => setEmail(event.target.value)}
                                  placeholder="you@example.com"
                                  autoComplete="email"
                                  className="h-11 px-3.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-950 text-foreground placeholder:text-slate-500 dark:placeholder:text-slate-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 transition-all duration-200 text-sm"
                                />
                              </div>

                              {/* Password field */}
                              <div className="space-y-2">
                                <Label htmlFor="password" className="text-sm font-medium text-foreground">
                                  Password
                                </Label>
                                <div className="relative">
                                  <Input
                                    id="password"
                                    type={showPassword ? "text" : "password"}
                                    value={password}
                                    onChange={(event) => setPassword(event.target.value)}
                                    placeholder="Enter your password"
                                    autoComplete="current-password"
                                    className="h-11 px-3.5 pr-10 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-950 text-foreground placeholder:text-slate-500 dark:placeholder:text-slate-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 transition-all duration-200 text-sm"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors duration-200"
                                    aria-label={showPassword ? "Hide password" : "Show password"}
                                  >
                                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                                  </button>
                                </div>
                              </div>

                              {/* Error message */}
                              {loginError && (
                                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800">
                                  <p className="text-xs sm:text-sm text-red-700 dark:text-red-200 font-medium">
                                    {loginError}
                                  </p>
                                </div>
                              )}

                              {/* Sign in button */}
                              <Button
                                type="submit"
                                className="w-full h-11 text-sm font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors duration-200 mt-4"
                                disabled={isSubmittingLogin}
                              >
                                {isSubmittingLogin ? (
                                  <>
                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                    Signing in...
                                  </>
                                ) : (
                                  "Sign In"
                                )}
                              </Button>

                              {/* Back button */}
                              <Button
                                type="button"
                                variant="outline"
                                className="w-full h-11 text-sm font-medium rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-850 text-foreground transition-colors duration-200"
                                onClick={() => setShowLoginForm(false)}
                              >
                                Back
                              </Button>
                            </form>
                          </CardContent>
                        </Card>
                      )}

                      {/* Footer text */}
                      <p className="text-center text-xs text-muted-foreground mt-6 sm:mt-8 px-4 sm:px-0">
                        © 2024 Cransfield CMTC. All rights reserved.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>
      )}
    </ProjectContext.Provider>
  );
};

export default Index;
