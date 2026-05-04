import { useEffect, useState, useMemo } from "react";
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
import { Layers, Loader2 } from "lucide-react";
import Navigation from "@/components/Navigation";
import { fetchCurrentUser, listRecords, logoutUser } from "@/lib/api";
import { toast } from "sonner";

interface TestRecord {
  id: number;
  project_id?: number;
  project_name?: string;
  test_type?: string;
  sample_id?: string;
  depth?: string;
  date_created?: string;
  created_by?: string;
  material_type?: string;
}

interface TestResultsProps {}

const TestResults = ({}: TestResultsProps) => {
  const navigate = useNavigate();
  const [tests, setTests] = useState<TestRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [materialFilter, setMaterialFilter] = useState<string>("all");
  const [testTypeFilter, setTestTypeFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Load current user and check authentication
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const user = await fetchCurrentUser(3000);
        setCurrentUser(user);
        setIsAuthenticated(true);
      } catch (error) {
        setIsAuthenticated(false);
        navigate("/login", { replace: true });
      }
    };
    checkAuth();
  }, [navigate]);

  // Load test results
  useEffect(() => {
    if (!isAuthenticated) return;

    const loadTests = async () => {
      try {
        setIsLoading(true);
        // Fetch from API - adjust table name based on your backend schema
        const response = await listRecords<TestRecord>("test_results", { limit: 100 });
        setTests(response.data || []);
      } catch (error) {
        console.error("Failed to load test results:", error);
        // Optionally show an error message
        // toast.error("Failed to load test results");
        // For now, show empty state rather than error
        setTests([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadTests();
  }, [isAuthenticated]);

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

  const handleLogout = async () => {
    try {
      await logoutUser();
      toast.success("Logged out");
      navigate("/login", { replace: true });
    } catch (error) {
      toast.error("Failed to logout");
    }
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

  if (!isAuthenticated && !isLoading) {
    return null;
  }

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
            <div className="flex items-center justify-between h-14 px-4 gap-2">
              <div className="flex items-center gap-2">
                <SidebarTrigger />
                <div>
                  <h1 className="text-lg font-semibold">Test Results</h1>
                  <p className="text-xs text-muted-foreground">
                    All recorded complex tests
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
                      <CardTitle>Test Records</CardTitle>
                      <CardDescription>
                        {filteredTests.length} test{filteredTests.length !== 1 ? "s" : ""} found
                      </CardDescription>
                    </div>
                  </div>

                  {/* Filters */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-6">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Material Type</label>
                      <Select value={materialFilter} onValueChange={setMaterialFilter}>
                        <SelectTrigger className="h-10">
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

                    <div className="space-y-2">
                      <label className="text-sm font-medium">Test Type</label>
                      <Select value={testTypeFilter} onValueChange={setTestTypeFilter}>
                        <SelectTrigger className="h-10">
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

                    <div className="space-y-2">
                      <label className="text-sm font-medium">Search</label>
                      <Input
                        placeholder="Search project, ID or test type..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="h-10"
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
                          className="w-full h-10"
                        >
                          Clear filters
                        </Button>
                      </div>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="pt-0">
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
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/40 hover:bg-muted/40">
                            <TableHead className="font-semibold">PROJECT</TableHead>
                            <TableHead className="font-semibold">TEST TYPE</TableHead>
                            <TableHead className="font-semibold">SAMPLE ID & DEPTH</TableHead>
                            <TableHead className="font-semibold">DATE & TIME</TableHead>
                            <TableHead className="font-semibold">RECORDED BY</TableHead>
                            <TableHead className="font-semibold text-right">ACTION</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredTests.map((test) => (
                            <TableRow
                              key={test.id}
                              className="border-b last:border-0 hover:bg-muted/50"
                            >
                              <TableCell className="font-medium">
                                {test.project_name || "-"}
                              </TableCell>
                              <TableCell>{test.test_type || "-"}</TableCell>
                              <TableCell>
                                <div className="space-y-1">
                                  <p className="font-medium">{test.sample_id || "-"}</p>
                                  <p className="text-xs text-muted-foreground">
                                    Depth: {test.depth || "-"}
                                  </p>
                                </div>
                              </TableCell>
                              <TableCell className="text-sm">
                                {formatDate(test.date_created)}
                              </TableCell>
                              <TableCell>{test.created_by || "-"}</TableCell>
                              <TableCell className="text-right">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8"
                                  onClick={() =>
                                    toast.info(`View test details for ${test.sample_id}`)
                                  }
                                >
                                  View
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

export default TestResults;
