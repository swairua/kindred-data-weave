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
import ProjectHeader from "@/components/ProjectHeader";
import Navigation from "@/components/Navigation";
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
const TestsView = ({
  initialTab,
  projectName,
  clientName,
  date,
  projectHistory,
  isLoadingProjects,
  projectMetadata,
  onProjectNameChange,
  onClientNameChange,
  onLoadProject,
  onStartNewProject,
  onMetadataChange,
}: {
  initialTab?: string;
  projectName: string;
  clientName: string;
  date: string;
  projectHistory: ApiProjectRow[];
  isLoadingProjects: boolean;
  projectMetadata: any;
  onProjectNameChange: (value: string) => void;
  onClientNameChange: (value: string) => void;
  onLoadProject: (projectId: string) => void;
  onStartNewProject: () => void;
  onMetadataChange: (key: string, value: string) => void;
}) => {
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
    <div className="space-y-6">
      <ProjectHeader
        projectName={projectName}
        clientName={clientName}
        date={date}
        projectHistory={projectHistory}
        isLoadingProjects={isLoadingProjects}
        projectMetadata={projectMetadata}
        onProjectNameChange={onProjectNameChange}
        onClientNameChange={onClientNameChange}
        onLoadProject={onLoadProject}
        onStartNewProject={onStartNewProject}
        onMetadataChange={onMetadataChange}
      />

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
    </div>
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
  const [projectDate, setProjectDate] = useState<string | undefined>(undefined);
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

  const projectCtx = useMemo(() => ({ projectName, clientName, date: today, currentProjectId, projectDate }), [projectName, clientName, today, currentProjectId, projectDate]);
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
    // Increased from 3s to 10s to accommodate slower API responses
    timeoutId = setTimeout(() => {
      if (isMounted) {
        console.warn("[Index] Session restore timeout - setting to unauthenticated");
        setCurrentUser(null);
        setAuthStatus("unauthenticated");
      }
    }, 10000);

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, []);

  // Keep session alive while authenticated to prevent backend timeout
  // Pings every 5 minutes to refresh the session on backend
  useSessionKeepAlive(authStatus === "authenticated");

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

        // Check if it's a network/API unavailability error
        const isNetworkError = errorMsg.toLowerCase().includes("failed to fetch") ||
                              errorMsg.toLowerCase().includes("unable to reach");

        if (!isNetworkError) {
          console.error("[Index] Failed to load project history:", errorMsg);
        } else {
          console.debug("[Index] API server currently unavailable, project history will not load");
        }

        // If it's an authentication error, log additional context
        // Note: Don't auto-logout on 401 from project loading - it's a non-critical background task
        if (errorMsg.includes("401") || errorMsg.includes("Unauthorized")) {
          console.warn("[Index] ⚠️ Project loading returned 401 - possible session expiration on backend");
          console.warn("[Index] Keeping user logged in locally - will retry on next action");
          // Don't auto-logout on background task failures - let the user trigger actions that will refresh the session
        }

        if (isMounted && !isNetworkError) {
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
    setProjectDate(project.project_date || undefined);
    setCurrentProjectId(project.id);
    testData.updateProjectMetadata({ projectName: project.name, clientName: project.client_name || "" });
    toast.success(`Loaded project: ${project.name}`);
  };

  const handleStartNewProject = () => {
    // Clear form fields
    setProjectName("");
    setClientName("");
    setProjectDate(undefined);
    setCurrentProjectId(null);

    // Clear browser cache/localStorage
    localStorage.removeItem("atterbergProjectState");
    localStorage.removeItem("enhancedAtterbergTests");

    // Reset all test data context
    testData.resetProjectData();

    // Dispatch custom event for components to listen to (e.g., AtterbergTest)
    window.dispatchEvent(new CustomEvent("resetProject"));

    toast.success("New project started - form cleared and data reset");
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
      <div className="min-h-screen bg-background flex flex-col">
        <header className="border-b bg-card sticky top-0 z-10">
          <div className="px-4 py-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center overflow-hidden">
                  <img
                    src="https://cdn.builder.io/api/v1/image/assets%2Fedb7c735e72a41328e7ab97a48a7676d%2Fe8eac870f9c84f0c869c7c6ece6e38e5?format=webp&width=800&height=1200"
                    alt="Cransfield Materials Testing Center"
                    className="h-full w-full object-contain"
                  />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-foreground tracking-tight">Cransfield Materials Testing Center</h1>
                  <p className="text-xs text-muted-foreground">Quality Assurance</p>
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
          </div>
        </header>

        <div className="flex flex-1 overflow-hidden">
          {isAuthenticated && (
            <Navigation
              currentView={view}
              onViewChange={setView}
              onStartNewProject={handleStartNewProject}
              onLogout={handleLogout}
              userName={currentUser?.name}
              userEmail={currentUser?.email}
            />
          )}

          <main className="flex-1 overflow-y-auto px-4 py-6">
            <div className="container max-w-6xl mx-auto">
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
            <div className="min-h-[calc(100vh-200px)] flex items-center justify-center px-4 py-12 relative">
              {/* Background gradient elements */}
              <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
                <div className="absolute top-1/4 right-0 w-96 h-96 bg-gradient-to-bl from-blue-500/5 to-transparent rounded-full blur-3xl"></div>
                <div className="absolute bottom-1/4 left-0 w-96 h-96 bg-gradient-to-tr from-indigo-500/5 to-transparent rounded-full blur-3xl"></div>
              </div>

              <div className="w-full max-w-6xl grid lg:grid-cols-2 gap-8 lg:gap-12 items-center relative z-0">
                {/* Left side - Branding */}
                <div className="hidden lg:flex flex-col justify-center space-y-8">
                  <div className="space-y-4">
                    <div className="inline-flex items-center justify-center h-16 w-16 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 shadow-lg">
                      <img
                        src="https://cdn.builder.io/api/v1/image/assets%2Fedb7c735e72a41328e7ab97a48a7676d%2Fe8eac870f9c84f0c869c7c6ece6e38e5?format=webp&width=800&height=1200"
                        alt="Cransfield Materials Testing Center"
                        className="h-10 w-10 object-contain"
                      />
                    </div>
                    <h2 className="text-4xl font-bold text-foreground leading-tight">
                      Welcome Back
                    </h2>
                    <p className="text-lg text-muted-foreground">
                      Access your lab data, manage tests, and generate comprehensive reports with Cransfield Materials Testing Center.
                    </p>
                  </div>

                  {/* Features */}
                  <div className="space-y-4 pt-4">
                    <div className="flex gap-4">
                      <div className="flex-shrink-0">
                        <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                          <svg className="h-6 w-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                        </div>
                      </div>
                      <div>
                        <h3 className="font-semibold text-foreground">Fast & Reliable</h3>
                        <p className="text-sm text-muted-foreground">Lightning-quick access to your test data</p>
                      </div>
                    </div>

                    <div className="flex gap-4">
                      <div className="flex-shrink-0">
                        <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-indigo-100 dark:bg-indigo-900/30">
                          <svg className="h-6 w-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                        </div>
                      </div>
                      <div>
                        <h3 className="font-semibold text-foreground">Secure & Protected</h3>
                        <p className="text-sm text-muted-foreground">Your data is encrypted and secure</p>
                      </div>
                    </div>

                    <div className="flex gap-4">
                      <div className="flex-shrink-0">
                        <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                          <svg className="h-6 w-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                          </svg>
                        </div>
                      </div>
                      <div>
                        <h3 className="font-semibold text-foreground">Smart Analytics</h3>
                        <p className="text-sm text-muted-foreground">Detailed insights and comprehensive reports</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right side - Login form */}
                <div className="w-full">
                  <Card className="border-0 shadow-xl rounded-2xl overflow-hidden">
                    {/* Card header with gradient */}
                    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 px-8 py-8 border-b">
                      <h1 className="text-3xl font-bold text-foreground mb-2">Sign in</h1>
                      <p className="text-muted-foreground">Enter your credentials to access your account</p>
                    </div>

                    <CardContent className="p-8">
                      <form className="space-y-6" onSubmit={handleLogin}>
                        {/* Email field */}
                        <div className="space-y-2">
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
                            className="h-12 px-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                          />
                        </div>

                        {/* Password field */}
                        <div className="space-y-2">
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
                            className="h-12 px-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                          />
                        </div>

                        {/* Submit button */}
                        <Button
                          type="submit"
                          className="w-full h-12 text-base font-semibold rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-lg hover:shadow-xl transition-all duration-200"
                          disabled={isSubmittingLogin}
                        >
                          {isSubmittingLogin ? (
                            <>
                              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Signing in
                            </>
                          ) : (
                            "Sign in"
                          )}
                        </Button>

                        {/* Divider */}
                        <div className="flex items-center gap-3 my-6">
                          <div className="flex-1 border-t border-gray-200 dark:border-gray-700"></div>
                          <span className="text-sm text-muted-foreground">New to the lab?</span>
                          <div className="flex-1 border-t border-gray-200 dark:border-gray-700"></div>
                        </div>

                        {/* Help text */}
                        <p className="text-center text-sm text-muted-foreground">
                          Contact your lab administrator for access
                        </p>
                      </form>
                    </CardContent>
                  </Card>

                  {/* Footer text */}
                  <p className="text-center text-xs text-muted-foreground mt-6">
                    By signing in, you agree to our Terms of Service and Privacy Policy
                  </p>
                </div>
              </div>
            </div>
          ) : view === "dashboard" ? (
            <Dashboard />
          ) : view === "reports" ? (
            <Reports />
          ) : view === "admin" ? (
            <Admin />
          ) : (
            <TestsView
              initialTab={initialTab}
              projectName={projectName}
              clientName={clientName}
              date={today}
              projectHistory={projectHistory}
              isLoadingProjects={isLoadingProjects}
              projectMetadata={testData.projectMetadata}
              onProjectNameChange={handleProjectNameChange}
              onClientNameChange={handleClientNameChange}
              onLoadProject={handleLoadProject}
              onStartNewProject={handleStartNewProject}
              onMetadataChange={handleMetadataChange}
            />
          )}
            </div>
        </main>
        </div>
      </div>
    </ProjectContext.Provider>
  );
};

export default Index;
