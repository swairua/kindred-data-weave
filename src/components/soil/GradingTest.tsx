import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Check, FileDown, HelpCircle, Loader2, Printer, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import ParticleSizeDistributionChart from "@/components/soil/ParticleSizeDistributionChart";
import { useProject } from "@/context/ProjectContext";
import { useGridArrowNavigation } from "@/hooks/useGridArrowNavigation";
import { type RecordMetadata, useTestData } from "@/context/TestDataContext";
import { captureChartAsBase64 } from "@/lib/chartCapture";
import { createRecord, deleteRecord, listRecords, updateRecord } from "@/lib/api";
import { generateParticleSizeDistributionPDF } from "@/lib/psdPdfGenerator";
import { calculateGrading, panMass, calculateGradationCoefficients, calculateHydrometer, calculateMoisture, type GradingRow } from "@/lib/gradingCalculations";
import { mergePsdSeries } from "@/lib/psdChartGeometry";
import { calculateAashtoGroupIndex, classifySoilAASHTO, classifySoilUSCS, getAashtoEvidenceWarnings, rateAashtoGroup } from "@/lib/soilClassification";
import { toast } from "sonner";

interface GradingTestProps {
  testKey?: string;
}

interface SamplePreparation {
  initialDryMass: string;
  washedOvenDryMass: string;
}

interface MoistureSection {
  wetMass: string;
  dryMass: string;
}

interface ClassificationSection {
  uscs: string;
  aashtoGroup: string;
  liquidLimit: string;
  plasticLimit: string;
  plasticityIndex: string;
  nonPlastic: boolean;
  suspectedOrganic: boolean;
  ovenDriedLiquidLimit: string;
}

interface HydrometerRow {
  time: string;
  actualHydrometer: string;
  adjustedHydrometer: string;
  compositeCorrection: string;
  correctedHydrometer: string;
  effectiveDepth: string;
  particleDiameter: string;
  finesInSuspension: string;
  finesByHydrometer: string;
}

interface GradingRecord {
  label: string;
  sampleNumber: string;
  sampleDepthFrom: string;
  sampleDepthTo: string;
  sampledSubmittedBy: string;
  testedBy: string;
  dateSubmitted: string;
  dateTested: string;
  sampleNotes: string;
  samplePreparation: SamplePreparation;
  moisture: MoistureSection;
  classification: ClassificationSection;
  sieveRows: GradingRow[];
  hydrometerRows: HydrometerRow[];
  hydrometerInputs: Record<string, string>;
}

interface GradingPayload {
  version: string;
  project: {
    title: string;
    clientName: string;
    date: string;
    records: GradingRecord[];
  };
  calculations: ReturnType<typeof calculateGrading> & ReturnType<typeof calculateMoisture> & ReturnType<typeof calculateHydrometer> & {
    fineMass: number | null;
    finesPercentage: number | null;
    moistureCorrectedMass: number | null;
    gravelPercentage: number | null;
    sandPercentage: number | null;
    sieveFinesPercentage: number | null;
    plasticityIndex: number | null;
    groupIndex: number | null;
    uscsSymbol: string | null;
    aashtoGroup: string | null;
  };
}

interface ApiTestResultRow {
  id: number;
  project_id: number;
  test_key: string;
  payload_json?: unknown;
  created_at?: string;
  updated_at?: string;
}

const SIEVE_SIZES = [
  "75", "63", "50", "37.5", "28", "20", "14", "10", "6.3", "5", "4.75 (No. 4)", "3.35", "2.36", "2.00 (No. 10)", "1.18", "0.6", "0.425", "0.3", "0.212", "0.15", "0.075", "0.063", "<0.063", "<0.075",
];
const HYDROMETER_TIMES = ["0.25", "0.50", "1", "2", "4", "8", "15", "30", "60", "120", "240", "480", "1440"];
const EMPTY_SIEVE_ROWS: GradingRow[] = SIEVE_SIZES.map((sieveSize) => ({ sieveSize, weightRetained: "" }));
const EMPTY_HYDROMETER_ROWS: HydrometerRow[] = HYDROMETER_TIMES.map((time) => ({
  time,
  actualHydrometer: "",
  adjustedHydrometer: "auto",
  compositeCorrection: "auto",
  correctedHydrometer: "auto",
  effectiveDepth: "auto",
  particleDiameter: "auto",
  finesInSuspension: "auto",
  finesByHydrometer: "auto",
}));

const DEFAULT_CLASSIFICATION: ClassificationSection = {
  uscs: "auto",
  aashtoGroup: "auto",
  liquidLimit: "",
  plasticLimit: "",
  plasticityIndex: "auto",
  nonPlastic: false,
  suspectedOrganic: false,
  ovenDriedLiquidLimit: "Required for OL/OH",
};

const DEFAULT_HYDROMETER_INPUTS = {
  dryWeight: "",
  suspensionVolume: "1000",
  sG: "2.65",
  temperature: "20",
  kFactor: "",
  hydrometerType: "152H",
  zeroCorrection: "0",
  meniscusCorrection: "0.1",
  temperatureCorrection: "",
};

const emptyRecord = (metadata: RecordMetadata): GradingRecord => ({
  label: metadata.sampleId || "",
  sampleNumber: metadata.sampleNumber || "",
  sampleDepthFrom: metadata.sampleDepthFrom || "",
  sampleDepthTo: metadata.sampleDepthTo || "",
  sampledSubmittedBy: metadata.sampledSubmittedBy || "",
  testedBy: metadata.testedBy || metadata.sampledSubmittedBy || "",
  dateSubmitted: metadata.dateSubmitted || "",
  dateTested: metadata.dateTested || "",
  sampleNotes: metadata.sampleNotes || "",
  samplePreparation: { initialDryMass: "", washedOvenDryMass: "" },
  moisture: { wetMass: "", dryMass: "" },
  classification: { ...DEFAULT_CLASSIFICATION },
  sieveRows: EMPTY_SIEVE_ROWS.map((row) => ({ ...row })),
  hydrometerRows: EMPTY_HYDROMETER_ROWS.map((row) => ({ ...row })),
  hydrometerInputs: { ...DEFAULT_HYDROMETER_INPUTS },
});

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const readString = (value: unknown) => typeof value === "string" ? value : value == null ? "" : String(value);
const readBoolean = (value: unknown) => value === true;

const normalizeRecord = (value: unknown, metadata: RecordMetadata): GradingRecord => {
  const source = isObject(value) ? value : {};
  const fallback = emptyRecord(metadata);
  const preparation = isObject(source.samplePreparation) ? source.samplePreparation : {};
  const moisture = isObject(source.moisture) ? source.moisture : {};
  const classification = isObject(source.classification) ? source.classification : {};
  const inputs = isObject(source.hydrometerInputs) ? source.hydrometerInputs : {};
  const sieveRows = Array.isArray(source.sieveRows) ? source.sieveRows : fallback.sieveRows;
  const hydrometerRows = Array.isArray(source.hydrometerRows) ? source.hydrometerRows : fallback.hydrometerRows;

  return {
    ...fallback,
    label: readString(source.label) || fallback.label,
    sampleNumber: readString(source.sampleNumber) || fallback.sampleNumber,
    sampleDepthFrom: readString(source.sampleDepthFrom) || fallback.sampleDepthFrom,
    sampleDepthTo: readString(source.sampleDepthTo) || fallback.sampleDepthTo,
    sampledSubmittedBy: readString(source.sampledSubmittedBy) || fallback.sampledSubmittedBy,
    testedBy: readString(source.testedBy) || fallback.testedBy || readString(source.sampledSubmittedBy),
    dateSubmitted: readString(source.dateSubmitted) || fallback.dateSubmitted,
    dateTested: readString(source.dateTested) || fallback.dateTested,
    sampleNotes: readString(source.sampleNotes) || fallback.sampleNotes,
    samplePreparation: {
      initialDryMass: readString(preparation.initialDryMass),
      washedOvenDryMass: readString(preparation.washedOvenDryMass),
    },
    moisture: { wetMass: readString(moisture.wetMass), dryMass: readString(moisture.dryMass) },
    classification: {
      uscs: readString(classification.uscs) || DEFAULT_CLASSIFICATION.uscs,
      aashtoGroup: readString(classification.aashtoGroup) || DEFAULT_CLASSIFICATION.aashtoGroup,
      liquidLimit: readString(classification.liquidLimit),
      plasticLimit: readString(classification.plasticLimit),
      plasticityIndex: readString(classification.plasticityIndex) || DEFAULT_CLASSIFICATION.plasticityIndex,
      nonPlastic: readBoolean(classification.nonPlastic),
      suspectedOrganic: readBoolean(classification.suspectedOrganic),
      ovenDriedLiquidLimit: readString(classification.ovenDriedLiquidLimit) || DEFAULT_CLASSIFICATION.ovenDriedLiquidLimit,
    },
    sieveRows: sieveRows.map((row, index) => ({
      sieveSize: readString(isObject(row) ? row.sieveSize : "") || fallback.sieveRows[index]?.sieveSize || "",
      weightRetained: readString(isObject(row) ? row.weightRetained : ""),
    })),
    hydrometerRows: hydrometerRows.map((row, index) => {
      const item = isObject(row) ? row : {};
      const fallbackRow = fallback.hydrometerRows[index] || EMPTY_HYDROMETER_ROWS[0];
      return {
        time: readString(item.time) || fallbackRow.time,
        actualHydrometer: readString(item.actualHydrometer),
        adjustedHydrometer: readString(item.adjustedHydrometer) || "auto",
        compositeCorrection: readString(item.compositeCorrection) || "auto",
        correctedHydrometer: readString(item.correctedHydrometer) || "auto",
        effectiveDepth: readString(item.effectiveDepth) || "auto",
        particleDiameter: readString(item.particleDiameter) || "auto",
        finesInSuspension: readString(item.finesInSuspension) || "auto",
        finesByHydrometer: readString(item.finesByHydrometer) || "auto",
      };
    }),
    hydrometerInputs: Object.fromEntries(Object.keys(DEFAULT_HYDROMETER_INPUTS).map((key) => [key, readString(inputs[key])])),
  };
};

const getPayloadRecord = (payload: unknown, metadata: RecordMetadata) => {
  let parsedPayload = payload;
  if (typeof payload === "string") {
    try {
      parsedPayload = JSON.parse(payload) as unknown;
    } catch {
      // A payload that cannot be parsed used to render as a blank form, which
      // looks exactly like "no data". Fail loudly instead so the record can be
      // repaired rather than silently overwritten on save.
      throw new Error("This result's saved data is unreadable (invalid JSON). The record needs to be repaired before it can be opened.");
    }
  }
  if (!isObject(parsedPayload)) return emptyRecord(metadata);
  const project = isObject(parsedPayload.project) ? parsedPayload.project : parsedPayload;
  const records = Array.isArray(project.records) ? project.records : [];
  return normalizeRecord(records[0], metadata);
};

const formatValue = (value: number | null, decimals = 2) => value === null ? "auto" : value.toFixed(decimals);
/** Formats a calculated cell, rendering an absent reading as the "auto" placeholder. */
const formatCell = (value: number | null | undefined, decimals = 2) => value === null || value === undefined ? "auto" : value.toFixed(decimals);
const parseNumber = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

const PAN_REMAINDER_SIZE = "<0.075";

/** The <0.075 pan mass is the dry mass less every other retained mass; blank until both are entered. */
const withPanRemainder = (rows: GradingRow[], dryMass: number | null): GradingRow[] => {
  const index = rows.findIndex((row) => row.sieveSize === PAN_REMAINDER_SIZE);
  if (index < 0) return rows;
  const dry = dryMass;
  const otherMasses = rows.flatMap((row, rowIndex) => rowIndex === index ? [] : [parseNumber(row.weightRetained)]);
  const enteredOthers = otherMasses.filter((mass): mass is number => mass !== null);
  const remainder = dry !== null && dry > 0 && enteredOthers.length > 0
    ? (dry - enteredOthers.reduce((sum, mass) => sum + mass, 0)).toFixed(2)
    : "";
  return rows.map((row, rowIndex) => rowIndex === index ? { ...row, weightRetained: remainder } : row);
};

const GradingTest = ({ testKey }: GradingTestProps) => {
  const project = useProject();
  const testData = useTestData();
  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const isNewRecord = searchParams.get("newRecord") === "1";
  const resultIdValue = Number.parseInt(searchParams.get("resultId") || "", 10);
  const selectedResultId = Number.isInteger(resultIdValue) && resultIdValue > 0 ? resultIdValue : null;
  const projectId = project.currentProjectId ?? null;
  const metadata = useMemo(() => testData.recordMetadata.grading || {}, [testData.recordMetadata.grading]);
  const metadataKey = JSON.stringify(metadata);
  const [record, setRecord] = useState<GradingRecord>(() => emptyRecord(metadata));
  const [recordId, setRecordId] = useState<number | null>(null);
  // Arrow keys move between the sieve, hydrometer and readings fields so the
  // whole form can be filled from the keyboard.
  const prepNav = useGridArrowNavigation<HTMLDivElement>();
  const sieveNav = useGridArrowNavigation<HTMLDivElement>();
  const hydrometerNav = useGridArrowNavigation<HTMLDivElement>();
  const readingsNav = useGridArrowNavigation<HTMLDivElement>();
  const [isLoading, setIsLoading] = useState(Boolean(projectId) && !isNewRecord);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const moisture = useMemo(() => calculateMoisture(record.moisture.wetMass, record.moisture.dryMass), [record.moisture]);
  const moistureCorrectedMass = useMemo(() => {
    const initialMass = parseNumber(record.samplePreparation.initialDryMass);
    if (initialMass === null) return null;
    if (moisture.moistureContent === null) return initialMass;
    return initialMass - (initialMass * moisture.moistureContent) / 100;
  }, [record.samplePreparation.initialDryMass, moisture.moistureContent]);
  const measuredRetainedMass = useMemo(
    () => record.sieveRows.reduce((total, row) => {
      if (row.sieveSize === PAN_REMAINDER_SIZE) return total;
      return total + Math.max(parseNumber(row.weightRetained) ?? 0, 0);
    }, 0),
    [record.sieveRows],
  );
  const massBalanceExcess = moistureCorrectedMass === null ? 0 : measuredRetainedMass - moistureCorrectedMass;
  const hasImpossibleMassBalance = massBalanceExcess > 0.01;
  const massBalanceMessage = hasImpossibleMassBalance
    ? `Mass balance error: measured sieve masses total ${measuredRetainedMass.toFixed(1)} g, exceeding the moisture-corrected initial mass (${moistureCorrectedMass?.toFixed(1)} g) by ${massBalanceExcess.toFixed(1)} g. Correct the entered masses before saving or exporting.`
    : null;
  const sieveRows = useMemo(
    () => withPanRemainder(record.sieveRows, moistureCorrectedMass),
    [record.sieveRows, moistureCorrectedMass],
  );
  const calculations = useMemo(() => calculateGrading(sieveRows), [sieveRows]);
  // Fines are what the pan holds out of the sieved mass, so they come from the sieve table
  // rather than a separately typed washed mass that can disagree with it.
  const fineMass = useMemo(() => panMass(sieveRows), [sieveRows]);
  const washedOvenDryMass = useMemo(
    () => fineMass === null || moistureCorrectedMass === null ? null : moistureCorrectedMass - fineMass,
    [fineMass, moistureCorrectedMass],
  );
  const finesPercentage = useMemo(
    () => fineMass === null || calculations.totalWeight <= 0 ? null : (fineMass / calculations.totalWeight) * 100,
    [fineMass, record.samplePreparation.initialDryMass],
  );
  const preparedRecord = useMemo<GradingRecord>(() => ({
    ...record,
    sieveRows,
    samplePreparation: {
      ...record.samplePreparation,
      washedOvenDryMass: washedOvenDryMass === null ? "" : washedOvenDryMass.toFixed(2),
    },
  }), [record, sieveRows, washedOvenDryMass]);
  const hydrometer = useMemo(() => calculateHydrometer(
    record.hydrometerRows,
    { ...DEFAULT_HYDROMETER_INPUTS, ...record.hydrometerInputs },
    moistureCorrectedMass === null ? "" : String(moistureCorrectedMass),
  ), [record.hydrometerRows, record.hydrometerInputs, moistureCorrectedMass]);
  /**
   * One grading series for the BS sheet: sieve cumulative passing, extended
   * below the finest sieve by the hydrometer diameters. `mergePsdSeries` keeps
   * the sieve reading wherever both methods report the same size.
   */
  const psdSeries = useMemo(() => {
    const sievePoints = record.sieveRows.map((row, index) => ({
      size: Number.parseFloat(row.sieveSize),
      passing: calculations.cumulativePassing[index],
    }));
    const hydrometerPoints = hydrometer.results.map((result) => ({
      size: result.particleDiameter,
      passing: result.finesByHydrometer,
    }));
    return mergePsdSeries(sievePoints, hydrometerPoints);
  }, [record.sieveRows, calculations.cumulativePassing, hydrometer.results]);
  const gradation = useMemo(() => calculateGradationCoefficients(psdSeries), [psdSeries]);
  const classificationValues = useMemo(() => {
    const passingAt = (matcher: (size: string) => boolean) => {
      const index = record.sieveRows.findIndex((row) => matcher(row.sieveSize));
      return index >= 0 ? calculations.cumulativePassing[index] : null;
    };
    const sieveMm = (size: string) => {
      const trimmed = size.trim().toLowerCase();
      const map: Record<string, number> = { "no. 4": 4.75, "no. 8": 2.36, "no. 10": 2, "no. 16": 1.18, "no. 30": 0.6, "no. 40": 0.425, "no. 50": 0.3, "no. 100": 0.15, "no. 200": 0.075 };
      if (map[trimmed] !== undefined) return map[trimmed];
      const m = trimmed.match(/[\d.]+/);
      return m ? Number.parseFloat(m[0]) : NaN;
    };
    const matchesSieve = (size: string, mm: number, ...aliases: string[]) => {
      const parsed = sieveMm(size);
      if (Number.isFinite(parsed) && Math.abs(parsed - mm) < 1e-9) return true;
      return aliases.some((alias) => size.toLowerCase().includes(alias.toLowerCase()));
    };
    const gravelPassing = passingAt((size) => matchesSieve(size, 4.75, "No. 4"));
    const finesPassing = passingAt((size) => matchesSieve(size, 0.075, "No. 200"));
    // AASHTO M 145 evidence: % passing No. 10 (2.00 mm) and No. 40 (0.425 mm),
    // read off the sieve rows the same way as the No. 4 / No. 200 values. The
    // No. 10 passing also opens the BS fraction table, where gravel is what the
    // 2 mm sieve retains.
    const p10Passing = passingAt((size) => matchesSieve(size, 2, "No. 10"));
    const p40Passing = passingAt((size) => matchesSieve(size, 0.425, "No. 40"));
    // BS 1377 fraction boundaries — gravel ≥ 2 mm, sand 2–0.063 mm, fines
    // < 0.063 mm — which differ from the No. 4 / No. 200 split the USCS and
    // AASHTO verdicts above are built on. Records saved before the 0.212 mm
    // sieve existed (or sieved down to 0.075 mm only) have no 0.063 mm row, so
    // the fines read off the finest measured sieve: the closest available
    // reading of what passes 0.063 mm. Pan rows never carry a percentage, so
    // they cannot be picked up by the fallback.
    const bsFinesPassing = passingAt((size) => { const m = sieveMm(size); return Number.isFinite(m) && Math.abs(m - 0.063) < 1e-9; }) ?? (() => {
      let finestIndex = -1;
      let finestSize = Number.POSITIVE_INFINITY;
      record.sieveRows.forEach((row, index) => {
        const size = sieveMm(row.sieveSize);
        if (size > 0 && size < finestSize && calculations.cumulativePassing[index] !== null) {
          finestIndex = index;
          finestSize = size;
        }
      });
      return finestIndex >= 0 ? calculations.cumulativePassing[finestIndex] : null;
    })();
    const liquidLimit = parseNumber(record.classification.liquidLimit);
    const plasticLimit = parseNumber(record.classification.plasticLimit);
    return {
      gravel: gravelPassing === null ? null : 100 - gravelPassing,
      sand: gravelPassing !== null && finesPassing !== null ? gravelPassing - finesPassing : null,
      fines: finesPassing,
      bsGravel: p10Passing === null ? null : 100 - p10Passing,
      bsSand: p10Passing !== null && bsFinesPassing !== null ? p10Passing - bsFinesPassing : null,
      bsFines: bsFinesPassing,
      p10: p10Passing,
      p40: p40Passing,
      plasticityIndex: record.classification.nonPlastic ? 0 : liquidLimit !== null && plasticLimit !== null ? liquidLimit - plasticLimit : null,
    };
  }, [record.sieveRows, record.classification.liquidLimit, record.classification.plasticLimit, record.classification.nonPlastic, calculations.cumulativePassing]);

  /** USCS / AASHTO symbols follow directly from the computed fractions. */
  const autoClassification = useMemo(() => {
    const { gravel, sand, fines, plasticityIndex } = classificationValues;
    if (fines === null) return null;
    // Fine-grained soils (≥ 50 % fines) classify on the No. 200 passing value
    // alone, so a record without a No. 4 row still gets a USCS/AASHTO verdict.
    // Coarse-grained soils need the No. 4 / No. 200 split.
    const isFineGrained = fines >= 50;
    if (!isFineGrained && (gravel === null || sand === null)) return null;
    const g = isFineGrained ? 0 : (gravel ?? 0);
    const s = isFineGrained ? 0 : (sand ?? 0);
    const liquidLimit = parseNumber(record.classification.liquidLimit) ?? undefined;
    const plasticLimit = parseNumber(record.classification.plasticLimit) ?? undefined;
    const atterberg = {
      liquidLimit,
      plasticLimit,
      plasticityIndex: plasticityIndex ?? undefined,
    };
    const uscs = classifySoilUSCS({ gravel: g, sand: s, fines }, atterberg);
    // AASHTO M 145 granular groups need the No. 10 / No. 40 passing values;
    // without them the classifier falls back to a flagged approximation.
    const aashto = classifySoilAASHTO({ gravel: g, sand: s, fines }, atterberg, {
      p10: classificationValues.p10,
      p40: classificationValues.p40,
      nonPlastic: record.classification.nonPlastic,
    });
    return {
      uscsSymbol: uscs.uscsSymbol,
      uscsDescription: uscs.uscsDescription,
      uscsGroup: uscs.uscsGroup,
      aashtoGroup: aashto,
    };
  }, [classificationValues, record.classification.liquidLimit, record.classification.plasticLimit, record.classification.nonPlastic]);

  /**
   * Missing-sieve evidence warnings for the granular AASHTO groups. When the
   * No. 10 / No. 40 rows are empty the group above is an approximation, so
   * the banner below says exactly which verdicts cannot be verified.
   */
  const aashtoWarnings = useMemo(() => getAashtoEvidenceWarnings({
    p10: classificationValues.p10,
    p40: classificationValues.p40,
    p200: classificationValues.fines,
    plasticityIndex: classificationValues.plasticityIndex,
    nonPlastic: record.classification.nonPlastic,
  }), [classificationValues, record.classification.nonPlastic]);

  /**
   * AASHTO M 145 (2008) 6.4 group index. F is the percentage passing the 75 µm
   * (No. 200) sieve, which is the fines value already read off the 0.075 mm row,
   * and the value only means anything for A-2-6, A-2-7, A-4, A-5, A-6, A-7-5
   * and A-7-6. The A-2-6 / A-2-7 subgroups use the plasticity term on its own.
   */
  const uscsResult = record.classification.uscs && record.classification.uscs !== "auto" ? record.classification.uscs : autoClassification?.uscsSymbol ?? null;
  const aashtoResult = record.classification.aashtoGroup && record.classification.aashtoGroup !== "auto" ? record.classification.aashtoGroup : autoClassification?.aashtoGroup ?? null;
  const groupIndex = useMemo(() => {
    const liquidLimit = parseNumber(record.classification.liquidLimit);
    const plasticityIndex = classificationValues.plasticityIndex;
    const passingNo200 = classificationValues.fines;
    if (liquidLimit === null || plasticityIndex === null || passingNo200 === null) return null;
    return calculateAashtoGroupIndex({
      passingNo200,
      liquidLimit,
      plasticityIndex,
      aashtoGroup: record.classification.aashtoGroup && record.classification.aashtoGroup !== "auto" ? record.classification.aashtoGroup : autoClassification?.aashtoGroup ?? null,
    });
  }, [record.classification.liquidLimit, record.classification.aashtoGroup, classificationValues.plasticityIndex, classificationValues.fines, autoClassification?.aashtoGroup]);
  const aashtoRating = rateAashtoGroup(aashtoResult, groupIndex);

  useEffect(() => {
    if (!projectId) {
      setRecord(emptyRecord(metadata));
      setRecordId(null);
      setIsLoading(false);
      return;
    }
    if (isNewRecord) {
      // A record started from an existing project opens blank: the wizard supplies the
      // sample metadata, and the source project's measurements are deliberately not
      // copied, so the original record stays untouched when this one is saved.
      setRecord(emptyRecord(metadata));
      setRecordId(null);
      setIsLoading(false);
      return;
    }

    if (projectId === null) return;

    let active = true;
    setIsLoading(true);
    setError(null);
    // Do not let a failed lookup leave the previous project's row id in place:
    // saving would then overwrite a record that belongs to another project.
    setRecordId(null);
    listRecords<ApiTestResultRow>("test_results", { limit: 5000, orderBy: "updated_at", direction: "DESC" })
      .then((response) => {
        if (!active) return;
        const result = (response.data || []).find((row) => Number(row.project_id) === projectId && row.test_key === "grading" && (!selectedResultId || Number(row.id) === selectedResultId) && row.payload_json);
        if (selectedResultId && !result) {
          throw new Error(`Result ${selectedResultId} was not found for this project. It may have been deleted, or it may belong to another user.`);
        }
        const loadedRecord = getPayloadRecord(result?.payload_json, metadata);
        setRecordId(result?.id ?? null);
        setRecord(loadedRecord);
      })
      .catch((loadError) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "Unable to load this record");
      })
      .finally(() => active && setIsLoading(false));
    return () => { active = false; };
  }, [projectId, isNewRecord, selectedResultId, metadataKey, metadata]);

  const updateRecordField = <K extends keyof GradingRecord>(field: K, value: GradingRecord[K]) => {
    setRecord((current) => ({ ...current, [field]: value }));
    setSaveStatus("idle");
  };

  const updateNested = <K extends keyof GradingRecord, N extends keyof NonNullable<GradingRecord[K]>>(field: K, nested: N, value: string | boolean) => {
    setRecord((current) => ({ ...current, [field]: { ...(current[field] as object), [nested]: value } }));
    setSaveStatus("idle");
  };

  const updateSieve = (index: number, value: string) => {
    updateRecordField("sieveRows", record.sieveRows.map((row, rowIndex) => rowIndex === index ? { ...row, weightRetained: value } : row));
  };

  const updateHydrometer = (index: number, field: keyof HydrometerRow, value: string) => {
    updateRecordField("hydrometerRows", record.hydrometerRows.map((row, rowIndex) => rowIndex === index ? { ...row, [field]: value } : row));
  };

  const payload = useMemo<GradingPayload>(() => ({
    version: "1.0",
    project: {
      title: project.projectName,
      clientName: project.clientName,
      date: project.projectDate || project.date,
      records: [preparedRecord],
    },
    calculations: {
      ...calculations,
      ...gradation,
      ...moisture,
      ...hydrometer,
      fineMass,
      moistureCorrectedMass,
      finesPercentage,
      gravelPercentage: classificationValues.gravel,
      sandPercentage: classificationValues.sand,
      sieveFinesPercentage: classificationValues.fines,
      plasticityIndex: classificationValues.plasticityIndex,
      groupIndex,
      uscsSymbol: uscsResult,
      aashtoGroup: aashtoResult,
    },
  }), [project.projectName, project.clientName, project.projectDate, project.date, preparedRecord, calculations, gradation, moisture, hydrometer, fineMass, moistureCorrectedMass, finesPercentage, classificationValues, groupIndex, uscsResult, aashtoResult]);

  const status = calculations.totalWeight === 0 ? "not-started" : calculations.percentageRetained.some((value) => value > 0) ? "in-progress" : "not-started";
  const save = useCallback(async () => {
    if (!projectId) {
      const message = "Select a project before saving this record";
      setError(message);
      throw new Error(message);
    }
    if (!isNewRecord && selectedResultId && !recordId) {
      const message = "This PSD result could not be found. Reload the project before saving.";
      setError(message);
      throw new Error(message);
    }
    if (record.sieveRows.every((row) => row.weightRetained.trim() === "")) {
      const message = "Enter at least one sieve retained mass before saving this record";
      setError(message);
      throw new Error(message);
    }
    if (massBalanceMessage) {
      setError(massBalanceMessage);
      throw new Error(massBalanceMessage);
    }
    setSaveStatus("saving");
    setError(null);
    const data = {
      project_id: projectId,
      test_key: "grading",
      sample_key: record.sampleNumber.trim() || record.label.trim() || crypto.randomUUID(),
      sample_label: record.label.trim() || null,
      sample_depth: record.sampleNumber.trim() || null,
      name: "Particle Size Distribution",
      category: "soil",
      status,
      data_points: record.sieveRows.filter((row) => row.weightRetained.trim()).length,
      key_results_json: [
        { label: "D10", value: formatValue(gradation.d10, 3) },
        { label: "D30", value: formatValue(gradation.d30, 3) },
        { label: "D60", value: formatValue(gradation.d60, 3) },
        { label: "Cu", value: formatValue(gradation.cu) },
        { label: "Cc", value: formatValue(gradation.cc) },
        ...(uscsResult ? [{ label: "USCS", value: uscsResult }] : []),
        ...(aashtoResult ? [{ label: "AASHTO", value: aashtoResult }] : []),
        ...(groupIndex === null ? [] : [{ label: "Group Index", value: String(groupIndex) }]),
      ],
      payload_json: payload,
    };
    try {
      let savedId = recordId;
      if (recordId) {
        await updateRecord<{ id: number }>("test_results", recordId, data);
      } else {
        const created = await createRecord<{ id: number }>("test_results", data);
        savedId = created.data?.id ?? created.id ?? null;
      }
      setRecordId(savedId);
      setSaveStatus("saved");
      if (isNewRecord) {
        const params = new URLSearchParams(location.search);
        params.delete("newRecord");
        params.delete("sourceProjectId");
        if (savedId) params.set("resultId", String(savedId));
        navigate({
          pathname: location.pathname,
          search: params.toString() ? `?${params.toString()}` : "",
          hash: location.hash,
        }, { replace: true });
      }
      toast.success("Particle Size Distribution saved");
    } catch (saveError) {
      setSaveStatus("error");
      setError(saveError instanceof Error ? saveError.message : "Unable to save this record");
      throw saveError;
    }
  }, [projectId, status, record, gradation, payload, recordId, selectedResultId, isNewRecord, location, navigate, uscsResult, aashtoResult, groupIndex, massBalanceMessage]);

  const clear = async () => {
    if (projectId) {
      const response = await listRecords<ApiTestResultRow>("test_results", { limit: 5000 });
      // Only remove the row this form is editing. If the project somehow holds several rows for the
      // same test, the others may be separate samples and must not be destroyed.
      const targetResultId = recordId ?? selectedResultId;
      const rows = (response.data || []).filter((row) =>
        Number(row.project_id) === projectId
        && row.test_key === "grading"
        && (!targetResultId || Number(row.id) === targetResultId),
      );
      await Promise.all(rows.map((row) => deleteRecord("test_results", row.id)));
    }
    setRecord(emptyRecord(metadata));
    setRecordId(null);
    setSaveStatus("idle");
    toast.success("Particle Size Distribution cleared");
  };

  const handleSave = () => {
    void save().catch(() => undefined);
  };

  const handleClear = () => {
    void clear().catch((clearError) => {
      const message = clearError instanceof Error ? clearError.message : "Unable to delete this record";
      setError(message);
      toast.error(message);
    });
  };

  // One metadata set for every export and for printing. `...project` carries no
  // testedBy, so the PDF footer and the Date Tested row were previously blank
  // and wrong respectively.
  const exportMetadata = {
    projectName: project.projectName,
    clientName: project.clientName,
    date: project.projectDate || project.date,
    dateTested: record.dateTested,
    labOrganization: project.labOrganization,
    dateReported: project.dateReported,
    checkedBy: project.checkedBy,
    testedBy: record.testedBy,
  };

  /** The BS 1377-2 sheet, shared by the download and the print window. */
  const buildPdfOptions = () => ({
    ...exportMetadata,
    record: preparedRecord,
    grading: { ...calculations, ...gradation },
    moistureCorrectedMass,
    preparationFineMass: fineMass,
    preparationFinesPercentage: finesPercentage,
    hydrometer,
    hydrometerInputs: { ...DEFAULT_HYDROMETER_INPUTS, ...record.hydrometerInputs },
    series: psdSeries,
    chartImage: null,
    gravelPercentage: classificationValues.bsGravel,
    sandPercentage: classificationValues.bsSand,
    finesPercentage: classificationValues.bsFines,
    uscsSymbol: record.classification.uscs && record.classification.uscs !== "auto" ? record.classification.uscs : (autoClassification?.uscsSymbol ?? record.classification.uscs),
    uscsDescription: autoClassification?.uscsDescription ?? null,
    aashtoGroup: record.classification.aashtoGroup && record.classification.aashtoGroup !== "auto" ? record.classification.aashtoGroup : (autoClassification?.aashtoGroup ?? record.classification.aashtoGroup),
    groupIndex,
    uniformityCoefficient: gradation.cu,
    coefficientOfCurvature: gradation.cc,
    effectiveSize: gradation.d10,
    sixtyPercentSize: gradation.d60,
    liquidLimit: parseNumber(record.classification.liquidLimit),
    plasticLimit: parseNumber(record.classification.plasticLimit),
    plasticityIndex: classificationValues.plasticityIndex,
  });

  const handlePrint = async () => {
    if (massBalanceMessage) {
      setError(massBalanceMessage);
      return;
    }
    try {
      // Hand the processed sheet itself to a browser tab and let that tab print
      // it — never the on-screen report page.
      const doc = await generateParticleSizeDistributionPDF({ ...buildPdfOptions(), skipDownload: true });
      doc.autoPrint();
      const pdfUrl = doc.output("bloburl");
      const printWindow = window.open(pdfUrl, "_blank");
      if (printWindow) {
        printWindow.onload = () => printWindow.print();
      } else {
        toast.error("Failed to open print dialog. Pop-ups may be blocked.");
      }
    } catch (printError) {
      console.error("[PSD print]", printError);
      toast.error("Unable to print the Particle Size Distribution report");
    }
  };

  const exportFiles = async (type: "pdf" | "xlsx") => {
    if (massBalanceMessage) {
      setError(massBalanceMessage);
      return;
    }
    const tables = [{
      headers: ["Sieve size (mm)", "Retained mass (g)", "% retained", "Cumulative passing (%)"],
      // Empty tables read as "auto", exactly as on screen — never 0.0%.
      rows: record.sieveRows.map((row, index) => [row.sieveSize, row.weightRetained || "—", calculations.totalWeight > 0 ? calculations.percentageRetained[index]?.toFixed(1) || "—" : "auto", calculations.cumulativePassing[index]?.toFixed(1) || "—"]),
    }, {
      // Column order follows the calculation chain in calculateHydrometer: the observed
      // reading, the reading reduced to the dispersant baseline (Rd), the correction, then
      // the true reading (Rh) that the effective depth and the plotted curve are read from.
      headers: ["Time (min)", "R_n' (g/L)", "R_d = R_n' - R_o' (g/L)", "C_m + C_t (g/L)", "R_h (g/L)", "Effective depth (cm)", "Diameter (mm)", "% finer (hydrometer sample)", "% finer (whole sample)"],
      rows: record.hydrometerRows.map((row, index) => {
        const result = hydrometer.results[index];
        return [
          row.time,
          row.actualHydrometer || "—",
          formatCell(result?.adjustedReading, 1),
          formatCell(result?.compositeCorrection ?? null, 2),
          formatCell(result?.correctedReading, 1),
          formatCell(result?.effectiveDepth, 2),
          formatCell(result?.particleDiameter, 4),
          formatCell(result?.finesInSuspension, 1),
          formatCell(result?.finesByHydrometer, 1),
        ];
      }),
    }];
    // The headline numbers, shared by every export so the PDF cannot omit what the
    // spreadsheet of the same test contains.
    const resultFields = [
      { label: "D10", value: formatValue(gradation.d10, 3) },
      { label: "D30", value: formatValue(gradation.d30, 3) },
      { label: "D60", value: formatValue(gradation.d60, 3) },
      { label: "Cu", value: formatValue(gradation.cu) },
      { label: "Cc", value: formatValue(gradation.cc) },
      ...(uscsResult ? [{ label: "USCS", value: uscsResult }] : []),
      ...(aashtoResult ? [{ label: "AASHTO", value: aashtoResult }] : []),
      ...(groupIndex === null ? [] : [{ label: "Group Index", value: String(groupIndex) }]),
    ];
    const chartImages: Record<string, string> = {};
    // The PDF draws its own vector curve; only the Excel twin embeds the capture.
    if (type !== "pdf" && psdSeries.length >= 2) {
      const chart = await captureChartAsBase64("grading-chart");
      if (chart) chartImages["Particle Size Distribution Curve"] = chart;
    }
    if (type === "pdf") {
      // The dedicated generator reproduces the BS 1377-2 sheet layout. The
      // curve is always drawn natively (selectable vector labels, print-sharp
      // at any size) rather than embedding the on-screen raster capture; the
      // capture is still attached to the Excel twin below.
      await generateParticleSizeDistributionPDF(buildPdfOptions());
    } else {
      generateTestExcel({ data: { title: "Particle Size Distribution", fields: resultFields, tables, chartImages }, ...exportMetadata });
    }
  };
  if (isLoading) {
    return <div className="flex min-h-[360px] items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading particle size distribution record...</div>;
  }

  if (!projectId) {
    return <div className="rounded-xl border bg-card p-10 text-center"><p className="font-medium">No project selected</p><p className="mt-1 text-sm text-muted-foreground">Start a Particle Size Distribution record from the test wizard.</p></div>;
  }

  const sieveTableRows = record.sieveRows.length + 1;
  const readingRows = record.hydrometerRows.length;
  const sieveFillerRows = Math.max(0, readingRows - sieveTableRows);
  const readingFillerRows = Math.max(0, sieveTableRows - readingRows);

  return (
    <div className="grading-record space-y-3 pb-6" data-test-key={testKey || "grading"}>
      {error && <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</div>}

      <section className="record-card record-identity">
        <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
          <div><h1 className="text-sm font-semibold">{project.projectName || "Particle Size Distribution"}</h1><p className="text-[11px] text-muted-foreground">{project.clientName || (record.sampleNumber ? `Sample ${record.sampleNumber}` : "Sample details")}</p></div>
        </div>
        <div className="flex flex-wrap gap-x-2 gap-y-1 px-4 py-2 text-[10px] text-muted-foreground"><span>Material: <strong className="text-foreground">Soil</strong></span><span>·</span><span>Test type: <strong className="text-foreground">Particle Size Distribution</strong></span><span>·</span><span>Sample ID: <strong className="text-foreground">{record.label || "—"}</strong></span><span>·</span><span>Sample No.: <strong className="text-foreground">{record.sampleNumber || "—"}</strong></span><span>·</span><span>Sample Depth From (m): <strong className="text-foreground">{record.sampleDepthFrom || "—"}</strong></span><span>·</span><span>Sample Depth To (m): <strong className="text-foreground">{record.sampleDepthTo || "—"}</strong></span></div>
      </section>

      <div className="px-1 pt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Record results — BS 1377 Part 2</div>

      <div className="grid gap-3 md:grid-cols-2" ref={prepNav.ref} onKeyDown={prepNav.onKeyDown}>
        <RecordSection title="Sample preparation">
          <div className="grid gap-px overflow-hidden rounded-md border sm:grid-cols-2">
            <RecordField label="Initial air-dried mass (g) *" value={record.samplePreparation.initialDryMass} placeholder="e.g. 669" onChange={(value) => updateNested("samplePreparation", "initialDryMass", value)} />
            <CalculatedField label="Moisture-corrected initial mass (g)" value={moistureCorrectedMass === null ? "auto" : moistureCorrectedMass.toFixed(1)} />
            <CalculatedField label="Washed & oven-dried mass (g)" value={washedOvenDryMass === null ? "auto" : washedOvenDryMass.toFixed(1)} />
            <CalculatedField label="Fine mass (g)" value={fineMass === null ? "auto" : fineMass.toFixed(1)} />
            <CalculatedField label="Fines %" value={formatValue(finesPercentage, 1)} />
          </div>
          {massBalanceMessage && <p role="alert" className="mt-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{massBalanceMessage}</p>}
        </RecordSection>
        <RecordSection title="Moisture content at preparation">
          <div className="grid gap-px overflow-hidden rounded-md border sm:grid-cols-2">
            <RecordField label="Wet weight of sample (g)" value={record.moisture.wetMass} placeholder="e.g. 109" onChange={(value) => updateNested("moisture", "wetMass", value)} />
            <RecordField label="Dry weight of sample (g)" value={record.moisture.dryMass} placeholder="e.g. 85.5" onChange={(value) => updateNested("moisture", "dryMass", value)} />
            <CalculatedField label="Weight of water (g)" value={formatValue(moisture.waterWeight, 1)} />
            <CalculatedField label="Moisture content (%)" value={formatValue(moisture.moistureContent, 1)} />
          </div>
        </RecordSection>
      </div>

      <RecordSection title="Soil classification" help="Calculated classification values update from the recorded material data.">
        <div className="grid gap-px overflow-hidden rounded-md border sm:grid-cols-3">
          <EditableCell label="Gravel (%)" value={formatValue(classificationValues.bsGravel, 1)} calculated />
          <EditableCell label="Sand (%)" value={formatValue(classificationValues.bsSand, 1)} calculated />
          <EditableCell label="Fines (%)" value={formatValue(classificationValues.bsFines, 1)} calculated />
        </div>
        <div className="mt-px grid gap-px overflow-hidden rounded-md border sm:grid-cols-2">
          <EditableCell label="No. 10 passing P10 (%)" value={formatValue(classificationValues.p10, 1)} calculated />
          <EditableCell label="No. 40 passing P40 (%)" value={formatValue(classificationValues.p40, 1)} calculated />
        </div>
        <div className="mt-px grid gap-px overflow-hidden rounded-md border sm:grid-cols-2">
          <EditableCell label="USCS" value={autoClassification ? `${autoClassification.uscsSymbol} — ${autoClassification.uscsDescription}` : "auto"} calculated />
          <EditableCell label="USCS override" value={record.classification.uscs} onChange={(value) => updateNested("classification", "uscs", value)} />
        </div>
        <div className="mt-px grid gap-px overflow-hidden rounded-md border sm:grid-cols-4">
          <EditableCell label="AASHTO group" value={autoClassification ? autoClassification.aashtoGroup : "auto"} calculated />
          <EditableCell label="Group Index" value={groupIndex === null ? "auto" : String(groupIndex)} calculated />
          <EditableCell label="AASHTO override" value={record.classification.aashtoGroup} onChange={(value) => updateNested("classification", "aashtoGroup", value)} />
          <EditableCell label="Rating" value={aashtoRating ?? "auto"} calculated />
        </div>
        <div className="mt-2 border-t pt-2">
          <div className="mb-px bg-muted/60 px-2 py-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">Atterberg</div>
          <div className="grid gap-px overflow-hidden rounded-md border sm:grid-cols-3">
            <EditableCell label="Liquid limit" value={record.classification.liquidLimit} placeholder="-" onChange={(value) => updateNested("classification", "liquidLimit", value)} />
            <EditableCell label="Plastic limit" value={record.classification.plasticLimit} placeholder="-" onChange={(value) => updateNested("classification", "plasticLimit", value)} />
            <EditableCell label="Plasticity index" value={formatValue(classificationValues.plasticityIndex, 1)} calculated />
          </div>
        </div>
        <div className="mt-2 grid gap-2 border-t pt-2 text-[11px] sm:grid-cols-3"><label className="flex items-center gap-2"><Checkbox checked={record.classification.nonPlastic} onCheckedChange={(checked) => updateNested("classification", "nonPlastic", checked === true)} />Non-plastic (NP)</label><label className="flex items-center gap-2"><Checkbox checked={record.classification.suspectedOrganic} onCheckedChange={(checked) => updateNested("classification", "suspectedOrganic", checked === true)} />Suspected organic soil</label><div><span className="text-muted-foreground">Oven-dried Liquid Limit</span><Input value={record.classification.ovenDriedLiquidLimit} onChange={(event) => updateNested("classification", "ovenDriedLiquidLimit", event.target.value)} className="mt-1 h-7 w-full" /></div></div>
        {aashtoWarnings.length > 0 ? (
          <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] text-amber-800"><span className="font-semibold">AASHTO evidence: </span>{aashtoWarnings.join(" ")} The group shown is an approximation.</div>
        ) : (
          <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] text-amber-800">USCS: USCS requires measured No. 4 and No. 200 passing values. AASHTO: AASHTO requires measured No. 10, No. 40, and No. 200 passing values.</div>
        )}
      </RecordSection>

      <div className="grid gap-3 md:grid-cols-[3fr_5fr]">
        <RecordSection title="Wet & dry sieve analysis to BS 1377-2:1990:9.2/9.3">
          <div className="overflow-x-auto" ref={sieveNav.ref} onKeyDown={sieveNav.onKeyDown}><table className="record-table grading-sieve-table w-full table-fixed"><thead><tr className="h-16"><th>Sieve size (mm)</th><th>Retained mass (g)</th><th>% retained</th><th>Cumulative passing (%)</th></tr></thead><tbody>{sieveRows.map((row, index) => <tr key={`${row.sieveSize}-${index}`} className="h-10"><td className="font-semibold">{row.sieveSize}</td><td><Input type="number" min="0" value={row.weightRetained} readOnly={row.sieveSize === PAN_REMAINDER_SIZE} placeholder={row.sieveSize === PAN_REMAINDER_SIZE ? "auto" : undefined} onChange={(event) => updateSieve(index, event.target.value)} className="record-input h-7 min-w-0 w-full px-1 text-center" /></td><td className="calculated-cell">{calculations.totalWeight > 0 ? calculations.percentageRetained[index].toFixed(1) : "auto"}</td><td className="calculated-cell">{calculations.cumulativePassing[index] === null ? "auto" : calculations.cumulativePassing[index]?.toFixed(1)}</td></tr>)}<tr className="h-10 font-semibold"><td>TOTAL</td><td className="calculated-cell">{calculations.totalWeight ? calculations.totalWeight.toFixed(1) : "auto"}</td><td className="calculated-cell">{calculations.totalWeight ? "100.0" : "auto"}</td><td className="calculated-cell">—</td></tr>{Array.from({ length: sieveFillerRows }, (_, index) => <tr key={`sieve-filler-${index}`} className="h-10"><td /><td /><td /><td /></tr>)}</tbody></table></div>
        </RecordSection>

        <RecordSection title="Hydrometer analysis to BS 1377-2:1990:9.5">
          <div className="grid gap-px overflow-hidden rounded border sm:grid-cols-2" ref={hydrometerNav.ref} onKeyDown={hydrometerNav.onKeyDown}><HydrometerInput label="Dry weight (g)" value={record.hydrometerInputs.dryWeight} onChange={(value) => updateRecordField("hydrometerInputs", { ...record.hydrometerInputs, dryWeight: value })} /><HydrometerInput label="Suspension volume (cm³)" value={record.hydrometerInputs.suspensionVolume} onChange={(value) => updateRecordField("hydrometerInputs", { ...record.hydrometerInputs, suspensionVolume: value })} /><HydrometerInput label="Hydrometer type" value={record.hydrometerInputs.hydrometerType} onChange={(value) => updateRecordField("hydrometerInputs", { ...record.hydrometerInputs, hydrometerType: value })} /><HydrometerInput label="S.G (Mg/m³)" value={record.hydrometerInputs.sG} onChange={(value) => updateRecordField("hydrometerInputs", { ...record.hydrometerInputs, sG: value })} /><HydrometerInput label="Dispersant blank Ro′ (g/L)" value={record.hydrometerInputs.zeroCorrection} onChange={(value) => updateRecordField("hydrometerInputs", { ...record.hydrometerInputs, zeroCorrection: value })} /><HydrometerInput label="Temperature (°C)" value={record.hydrometerInputs.temperature} onChange={(value) => updateRecordField("hydrometerInputs", { ...record.hydrometerInputs, temperature: value })} /><HydrometerInput label="Meniscus correction Cm (g/L)" value={record.hydrometerInputs.meniscusCorrection} onChange={(value) => updateRecordField("hydrometerInputs", { ...record.hydrometerInputs, meniscusCorrection: value })} /><HydrometerInput label="Stokes constant K (optional)" value={record.hydrometerInputs.kFactor} onChange={(value) => updateRecordField("hydrometerInputs", { ...record.hydrometerInputs, kFactor: value })} /><HydrometerInput label="Temperature correction (g/L, 0 = none)" value={record.hydrometerInputs.temperatureCorrection} onChange={(value) => updateRecordField("hydrometerInputs", { ...record.hydrometerInputs, temperatureCorrection: value })} /></div>
          <div className="overflow-x-auto" ref={readingsNav.ref} onKeyDown={readingsNav.onKeyDown}><table className="record-table min-w-[1080px]"><thead><tr className="h-16"><th>Time, min</th><th>Reading Rn′ (g/L)</th><th>R_d = Rn′ − R_o′ (g/L)</th><th>C_m + C_t (g/L)</th><th>R_h = R_d + C_m + C_t (g/L)</th><th>Effective depth (cm)</th><th>Diameter (mm)</th><th>% finer than D (hydrometer sample)</th><th>% finer than D (whole sample)</th></tr></thead><tbody>{record.hydrometerRows.map((row, index) => {
    const result = hydrometer.results[index];
    return <tr key={row.time} className="h-10"><td className="font-semibold">{row.time}</td><td><Input value={row.actualHydrometer} onChange={(event) => updateHydrometer(index, "actualHydrometer", event.target.value)} className="record-input" /></td><td className="calculated-cell">{formatCell(result?.adjustedReading, 1)}</td><td className="calculated-cell">{formatCell(result?.compositeCorrection ?? null, 2)}</td><td className="calculated-cell">{formatCell(result?.correctedReading, 1)}</td><td className="calculated-cell">{formatCell(result?.effectiveDepth, 2)}</td><td className="calculated-cell">{formatCell(result?.particleDiameter, 4)}</td><td className="calculated-cell">{formatCell(result?.finesInSuspension, 1)}</td><td className="calculated-cell">{formatCell(result?.finesByHydrometer, 1)}</td></tr>;
  })}{Array.from({ length: readingFillerRows }, (_, index) => <tr key={`reading-filler-${index}`} className="h-10">{Array.from({ length: 9 }, (_, cell) => <td key={cell} />)}</tr>)}</tbody></table></div><div className="mt-1 flex justify-end"><span className="rounded-full border bg-muted/50 px-2 py-0.5 text-[8px] uppercase tracking-wide text-muted-foreground">Scroll →</span></div>
        </RecordSection>
      </div>

      <RecordSection title="Coefficient of uniformity and curvature">
        <div className="grid gap-px overflow-hidden rounded-md border sm:grid-cols-5">
          <CalculatedField label="D10 (mm)" value={formatValue(gradation.d10, 4)} />
          <CalculatedField label="D30 (mm)" value={formatValue(gradation.d30, 4)} />
          <CalculatedField label="D60 (mm)" value={formatValue(gradation.d60, 4)} />
          <CalculatedField label="Cu = D60/D10" value={formatValue(gradation.cu, 2)} />
          <CalculatedField label="Cc = D30²/D10D60" value={formatValue(gradation.cc, 2)} />
        </div>
      </RecordSection>

      <RecordSection title="Particle size distribution graph">
        <div className="overflow-x-auto bg-white p-1"><ParticleSizeDistributionChart id="grading-chart" points={psdSeries} className="w-full min-w-[620px]" /></div>
      </RecordSection>

      <section className="record-card flex flex-col gap-3 px-4 py-3 text-[10px] sm:flex-row sm:items-center sm:justify-between"><div><span className="text-muted-foreground">TESTED BY</span><div className="font-semibold uppercase">{record.testedBy || "—"}</div></div><div><span className="text-muted-foreground">DATE REPORTED</span><div className="font-semibold">{project.dateReported || "—"}</div></div></section>
      <div className="flex flex-wrap items-center justify-end gap-2 print:hidden">
        <Button variant="outline" size="sm" onClick={() => void exportFiles("pdf")} disabled={hasImpossibleMassBalance || isLoading}><FileDown className="mr-1.5 h-3.5 w-3.5" />PDF</Button>
        <Button variant="outline" size="sm" onClick={() => void handlePrint()} disabled={hasImpossibleMassBalance || isLoading}><Printer className="mr-1.5 h-3.5 w-3.5" />Print</Button>
        <Button size="sm" onClick={handleSave} disabled={saveStatus === "saving" || isLoading || hasImpossibleMassBalance}>{saveStatus === "saving" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : saveStatus === "saved" ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}{saveStatus === "saving" ? "Saving..." : saveStatus === "saved" ? "Saved" : "Save"}</Button>
      </div>
    </div>
  );
};

const RecordSection = ({ title, help, children }: { title: string; help?: string; children: React.ReactNode }) => <section className="record-card overflow-hidden"><div className="flex items-center justify-between bg-muted/60 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"><span>{title}</span>{help && <span title={help}><HelpCircle className="h-3.5 w-3.5" /></span>}</div><div className="p-2">{children}</div></section>;

const RecordField = ({ label, value, placeholder, onChange }: { label: string; value: string; placeholder?: string; onChange: (value: string) => void }) => <label className="block bg-card px-2.5 py-2"><span className="mb-1 block text-[10px] text-muted-foreground">{label}</span><Input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className="record-input w-full" /></label>;
const CalculatedField = ({ label, value }: { label: string; value: string }) => <div className="calculated-cell px-2.5 py-2"><span className="mb-1 block text-[10px] text-calculated-foreground/80">{label}</span><strong className="font-mono text-xs text-calculated-foreground">{value}</strong></div>;
const EditableCell = ({ label, value, placeholder, calculated, onChange }: { label: string; value: string; placeholder?: string; calculated?: boolean; onChange?: (value: string) => void }) => <label className={`grid min-h-8 min-w-0 grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] items-stretch ${calculated ? "bg-calculated" : "bg-card"}`}><span className="flex items-center border-r bg-muted/50 px-2 py-1 text-[9px] uppercase leading-tight text-muted-foreground">{label}</span>{calculated ? <strong className="flex items-center px-2 font-mono text-[10px] text-calculated-foreground">{value}</strong> : <Input value={value} placeholder={placeholder} onChange={(event) => onChange?.(event.target.value)} className="h-8 min-w-0 rounded-none border-0 bg-transparent px-2 py-1 font-mono text-[10px] shadow-none focus-visible:ring-0" />}</label>;
const HydrometerInput = ({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) => <RecordField label={label} value={value} onChange={onChange} />;

export default GradingTest;
