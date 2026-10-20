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
import { generateCompressiveStrengthPDF, type CompressiveRecordView } from "@/lib/compressivePdfGenerator";
import { listCompressiveCubes, listCompressiveTests } from "@/lib/api";
import { emptyCubeRow, mostCommonCastDate } from "@/lib/compressiveCalculations";
import { toast } from "sonner";
import { useState } from "react";

const Reports = () => {
  const { tests, concreteTestMetadata } = useTestData();
  const project = useProject();
  const testList = Object.values(tests);
  const testsWithData = testList.filter(t => t.dataPoints > 0);
  const [isCompressiveExporting, setIsCompressiveExporting] = useState(false);

  // The generic report path only prints the two key-results lines, which loses
  // the whole cube table. Compressive exports go through the dedicated
  // BS EN 12390-3 sheet so the PDF matches the recording grid.
  const handleCompressivePDF = async () => {
    if (isCompressiveExporting) return;
    setIsCompressiveExporting(true);
    try {
      const projectId = project.currentProjectId;
       const rows = projectId
        ? await (async () => {
            const listed = await listCompressiveTests(projectId);
            const match = (listed.data || []).find((row) => Number(row.project_id) === Number(projectId));
            if (!match) return null;
            const cubes = await listCompressiveCubes(Number(match.id));
            const toInput = (value: unknown, fallback = ""): string => {
              if (value === null || value === undefined) return fallback;
              const text = String(value);
              return text === "" ? fallback : text;
            };
            const asDate = (value: unknown): string => {
              const text = typeof value === "string" ? value.trim() : String(value ?? "").trim();
              const m = /^(\d{4}-\d{2}-\d{2})/.exec(text);
              return m ? m[1] : "";
            };
            return {
              meta: match,
              cubes: (cubes.data || []).map((cube) => ({
                ...emptyCubeRow(),
                id: Number(cube.id),
                mark: cube.cube_mark && cube.cube_mark !== "Unknown" ? String(cube.cube_mark) : "",
                dateOfCast: asDate(cube.date_of_cast),
                dateOfTest: asDate(cube.date_of_test),
                load: toInput(cube.load_kn),
                width: toInput(cube.width_mm, "150"),
                height: toInput(cube.height_mm, "150"),
                depth: toInput(cube.depth_mm, "150"),
                mass: toInput(cube.mass_g),
                remarks: cube.remarks ? String(cube.remarks) : "",
              })),
            };
          })()
        : null;
      const textOf = (value: unknown): string => (typeof value === "string" ? value : value == null ? "" : String(value));
      const record: CompressiveRecordView = {
        // Contractor and county are concrete metadata; the project context has no such fields.
        contractor: textOf(concreteTestMetadata?.contractor),
        county: textOf(concreteTestMetadata?.county),
        concreteClass: textOf(concreteTestMetadata?.concreteClass),
        section: textOf(concreteTestMetadata?.section),
        madeBy: textOf(concreteTestMetadata?.madeBy),
        slump: textOf(concreteTestMetadata?.slump),
        clientRef: textOf(concreteTestMetadata?.clientRef),
        labRef: textOf(concreteTestMetadata?.labRef),
        dateCasted: "",
      };
      const meta = rows?.meta as unknown as Record<string, unknown> | undefined;
      if (meta) {
        const pick = (...keys: string[]): string => {
          for (const key of keys) {
            const value = meta[key];
            if (typeof value === "string" && value.trim() !== "") return value;
            if (typeof value === "number" && Number.isFinite(value)) return String(value);
          }
          return "";
        };
        record.contractor = record.contractor || pick("contractor");
        record.county = record.county || pick("county");
        record.concreteClass = record.concreteClass || pick("concrete_class", "concreteClass");
        record.section = record.section || pick("section");
        record.madeBy = record.madeBy || pick("made_by", "madeBy");
        record.slump = record.slump || pick("slump");
        record.clientRef = record.clientRef || pick("client_ref", "clientRef");
        record.labRef = record.labRef || pick("lab_ref", "labRef");
        record.reportNo = record.reportNo || pick("report_no", "reportNo");
        record.dateReceived = record.dateReceived || pick("date_received", "dateReceived");
        record.curing = record.curing || pick("curing");
        record.modeOfFailure = record.modeOfFailure || pick("mode_of_failure", "modeOfFailure");
        record.comment = record.comment || pick("comment");
        record.dateCasted = record.dateCasted || mostCommonCastDate(rows?.cubes ?? []) || "";
      }
      await generateCompressiveStrengthPDF({
        projectName: project.projectName,
        clientName: project.clientName,
        dateReported: project.dateReported,
        checkedBy: project.checkedBy,
        labOrganization: project.labOrganization,
        record,
        rows: rows?.cubes ?? [],
      });
      toast.success("Compressive strength report downloaded");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Compressive report download failed");
    } finally {
      setIsCompressiveExporting(false);
    }
  };

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
                    {test.id === "compressive" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-9 text-xs gap-1"
                        disabled={isCompressiveExporting}
                        onClick={() => void handleCompressivePDF()}
                      >
                        <FileDown className="h-3 w-3" /> {isCompressiveExporting ? "Preparing…" : "Cube report PDF"}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-9 text-xs gap-1"
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
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-9 text-xs gap-1"
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
