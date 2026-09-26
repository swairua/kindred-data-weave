import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import TestSection from "@/components/TestSection";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import CalculatedInput from "@/components/CalculatedInput";
import { Plus, X, Save as SaveIcon, Printer, Loader2, CheckCircle2, GripVertical } from "lucide-react";
import { useProject } from "@/context/ProjectContext";
import { useTestData } from "@/context/TestDataContext";
import { generateTestPDF } from "@/lib/pdfGenerator";
import { generateTestCSV } from "@/lib/csvExporter";
import { generateTestExcel } from "@/lib/genericExcelExporter";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line, PieChart, Pie, Cell, Legend, ResponsiveContainer } from "recharts";
import { Label } from "@/components/ui/label";
import { useTestReport } from "@/hooks/useTestReport";
import { captureChartAsBase64 } from "@/lib/chartCapture";
import { saveCompressiveTest, listCompressiveCubes, type CompressiveCubeApiRow } from "@/lib/api";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ACCEPTANCE_MARGIN_MPA,
  ageOf,
  buildAgeGroups,
  cubeStrengthFromClass,
  emptyCubeRow,
  formatDensity,
  formatStrength,
  getPassFailResults,
  getStrengthDistribution,
  isFiniteNumber,
  parseNumber,
  strengthOf,
  densityOf,
  strengthRemark,
  toInputValue,
  type CompressiveCubeInput,
} from "@/lib/compressiveCalculations";

type Row = CompressiveCubeInput;

/** Map a stored cube back into an editable row. */
const cubeFromApi = (cube: CompressiveCubeApiRow): Row => ({
  id: Number(cube.id),
  // Older rows stored a placeholder "Unknown" for a blank mark; show those as blank again
  // rather than pretending the technician wrote a mark.
  mark: cube.cube_mark && cube.cube_mark !== "Unknown" ? String(cube.cube_mark) : "",
  dateOfCast: toInputValue(cube.date_of_cast),
  dateOfTest: toInputValue(cube.date_of_test),
  load: toInputValue(cube.load_kn),
  width: toInputValue(cube.width_mm, "150"),
  height: toInputValue(cube.height_mm, "150"),
  depth: toInputValue(cube.depth_mm, "150"),
  mass: toInputValue(cube.mass_g),
  remarks: cube.remarks ? String(cube.remarks) : "",
});

interface TestDetails {
  cement: string;
  fineAggregate: string;
  coarseAggregate: string;
  contractor: string;
  county: string;
  concreteClass: string;
  section: string;
  madeBy: string;
  slump: string;
  clientRef: string;
  dateTested: string;
}

interface CompressiveStrengthTestProps {
  testKey?: string;
}

const CompressiveStrengthTest = ({ testKey }: CompressiveStrengthTestProps) => {
  const project = useProject();
  const testData = useTestData();
  const location = useLocation();
  const [rows, setRows] = useState<Row[]>(() => [emptyCubeRow()]);
  const [isLoadingCubes, setIsLoadingCubes] = useState(false);

  // The wizard passes the id of the test being edited through the URL, the same way GradingTest
  // reads ?resultId. Without this the form always starts from one blank cube, and because the
  // save is a diff the technician would silently "confirm" an empty set of results.
  const testIdParam = Number.parseInt(new URLSearchParams(location.search).get("testId") || "", 10);
  const existingTestId = Number.isInteger(testIdParam) && testIdParam > 0 ? testIdParam : null;
  const [isSaving, setIsSaving] = useState(false);
  const [saveCompleted, setSaveCompleted] = useState(false);
  const [editingRemarksIndex, setEditingRemarksIndex] = useState<number | null>(null);
  const [highlightedRowIndex, setHighlightedRowIndex] = useState<number | null>(null);
  const [passFailThreshold, setPassFailThreshold] = useState(25);
  const [isThresholdOverridden, setIsThresholdOverridden] = useState(false);
  const [passFailMode, setPassFailMode] = useState<"simple" | "multi">("simple");
  const [multiStandardTargets, setMultiStandardTargets] = useState({
    sevenDay: 17,
    twentyEightDay: 25,
    custom: 30,
  });
  const [testDetails, setTestDetails] = useState<TestDetails>(() => ({
    cement: "",
    fineAggregate: "",
    coarseAggregate: "",
    contractor: testData.projectMetadata?.contractor || testData.concreteTestMetadata?.contractor || "",
    county: testData.projectMetadata?.county || testData.concreteTestMetadata?.county || "",
    concreteClass: "",
    section: "",
    madeBy: "",
    slump: "",
    clientRef: "",
    dateTested: "",
    ...(testData.concreteTestMetadata ?? {})
  }));
  const hasProjectSelected = !!project.currentProjectId;

  useEffect(() => {
    if (testData.projectMetadata?.contractor) {
      setTestDetails(prev => ({ ...prev, contractor: testData.projectMetadata.contractor || "" }));
    }
    if (testData.projectMetadata?.county) {
      setTestDetails(prev => ({ ...prev, county: testData.projectMetadata.county || "" }));
    }
  }, [testData.projectMetadata?.contractor, testData.projectMetadata?.county]);

  // Load the cubes of the test being edited. This is what makes an existing test editable:
  // previously the grid always rendered one blank row, so a technician re-opening a saved
  // test saw no results at all and saving from that view dropped every stored cube.
  const cubesLoadStartedRef = useRef<number | null>(null);
  useEffect(() => {
    if (existingTestId === null) return;
    if (cubesLoadStartedRef.current === existingTestId) return;
    cubesLoadStartedRef.current = existingTestId;

    let active = true;
    setIsLoadingCubes(true);
    listCompressiveCubes(existingTestId)
      .then((response) => {
        if (!active) return;
        const loaded = (response.data || []).map(cubeFromApi);
        setRows(loaded.length > 0 ? loaded : [emptyCubeRow()]);
      })
      .catch((error) => {
        if (!active) return;
        const message = error instanceof Error ? error.message : String(error);
        console.error("[CompressiveStrengthTest] Failed to load saved cubes:", message);
        toast.error("Couldn't load the saved cube results — don't save over them blindly");
      })
      .finally(() => {
        if (active) setIsLoadingCubes(false);
      });

    return () => {
      active = false;
    };
  }, [existingTestId]);

  const getAge = (dateOfCast: string, dateOfTest: string) => {
    const days = ageOf(dateOfCast, dateOfTest);
    return days === null ? "" : String(days);
  };

  /** True only for a density that was actually measured and sits outside the normal range. */
  const isAbnormalDensity = (row: Row): boolean => {
    const density = densityOf(row);
    return density !== null && (density < 2200 || density > 2600);
  };

  const update = (i: number, field: keyof Row, val: string) => {
    const next = [...rows];
    next[i] = { ...next[i], [field]: val };
    setRows(next);
  };

  const updateTestDetail = (field: keyof TestDetails, val: string) => {
    setTestDetails(prev => ({ ...prev, [field]: val }));
  };

  const handleSave = useCallback(async () => {
    if (!project.currentProjectId) {
      toast.error("No project selected");
      return;
    }
    if (isLoadingCubes) {
      toast.error("Still loading the saved results — please wait a moment");
      return;
    }

    // A cube counts as "entered" when it actually yields a strength, which is stricter and
    // more honest than the old `r.load && r.width && r.height` (that passed the string
    // "0" and silently persisted NaN dimensions).
    const cubesWithData = rows.filter(row => isFiniteNumber(strengthOf(row)));
    if (cubesWithData.length === 0) {
      toast.error("Please enter a load and cube dimensions for at least one cube");
      return;
    }

    const unmarked = cubesWithData.filter(row => !row.mark.trim()).length;
    if (unmarked > 0) {
      toast.warning(
        `${unmarked} cube${unmarked > 1 ? "s have" : " has"} no mark — recorded as blank, not "Unknown"`,
      );
    }

    setIsSaving(true);
    try {
      const cubesPayload = cubesWithData.map(row => ({
        // Carried through so the API can update this row in place instead of re-inserting it.
        id: row.id ?? null,
        // Unmeasured values are stored as NULL. Writing 0 (or a NaN that JSON turns into null)
        // made a missing mass look like a measured 0 kg/m³ that then slipped past the
        // abnormal-density check.
        cube_mark: row.mark.trim() || null,
        date_of_cast: row.dateOfCast || null,
        date_of_test: row.dateOfTest || null,
        load_kn: parseNumber(row.load),
        width_mm: parseNumber(row.width),
        height_mm: parseNumber(row.height),
        depth_mm: parseNumber(row.depth),
        mass_g: parseNumber(row.mass),
        calculated_strength_mpa: strengthOf(row),
        density_kg_m3: densityOf(row),
        remarks: row.remarks.trim() || null,
      }));

      const testDataPayload = {
        date_tested: testDetails.dateTested || null,
        cement: testDetails.cement,
        fine_aggregate: testDetails.fineAggregate,
        coarse_aggregate: testDetails.coarseAggregate,
        contractor: testDetails.contractor,
        concrete_class: testDetails.concreteClass,
        section: testDetails.section,
        made_by: testDetails.madeBy,
        slump: testDetails.slump,
        client_ref: testDetails.clientRef,
        status: "submitted",
      };

      const result = await saveCompressiveTest({
        projectId: project.currentProjectId,
        testData: testDataPayload,
        cubes: cubesPayload,
        testId: existingTestId,
      });

      // Adopt the ids the server assigned. Without this a second save would treat every row
      // as new and duplicate the whole set of cubes.
      const idByRow = new Map<Row, number>();
      result.cubeIds.forEach((id, index) => {
        const row = cubesWithData[index];
        if (row && id) idByRow.set(row, id);
      });
      if (idByRow.size > 0) {
        setRows(prev => prev.map(row => {
          const id = idByRow.get(row);
          return id ? { ...row, id } : row;
        }));
      }

      toast.success("Compressive strength test saved successfully");
      setSaveCompleted(true);
    } catch (error) {
      console.error("Failed to save test:", error);
      toast.error(error instanceof Error ? error.message : "Failed to save test");
    } finally {
      setIsSaving(false);
    }
  }, [project.currentProjectId, rows, testDetails, isLoadingCubes, existingTestId]);

  const chartData = useMemo(() =>
    rows
      .map((r, idx) => ({ strength: strengthOf(r), name: r.mark.trim() || `Cube ${idx + 1}` }))
      .filter((point): point is { strength: number; name: string } => isFiniteNumber(point.strength)),
    [rows]
  );

  const strengthTrendData = useMemo(() =>
    rows
      .map((r, idx) => ({
        name: r.mark.trim() || `Cube ${idx + 1}`,
        strength: strengthOf(r),
        age: ageOf(r.dateOfCast, r.dateOfTest),
        index: idx,
      }))
      .filter((point): point is { name: string; strength: number; age: number | null; index: number } =>
        isFiniteNumber(point.strength)),
    [rows]
  );

  const densityChartData = useMemo(() =>
    rows
      .map((r, idx) => ({ density: densityOf(r), name: r.mark.trim() || `Cube ${idx + 1}`, index: idx }))
      .filter((point): point is { density: number; name: string; index: number } => isFiniteNumber(point.density))
      .map((point) => ({
        ...point,
        isAbnormal: point.density < 2200 || point.density > 2600,
      })),
    [rows]
  );

  const strengthDistribution = useMemo(() => {
    const dist = getStrengthDistribution(rows);
    return [
      { name: "Very Low (< 7)", value: dist.veryLow, color: "#ef4444" },
      { name: "Low (7–20)", value: dist.low, color: "#f97316" },
      { name: "Normal (20–40)", value: dist.normal, color: "#22c55e" },
      { name: "High (> 40)", value: dist.high, color: "#3b82f6" },
    ];
  }, [rows]);

  /**
   * Target strength for the simple tally. Taken from the recorded concrete class when there is
   * one ("C25/30" -> 30 MPa cubes) so a stale hand-typed threshold can't quietly mislabel a
   * whole batch. Typing in the box takes over via isThresholdOverridden.
   */
  const classTargetStrength = useMemo(
    () => cubeStrengthFromClass(testDetails.concreteClass),
    [testDetails.concreteClass],
  );
  const effectiveThreshold = isThresholdOverridden ? passFailThreshold : (classTargetStrength ?? passFailThreshold);

  const passFailData = useMemo(
    () => getPassFailResults(rows, effectiveThreshold),
    [rows, effectiveThreshold],
  );

  /**
   * Cubes grouped by the age they were actually tested at.
   *
   * Cube acceptance is judged on the mean of a group broken at one age, so averaging a 7-day
   * and a 28-day cube together produces a number that describes nothing. Each band is reported
   * separately, and anything outside every tolerance window is surfaced as "Other ages" rather
   * than being dropped on the floor.
   */
  const ageGroups = useMemo(
    () => buildAgeGroups(rows, multiStandardTargets),
    [rows, multiStandardTargets],
  );

  const chartConfig = { strength: { label: "Strength (MPa)", color: "hsl(var(--primary))" } };

  const strengths = useMemo(
    () => rows.map(strengthOf).filter(isFiniteNumber),
    [rows],
  );
  const avgStrength = strengths.length ? (strengths.reduce((a, b) => a + b, 0) / strengths.length).toFixed(2) : "";
  const compResults = useMemo(() => [
    { label: "Avg Strength (all ages)", value: avgStrength ? `${avgStrength} MPa` : "" },
    { label: "Cubes Tested", value: strengths.length ? String(strengths.length) : "" },
  ], [avgStrength, strengths.length]);
  useTestReport("compressive", strengths.length, compResults);

  /**
   * Report-ready summary + per-age-group breakdown, shared by the PDF and XLSX exports.
   * The per-age rows matter: a single blended "Avg Strength" is not a reportable figure
   * because it mixes cubes broken at different ages.
   */
  const buildExportTables = () => {
    const dist = getStrengthDistribution(rows);
    const classification = {
      headers: ["Classification", "Count"],
      rows: [
        ["Very Low (< 7 MPa)", String(dist.veryLow)],
        ["Low (7–20 MPa)", String(dist.low)],
        ["Normal (20–40 MPa)", String(dist.normal)],
        ["High (> 40 MPa)", String(dist.high)],
      ],
    };

    const groupRows = ageGroups.bands
      .filter((group) => group.count > 0)
      .map((group) => [
        group.label,
        String(group.count),
        group.mean !== null ? group.mean.toFixed(2) : "—",
        group.min !== null ? group.min.toFixed(2) : "—",
        group.max !== null ? group.max.toFixed(2) : "—",
        group.target !== null ? String(group.target) : "—",
        group.verdict
          ? (group.verdict.accepted ? "Accept" : (group.verdict.meetsMean ? "Mean OK, low cube" : "Reject"))
          : "—",
      ]);

    if (ageGroups.other.count > 0) {
      groupRows.push([
        ageGroups.other.label,
        String(ageGroups.other.count),
        ageGroups.other.mean !== null ? ageGroups.other.mean.toFixed(2) : "—",
        ageGroups.other.min !== null ? ageGroups.other.min.toFixed(2) : "—",
        ageGroups.other.max !== null ? ageGroups.other.max.toFixed(2) : "—",
        "—",
        "Not assessable — outside every reporting window",
      ]);
    }

    const ageBreakdown = {
      headers: ["Age Group", "Cubes", "Mean (MPa)", "Min (MPa)", "Max (MPa)", "Target (MPa)", "Result"],
      rows: groupRows,
    };

    const cubeRows = rows.map((r, i) => [
      String(i + 1),
      r.mark.trim() || "—",
      r.dateOfCast || "—",
      r.dateOfTest || "—",
      getAge(r.dateOfCast, r.dateOfTest) || "—",
      // Rendered as one unit rather than "150××" when a dimension was left blank.
      [r.width, r.height, r.depth].every((part) => part.trim() !== "")
        ? `${r.width}×${r.height}×${r.depth}`
        : "—",
      r.mass || "—",
      formatDensity(r) || "—",
      r.load || "—",
      formatStrength(r) || "—",
      r.remarks || strengthRemark(r) || "—",
    ]);

    const summaryFields = [
      { label: "Avg Strength (all ages)", value: avgStrength ? `${avgStrength} MPa` : "—" },
      { label: "Cubes Tested", value: strengths.length ? String(strengths.length) : "—" },
      { label: "Concrete Class", value: testDetails.concreteClass || "—" },
      { label: "Target (from class)", value: classTargetStrength !== null ? `${classTargetStrength} MPa` : "—" },
      { label: "Tally Threshold", value: `${effectiveThreshold} MPa${isThresholdOverridden ? " (manual)" : classTargetStrength !== null ? " (from class)" : ""}` },
      { label: "Pass Count", value: String(passFailData.passCount) },
      { label: "Fail Count", value: String(passFailData.failCount) },
      { label: "Pass Rate", value: `${passFailData.passRate.toFixed(0)}%` },
    ];

    return { summaryFields, tables: [classification, ageBreakdown, { headers: ["#", "Cube Mark", "Date of Cast", "Date of Test", "Age", "Dims", "Mass", "Density", "Load", "Strength", "Remarks"], rows: cubeRows }] };
  };

  const exportPDF = async () => {
    let chartImages = {};
    if (chartData.length >= 1) {
      const chartBase64 = await captureChartAsBase64("compressive-chart");
      if (chartBase64) {
        chartImages = { "Cube Compressive Strengths": chartBase64 };
      }
    }

    const { summaryFields, tables } = buildExportTables();

    generateTestPDF({
      title: "Compressive Strength (Cube Test)",
      standard: "BS EN 206:2013, Table 18 / BS 8500-1:2015",
      ...project,
      fields: summaryFields,
      tables,
      chartImages
    });
  };

  const exportXLSX = async () => {
    let chartImages = {};
    if (chartData.length >= 1) {
      const chartBase64 = await captureChartAsBase64("compressive-chart");
      if (chartBase64) {
        chartImages = { "Cube Compressive Strengths": chartBase64 };
      }
    }

    const { summaryFields, tables } = buildExportTables();

    generateTestExcel({
      data: {
        title: "Compressive Strength (Cube Test)",
        fields: summaryFields,
        tables,
        chartImages,
      },
      projectName: project.projectName,
      clientName: project.clientName,
      date: project.date,
      labOrganization: project.labOrganization,
      dateReported: project.dateReported,
      checkedBy: project.checkedBy,
    });
  };

  const handlePrint = () => {
    window.print();
  };

  const handleChartClick = (index: number) => {
    setHighlightedRowIndex(highlightedRowIndex === index ? null : index);
  };

  const handleRowClick = (index: number) => {
    setHighlightedRowIndex(highlightedRowIndex === index ? null : index);
  };

  const renderTable = () => (
    <div className="flex flex-col gap-4">
      <div className="mb-6 p-4 bg-gradient-to-r from-amber-50 to-amber-100 rounded-lg border border-amber-200">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">Test Details</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {[
            { label: "Cement", value: testDetails.cement },
            { label: "Fine Aggregate", value: testDetails.fineAggregate },
            { label: "Coarse Aggregate", value: testDetails.coarseAggregate },
            { label: "Contractor", value: testDetails.contractor },
            { label: "County", value: testDetails.county },
            { label: "Concrete Class", value: testDetails.concreteClass },
            { label: "Section", value: testDetails.section },
            { label: "Made By", value: testDetails.madeBy },
            { label: "Slump", value: testDetails.slump },
            { label: "Client Ref", value: testDetails.clientRef },
            { label: "Date Tested", value: testDetails.dateTested },
          ].map((item) => (
            <div key={item.label} className="flex flex-col">
              <span className="text-xs text-gray-600 font-medium">{item.label}</span>
              <span className="text-sm font-semibold text-gray-900">{item.value || "—"}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border border-border rounded-lg">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left py-2 px-2 font-medium text-muted-foreground text-xs">#</th>
              <th className="text-left py-2 px-2 font-medium text-muted-foreground text-xs">Cube Mark</th>
              <th className="text-left py-2 px-2 font-medium text-muted-foreground text-xs hidden md:table-cell">Date of Cast</th>
              <th className="text-left py-2 px-2 font-medium text-muted-foreground text-xs hidden md:table-cell">Date of Test</th>
              <th className="text-left py-2 px-2 font-medium text-muted-foreground text-xs">Age (days)</th>
              <th className="text-left py-2 px-2 font-medium text-muted-foreground text-xs hidden md:table-cell">Cube Dim (mm)<br/>L × W × H</th>
              <th className="text-left py-2 px-2 font-medium text-muted-foreground text-xs hidden md:table-cell">Mass (g)</th>
              <th className="text-left py-2 px-2 font-medium text-muted-foreground text-xs hidden md:table-cell">Density (kg/m³)</th>
              <th className="text-left py-2 px-2 font-medium text-muted-foreground text-xs">Max Load (kN)</th>
              <th className="text-left py-2 px-2 font-medium text-muted-foreground text-xs">Strength (N/mm²)</th>
              <th className="text-left py-2 px-2 font-medium text-muted-foreground text-xs">Remarks</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const isDensityAbnormal = isAbnormalDensity(row);
              const isHighlighted = highlightedRowIndex === i;
              return (
                <tr
                  key={i}
                  className={`border-b border-border/50 cursor-pointer transition-colors ${isHighlighted ? "bg-blue-100" : isDensityAbnormal ? "bg-red-50" : "hover:bg-muted/30"}`}
                  onClick={() => handleRowClick(i)}
                >
                  <td className="py-1.5 px-2 text-muted-foreground">{i + 1}</td>
                  <td className="py-1.5 px-2"><Input value={row.mark} onChange={(e) => update(i, "mark", e.target.value)} className="h-8 text-sm" placeholder="—" /></td>
                  <td className="py-1.5 px-2 hidden md:table-cell"><Input type="date" value={row.dateOfCast} onChange={(e) => update(i, "dateOfCast", e.target.value)} className="h-8 text-sm" /></td>
                  <td className="py-1.5 px-2 hidden md:table-cell"><Input type="date" value={row.dateOfTest} onChange={(e) => update(i, "dateOfTest", e.target.value)} className="h-8 text-sm" /></td>
                  <td className="py-1.5 px-2"><CalculatedInput value={getAge(row.dateOfCast, row.dateOfTest)} /></td>
                  <td className="py-1.5 px-2 hidden md:table-cell">
                    <div className="flex gap-1 text-xs">
                      <Input type="number" value={row.width} onChange={(e) => update(i, "width", e.target.value)} className="h-8 w-14" placeholder="L" />
                      <span className="text-muted-foreground">×</span>
                      <Input type="number" value={row.height} onChange={(e) => update(i, "height", e.target.value)} className="h-8 w-14" placeholder="W" />
                      <span className="text-muted-foreground">×</span>
                      <Input type="number" value={row.depth} onChange={(e) => update(i, "depth", e.target.value)} className="h-8 w-14" placeholder="H" />
                    </div>
                  </td>
                  <td className="py-1.5 px-2 hidden md:table-cell"><Input type="number" value={row.mass} onChange={(e) => update(i, "mass", e.target.value)} className="h-8 text-sm" placeholder="—" /></td>
                  <td className={`py-1.5 px-2 hidden md:table-cell ${isDensityAbnormal ? "text-red-600 font-semibold" : ""}`}><CalculatedInput value={formatDensity(row)} /></td>
                  <td className="py-1.5 px-2"><Input type="number" value={row.load} onChange={(e) => update(i, "load", e.target.value)} className="h-8 text-sm" placeholder="0" /></td>
                  <td className="py-1.5 px-2"><CalculatedInput value={formatStrength(row)} /></td>
                  <td className="py-1.5 px-2">
                    {editingRemarksIndex === i ? (
                      <div className="flex gap-1">
                        <Input value={row.remarks} onChange={(e) => update(i, "remarks", e.target.value)} className="h-8 text-sm flex-1" placeholder="—" />
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditingRemarksIndex(null)}><CheckCircle2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    ) : (
                      <div className="flex gap-1 items-center group">
                        <CalculatedInput value={row.remarks || strengthRemark(row)} />
                        <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100" onClick={() => setEditingRemarksIndex(i)}>
                          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                        </Button>
                      </div>
                    )}
                  </td>
                  <td className="py-1.5 px-1"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setRows(rows.filter((_, j) => j !== i))}><X className="h-3.5 w-3.5" /></Button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between mt-3">
        <Button variant="outline" size="sm" onClick={() => setRows([...rows, emptyCubeRow()])}><Plus className="h-3.5 w-3.5 mr-1" /> Add row</Button>
        {saveCompleted ? (
          <Button size="sm" variant="default" onClick={handlePrint}><Printer className="h-3.5 w-3.5 mr-1" /> Print to Browser</Button>
        ) : isSaving ? (
          <Button size="sm" variant="default" disabled><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Saving...</Button>
        ) : (
          <Button size="sm" variant="default" onClick={handleSave}><SaveIcon className="h-3.5 w-3.5 mr-1" /> Save</Button>
        )}
      </div>
    </div>
  );

  const renderAnalytics = () => (
    <div className="flex flex-col gap-4">
      {strengthTrendData.length >= 1 && (
        <div className="rounded-lg border bg-card p-4">
          <Label className="text-xs font-semibold mb-2 block">Strength Trend</Label>
          <ChartContainer config={chartConfig} className="h-[250px] w-full">
            <LineChart data={strengthTrendData} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" className="text-xs" />
              <YAxis className="text-xs" />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line
                type="monotone"
                dataKey="strength"
                stroke="var(--color-strength)"
                dot={{ r: 4, cursor: "pointer" }}
                onClick={(e: any) => handleChartClick(e.payload.index)}
              />
            </LineChart>
          </ChartContainer>
        </div>
      )}

      {densityChartData.length >= 1 && (
        <div className="rounded-lg border bg-card p-4">
          <Label className="text-xs font-semibold mb-2 block">Density Distribution</Label>
          <ChartContainer config={chartConfig} className="h-[200px] w-full">
            <BarChart data={densityChartData} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" className="text-xs" />
              <YAxis className="text-xs" />
              <ChartTooltip
                content={<ChartTooltipContent />}
              />
              <Bar
                dataKey="density"
                fill="hsl(var(--primary))"
                onClick={(e: any) => handleChartClick(e.payload.index)}
                radius={[4, 4, 0, 0]}
              >
                {densityChartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.isAbnormal ? "#ef4444" : "hsl(var(--primary))"} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        </div>
      )}

      {strengthDistribution.some(d => d.value > 0) && (
        <div className="rounded-lg border bg-card p-4">
          <Label className="text-xs font-semibold mb-2 block">Strength Classification</Label>
          <ChartContainer config={chartConfig} className="h-[200px] w-full">
            <PieChart>
              <Pie data={strengthDistribution} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}>
                {strengthDistribution.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <ChartTooltip content={<ChartTooltipContent />} />
            </PieChart>
          </ChartContainer>
        </div>
      )}

      <div className="rounded-lg border bg-card p-4">
        <Label className="text-xs font-semibold mb-3 block">Pass/Fail Summary</Label>
        <Tabs value={passFailMode} onValueChange={(v) => setPassFailMode(v as "simple" | "multi")}>
          <TabsList className="mb-3 w-full">
            <TabsTrigger value="simple" className="flex-1">Simple Mode</TabsTrigger>
            <TabsTrigger value="multi" className="flex-1">Multi-Standard</TabsTrigger>
          </TabsList>

          <TabsContent value="simple" className="space-y-3 mt-0">
            <div className="flex items-center gap-2">
              <Label className="text-xs">Threshold (MPa):</Label>
              <Input
                type="number"
                value={passFailThreshold}
                onChange={(e) => {
                  setPassFailThreshold(parseFloat(e.target.value) || 25);
                  setIsThresholdOverridden(true);
                }}
                className="h-8 w-20 text-sm"
              />
              <span className="text-[11px] text-muted-foreground">
                {classTargetStrength !== null && !isThresholdOverridden
                  ? `Using ${classTargetStrength} MPa from class ${testDetails.concreteClass}`
                  : isThresholdOverridden
                    ? "Manual override"
                    : "No concrete class set — using 25 MPa default"}
              </span>
            </div>
            {classTargetStrength !== null && !isThresholdOverridden && (
              <button
                type="button"
                className="text-[11px] text-primary underline underline-offset-2"
                onClick={() => setIsThresholdOverridden(true)}
              >
                Override the class-derived target
              </button>
            )}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded bg-green-50 border border-green-200 p-3 text-center">
                <div className="text-2xl font-bold text-green-600">{passFailData.passCount}</div>
                <div className="text-xs text-green-700">Pass</div>
              </div>
              <div className="rounded bg-red-50 border border-red-200 p-3 text-center">
                <div className="text-2xl font-bold text-red-600">{passFailData.failCount}</div>
                <div className="text-xs text-red-700">Fail</div>
              </div>
              <div className={`rounded p-3 text-center border ${passFailData.passRate >= 80 ? "bg-green-50 border-green-200" : passFailData.passRate >= 50 ? "bg-yellow-50 border-yellow-200" : "bg-red-50 border-red-200"}`}>
                <div className={`text-2xl font-bold ${passFailData.passRate >= 80 ? "text-green-600" : passFailData.passRate >= 50 ? "text-yellow-600" : "text-red-600"}`}>
                  {passFailData.passRate.toFixed(0)}%
                </div>
                <div className={`text-xs ${passFailData.passRate >= 80 ? "text-green-700" : passFailData.passRate >= 50 ? "text-yellow-700" : "text-red-700"}`}>Pass Rate</div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="multi" className="space-y-3 mt-0">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label className="text-xs w-20">7-Day (MPa):</Label>
                <Input
                  type="number"
                  value={multiStandardTargets.sevenDay}
                  onChange={(e) => setMultiStandardTargets(prev => ({ ...prev, sevenDay: parseFloat(e.target.value) || 17 }))}
                  className="h-8 flex-1 text-sm"
                />
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs w-20">28-Day (MPa):</Label>
                <Input
                  type="number"
                  value={multiStandardTargets.twentyEightDay}
                  onChange={(e) => setMultiStandardTargets(prev => ({ ...prev, twentyEightDay: parseFloat(e.target.value) || 25 }))}
                  className="h-8 flex-1 text-sm"
                />
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs w-20">Custom (MPa):</Label>
                <Input
                  type="number"
                  value={multiStandardTargets.custom}
                  onChange={(e) => setMultiStandardTargets(prev => ({ ...prev, custom: parseFloat(e.target.value) || 30 }))}
                  className="h-8 flex-1 text-sm"
                />
              </div>
            </div>
            {ageGroups.bands.map((group) => (
              <div
                key={group.key}
                className={`rounded border p-3 ${
                  group.count === 0
                    ? "bg-muted/30 border-border"
                    : group.verdict?.accepted
                      ? "bg-green-50 border-green-200"
                      : "bg-amber-50 border-amber-200"
                }`}
              >
                <div className="text-xs font-semibold text-gray-900 mb-1">{group.label}</div>
                {group.count === 0 ? (
                  <div className="text-xs text-muted-foreground">No cubes broken at this age</div>
                ) : (
                  <div className="text-xs text-gray-700 space-y-0.5">
                    <div>
                      {group.count} cube{group.count > 1 ? "s" : ""} · mean{" "}
                      <strong>{group.mean !== null ? group.mean.toFixed(2) : "—"} MPa</strong> · min{" "}
                      {group.min !== null ? group.min.toFixed(2) : "—"} · max{" "}
                      {group.max !== null ? group.max.toFixed(2) : "—"}
                    </div>
                    <div>
                      Target {group.target} MPa ·{" "}
                      {group.verdict?.accepted
                        ? <span className="text-green-700 font-semibold">Group accepted</span>
                        : group.verdict?.meetsMean
                          ? <span className="text-amber-700 font-semibold">Mean reached, but a cube is more than {ACCEPTANCE_MARGIN_MPA} MPa below target</span>
                          : <span className="text-red-700 font-semibold">Group mean below target</span>}
                    </div>
                  </div>
                )}
              </div>
            ))}
            {ageGroups.other.count > 0 && (
              <div className="rounded bg-slate-50 border border-slate-200 p-3">
                <div className="text-xs font-semibold text-slate-900 mb-1">{ageGroups.other.label}</div>
                <div className="text-xs text-slate-700">
                  {ageGroups.other.count} cube{ageGroups.other.count > 1 ? "s" : ""} · mean{" "}
                  <strong>{ageGroups.other.mean !== null ? ageGroups.other.mean.toFixed(2) : "—"} MPa</strong> · min{" "}
                  {ageGroups.other.min !== null ? ageGroups.other.min.toFixed(2) : "—"}
                </div>
                <div className="text-[11px] text-slate-600 mt-1">
                  Outside 7±1 and 28±3 days — not assessable against a standard reporting age.
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {chartData.length >= 1 && (
        <div className="rounded-lg border bg-card p-4">
          <Label className="text-xs font-semibold mb-2 block">Cube Compressive Strengths</Label>
          <ChartContainer id="compressive-chart" config={chartConfig} className="h-[250px] w-full">
            <BarChart data={chartData} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" className="text-xs" />
              <YAxis className="text-xs" />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="strength" name="strength" fill="var(--color-strength)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </div>
      )}
    </div>
  );

  return (
    <TestSection title="Compressive Strength (Cube Test)" testKey={testKey} onClear={() => setRows([emptyCubeRow()])}>
      <>
        <div className="flex flex-col gap-6 w-full">
          <div className="w-full">
            {renderTable()}
          </div>
          <div className="w-full">
            {renderAnalytics()}
          </div>
        </div>
      </>
    </TestSection>
  );
};

export default CompressiveStrengthTest;
