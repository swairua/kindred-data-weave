import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Layers, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import Navigation from "@/components/Navigation";
import { useTestData } from "@/context/TestDataContext";
import { useProject } from "@/context/ProjectContext";
import { listRecords } from "@/lib/api";
import { toast } from "sonner";

interface ApiTestResult {
  id: number;
  project_id: number;
  test_key: string;
  name: string;
  category: string;
  project_name?: string;
  status?: string;
  payload_json?: {
    project?: {
      records?: Array<{
        label?: string;
        sampleNumber?: string;
        sampleDepthFrom?: string;
        sampleDepthTo?: string;
        sampledSubmittedBy?: string;
        testedBy?: string;
      }>;
    };
  };
  created_at?: string;
  updated_at?: string;
}

const TestResults = () => {
  const { tests: testDataMap } = useTestData();
  const testData = useTestData();
  const project = useProject();
  const navigate = useNavigate();
  const [materialFilter, setMaterialFilter] = useState<string>("all");
  const [testTypeFilter, setTestTypeFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [apiTestResults, setApiTestResults] = useState<ApiTestResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Fetch test results from API (now includes project_name via JOIN)
  useEffect(() => {
    const loadTestResults = async () => {
      try {
        setIsLoading(true);
        const response = await listRecords<ApiTestResult>("test_results", { limit: 100 });
        setApiTestResults(response.data || []);
      } catch (error) {
        console.error("Failed to load test results:", error);
        setApiTestResults([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadTestResults();
  }, []);

  // Helper function to format test type from test_key
  const formatTestType = (testKey: string): string => {
    const testTypeMap: Record<string, string> = {
      atterberg: "Atterberg Limits Testing",
      grading: "Particle Size Distribution",
      cbr: "CBR Test",
      proctor: "Proctor Test",
      consolidation: "Consolidation Test",
      shear: "Shear Test",
      linearShrinkage: "Linear Shrinkage Test",
    };
    return testTypeMap[testKey] || testKey.charAt(0).toUpperCase() + testKey.slice(1);
  };

  // Helper function to extract first record from payload
  const getFirstRecord = (testResult: ApiTestResult) => {
    const records = testResult.payload_json?.project?.records;
    if (Array.isArray(records) && records.length > 0) {
      return records[0];
    }
    return null;
  };

  // Convert API test results to display format
  const tests = useMemo(() => {
    return apiTestResults.map((result) => {
      const record = getFirstRecord(result);
      const sampleId = record?.label || "-";
      const depth = record?.sampleDepthFrom || record?.sampleDepthTo
        ? `${record.sampleDepthFrom || "—"} to ${record.sampleDepthTo || "—"}`
        : record?.sampleNumber || "-";
      const testedBy = record?.sampledSubmittedBy || record?.testedBy || "-";
      const projectName = result.project_name || `Project #${result.project_id}`;
      const testType = formatTestType(result.test_key);
      const dateCreated = result.created_at || result.updated_at || new Date().toISOString();

      return {
        id: String(result.id),
        project_id: result.project_id,
        test_key: result.test_key,
        project_name: projectName,
        test_type: testType,
        sample_id: sampleId,
        depth: depth,
        date_created: dateCreated,
        created_by: testedBy,
        material_type: result.category || "Soil",
      };
    });
  }, [apiTestResults]);

  // Get unique material types from the test data
  const materialTypes = useMemo(() => {
    const types = new Set(tests.map((t) => t.material_type).filter(Boolean));
    return Array.from(types).sort();
  }, [tests]);

  // Get unique test types from the test data
  const testTypes = useMemo(() => {
    const types = new Set(tests.map((t) => t.test_type).filter(Boolean));
    return Array.from(types).sort();
  }, [tests]);

  // Get current user from project context
  const currentUser: { name?: string; email?: string } | null = null;

  // Filter tests based on selected filters and search query
  const filteredTests = useMemo(() => {
    return tests.filter((test) => {
      const materialMatch =
        materialFilter === "all" || test.material_type === materialFilter;
      const testTypeMatch = testTypeFilter === "all" || test.test_type === testTypeFilter;
      const searchMatch =
        searchQuery === "" ||
        test.project_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        test.sample_id?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        test.test_type?.toLowerCase().includes(searchQuery.toLowerCase());

      return materialMatch && testTypeMatch && searchMatch;
    });
  }, [tests, materialFilter, testTypeFilter, searchQuery]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [materialFilter, testTypeFilter, searchQuery]);

  // Calculate pagination
  const totalPages = Math.ceil(filteredTests.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedTests = filteredTests.slice(startIndex, endIndex);

  const handleOpenTest = (test: (typeof filteredTests)[0]) => {
    // Preload project metadata into TestDataContext
    testData.updateProjectMetadata({
      projectName: test.project_name,
      projectDate: test.date_created,
    });

    toast.success(`Opened ${test.project_name}`);

    // Navigate to tests page with:
    // - hash for the specific test (#atterberg)
    // - query param for the project ID (so Index.tsx can load full project data)
    navigate(`/tests?projectId=${test.project_id}#${test.test_key}`);
  };

  const handleLogout = () => {
    toast.success("Logged out");
    navigate("/login", { replace: true });
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "-";
    try {
      const date = new Date(dateString);
      return date.toLocaleString("en-US", {
        month: "short",
        day: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateString;
    }
  };

  return (
    <SidebarProvider>
      <Navigation
        currentView="results"
        onViewChange={() => {}}
        onLogout={handleLogout}
        userName={currentUser?.name}
        userEmail={currentUser?.email}
      />
      <SidebarInset>
        <div className="flex flex-col min-h-screen bg-background">
          {/* Header */}
          <header className="border-b bg-card sticky top-0 z-10">
            <div className="flex items-center justify-between h-11 px-3 sm:px-4 gap-2">
              <div className="flex items-center gap-2">
                <SidebarTrigger />
                <div>
                  <h1 className="text-sm font-semibold leading-4">Test Results</h1>
                  <p className="text-[10px] leading-3 text-muted-foreground">
                    All recorded complex tests
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
                      <CardTitle className="text-sm font-semibold leading-5">Test Records</CardTitle>
                      <CardDescription className="text-[11px] leading-4">
                        {filteredTests.length} test{filteredTests.length !== 1 ? "s" : ""} found
                        {totalPages > 1 && ` • Page ${currentPage} of ${totalPages}`}
                      </CardDescription>
                    </div>
                  </div>

                  {/* Filters */}
                  <div className="grid w-full grid-cols-1 gap-2 sm:flex-1 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="space-y-1">
                      <label className="text-xs font-medium">Material Type</label>
                      <Select value={materialFilter} onValueChange={setMaterialFilter}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All materials</SelectItem>
                          {materialTypes.map((type) => (
                            <SelectItem key={type} value={type || "unknown"}>
                              {type || "Unknown"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-medium">Test Type</label>
                      <Select value={testTypeFilter} onValueChange={setTestTypeFilter}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All test types</SelectItem>
                          {testTypes.map((type) => (
                            <SelectItem key={type} value={type || "unknown"}>
                              {type || "Unknown"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-medium">Search</label>
                      <Input
                        placeholder="Search project, ID or test type..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>

                    {(materialFilter !== "all" ||
                      testTypeFilter !== "all" ||
                      searchQuery !== "") && (
                      <div className="flex items-end">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setMaterialFilter("all");
                            setTestTypeFilter("all");
                            setSearchQuery("");
                          }}
                          className="h-8 w-full text-xs"
                        >
                          Clear filters
                        </Button>
                      </div>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="px-3 pb-3 pt-0 sm:px-4 sm:pb-4">
                  {isLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                  ) : filteredTests.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
                        <Layers className="h-6 w-6 text-muted-foreground" />
                      </div>
                      <p className="text-lg font-medium text-foreground mb-1">
                        No test results found
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {tests.length === 0
                          ? "No tests have been recorded yet. Start by recording a new test."
                          : "Try adjusting your filters or search query."}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/40 hover:bg-muted/40">
                              <TableHead className="h-8 px-2 text-[10px] font-semibold tracking-wide text-muted-foreground">PROJECT</TableHead>
                              <TableHead className="hidden h-8 px-2 text-[10px] font-semibold tracking-wide text-muted-foreground sm:table-cell">TEST TYPE</TableHead>
                              <TableHead className="h-8 px-2 text-[10px] font-semibold tracking-wide text-muted-foreground">SAMPLE ID & DEPTH</TableHead>
                              <TableHead className="hidden h-8 px-2 text-[10px] font-semibold tracking-wide text-muted-foreground md:table-cell">DATE & TIME</TableHead>
                              <TableHead className="hidden h-8 px-2 text-[10px] font-semibold tracking-wide text-muted-foreground lg:table-cell">RECORDED BY</TableHead>
                              <TableHead className="h-8 px-2 text-right text-[10px] font-semibold tracking-wide text-muted-foreground">ACTION</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {paginatedTests.map((test) => (
                              <TableRow
                                key={test.id}
                                className="border-b last:border-0 hover:bg-muted/50"
                              >
                                <TableCell className="px-2 py-1.5 font-medium">
                                  <div>
                                    <p className="text-xs font-medium leading-4">{test.project_name || "-"}</p>
                                    <p className="text-[10px] leading-3 text-muted-foreground sm:hidden">
                                      {test.test_type || "-"}
                                    </p>
                                  </div>
                                </TableCell>
                                <TableCell className="hidden px-2 py-1.5 text-xs sm:table-cell">{test.test_type || "-"}</TableCell>
                                <TableCell className="px-2 py-1.5">
                                  <div>
                                    <p className="text-xs font-medium leading-4">{test.sample_id || "-"}</p>
                                    <p className="text-[10px] leading-3 text-muted-foreground">
                                      Depth: {test.depth || "-"}
                                    </p>
                                    <p className="text-[10px] leading-3 text-muted-foreground md:hidden">
                                      {formatDate(test.date_created)}
                                    </p>
                                  </div>
                                </TableCell>
                                <TableCell className="hidden px-2 py-1.5 text-xs md:table-cell">
                                  {formatDate(test.date_created)}
                                </TableCell>
                                <TableCell className="hidden px-2 py-1.5 text-xs lg:table-cell">{test.created_by || "-"}</TableCell>
                                <TableCell className="px-2 py-1.5 text-right">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 px-2.5 text-[11px]"
                                    onClick={() => handleOpenTest(test)}
                                  >
                                    Open →
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>

                      {/* Pagination Controls */}
                      {totalPages > 1 && (
                        <div className="flex flex-col items-start justify-between gap-2 border-t pt-2 sm:flex-row sm:items-center">
                          <p className="text-[10px] text-muted-foreground">
                            {startIndex + 1}-{Math.min(endIndex, filteredTests.length)} of {filteredTests.length}
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

export default TestResults;
