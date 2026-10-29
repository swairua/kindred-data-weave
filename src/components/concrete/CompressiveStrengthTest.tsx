import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import TestSection from "@/components/TestSection";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import CalculatedInput from "@/components/CalculatedInput";
import { Plus, X, Save as SaveIcon, Printer, Loader2, CheckCircle2, GripVertical, FileDown, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useProject } from "@/context/ProjectContext";
import { useTestData } from "@/context/TestDataContext";
import { generateCompressiveStrengthPDF } from "@/lib/compressivePdfGenerator";

import { Label } from "@/components/ui/label";
import { useTestReport } from "@/hooks/useTestReport";
import { saveCompressiveTest, listCompressiveCubes, getCompressiveTest, resolveCompressiveTestId, type CompressiveCubeApiRow } from "@/lib/api";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ACCEPTANCE_MARGIN_MPA,
  ageOf,
  buildAgeGroups,
  classBandTargets,
  cubeStrengthFromClass,
  emptyCubeRow,
  formatDensity,
  formatStrength,
  gainSummary,
  getPassFailResults,
  isFiniteNumber,
  parseNumber,
  strengthOf,
  densityOf,
  mostCommonCastDate,
  strengthRemark,
  toInputValue,
  type CompressiveCubeInput,
  type MultiStandardTargets,
} from "@/lib/compressiveCalculations";

type Row = CompressiveCubeInput;

/** Map a stored cube back into an editable row. */
const cubeFromApi = (cube: CompressiveCubeApiRow): Row => ({
  id: Number(cube.id),
  // Older rows stored a placeholder "Unknown" for a blank mark; show those as blank again
  // rather than pretending the technician wrote a mark.
  mark: cube.cube_mark && cube.cube_mark !== "Unknown" ? String(cube.cube_mark) : "",
  dateOfCast: asDateInput(cube.date_of_cast),
  dateOfTest: asDateInput(cube.date_of_test),
  load: toInputValue(cube.load_kn),
  width: toInputValue(cube.width_mm, "150"),
  height: toInputValue(cube.height_mm, "150"),
  depth: toInputValue(cube.depth_mm, "150"),
  mass: toInputValue(cube.mass_g),
  remarks: cube.remarks ? String(cube.remarks) : "",
});

const asText = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  const text = String(value).trim();
  return text;
};

const parseCustomFields = (value: unknown): { key: string; value: string }[] => {
  if (value === null || value === undefined || value === "") return [];
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item === "object")
      .map((item) => ({ key: String((item as { key?: unknown }).key ?? ""), value: String((item as { value?: unknown }).value ?? "") }));
  } catch {
    return [];
  }
};

/** ISO date (or datetime) straight from the API back into a date input. */
const asDateInput = (value: unknown): string => {
  const text = asText(value);
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(text);
  return match ? match[1] : "";
};

/** Map a stored test row back into the editable Test Details form. */
const detailsFromApi = (row: Record<string, unknown>): TestDetails => ({
  cement: asText(row.cement),
  fineAggregate: asText(row.fine_aggregate),
  coarseAggregate: asText(row.coarse_aggregate),
  contractor: asText(row.contractor),
  county: asText(row.county),
  concreteClass: asText(row.concrete_class),
  section: asText(row.section),
  madeBy: asText(row.made_by),
  slump: asText(row.slump),
  clientRef: asText(row.client_ref),
  labRef: asText(row.lab_ref),
  reportNo: asText(row.report_no),
  dateReceived: asDateInput(row.date_received),
  curing: asText(row.curing),
  modeOfFailure: asText(row.mode_of_failure),
  comment: asText(row.comment),
  customFields: parseCustomFields(row.custom_fields),
  dateTested: asDateInput(row.date_tested),
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
  /** The laboratory's own sample reference, printed on the results sheet. */
  labRef: string;
  reportNo: string;
  dateReceived: string;
  curing: string;
  modeOfFailure: string;
  comment: string;
  customFields: { key: string; value: string }[];
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
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const tableRef = useRef<HTMLTableElement | null>(null);

  const handleTableKeyDown = (event: { key: string; currentTarget: HTMLInputElement; preventDefault: () => void }) => {
    const row = Number(event.currentTarget.dataset.navRow);
    const col = Number(event.currentTarget.dataset.navCol);
    let nextRow = row;
    let nextCol = col;
    if (event.key === "ArrowRight") nextCol += 1;
    else if (event.key === "ArrowLeft") nextCol -= 1;
    else if (event.key === "ArrowDown") nextRow += 1;
    else if (event.key === "ArrowUp") nextRow -= 1;
    else return;
    const target = tableRef.current?.querySelector<HTMLInputElement>(`input[data-nav-row="${nextRow}"][data-nav-col="${nextCol}"]`);
    if (target) {
      event.preventDefault();
      target.focus();
    }
  };
  const [isLoadingCubes, setIsLoadingCubes] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  // The wizard passes the id of the test being edited through the URL, the same way GradingTest
  // reads ?resultId. Without this the form always starts from one blank cube, and because the
  // save is a diff the technician would silently "confirm" an empty set of results.
  const testIdParam = Number.parseInt(new URLSearchParams(location.search).get("testId") || "", 10);
  const existingTestId = Number.isInteger(testIdParam) && testIdParam > 0 ? testIdParam : null;
  // The project overview and test-results pages open saved tests with ?resultId= (a
  // test_results id, not a compressive_tests id), which the grid cannot load from
  // directly. Resolve it to the compressive test below instead of showing blank.
  const resultIdParam = Number.parseInt(new URLSearchParams(location.search).get("resultId") || "", 10);
  const projectIdParam = Number.parseInt(new URLSearchParams(location.search).get("projectId") || "", 10);
  const [resolvedTestId, setResolvedTestId] = useState<number | null>(null);
  const activeTestId = existingTestId ?? resolvedTestId;
  const [isSaving, setIsSaving] = useState(false);
  const [editingRemarksIndex, setEditingRemarksIndex] = useState<number | null>(null);
  const [highlightedRowIndex, setHighlightedRowIndex] = useState<number | null>(null);
  const [passFailThreshold, setPassFailThreshold] = useState(25);
  const [isThresholdOverridden, setIsThresholdOverridden] = useState(false);
  const [passFailMode, setPassFailMode] = useState<"simple" | "multi">("simple");
  const [multiStandardTargets, setMultiStandardTargets] = useState({
    oneDay: 4,
    threeDay: 10,
    sevenDay: 17,
    fourteenDay: 22.5,
    twentyEightDay: 25,
  });
  const [isMultiOverridden, setIsMultiOverridden] = useState(false);
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
    labRef: "",
    reportNo: "",
    dateReceived: "",
    curing: "",
    modeOfFailure: "",
    comment: "",
    customFields: [],
    dateTested: "",
    ...(testData.concreteTestMetadata ?? {})
  }));
  const hasProjectSelected = !!project.currentProjectId;

  // Auto-generate references for a new compressive test, following the laboratory's
  // numbering: C/<project initial> L01 per project and CMT C - L001 across all tests.
  useEffect(() => {
    if (activeTestId !== null || !project.currentProjectId) return;
    let active = true;
    (async () => {
      try {
        const [projectTests, allTests] = await Promise.all([
          listCompressiveTests(project.currentProjectId),
          listCompressiveTests(),
        ]);
        if (!active) return;
        const initial = (project.projectName || "").trim().charAt(0).toUpperCase() || "X";
        const projectSeq = (projectTests.data || []).length + 1;
        const globalSeq = (allTests.data || []).length + 1;
        setTestDetails((prev) => ({
          ...prev,
          labRef: prev.labRef || `C/${initial} L${String(projectSeq).padStart(2, "0")}`,
          reportNo: prev.reportNo || `CMT C - L${String(globalSeq).padStart(3, "0")}`,
        }));
      } catch {
        // Reference generation is a convenience; a failed lookup leaves the fields blank.
      }
    })();
    return () => {
      active = false;
    };
  }, [project.currentProjectId, activeTestId, project.projectName]);

  useEffect(() => {
    // Project metadata only fills blanks: values loaded from a saved test
    // (or typed by the technician) must never be clobbered when the project
    // context arrives late.
    if (testData.projectMetadata?.contractor) {
      const fallback = testData.projectMetadata.contractor || "";
      setTestDetails(prev => (prev.contractor ? prev : { ...prev, contractor: fallback }));
    }
    if (testData.projectMetadata?.county) {
      const fallback = testData.projectMetadata.county || "";
      setTestDetails(prev => (prev.county ? prev : { ...prev, county: fallback }));
    }
  }, [testData.projectMetadata?.contractor, testData.projectMetadata?.county]);

  // The wizard hands the compressive sheet the reception Lab ID as the lab
  // reference. The metadata can arrive after this form mounts (the wizard
  // writes it just before navigating here), so fill a blank labRef once it
  // shows up — never overwrite one the technician typed or loaded from a
  // saved test.
  useEffect(() => {
    const incoming = testData.concreteTestMetadata?.labRef;
    if (!incoming) return;
    setTestDetails(prev => (prev.labRef ? prev : { ...prev, labRef: incoming }));
  }, [testData.concreteTestMetadata?.labRef]);

  // Load the cubes and the test details of the test being edited. This is what
  // makes an existing test editable: previously the grid always rendered one
  // blank row, so a technician re-opening a saved test saw no results at all
  // and saving from that view dropped every stored cube — and the details
  // (cement, class, slump, refs) came from possibly-stale context, so a
  // reopen showed whatever the context happened to hold instead of the truth.
  const cubesLoadStartedRef = useRef<number | null>(null);

  // Turn a ?resultId= link (project overview, test results) into the
  // compressive_tests.id the grid loads from. A direct ?testId= always wins;
  // when nothing resolves the form stays blank, which is a new test.
  useEffect(() => {
    if (existingTestId !== null || resolvedTestId !== null) return;
    if (!Number.isInteger(resultIdParam) || resultIdParam <= 0) return;
    if (!Number.isInteger(projectIdParam) || projectIdParam <= 0) return;

    let active = true;
    setIsLoadingCubes(true);
    setIsLoadingDetails(true);
    resolveCompressiveTestId(resultIdParam, projectIdParam)
      .then((id) => {
        if (active && id !== null) setResolvedTestId(id);
      })
      .catch((error) => {
        if (!active) return;
        const message = error instanceof Error ? error.message : String(error);
        console.error("[CompressiveStrengthTest] Failed to resolve the saved test:", message);
      })
      .finally(() => {
        if (active) {
          setIsLoadingCubes(false);
          setIsLoadingDetails(false);
        }
      });

    return () => {
      active = false;
    };
  }, [existingTestId, resolvedTestId, resultIdParam, projectIdParam]);

  useEffect(() => {
    if (activeTestId === null) return;
    if (cubesLoadStartedRef.current === activeTestId) return;
    cubesLoadStartedRef.current = activeTestId;

    let active = true;
    setIsLoadingCubes(true);
    setIsLoadingDetails(true);
    listCompressiveCubes(activeTestId)
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
    getCompressiveTest(activeTestId)
      .then((response) => {
        if (!active) return;
        const row = (response as { data?: unknown }).data;
        if (row && typeof row === "object") {
          setTestDetails(detailsFromApi(row as Record<string, unknown>));
        }
      })
      .catch((error) => {
        if (!active) return;
        const message = error instanceof Error ? error.message : String(error);
        console.error("[CompressiveStrengthTest] Failed to load saved test details:", message);
        toast.error("Couldn't load the saved test details — don't save over them blindly");
      })
      .finally(() => {
        if (active) setIsLoadingDetails(false);
      });

    return () => {
      active = false;
    };
  }, [activeTestId]);

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

  const handleImportFieldLog = (event: { target: { files?: FileList | null; value: string } }) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const lines = text.trim().split(/\r?\n/).filter((line) => line.trim() !== "");
      if (lines.length < 2) {
        toast.error("Field log is empty");
        return;
      }
      const headers = lines[0].split(",").map((header) => header.trim().toLowerCase().replace(/[^a-z0-9]/g, ""));
      const indexOf = (names: string[]) => {
        for (const name of names) {
          const index = headers.indexOf(name);
          if (index >= 0) return index;
        }
        return -1;
      };
      const markIndex = indexOf(["mark", "cubemark", "cubemark"]);
      const castIndex = indexOf(["dateofcast", "datecast", "castdate"]);
      const testIndex = indexOf(["dateoftest", "testdate", "datetested"]);
      const widthIndex = indexOf(["width", "widthmm", "l"]);
      const heightIndex = indexOf(["height", "heightmm", "w"]);
      const depthIndex = indexOf(["depth", "depthmm", "h"]);
      const massIndex = indexOf(["mass", "massg"]);
      const loadIndex = indexOf(["load", "loadkn", "maxload"]);
      const remarksIndex = indexOf(["remarks", "remark", "comment"]);

      const imported: Row[] = [];
      for (let i = 1; i < lines.length; i += 1) {
        const columns = lines[i].split(",");
        const row = emptyCubeRow();
        if (markIndex >= 0) row.mark = (columns[markIndex] ?? "").trim();
        if (castIndex >= 0) row.dateOfCast = (columns[castIndex] ?? "").trim();
        if (testIndex >= 0) row.dateOfTest = (columns[testIndex] ?? "").trim();
        if (widthIndex >= 0) row.width = (columns[widthIndex] ?? "").trim() || "150";
        if (heightIndex >= 0) row.height = (columns[heightIndex] ?? "").trim() || "150";
        if (depthIndex >= 0) row.depth = (columns[depthIndex] ?? "").trim() || "150";
        if (massIndex >= 0) row.mass = (columns[massIndex] ?? "").trim();
        if (loadIndex >= 0) row.load = (columns[loadIndex] ?? "").trim();
        if (remarksIndex >= 0) row.remarks = (columns[remarksIndex] ?? "").trim();
        imported.push(row);
      }

      if (imported.length === 0) {
        toast.error("No cubes found in field log");
        return;
      }
      setRows(imported);
      toast.success(`Imported ${imported.length} cube(s) from field log`);
    };
    reader.readAsText(file);
    event.target.value = "";
  };

  const updateTestDetail = (field: keyof TestDetails, val: string) => {
    setTestDetails(prev => ({ ...prev, [field]: val }));
  };

  const handleSave = useCallback(async () => {
    if (!project.currentProjectId) {
      toast.error("No project selected");
      return;
    }
    if (isLoadingCubes || isLoadingDetails) {
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
      // Info, not a warning: a blank mark is legitimate and the save proceeds.
      // It used to read as a failure ("recorded as blank, not "Unknown""),
      // which stopped technicians mid-save even though nothing was wrong.
      toast.info(
        `${unmarked} cube${unmarked > 1 ? "s have" : " has"} no mark — saving with a blank mark`,
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
        county: testDetails.county,
        concrete_class: testDetails.concreteClass,
        section: testDetails.section,
        made_by: testDetails.madeBy,
        slump: testDetails.slump,
        client_ref: testDetails.clientRef,
         lab_ref: testDetails.labRef,
         report_no: testDetails.reportNo,
         date_received: testDetails.dateReceived || null,
         curing: testDetails.curing,
          mode_of_failure: testDetails.modeOfFailure,
          comment: testDetails.comment,
          custom_fields: JSON.stringify(testDetails.customFields),
          status: "submitted",
      };

      const result = await saveCompressiveTest({
        projectId: project.currentProjectId,
        testData: testDataPayload,
        cubes: cubesPayload,
        testId: activeTestId,
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
      // Keep the shared context in step with what was just persisted, so a
      // reopen (or another view) reads the saved details instead of stale ones.
      testData.updateConcreteTestMetadata({ ...testDetails });
    } catch (error) {
      console.error("Failed to save test:", error);
      toast.error(error instanceof Error ? error.message : "Failed to save test");
    } finally {
      setIsSaving(false);
    }
  }, [project.currentProjectId, rows, testDetails, isLoadingCubes, isLoadingDetails, activeTestId, testData.updateConcreteTestMetadata]);

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
   * Band targets follow the concrete class through the gain table (C30 ->
   * 4.8/12/19.5/27/29.7 MPa) until the technician types in a box, which
   * takes over just like the simple threshold override.
   */
  const effectiveMultiTargets: MultiStandardTargets = useMemo(
    () => (!isMultiOverridden && classTargetStrength !== null)
      ? classBandTargets(classTargetStrength)
      : multiStandardTargets,
    [isMultiOverridden, classTargetStrength, multiStandardTargets],
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
    () => buildAgeGroups(rows, effectiveMultiTargets),
    [rows, effectiveMultiTargets],
  );

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
   * The record as the exporters want it. PDF and Excel build from the same
   * object so the two sheets can never describe different tests.
   *
   * DATE CASTED is derived from the cubes themselves (the date most of them
   * share) rather than echoed from Date Tested: the old mapping printed the
   * test date on the "DATE CASTED" line of the report.
   */
  const buildRecordView = () => ({
    contractor: testDetails.contractor,
    county: testDetails.county,
    concreteClass: testDetails.concreteClass,
    section: testDetails.section,
    madeBy: testDetails.madeBy,
    slump: testDetails.slump,
    clientRef: testDetails.clientRef,
    labRef: testDetails.labRef,
    reportNo: testDetails.reportNo,
    dateReceived: testDetails.dateReceived,
    curing: testDetails.curing,
    modeOfFailure: testDetails.modeOfFailure,
    comment: testDetails.comment,
    dateCasted: mostCommonCastDate(rows) ?? "",
  });

  /** Cubes that can produce a strength; blank rows are not worth exporting. */
  const exportableCubes = () => rows.filter((row) => isFiniteNumber(strengthOf(row)));

  /**
   * Export the landscape cube sheet. It is drawn natively rather than through the
   * generic portrait generator so it matches the laboratory's own form, and the
   * header repeats automatically when a test has more cubes than one page holds.
   */
  /** Exports the cube sheet. Resolves false when there was nothing to print. */
  const exportPDF = async (): Promise<boolean> => {
    const cubes = exportableCubes();
    if (cubes.length === 0) {
      toast.error("Add at least one cube with a load and dimensions before exporting");
      return false;
    }

    await generateCompressiveStrengthPDF({
      projectName: project.projectName,
      clientName: project.clientName,
      dateReported: project.dateReported,
      // `project` carries no testedBy, so the technician comes from the record.
      testedBy: testDetails.madeBy,
      checkedBy: project.checkedBy,
      labOrganization: project.labOrganization,
      record: buildRecordView(),
      rows: cubes,
    });
    return true;
  };

  const printPDF = async () => {
    const cubes = exportableCubes();
    if (cubes.length === 0) {
      toast.error("Add at least one cube with a load and dimensions before printing");
      return;
    }
    try {
      const doc = await generateCompressiveStrengthPDF({
        projectName: project.projectName,
        clientName: project.clientName,
        dateReported: project.dateReported,
        testedBy: testDetails.madeBy,
        checkedBy: project.checkedBy,
        labOrganization: project.labOrganization,
        record: buildRecordView(),
        rows: cubes,
        skipDownload: true,
      });
      doc.autoPrint();
      const blobUrl = doc.output("bloburl");
      const printWindow = window.open(blobUrl, "_blank");
      if (printWindow) {
        printWindow.onload = () => printWindow.print();
      }
    } catch {
      toast.error("Compressive Strength (Cube Test) print failed");
    }
  };

  const handlePrint = async () => {
    if (isPrinting) return;
    setIsPrinting(true);
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
            const cubesInput = cubes?.map((cube) => ({
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
            })) ?? [];
            return cubesInput;
          })() : [];
      const textOf = (value: unknown): string => (typeof value === "string" ? value : value == null ? "" : String(value));
      const record: CompressiveRecordView = {
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
      const cubes = rows ?? [];
      await generateCompressiveStrengthPDF({
        projectName: project.projectName,
        clientName: project.clientName,
        dateReported: project.dateReported,
        testedBy: testDetails.madeBy,
        checkedBy: project.checkedBy,
        labOrganization: project.labOrganization,
        record,
        rows: cubes,
        skipDownload: false,
      });
      toast.success("Compressive strength report downloaded");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Compressive report download failed");
    } finally {
      setIsPrinting(false);
    }
  };

  const handleRowClick = (index: number) => {
    setHighlightedRowIndex(highlightedRowIndex === index ? null : index);
  };

  const renderTable = () => (
    <div className="flex flex-col gap-4">
      <div className="mb-6 p-4 bg-gradient-to-r from-amber-50 to-amber-100 rounded-lg border border-amber-200">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">Test Details</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {([
            { label: "Cement", field: "cement", placeholder: "e.g. CEM I 42.5R" },
            { label: "Fine Aggregate", field: "fineAggregate", placeholder: "e.g. River sand" },
            { label: "Coarse Aggregate", field: "coarseAggregate", placeholder: "e.g. 20 mm crushed" },
            { label: "Contractor", field: "contractor", placeholder: "—" },
            { label: "County", field: "county", placeholder: "—" },
            { label: "Concrete Class", field: "concreteClass", placeholder: "e.g. C25/30" },
            { label: "Section", field: "section", placeholder: "—" },
            { label: "Made By", field: "madeBy", placeholder: "Technician" },
            { label: "Slump (mm)", field: "slump", inputType: "number", placeholder: "e.g. 75" },
            { label: "Client Ref", field: "clientRef", placeholder: "—" },
            // Stacked lab references (one per line) print stacked in the
            // report cell, as on the laboratory's own sheet.
            { label: "Lab Ref", field: "labRef", placeholder: "—", multiline: true },
            { label: "Report No.", field: "reportNo", placeholder: "—" },
            { label: "Date Received", field: "dateReceived", inputType: "date" },
            { label: "Curing", field: "curing", placeholder: "e.g. water cured" },
            { label: "Mode of Failure", field: "modeOfFailure", placeholder: "—" },
            { label: "Comment", field: "comment", placeholder: "—", multiline: true },
            { label: "Date Tested", field: "dateTested", inputType: "date" },
          ] as { label: string; field: keyof TestDetails; inputType?: string; placeholder?: string; multiline?: boolean }[]).map((item) => (
            <div key={item.field} className="flex flex-col gap-1">
              <span className="text-xs text-gray-600 font-medium">{item.label}</span>
              {item.multiline ? (
                <Textarea
                  value={testDetails[item.field]}
                  onChange={(e) => updateTestDetail(item.field, e.target.value)}
                  className="min-h-8 text-sm"
                  rows={2}
                  placeholder={item.placeholder ?? "—"}
                />
              ) : (
              <Input
                type={item.inputType ?? "text"}
                value={testDetails[item.field]}
                onChange={(e) => updateTestDetail(item.field, e.target.value)}
                className="h-8 text-sm"
                placeholder={item.placeholder ?? "—"}
              />
              )}
            </div>
          ))}
        </div>
        <div className="mt-3 space-y-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setTestDetails((prev) => ({
                ...prev,
                customFields: [...prev.customFields, { key: "", value: "" }],
              }))
            }
          >
            Add field
          </Button>
          {testDetails.customFields.map((field, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                value={field.key}
                onChange={(e) => {
                  const next = [...testDetails.customFields];
                  next[index] = { ...next[index], key: e.target.value };
                  setTestDetails((prev) => ({ ...prev, customFields: next }));
                }}
                placeholder="Field name"
                className="h-8 text-sm"
              />
              <Input
                value={field.value}
                onChange={(e) => {
                  const next = [...testDetails.customFields];
                  next[index] = { ...next[index], value: e.target.value };
                  setTestDetails((prev) => ({ ...prev, customFields: next }));
                }}
                placeholder="Value"
                className="h-8 text-sm"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() =>
                  setTestDetails((prev) => ({
                    ...prev,
                    customFields: prev.customFields.filter((_, i) => i !== index),
                  }))
                }
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      </div>

       <div className="overflow-x-auto">
        <table ref={tableRef} className="w-full min-w-[1320px] text-sm border border-border rounded-lg">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left py-2 px-2 font-medium text-muted-foreground text-xs">#</th>
              <th className="text-left py-2 px-2 font-medium text-muted-foreground text-xs">Cube Mark</th>
              <th className="text-left py-2 px-2 font-medium text-muted-foreground text-xs">Date of Cast</th>
              <th className="text-left py-2 px-2 font-medium text-muted-foreground text-xs">Date of Test</th>
              <th className="text-left py-2 px-2 font-medium text-muted-foreground text-xs">Age (days)</th>
              <th className="text-left py-2 px-2 font-medium text-muted-foreground text-xs">Cube Dim (mm)<br/>L × W × H</th>
              <th className="text-left py-2 px-2 font-medium text-muted-foreground text-xs">Mass (g)</th>
              <th className="text-left py-2 px-2 font-medium text-muted-foreground text-xs">Density (kg/m³)</th>
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
              const gain = gainSummary(row, classTargetStrength);
              return (
                <tr
                  key={row.id ?? `pending-${i}`}
                  className={`border-b border-border/50 cursor-pointer transition-colors ${isHighlighted ? "bg-blue-100" : isDensityAbnormal ? "bg-red-50" : "hover:bg-muted/30"}`}
                  onClick={() => handleRowClick(i)}
                >
                  <td className="py-1.5 px-2 text-muted-foreground">{i + 1}</td>
                  <td className="py-1.5 px-2"><Input data-nav-row={i} data-nav-col={0} onKeyDown={handleTableKeyDown} value={row.mark} onChange={(e) => update(i, "mark", e.target.value)} className="h-8 text-sm" placeholder="—" /></td>
                  <td className="py-1.5 px-2"><Input data-nav-row={i} data-nav-col={1} onKeyDown={handleTableKeyDown} type="date" value={row.dateOfCast} onChange={(e) => update(i, "dateOfCast", e.target.value)} className="h-8 min-w-[132px] text-sm" /></td>
                  <td className="py-1.5 px-2"><Input data-nav-row={i} data-nav-col={2} onKeyDown={handleTableKeyDown} type="date" value={row.dateOfTest} onChange={(e) => update(i, "dateOfTest", e.target.value)} className="h-8 min-w-[132px] text-sm" /></td>
                  <td className="py-1.5 px-2"><CalculatedInput value={getAge(row.dateOfCast, row.dateOfTest)} /></td>
                  <td className="py-1.5 px-2">
                    <div className="flex gap-1 text-xs">
                      <Input data-nav-row={i} data-nav-col={3} onKeyDown={handleTableKeyDown} type="number" value={row.width} onChange={(e) => update(i, "width", e.target.value)} className="h-8 w-20" placeholder="L" />
                      <span className="text-muted-foreground">×</span>
                      <Input data-nav-row={i} data-nav-col={4} onKeyDown={handleTableKeyDown} type="number" value={row.height} onChange={(e) => update(i, "height", e.target.value)} className="h-8 w-20" placeholder="W" />
                      <span className="text-muted-foreground">×</span>
                      <Input data-nav-row={i} data-nav-col={5} onKeyDown={handleTableKeyDown} type="number" value={row.depth} onChange={(e) => update(i, "depth", e.target.value)} className="h-8 w-20" placeholder="H" />
                    </div>
                  </td>
                  <td className="py-1.5 px-2"><Input data-nav-row={i} data-nav-col={6} onKeyDown={handleTableKeyDown} type="number" value={row.mass} onChange={(e) => update(i, "mass", e.target.value)} className="h-8 min-w-[96px] text-sm" placeholder="—" /></td>
                  <td className={`py-1.5 px-2 min-w-[96px] ${isDensityAbnormal ? "text-red-600 font-semibold" : ""}`}><CalculatedInput value={formatDensity(row)} /></td>
                  <td className="py-1.5 px-2 min-w-[96px]"><Input data-nav-row={i} data-nav-col={7} onKeyDown={handleTableKeyDown} type="number" value={row.load} onChange={(e) => update(i, "load", e.target.value)} className="h-8 w-24 text-sm" placeholder="0" /></td>
                  <td className="py-1.5 px-2 min-w-[96px]"><CalculatedInput value={formatStrength(row)} />{gain !== "" && (<div className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{gain}</div>)}</td>
                  <td className="py-1.5 px-2 min-w-[180px]">
                    {editingRemarksIndex === i ? (
                      <div className="flex gap-1">
                        <Input data-nav-row={i} data-nav-col={8} onKeyDown={handleTableKeyDown} value={row.remarks} onChange={(e) => update(i, "remarks", e.target.value)} className="h-8 text-sm flex-1" placeholder="—" />
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditingRemarksIndex(null)}><CheckCircle2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    ) : (
                      <div className="flex gap-1 items-center group">
                        <CalculatedInput value={row.remarks || strengthRemark(row)} />
                        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 opacity-50 hover:opacity-100 focus-visible:opacity-100" aria-label="Edit remarks" onClick={() => setEditingRemarksIndex(i)}>
                          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                        </Button>
                      </div>
                    )}
                  </td>
                  <td className="py-1.5 px-1"><Button variant="ghost" size="icon" aria-label="Remove row" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); setRows(rows.filter((_, j) => j !== i)); }}><X className="h-3.5 w-3.5" /></Button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
       <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setRows([...rows, emptyCubeRow()])}><Plus className="h-3.5 w-3.5 mr-1" /> Add row</Button>
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>Import from field log</Button>
          <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleImportFieldLog} />
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <Button
            size="sm"
            variant="outline"
            disabled={isLoadingCubes || isLoadingDetails || isSaving}
            onClick={async () => {
              try {
                const exported = await exportPDF();
                if (exported !== false) toast.success("Compressive Strength (Cube Test) PDF downloaded");
              } catch {
                toast.error("Compressive Strength (Cube Test) PDF download failed");
              }
            }}
          >
            <FileDown className="h-3.5 w-3.5 mr-1" /> PDF
          </Button>
          <Button size="sm" variant="outline" onClick={() => void printPDF()}>
            <Printer className="h-3.5 w-3.5 mr-1" /> Print
          </Button>
          {isSaving ? (
            <Button size="sm" variant="default" disabled><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Saving...</Button>
          ) : (
            <Button size="sm" variant="default" onClick={handleSave}><SaveIcon className="h-3.5 w-3.5 mr-1" /> Save</Button>
          )}
        </div>
      </div>
    </div>
  );

  const renderAnalytics = () => (
    <div className="flex flex-col gap-4">
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
            {classTargetStrength !== null && isThresholdOverridden && (
              <button
                type="button"
                className="text-[11px] text-primary underline underline-offset-2"
                onClick={() => setIsThresholdOverridden(false)}
              >
                Use class target
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
              {([
                { label: "1-Day (MPa):", field: "oneDay", fallback: 4 },
                { label: "3-Day (MPa):", field: "threeDay", fallback: 10 },
                { label: "7-Day (MPa):", field: "sevenDay", fallback: 17 },
                { label: "14-Day (MPa):", field: "fourteenDay", fallback: 22.5 },
                { label: "28-Day (MPa):", field: "twentyEightDay", fallback: 25 },
              ] as { label: string; field: keyof MultiStandardTargets; fallback: number }[]).map((item) => (
                <div className="flex items-center gap-2" key={item.field}>
                  <Label className="text-xs w-20">{item.label}</Label>
                  <Input
                    type="number"
                    value={effectiveMultiTargets[item.field]}
                    onChange={(e) => {
                      setMultiStandardTargets(prev => ({ ...prev, [item.field]: parseFloat(e.target.value) || item.fallback }));
                      setIsMultiOverridden(true);
                    }}
                    className="h-8 flex-1 text-sm"
                  />
                </div>
              ))}
              <span className="text-[11px] text-muted-foreground">
                {classTargetStrength !== null && !isMultiOverridden
                  ? `Using class ${testDetails.concreteClass} targets via the gain table`
                  : isMultiOverridden
                    ? "Manual override"
                    : "No concrete class set — using default targets"}
              </span>
              {isMultiOverridden && classTargetStrength !== null && (
                <button
                  type="button"
                  className="text-[11px] text-primary underline underline-offset-2"
                  onClick={() => setIsMultiOverridden(false)}
                >
                  Use class targets
                </button>
              )}
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
    </div>
  );

  return (
    <TestSection
      title="Compressive Strength (Cube Test)"
      testKey={testKey}
      onClear={() => setRows([emptyCubeRow()])}
    >
      <>
        <div className="grid gap-5 w-full xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-5">
            {renderTable()}
          </div>
          <aside className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                <div className="flex justify-between"><span>Cubes entered</span><span className="font-medium">{rows.filter((r) => isFiniteNumber(strengthOf(r))).length}</span></div>
                <div className="flex justify-between"><span>Average strength</span><span className="font-medium">{avgStrength ? `${avgStrength} MPa` : "—"}</span></div>
                <div className="flex justify-between"><span>Pass rate</span><span className="font-medium">{passFailData.passRate.toFixed(0)}%</span></div>
                <div className="flex justify-between"><span>Abnormal density</span><span className="font-medium">{rows.filter((r) => isAbnormalDensity(r)).length}</span></div>
              </CardContent>
            </Card>
            {(rows.filter((r) => isAbnormalDensity(r)).length > 0 || passFailData.failCount > 0) && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <AlertTriangle className="h-4 w-4 text-amber-600" /> Checks
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-xs">
                  {rows.filter((r) => isAbnormalDensity(r)).length > 0 && (
                    <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
                      {rows.filter((r) => isAbnormalDensity(r)).length} cube(s) have abnormal density.
                    </p>
                  )}
                  {passFailData.failCount > 0 && (
                    <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-900">
                      {passFailData.failCount} cube(s) are below the pass threshold.
                    </p>
                  )}
                </CardContent>
              </Card>
            )}
            {renderAnalytics()}
          </aside>
        </div>
      </>
    </TestSection>
  );
};

export default CompressiveStrengthTest;
