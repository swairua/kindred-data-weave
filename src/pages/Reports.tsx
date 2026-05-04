import { useTestData } from "@/context/TestDataContext";
import { useProject } from "@/context/ProjectContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FileDown, FileSpreadsheet, FileText, LayoutDashboard,
  ClipboardList, BarChart3,
} from "lucide-react";
import {
  generateProjectSummaryReport,
  generateDashboardReport,
  generateProjectSummaryCSV,
} from "@/lib/reportGenerator";
import { generateTestPDF } from "@/lib/pdfGenerator";
import { generateTestCSV } from "@/lib/csvExporter";
import { toast } from "sonner";

const Reports = () => {
  const { tests } = useTestData();
  const project = useProject();
  const testList = Object.values(tests);
  const testsWithData = testList.filter(t => t.dataPoints > 0);

  const handleSummaryPDF = () => {
    generateProjectSummaryReport(project, tests);
    toast.success("Project summary report downloaded");
  };

  const handleSummaryCSV = () => {
    generateProjectSummaryCSV(project, tests);
    toast.success("Project summary CSV downloaded");
  };

  const handleDashboardPDF = () => {
    generateDashboardReport(project, tests);
    toast.success("Dashboard export downloaded");
  };

  return (
    <div className="space-y-6">
      {/* Report Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              Project Summary Report
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-xs text-muted-foreground mb-3">
              Comprehensive report with all test categories, statuses, and key results.
            </p>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSummaryPDF} className="gap-1.5">
                <FileDown className="h-3.5 w-3.5" /> PDF
              </Button>
              <Button size="sm" variant="outline" onClick={handleSummaryCSV} className="gap-1.5">
                <FileSpreadsheet className="h-3.5 w-3.5" /> CSV
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <LayoutDashboard className="h-4 w-4 text-primary" />
              Dashboard Export
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-xs text-muted-foreground mb-3">
              Export the full dashboard view with all tests, statuses, and data points.
            </p>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleDashboardPDF} className="gap-1.5">
                <FileDown className="h-3.5 w-3.5" /> PDF
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-primary" />
              Individual Test Reports
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-xs text-muted-foreground mb-3">
              Download reports for specific tests with recorded data below.
            </p>
            <Badge variant="secondary" className="text-xs">
              {testsWithData.length} test{testsWithData.length !== 1 ? "s" : ""} with data
            </Badge>
          </CardContent>
        </Card>
      </div>

      {/* Individual Test Reports */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          Individual Test Reports
        </h2>
        {testsWithData.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-sm text-muted-foreground">No tests have recorded data yet. Enter data in the Tests tab to generate individual reports.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {testsWithData.map(test => (
              <Card key={test.id} className="hover:shadow-md transition-shadow">
                <CardContent className="py-3 px-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-foreground">{test.name}</span>
                    <Badge variant="secondary" className="text-[10px] capitalize">{test.category}</Badge>
                  </div>
                  {test.keyResults.length > 0 && (
                    <div className="space-y-0.5 mb-2">
                      {test.keyResults.slice(0, 2).map((r, i) => (
                        <div key={i} className="flex justify-between text-xs">
                          <span className="text-muted-foreground">{r.label}</span>
                          <span className="font-mono text-foreground">{r.value}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1"
                      onClick={() => {
                        generateTestPDF({
                          title: test.name,
                          ...project,
                          fields: test.keyResults.map(r => ({ label: r.label, value: r.value })),
                        });
                        toast.success(`${test.name} PDF downloaded`);
                      }}
                    >
                      <FileDown className="h-3 w-3" /> PDF
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1"
                      onClick={() => {
                        generateTestCSV({
                          title: test.name,
                          ...project,
                          fields: test.keyResults.map(r => ({ label: r.label, value: r.value })),
                        });
                        toast.success(`${test.name} CSV downloaded`);
                      }}
                    >
                      <FileSpreadsheet className="h-3 w-3" /> CSV
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Reports;
