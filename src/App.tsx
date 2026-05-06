import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TestDataProvider } from "@/context/TestDataContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import Index from "./pages/Index.tsx";
import Login from "./pages/Login.tsx";
import NotFound from "./pages/NotFound.tsx";
import RecordTestWizard from "./pages/RecordTestWizard.tsx";
import TestResults from "./pages/TestResults.tsx";
import Projects from "./pages/Projects.tsx";
import UserManagement from "./pages/UserManagement.tsx";
import Settings from "./pages/Settings.tsx";

const queryClient = new QueryClient();

const App = () => {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <BrowserRouter>
        <ErrorBoundary>
          <QueryClientProvider client={queryClient}>
            <TooltipProvider>
              <TestDataProvider>
                <Toaster />
                <Sonner />
                <Routes>
                  <Route path="/login" element={<Login />} />
                  <Route path="/" element={<RecordTestWizard />} />
                  <Route path="/tests" element={<Index initialTab="soil" />} />
                  <Route path="/tests/:projectId" element={<Index initialTab="soil" />} />
                  <Route path="/reports" element={<Index />} />
                  <Route path="/results" element={<TestResults />} />
                  <Route path="/projects" element={<Projects />} />
                  <Route path="/admin" element={<Index />} />
                  <Route path="/users" element={<UserManagement />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/record" element={<RecordTestWizard />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </TestDataProvider>
            </TooltipProvider>
          </QueryClientProvider>
        </ErrorBoundary>
      </BrowserRouter>
    </ThemeProvider>
  );
};

export default App;
