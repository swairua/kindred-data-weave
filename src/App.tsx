import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TestDataProvider } from "@/context/TestDataContext";
import { NavigationLoadingProvider } from "@/context/NavigationLoadingContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { SessionGuard } from "@/components/SessionGuard";
import ProtectedLayout from "@/components/ProtectedLayout";
import Index from "./pages/Index.tsx";
import Login from "./pages/Login.tsx";
const NotFound = lazy(() => import("./pages/NotFound.tsx"));
const RecordTestWizard = lazy(() => import("./pages/RecordTestWizard.tsx"));
const TestResults = lazy(() => import("./pages/TestResults.tsx"));
const Reception = lazy(() => import("./pages/Reception.tsx"));
const LogConsignment = lazy(() => import("./pages/LogConsignment.tsx"));
const Projects = lazy(() => import("./pages/Projects.tsx"));
const ProjectOverview = lazy(() => import("./pages/ProjectOverview.tsx"));
const UserManagement = lazy(() => import("./pages/UserManagement.tsx"));
const Settings = lazy(() => import("./pages/Settings.tsx"));
const Storage = lazy(() => import("./pages/Storage.tsx"));
const Equipment = lazy(() => import("./pages/Equipment.tsx"));
const Profile = lazy(() => import("./pages/Profile.tsx"));

const queryClient = new QueryClient();

const App = () => {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <BrowserRouter>
        <ErrorBoundary>
          <QueryClientProvider client={queryClient}>
            <TooltipProvider>
              <TestDataProvider>
                <NavigationLoadingProvider>
                  <Toaster />
                  <Sonner />
                  <Suspense fallback={<div className="min-h-svh flex items-center justify-center bg-background" role="status"><p className="text-sm text-muted-foreground">Loading application…</p></div>}>
                  <Routes>
                    <Route path="/login" element={<Login />} />
                    <Route element={<SessionGuard />}>
                      <Route element={<ProtectedLayout />}>
                        <Route path="/" element={<RecordTestWizard />} />
                        <Route path="/projects" element={<Projects />} />
                        <Route path="/projects/:projectId" element={<ProjectOverview />} />
                        <Route path="/record" element={<RecordTestWizard />} />
                        <Route path="/testing" element={<RecordTestWizard />} />
                        <Route path="/reception" element={<Reception />} />
                        <Route path="/reception/new" element={<LogConsignment />} />
                        <Route path="/reception/:rcNo" element={<LogConsignment />} />
                        <Route path="/storage" element={<Storage />} />
                        <Route path="/equipment" element={<Equipment />} />
                        <Route path="/tests" element={<Index initialTab="soil" />} />
                        <Route path="/tests/:projectId" element={<Index initialTab="soil" />} />
                        <Route path="/reports" element={<Index />} />
                        <Route path="/admin" element={<Index />} />
                        <Route path="/settings" element={<Settings />} />
                        <Route path="/logs" element={<Settings initialTab="audit" />} />
                        <Route path="/profile" element={<Profile />} />
                        <Route path="/results" element={<TestResults />} />
                        <Route path="/users" element={<UserManagement />} />
                      </Route>
                    </Route>
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                  </Suspense>
                </NavigationLoadingProvider>
              </TestDataProvider>
            </TooltipProvider>
          </QueryClientProvider>
        </ErrorBoundary>
      </BrowserRouter>
    </ThemeProvider>
  );
};

export default App;
