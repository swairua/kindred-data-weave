import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Trash2, Download, ChevronDown, FileText, FileSpreadsheet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useProject } from "@/context/ProjectContext";

import type {
  AtterbergRecord,
  AtterbergTest,
  AtterbergTestType,
  LiquidLimitTest,
  LiquidLimitTrial,
  PlasticLimitTest,
  PlasticLimitTrial,
  ShrinkageLimitTest,
  ShrinkageLimitTrial,
} from "@/context/TestDataContext";
import {
  calculateLinearShrinkage,
  calculateLiquidLimit,
  calculateModulusOfPlasticity,
  calculatePlasticLimit,
  calculatePlasticityIndex,
  getDrySoilMass,
  getTrialMoisture,
  getWaterMass,
  sanitizeNumericInput,
} from "@/lib/atterbergCalculations";
import { classifySoilUSCS, classifySoilAASHTO } from "@/lib/soilClassification";
import PlasticityChart from "./PlasticityChart";

type ComputedRecord = AtterbergRecord & {
  dataPoints: number;
  startedDataPoints: number;
  completedTests: number;
};

interface AtterbergRecordViewProps {
  record: ComputedRecord;
  recordIndex: number;
  onRemove: () => void;
  onUpdateTitle: (title: string) => void;
  onUpdateLabel: (label: string) => void;
  onUpdateNote: (note: string) => void;
  onUpdateSampleNumber: (value: string) => void;
  onUpdateDateSubmitted: (value: string) => void;
  onUpdateDateTested: (value: string) => void;
  onUpdateTestedBy: (value: string) => void;
  onAddTest: (type: AtterbergTestType) => void;
  onUpdateLiquidLimitTrials: (testId: string, trials: LiquidLimitTrial[]) => void;
  onUpdatePlasticLimitTrials: (testId: string, trials: PlasticLimitTrial[]) => void;
  onUpdateShrinkageLimitTrials: (testId: string, trials: ShrinkageLimitTrial[]) => void;
  onUpdatePassing425um: (value: string) => void;
  onExportPDF: (recordId: string) => Promise<boolean>;
  onExportXLSX: (recordId: string) => Promise<boolean>;
  onRegisterChartRef: (recordId: string, ref: HTMLDivElement | null) => void;
}

const DEFAULT_LL_COLS = 4;
const DEFAULT_PL_COLS = 3;
const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

const isLLFilled = (t: LiquidLimitTrial | null | undefined) =>
  !!t && [t.containerNo, t.penetration, t.containerWetMass, t.containerDryMass, t.containerMass]
    .some((v) => (v ?? "").toString().trim() !== "");

const isPLFilled = (t: PlasticLimitTrial | null | undefined) =>
  !!t && [t.containerNo, t.containerWetMass, t.containerDryMass, t.containerMass]
    .some((v) => (v ?? "").toString().trim() !== "");

const newId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const blankLLTrial = (i: number): LiquidLimitTrial => ({
  id: newId("ll"),
  trialNo: String(i + 1),
  penetration: "",
  containerNo: "",
  containerWetMass: "",
  containerDryMass: "",
  containerMass: "",
  moisture: "",
});

const blankPLTrial = (i: number): PlasticLimitTrial => ({
  id: newId("pl"),
  trialNo: String(i + 1),
  containerNo: "",
  containerWetMass: "",
  containerDryMass: "",
  containerMass: "",
  moisture: "",
});

const blankLSTrial = (): ShrinkageLimitTrial => ({
  id: newId("ls"),
  trialNo: "1",
  initialLength: "140",
  finalLength: "",
});

/**
 * Atterberg data-entry view. Mirrors the Cransfield Netlify prototype:
 * - Project context strip at top
 * - Unified A–G trial table (LL = A–E, PL = F–G)
 * - Casagrande chart + Linear Shrinkage panel side-by-side
 * - Results card (vertical key-value list) + Soil classification (USCS/AASHTO)
 * - Sticky Delete | Save split bar
 *
 * All math/exporters reused as-is; only layout changes here.
 */
const AtterbergRecordView = ({
  record,
  recordIndex,
  onRemove,
  onUpdateLabel,
  onUpdateSampleNumber,
  onUpdateTestedBy,
  onAddTest,
  onUpdateLiquidLimitTrials,
  onUpdatePlasticLimitTrials,
  onUpdateShrinkageLimitTrials,
  onUpdatePassing425um,
  onExportPDF,
  onExportXLSX,
  onRegisterChartRef,
}: AtterbergRecordViewProps) => {
  const chartRef = useRef<HTMLDivElement | null>(null);
  const autoCreatedRef = useRef<Set<AtterbergTestType>>(new Set());
  const [isExporting, setIsExporting] = useState<"pdf" | "xlsx" | null>(null);
  const project = useProject();

  // Locate primary tests
  const llTest = useMemo(
    () => record.tests.find((t): t is LiquidLimitTest => t.type === "liquidLimit") ?? null,
    [record.tests],
  );
  const plTest = useMemo(
    () => record.tests.find((t): t is PlasticLimitTest => t.type === "plasticLimit") ?? null,
    [record.tests],
  );
  const lsTest = useMemo(
    () => record.tests.find((t): t is ShrinkageLimitTest => t.type === "shrinkageLimit") ?? null,
    [record.tests],
  );

  // Auto-create the three sub-tests on mount so trial editors can write directly.
  // Ref-guard ensures we only request creation once per type per mount, even
  // before the parent state has propagated back through props.
  useEffect(() => {
    if (!llTest && !autoCreatedRef.current.has("liquidLimit")) {
      autoCreatedRef.current.add("liquidLimit");
      try { onAddTest("liquidLimit"); } catch (e) { console.error(e); }
    }
  }, [llTest, onAddTest]);
  useEffect(() => {
    if (!plTest && !autoCreatedRef.current.has("plasticLimit")) {
      autoCreatedRef.current.add("plasticLimit");
      try { onAddTest("plasticLimit"); } catch (e) { console.error(e); }
    }
  }, [plTest, onAddTest]);
  useEffect(() => {
    if (!lsTest && !autoCreatedRef.current.has("shrinkageLimit")) {
      autoCreatedRef.current.add("shrinkageLimit");
      try { onAddTest("shrinkageLimit"); } catch (e) { console.error(e); }
    }
  }, [lsTest, onAddTest]);

  const llTrials = llTest?.trials ?? [];
  const plTrials = plTest?.trials ?? [];
  const lsTrial = lsTest?.trials[0] ?? blankLSTrial();

  // Calculations
  const liquidLimit = useMemo(() => (llTest ? calculateLiquidLimit(llTest.trials) : null), [llTest]);
  const plasticLimit = useMemo(() => (plTest ? calculatePlasticLimit(plTest.trials) : null), [plTest]);
  const linearShrinkage = useMemo(
    () => (lsTest ? calculateLinearShrinkage(lsTest.trials) : null),
    [lsTest],
  );
  const plasticityIndex = useMemo(
    () => calculatePlasticityIndex(liquidLimit, plasticLimit),
    [liquidLimit, plasticLimit],
  );
  const modulusOfPlasticity = useMemo(
    () => calculateModulusOfPlasticity(plasticityIndex, record.passing425um),
    [plasticityIndex, record.passing425um],
  );
  // Centralized USCS / AASHTO classification (matches Excel report wording).
  // Atterberg-only flow → assume fine-grained (fines = 100) so the LL/PI branch is selected.
  const { uscs, aashto } = useMemo(() => {
    const atterberg = {
      liquidLimit: liquidLimit ?? undefined,
      plasticLimit: plasticLimit ?? undefined,
      plasticityIndex: plasticityIndex ?? undefined,
    };
    const grain = { gravel: 0, sand: 0, fines: 100 };
    const u = classifySoilUSCS(grain, atterberg);
    const a = classifySoilAASHTO(grain, atterberg);
    return {
      uscs: liquidLimit === null && plasticityIndex === null
        ? "—"
        : `${u.uscsSymbol} — ${u.uscsDescription}`,
      aashto: liquidLimit === null && plasticityIndex === null ? "—" : a,
    };
  }, [liquidLimit, plasticLimit, plasticityIndex]);

  // Mutators (pad arrays so user can type into any column without first creating it)
  const updateLLAt = (index: number, field: keyof LiquidLimitTrial, value: string) => {
    if (!llTest) return;
    const trials = [...llTrials];
    while (trials.length <= index) trials.push(blankLLTrial(trials.length));
    trials[index] = {
      ...trials[index],
      [field]:
        field === "trialNo" || field === "containerNo" ? value : sanitizeNumericInput(value),
    };
    onUpdateLiquidLimitTrials(llTest.id, trials);
  };
  const updatePLAt = (index: number, field: keyof PlasticLimitTrial, value: string) => {
    if (!plTest) return;
    const trials = [...plTrials];
    while (trials.length <= index) trials.push(blankPLTrial(trials.length));
    trials[index] = {
      ...trials[index],
      [field]:
        field === "trialNo" || field === "containerNo" ? value : sanitizeNumericInput(value),
    };
    onUpdatePlasticLimitTrials(plTest.id, trials);
  };
  const updateLS = (field: keyof ShrinkageLimitTrial, value: string) => {
    if (!lsTest) return;
    const trial = lsTest.trials[0] ?? blankLSTrial();
    const next: ShrinkageLimitTrial = {
      ...trial,
      [field]: field === "trialNo" ? value : sanitizeNumericInput(value),
    };
    onUpdateShrinkageLimitTrials(lsTest.id, [next]);
  };

  // Exports
  const handlePDF = useCallback(async () => {
    setIsExporting("pdf");
    try {
      await onExportPDF(record.id);
    } finally {
      setIsExporting(null);
    }
  }, [onExportPDF, record.id]);
  const handleXLSX = useCallback(async () => {
    setIsExporting("xlsx");
    try {
      await onExportXLSX(record.id);
    } finally {
      setIsExporting(null);
    }
  }, [onExportXLSX, record.id]);

  const setChartRef = (el: HTMLDivElement | null) => {
    chartRef.current = el;
    onRegisterChartRef(record.id, el);
  };

  // Auto-grow column counts: at least the default; grow by 1 when the last visible column is filled.
  const llLastFilled = llTrials.reduce((acc, t, i) => (isLLFilled(t) ? i : acc), -1);
  const plLastFilled = plTrials.reduce((acc, t, i) => (isPLFilled(t) ? i : acc), -1);
  const LL_COLS = Math.max(DEFAULT_LL_COLS, llTrials.length, llLastFilled + 2);
  const PL_COLS = Math.max(DEFAULT_PL_COLS, plTrials.length, plLastFilled + 2);
  const COL_LETTERS = Array.from({ length: LL_COLS + PL_COLS }, (_, i) => ALPHA[i] ?? `C${i + 1}`);

  // Padded display rows
  const llRows = Array.from({ length: LL_COLS }, (_, i) => llTrials[i] ?? null);
  const plRows = Array.from({ length: PL_COLS }, (_, i) => plTrials[i] ?? null);

  return (
    <Card className="border shadow-sm overflow-hidden">
      {/* ===== Project context strip ===== */}
      <div className="border-b bg-card px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold tracking-tight truncate">
              {project.projectName || `Record ${recordIndex + 1}`}
            </h2>
            {project.clientName ? (
              <p className="text-sm text-muted-foreground truncate">{project.clientName}</p>
            ) : null}
          </div>
        </div>

        <div className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4 border-t pt-4">
          <ContextField label="Material" value="Soil" />
          <ContextField label="Test type" value="Atterberg Limits" />
          <ContextEditableField label="Sample ID" value={record.label} onChange={onUpdateLabel} placeholder="e.g. BH1" />
          <ContextEditableField
            label="Sample depth (m)"
            value={record.sampleNumber || ""}
            onChange={onUpdateSampleNumber}
            placeholder="e.g. 1–2"
          />
        </div>
      </div>

      {/* ===== Body ===== */}
      <div className="p-4 sm:p-6 space-y-6">
        {/* Trial table */}
        <section>
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Record results — BS 1377 Part 2
            </h3>
            <p className="text-[11px] italic text-muted-foreground">
              Auto rows fill once wet, dry and container masses are entered for a column.
            </p>
          </div>
          <div className="rounded-lg border overflow-x-auto bg-background">
            <table className="w-full min-w-[820px] text-xs border-collapse">
              <thead>
                <tr className="bg-muted/30">
                  <th className="border-b border-r px-3 py-2 text-left w-[210px]" />
                  <th
                    colSpan={LL_COLS}
                    className="border-b border-r px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-primary"
                  >
                    Liquid Limit (LL) — editable
                  </th>
                  <th
                    colSpan={PL_COLS}
                    className="border-b px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-primary"
                  >
                    Plastic Limit (PL) — editable
                  </th>
                </tr>
                <tr className="bg-muted/40">
                  <th className="border-b border-r px-3 py-2 text-left w-[210px] font-medium text-muted-foreground">
                    {/* placeholder corner */}
                  </th>
                  {COL_LETTERS.map((c) => (
                    <th
                      key={c}
                      className="border-b border-r last:border-r-0 px-2 py-2 text-center font-semibold text-foreground/80 w-[80px]"
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* Container No */}
                <DataRow label="Container No">
                  {llRows.map((t, i) => (
                    <CellInput
                      key={`ll-cn-${i}`}
                      value={t?.containerNo ?? ""}
                      onChange={(v) => updateLLAt(i, "containerNo", v)}
                    />
                  ))}
                  {plRows.map((t, i) => (
                    <CellInput
                      key={`pl-cn-${i}`}
                      value={t?.containerNo ?? ""}
                      onChange={(v) => updatePLAt(i, "containerNo", v)}
                    />
                  ))}
                </DataRow>

                {/* Penetration (LL only; PL shows "-") */}
                <DataRow label="Penetration (mm)">
                  {llRows.map((t, i) => (
                    <CellInput
                      key={`ll-p-${i}`}
                      value={t?.penetration ?? ""}
                      onChange={(v) => updateLLAt(i, "penetration", v)}
                      placeholder="—"
                    />
                  ))}
                  {plRows.map((_, i) => (
                    <CellMuted key={`pl-p-${i}`}>-</CellMuted>
                  ))}
                </DataRow>

                {/* Wt of Container + Wet Soil */}
                <DataRow label="Wt of Container + Wet Soil (g)">
                  {llRows.map((t, i) => (
                    <CellInput
                      key={`ll-w-${i}`}
                      value={t?.containerWetMass ?? ""}
                      onChange={(v) => updateLLAt(i, "containerWetMass", v)}
                    />
                  ))}
                  {plRows.map((t, i) => (
                    <CellInput
                      key={`pl-w-${i}`}
                      value={t?.containerWetMass ?? ""}
                      onChange={(v) => updatePLAt(i, "containerWetMass", v)}
                    />
                  ))}
                </DataRow>

                {/* Wt of Container + Dry Soil */}
                <DataRow label="Wt of Container + Dry Soil (g)">
                  {llRows.map((t, i) => (
                    <CellInput
                      key={`ll-d-${i}`}
                      value={t?.containerDryMass ?? ""}
                      onChange={(v) => updateLLAt(i, "containerDryMass", v)}
                    />
                  ))}
                  {plRows.map((t, i) => (
                    <CellInput
                      key={`pl-d-${i}`}
                      value={t?.containerDryMass ?? ""}
                      onChange={(v) => updatePLAt(i, "containerDryMass", v)}
                    />
                  ))}
                </DataRow>

                {/* Wt of Container */}
                <DataRow label="Wt of Container (g)">
                  {llRows.map((t, i) => (
                    <CellInput
                      key={`ll-c-${i}`}
                      value={t?.containerMass ?? ""}
                      onChange={(v) => updateLLAt(i, "containerMass", v)}
                    />
                  ))}
                  {plRows.map((t, i) => (
                    <CellInput
                      key={`pl-c-${i}`}
                      value={t?.containerMass ?? ""}
                      onChange={(v) => updatePLAt(i, "containerMass", v)}
                    />
                  ))}
                </DataRow>

                {/* Wt of Moisture (auto) */}
                <DataRow label="Wt of Moisture (g)">
                  {llRows.map((t, i) => (
                    <CellAuto key={`ll-mw-${i}`} value={t ? getWaterMass(t) : null} />
                  ))}
                  {plRows.map((t, i) => (
                    <CellAuto key={`pl-mw-${i}`} value={t ? getWaterMass(t) : null} />
                  ))}
                </DataRow>

                {/* Wt of Dry Soil (auto) */}
                <DataRow label="Wt of Dry Soil (g)">
                  {llRows.map((t, i) => (
                    <CellAuto key={`ll-ds-${i}`} value={t ? getDrySoilMass(t) : null} />
                  ))}
                  {plRows.map((t, i) => (
                    <CellAuto key={`pl-ds-${i}`} value={t ? getDrySoilMass(t) : null} />
                  ))}
                </DataRow>

                {/* Moisture content (auto) */}
                <DataRow label="Moisture Content (%)">
                  {llRows.map((t, i) => {
                    const m = t ? getTrialMoisture(t) : null;
                    return <CellAuto key={`ll-mc-${i}`} value={m === null || m === "" ? null : m} bold />;
                  })}
                  {plRows.map((t, i) => {
                    const m = t ? getTrialMoisture(t) : null;
                    return <CellAuto key={`pl-mc-${i}`} value={m === null || m === "" ? null : m} bold />;
                  })}
                </DataRow>

                {/* Plastic Limit footer row (spans LL cols, value in PL cols) */}
                <tr>
                  <td className="border-t px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {/* empty corner */}
                  </td>
                  <td
                    colSpan={LL_COLS}
                    className="border-t border-r px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    Plastic Limit
                  </td>
                  <td
                    colSpan={PL_COLS}
                    className="border-t px-3 py-2 text-center text-sm font-semibold text-foreground"
                  >
                    {plasticLimit !== null ? `${plasticLimit}%` : "—"}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Chart + Linear Shrinkage + Results */}
        <section className="grid gap-4 lg:grid-cols-5">
          {/* Casagrande chart */}
          <div className="lg:col-span-3 card p-3" ref={setChartRef}>
            <PlasticityChart liquidLimit={liquidLimit} plasticityIndex={plasticityIndex} />
          </div>

          {/* Right column: shrinkage + results stacked */}
          <div className="lg:col-span-2 space-y-4">
            {/* Linear Shrinkage */}
            <div className="card overflow-hidden">
              <div className="card-header border-b-0 rounded-b-none">
                <div className="card-header-title">Linear Shrinkage</div>
              </div>
              <div className="divide-y">
                <KvRow label="Initial length (mm)">
                  <Input
                    inputMode="decimal"
                    value={lsTrial.initialLength}
                    onChange={(e) => updateLS("initialLength", e.target.value)}
                    className="h-8 w-24 text-right text-xs"
                  />
                </KvRow>
                <KvRow label="Final length (mm)">
                  <Input
                    inputMode="decimal"
                    value={lsTrial.finalLength}
                    onChange={(e) => updateLS("finalLength", e.target.value)}
                    className="h-8 w-24 text-right text-xs"
                    placeholder="0.0"
                  />
                </KvRow>
                <KvRow label="Shrinkage (%)" emphasis>
                  <span className="text-sm font-semibold text-primary">
                    {linearShrinkage !== null ? `${linearShrinkage}%` : "—"}
                  </span>
                </KvRow>
              </div>
              <p className="px-3 py-2 text-[11px] italic text-muted-foreground border-t">
                Auto-computed from initial and final length.
              </p>
            </div>

            {/* Results */}
            <div className="card overflow-hidden">
              <div className="card-header border-b-0 rounded-b-none">
                <div className="card-header-title">Results</div>
              </div>
              <div className="divide-y">
                <KvRow label="Liquid Limit (%)">
                  <ResultValue value={liquidLimit} suffix="%" />
                </KvRow>
                <KvRow label="Plastic Limit (%)">
                  <ResultValue value={plasticLimit} suffix="%" />
                </KvRow>
                <KvRow label="Plasticity Index (%)">
                  <span
                    title={
                      plasticityIndex === null
                        ? `Needs ${liquidLimit === null ? "Liquid Limit" : ""}${liquidLimit === null && plasticLimit === null ? " and " : ""}${plasticLimit === null ? "Plastic Limit" : ""} to compute.`
                        : "PI = LL − PL"
                    }
                  >
                    <ResultValue value={plasticityIndex} suffix="%" />
                  </span>
                </KvRow>
                <KvRow label="Passing 425 µm (%)">
                  <Input
                    inputMode="decimal"
                    value={record.passing425um || ""}
                    onChange={(e) => onUpdatePassing425um(sanitizeNumericInput(e.target.value))}
                    className="h-8 w-24 text-right text-xs"
                    placeholder="—"
                  />
                </KvRow>
                <KvRow label="Modulus of Plasticity">
                  <ResultValue value={modulusOfPlasticity} />
                </KvRow>
                <KvRow label="Linear Shrinkage (%)">
                  <ResultValue value={linearShrinkage} suffix="%" />
                </KvRow>
              </div>
            </div>
          </div>
        </section>

        {/* Soil classification + tested by */}
        <section className="grid gap-4 lg:grid-cols-5 items-start">
          <div className="lg:col-span-3 card overflow-hidden">
            <div className="card-header border-b-0 rounded-b-none">
              <div className="card-header-title">Soil Classification</div>
            </div>
            <div className="divide-y">
              <KvRow label="USCS">
                <span className="text-sm font-semibold">{uscs}</span>
              </KvRow>
              <KvRow label="AASHTO">
                <span className="text-sm font-semibold">{aashto}</span>
              </KvRow>
            </div>
          </div>
          <div className="lg:col-span-2 flex items-center gap-3 px-1 pt-2">
            <span className="text-xs text-muted-foreground">Tested by</span>
            <Input
              value={record.testedBy || ""}
              onChange={(e) => onUpdateTestedBy(e.target.value)}
              className="h-8 text-sm font-medium border-0 border-b rounded-none focus-visible:ring-0 focus-visible:border-primary px-0"
              placeholder="Enter name"
            />
          </div>
        </section>
      </div>

      {/* ===== Sticky action bar ===== */}
      <div className="sticky bottom-0 z-10 flex items-center justify-between gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1 text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
          onClick={onRemove}
        >
          <Trash2 className="h-4 w-4" /> Delete
        </Button>

        <div className="flex items-center rounded-md shadow-sm">
          <Button
            type="button"
            size="sm"
            className="rounded-r-none gap-2"
            onClick={handlePDF}
            disabled={isExporting !== null}
          >
            <Download className="h-4 w-4" />
            {isExporting === "pdf" ? "Saving…" : "Save"}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                size="sm"
                className="rounded-l-none border-l border-primary-foreground/20 px-2"
                disabled={isExporting !== null}
                aria-label="More export options"
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handlePDF}>
                <FileText className="mr-2 h-4 w-4" /> Export as PDF
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleXLSX}>
                <FileSpreadsheet className="mr-2 h-4 w-4" /> Export as Excel
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </Card>
  );
};

// ===== Helpers =====

const ContextField = ({ label, value }: { label: string; value: string }) => (
  <div>
    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
    <div className="mt-0.5 text-sm font-medium text-foreground">{value}</div>
  </div>
);

const ContextEditableField = ({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) => (
  <div>
    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="mt-0.5 h-7 text-sm font-medium border-0 border-b rounded-none px-0 focus-visible:ring-0 focus-visible:border-primary"
      placeholder={placeholder}
    />
  </div>
);

const DataRow = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <tr>
    <td className="border-b border-r px-3 py-1.5 text-xs font-medium text-foreground/80 whitespace-nowrap bg-muted/10">
      {label}
    </td>
    {children}
  </tr>
);

const CellInput = ({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) => (
  <td className="border-b border-r last:border-r-0 p-0.5 bg-background">
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder ?? "—"}
      inputMode="decimal"
      className="w-full h-9 px-2 text-center text-xs bg-white dark:bg-muted/30 rounded border border-input outline-none transition-colors hover:border-primary/40 focus:border-primary focus:ring-1 focus:ring-primary/30 placeholder:text-muted-foreground/50"
    />
  </td>
);

const CellMuted = ({ children }: { children: React.ReactNode }) => (
  <td className="border-b border-r last:border-r-0 px-2 py-1 text-center text-xs text-muted-foreground/50">
    {children}
  </td>
);

const CellAuto = ({ value, bold }: { value: number | string | null; bold?: boolean }) => (
  <td className="border-b border-r last:border-r-0 px-2 py-1 text-center bg-muted/10">
    {value === null || value === "" ? (
      <span className="text-xs italic text-emerald-600/80">auto</span>
    ) : (
      <span className={cn("text-xs", bold && "font-semibold")}>
        {typeof value === "number" ? value : value}
      </span>
    )}
  </td>
);

const KvRow = ({
  label,
  children,
  emphasis,
}: {
  label: string;
  children: React.ReactNode;
  emphasis?: boolean;
}) => (
  <div
    className={cn(
      "flex items-center justify-between gap-3 px-3 py-2",
      emphasis && "bg-amber-50/40 dark:bg-amber-950/10",
    )}
  >
    <span className="text-xs text-foreground/80">{label}</span>
    {children}
  </div>
);

const ResultValue = ({ value, suffix }: { value: number | null; suffix?: string }) =>
  value === null || value === undefined ? (
    <span className="text-sm text-muted-foreground">—</span>
  ) : (
    <span className="text-sm font-semibold">
      {value}
      {suffix ?? ""}
    </span>
  );

export default AtterbergRecordView;
