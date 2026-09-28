import { calculateAashtoGroupIndex } from "./soilClassification";
import { calculateGrading } from "./gradingCalculations";
import { calculateProctor, type ProctorPayload, type ProctorSummary } from "./proctorRecords";
import { listRecords } from "./api";

export const COMBINED_SOIL_TITLE = "Particle Size Distribution + Compaction (OMC/MDD)";
export const COMBINED_SOIL_STANDARD =
  "BS 1377-2:1990 9.2/9.3/9.5 + BS 1377-4:1990 3.3 (2.5 kg rammer) / 3.5 (4.5 kg rammer)";
export const COMBINED_SOIL_FILENAME = "PSD_Compaction_Combined_Report";

export interface CombinedProjectMeta {
  projectName?: string; clientName?: string; date?: string; dateTested?: string;
  labOrganization?: string; dateReported?: string; checkedBy?: string; testedBy?: string;
}
export interface CombinedTestRow {
  id: number | string; project_id: number | string; test_key: string;
  payload_json?: unknown; updated_at?: string; created_at?: string;
}
export interface GradingCombinedInput {
  project?: {
    title?: string; clientName?: string; date?: string;
    records?: Array<{
      label?: string; sampleNumber?: string; sampleDepthFrom?: string; sampleDepthTo?: string;
      sampledSubmittedBy?: string; testedBy?: string; dateTested?: string;
      moisture?: { wetMass?: string; dryMass?: string };
      classification?: { liquidLimit?: string; plasticLimit?: string };
      sieveRows?: Array<{ sieveSize?: string; weightRetained?: string }>;
      hydrometerRows?: Array<{ time?: string; actualHydrometer?: string }>;
      hydrometerInputs?: Record<string, string>;
    }>;
  };
  calculations?: {
    d10?: number | null; d30?: number | null; d60?: number | null;
    cu?: number | null; cc?: number | null; moistureContent?: number | null;
    gravelPercentage?: number | null; sandPercentage?: number | null;
    sieveFinesPercentage?: number | null; finesPercentage?: number | null;
    plasticityIndex?: number | null; groupIndex?: number | null;
    uscsSymbol?: string | null; aashtoGroup?: string | null;
  };
}
export interface CombinedSoilReport {
  title: string; standard: string; sampleLabel: string;
  gradingSample: string; proctorSample: string; matched: boolean;
  hasGrading: boolean; hasProctor: boolean; banner: string | null;
  fields: { label: string; value: string }[];
  tables: { title?: string; headers: string[]; rows: string[][] }[];
  projectMeta: CombinedProjectMeta;
}
const DASH = "—";
const num = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") { const t = v.trim(); if (!t) return null; const p = Number(t); return Number.isFinite(p) ? p : null; }
  return null;
};
const fmt = (v: number | null | undefined, d = 2): string =>
  v === null || v === undefined || !Number.isFinite(v) ? DASH : v.toFixed(d);
const str = (v: unknown): string => {
  if (v === null || v === undefined) return DASH;
  const t = String(v).trim(); return t ? t : DASH;
};
const parsePayload = <T>(raw: unknown): T | null => {
  if (!raw) return null;
  if (typeof raw === "string") { try { return JSON.parse(raw) as T; } catch { return null; } }
  return raw as T;
};
const sampleTag = (r: { label?: string; sampleNumber?: string; sampleDepthFrom?: string; sampleDepthTo?: string } | undefined): string => {
  if (!r) return DASH;
  const id = (r.sampleNumber || r.label || "").trim() || "Unlabelled sample";
  const depth = r.sampleDepthFrom || r.sampleDepthTo ? `${r.sampleDepthFrom || "?"}-${r.sampleDepthTo || "?"} m` : "";
  return depth ? `${id} (${depth})` : id;
};
const sampleKey = (r: { label?: string; sampleNumber?: string } | undefined): string =>
  (r?.sampleNumber || r?.label || "").trim().toLowerCase();
export const pickGradingRecord = (payload: GradingCombinedInput | null, preferredKey = "") => {
  const records = payload?.project?.records ?? [];
  if (records.length === 0) return undefined;
  if (preferredKey) { const hit = records.find((r) => sampleKey(r) === preferredKey); if (hit) return hit; }
  return records[0];
};
export const pickProctorRecord = (payload: ProctorPayload | null, preferredKey = "") => {
  const records = payload?.project?.records ?? [];
  if (records.length === 0) return undefined;
  if (preferredKey) {
    const hit = records.find((r) => (r.sampleNumber || r.label || "").trim().toLowerCase() === preferredKey);
    if (hit) return hit;
  }
  return records[0];
};
const fractionsFromSieve = (
  sieveRows: Array<{ sieveSize?: string; weightRetained?: string }> | undefined,
  saved: { gravel?: number | null; sand?: number | null; fines?: number | null },
) => {
  if (saved.gravel != null && saved.sand != null && saved.fines != null) return { gravel: saved.gravel, sand: saved.sand, fines: saved.fines };
  if (!sieveRows || sieveRows.length === 0) return { gravel: saved.gravel ?? null, sand: saved.sand ?? null, fines: saved.fines ?? null };
  try {
    const calc = calculateGrading(sieveRows.map((r) => ({ sieveSize: r.sieveSize ?? "", weightRetained: r.weightRetained ?? "" })));
    const idx = (pred: (s: string) => boolean) => sieveRows.findIndex((r) => pred(r.sieveSize ?? ""));
    const gIdx = idx((s) => Number.parseFloat(s) === 4.75 || s.includes("No. 4"));
    const fIdx = idx((s) => Number.parseFloat(s) === 0.075 || s.includes("0.075"));
    const gPass = gIdx >= 0 ? calc.cumulativePassing[gIdx] : null;
    const fPass = fIdx >= 0 ? calc.cumulativePassing[fIdx] : null;
    return {
      gravel: gPass == null ? (saved.gravel ?? null) : 100 - gPass,
      sand: gPass != null && fPass != null ? gPass - fPass : (saved.sand ?? null),
      fines: fPass ?? saved.fines ?? null,
    };
  } catch { return { gravel: saved.gravel ?? null, sand: saved.sand ?? null, fines: saved.fines ?? null }; }
};
const proctorText = (s: ProctorSummary | null | undefined) => ({
  omc: s?.omc ?? null, mdd: s?.mdd ?? null, bulk: s?.bulkDensity ?? null,
  r2: s?.rSquared ?? null, source: s?.optimumSource ?? "none",
  points: s?.pointCount ?? 0, warnings: s?.warnings ?? [] as string[],
});
export function buildCombinedSoilReport(gRaw: unknown, pRaw: unknown, meta: CombinedProjectMeta = {}): CombinedSoilReport {
  const grading = parsePayload<GradingCombinedInput>(gRaw);
  const proctor = parsePayload<ProctorPayload>(pRaw);
  const gRecs = grading?.project?.records ?? [];
  const pRecs = proctor?.project?.records ?? [];
  const hasG = gRecs.length > 0;
  const hasP = pRecs.length > 0;
  let matched = false;
  let gRec = gRecs[0];
  let pRec = pRecs[0];
  if (hasG && hasP) {
    const pKeys = new Set(pRecs.map((r) => (r.sampleNumber || r.label || "").trim().toLowerCase()).filter(Boolean));
    const hit = gRecs.findIndex((r) => pKeys.has(sampleKey(r)));
    if (hit >= 0 && sampleKey(gRecs[hit])) {
      gRec = gRecs[hit];
      pRec = pickProctorRecord(proctor, sampleKey(gRecs[hit])) ?? pRecs[0];
      matched = true;
    }
  }
  const gCalc = grading?.calculations ?? {};
  const frac = fractionsFromSieve(gRec?.sieveRows, {
    gravel: num(gCalc.gravelPercentage), sand: num(gCalc.sandPercentage),
    fines: num(gCalc.sieveFinesPercentage ?? gCalc.finesPercentage),
  });
  const prepW = num(gCalc.moistureContent);
  const d10 = num(gCalc.d10); const d30 = num(gCalc.d30); const d60 = num(gCalc.d60);
  const cu = num(gCalc.cu); const cc = num(gCalc.cc);
  const uscs = gRec ? (gCalc.uscsSymbol ? String(gCalc.uscsSymbol) : DASH) : DASH;
  const aashto = gRec ? (gCalc.aashtoGroup ? String(gCalc.aashtoGroup) : DASH) : DASH;
  let gi: number | null = num(gCalc.groupIndex);
  if (gi === null && gRec && frac.fines !== null) {
    const ll = num(gRec.classification?.liquidLimit);
    const pl = num(gRec.classification?.plasticLimit);
    const pi = num(gCalc.plasticityIndex) ?? (ll !== null && pl !== null ? ll - pl : null);
    if (ll !== null && pi !== null) {
      try { gi = calculateAashtoGroupIndex({ passingNo200: frac.fines, liquidLimit: ll, plasticityIndex: pi, aashtoGroup: aashto === DASH ? null : aashto }); }
      catch { gi = null; }
    }
  }
  let std = proctor?.calculations?.standard ?? null;
  let mod = proctor?.calculations?.modified ?? null;
  if (pRec) {
    try {
      if (!std || std.pointCount === 0) { const r = calculateProctor(pRec.standardRows ?? [], pRec.standardMouldVolume ?? ""); if (r.pointCount > 0) std = r; }
      if (!mod || mod.pointCount === 0) { const r = calculateProctor(pRec.modifiedRows ?? [], pRec.modifiedMouldVolume ?? ""); if (r.pointCount > 0) mod = r; }
    } catch { /* keep saved */ }
  }
  const sS = proctorText(std); const mS = proctorText(mod);
  const aStd = sS.omc !== null && sS.mdd !== null;
  const aMod = mS.omc !== null && mS.mdd !== null;
  const prim = aStd ? sS : mS;
  const primName = aStd ? "Standard" : aMod ? "Modified" : "Standard";
  const gsRaw = (pRec?.specificGravity ?? "").trim();
  const gs = gsRaw ? num(gsRaw) : null;
  const fields: { label: string; value: string }[] = [];
  const push = (label: string, value: string) => fields.push({ label, value });
  push("PSD sample", hasG ? sampleTag(gRec) : `${DASH} (not saved)`);
  push("Gravel (4.75-63 mm) %", hasG ? fmt(frac.gravel, 1) : DASH);
  push("Sand (0.075-4.75 mm) %", hasG ? fmt(frac.sand, 1) : DASH);
  push("Fines (<0.075 mm) %", hasG ? fmt(frac.fines, 1) : DASH);
  push("D10 (mm)", hasG ? fmt(d10, 4) : DASH);
  push("D30 (mm)", hasG ? fmt(d30, 4) : DASH);
  push("D60 (mm)", hasG ? fmt(d60, 4) : DASH);
  push("Cu (=D60/D10)", hasG ? fmt(cu, 2) : DASH);
  push("Cc (=D30^2/D10.D60)", hasG ? fmt(cc, 2) : DASH);
  push("USCS symbol", hasG ? str(uscs) : DASH);
  push("AASHTO group", hasG ? str(aashto) : DASH);
  push("AASHTO Group Index", hasG ? (gi === null ? DASH : String(gi)) : DASH);
  push("Preparation moisture w (%)", hasG ? fmt(prepW, 1) : DASH);
  push("Compaction sample", hasP ? sampleTag(pRec) : `${DASH} (not saved)`);
  push("Standard OMC (%)", hasP ? fmt(sS.omc, 1) : DASH);
  push("Standard MDD (kg/m3)", hasP ? fmt(sS.mdd, 0) : DASH);
  push("Modified OMC (%)", hasP ? fmt(mS.omc, 1) : DASH);
  push("Modified MDD (kg/m3)", hasP ? fmt(mS.mdd, 0) : DASH);
  push("OMC/MDD basis (Standard)", hasP ? (sS.source === "curve" ? `Fitted curve (R2 ${fmt(sS.r2, 4)})` : sS.source === "peak-point" ? "Densest measured point" : DASH) : DASH);
  push("OMC/MDD basis (Modified)", hasP ? (mS.source === "curve" ? `Fitted curve (R2 ${fmt(mS.r2, 4)})` : mS.source === "peak-point" ? "Densest measured point" : DASH) : DASH);
  if (gs !== null) push("Particle density Gs (ZAV line)", String(gsRaw));
  const rel: { label: string; value: string }[] = [];
  if (hasG && (aStd || aMod)) {
    const fines = frac.fines;
    rel.push({ label: `Fines vs ${primName} OMC`, value: fines !== null && prim.omc !== null ? `${fines.toFixed(1)}% fines <-> ${prim.omc.toFixed(1)}% OMC` : DASH });
    rel.push({ label: `Gradation vs ${primName} MDD`, value: cu !== null && cc !== null && prim.mdd !== null ? `Cu ${cu.toFixed(2)}, Cc ${cc.toFixed(2)} <-> ${prim.mdd.toFixed(0)} kg/m3` : DASH });
    if (gs !== null && fines !== null) rel.push({ label: "Gs (ZAV) vs PSD fines", value: `Gs ${gsRaw} with ${fines.toFixed(1)}% fines` });
    if (prepW !== null && prim.omc !== null) {
      const delta = prepW - prim.omc;
      rel.push({ label: `Prep w vs ${primName} OMC`, value: `${prepW.toFixed(1)}% vs ${prim.omc.toFixed(1)}% (d ${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%)` });
    } else rel.push({ label: `Prep w vs ${primName} OMC`, value: DASH });
    const warns: string[] = [];
    if (fines !== null && prim.omc !== null && fines >= 35 && prim.omc >= 16) warns.push(`High fines (${fines.toFixed(1)}%) with high OMC (${prim.omc.toFixed(1)}%) - moisture-sensitive.`);
    if (fines !== null && prim.mdd !== null && fines >= 50 && prim.mdd < 1700) warns.push(`High fines (${fines.toFixed(1)}%) with low MDD (${prim.mdd.toFixed(0)} kg/m3).`);
    if (prepW !== null && prim.omc !== null && Math.abs(prepW - prim.omc) > 4) warns.push(`Prep w (${prepW.toFixed(1)}%) >4% from ${primName} OMC (${prim.omc.toFixed(1)}%).`);
    if (prim.source === "peak-point") warns.push("Optimum from densest point (no curve) - add points to confirm.");
    if (prim.r2 !== null && prim.r2 < 0.9) warns.push(`Weak curve fit (R2 ${prim.r2.toFixed(4)}).`);
    for (const w of [...sS.warnings, ...(aStd ? [] : mS.warnings)]) if (!warns.includes(w)) warns.push(w);
    for (const w of warns) rel.push({ label: "Relationship check", value: w });
  } else {
    rel.push({ label: "Fines vs OMC", value: DASH });
    rel.push({ label: "Gradation vs MDD", value: DASH });
    rel.push({ label: "Prep w vs OMC", value: DASH });
  }
  for (const r of rel) push(r.label, r.value);

  push("D30 (mm)", hasG ? fmt(d30, 4) : DASH);
  push("D60 (mm)", hasG ? fmt(d60, 4) : DASH);
  push("Cu (=D60/D10)", hasG ? fmt(cu, 2) : DASH);
  const tables: CombinedSoilReport["tables"] = [];
  if (hasG && gRec) {
    const gTag = sampleTag(gRec);
    tables.push({
      title: `PSD - sieve analysis (${gTag})`,
      headers: ["Sieve size (mm)", "Retained mass (g)", "% retained", "Cumulative passing (%)"],
      rows: (gRec.sieveRows ?? []).map((row) => [row.sieveSize || DASH, row.weightRetained || DASH, DASH, DASH]),
    });
    if (gRec.hydrometerRows && gRec.hydrometerRows.length > 0) {
      tables.push({
        title: `PSD - hydrometer readings (${gTag})`,
        headers: ["Time (min)", "Rn' (g/L)", "Gs / T / Cm"],
        rows: gRec.hydrometerRows.map((row) => [row.time || DASH, row.actualHydrometer || DASH, `Gs ${gRec.hydrometerInputs?.sG || DASH}`]),
      });
    }
  }
  if (hasP && pRec) {
    const pTag = sampleTag(pRec);
    const addRows = (rows: ProctorPayload["project"]["records"][number]["standardRows"], vol: string, name: string) => {
      if (!rows || rows.length === 0) return;
      tables.push({
        title: `Compaction - ${name} (${pTag})`,
        headers: ["Point", "Moisture add (cc)", "Mould+wet (g)", "Mould (g)", "Cont+wet (g)", "Cont+dry (g)", "Cont (g)", "Mould vol"],
        rows: rows.map((row, i) => [String.fromCharCode(65 + i), row.moistureAdded || DASH, row.mouldWetMass || DASH, row.mouldTare || DASH, row.containerWetMass || DASH, row.containerDryMass || DASH, row.containerTare || DASH, vol || DASH]),
      });
    };
    addRows(pRec.standardRows, pRec.standardMouldVolume ?? "", "Standard");
    addRows(pRec.modifiedRows, pRec.modifiedMouldVolume ?? "", "Modified");
    tables.push({
      title: `Compaction - results (${pTag})`,
      headers: ["Result", "Standard", "Modified"],
      rows: [
        ["OMC (%)", fmt(sS.omc, 1), fmt(mS.omc, 1)],
        ["MDD (kg/m3)", fmt(sS.mdd, 0), fmt(mS.mdd, 0)],
        ["Bulk at OMC (kg/m3)", fmt(sS.bulk, 0), fmt(mS.bulk, 0)],
        ["Basis", sS.source, mS.source],
        ["R2", fmt(sS.r2, 4), fmt(mS.r2, 4)],
        ["Points", String(sS.points), String(mS.points)],
      ],
    });
  }
  if (hasG && gRec?.sieveRows) {
    try {
      const calc = calculateGrading(gRec.sieveRows.map((r) => ({ sieveSize: r.sieveSize ?? "", weightRetained: r.weightRetained ?? "" })));
      const st = tables.find((t) => t.title?.includes("sieve analysis"));
      if (st) st.rows = gRec.sieveRows.map((row, i) => [row.sieveSize || DASH, row.weightRetained || DASH, calc.percentageRetained[i] !== undefined ? calc.percentageRetained[i].toFixed(1) : DASH, calc.cumulativePassing[i] == null ? DASH : (calc.cumulativePassing[i] as number).toFixed(1)]);
    } catch { /* keep placeholders */ }
  }
  const gSample = hasG ? sampleTag(gRec) : DASH;
  const pSample = hasP ? sampleTag(pRec) : DASH;
  const sampleLabel = hasG && hasP
    ? (matched ? `${gSample} (matched)` : `Latest PSD (${gSample}) + Latest Proctor (${pSample}) - verify depths`)
    : hasG ? `PSD only (${gSample})` : hasP ? `Compaction only (${pSample})` : "No saved PSD or Compaction";
  const banner = !hasG || !hasP
    ? `Companion test not saved - showing ${hasG ? "PSD only" : "compaction only"}.`
    : !matched ? "Sample numbers differ - reporting latest of each. Verify depths." : null;
  const testedBy = pRec?.sampledSubmittedBy || gRec?.testedBy || gRec?.sampledSubmittedBy || meta.testedBy || "";
  const dateTested = pRec?.dateTested || gRec?.dateTested || meta.dateTested || meta.date || "";
  return {
    title: COMBINED_SOIL_TITLE, standard: COMBINED_SOIL_STANDARD,
    sampleLabel, gradingSample: gSample, proctorSample: pSample, matched, hasGrading: hasG, hasProctor: hasP, banner,
    fields: [{ label: "Samples (PSD <-> Compaction)", value: sampleLabel }, ...(banner ? [{ label: "Coverage", value: banner }] : []), ...fields],
    tables, projectMeta: { ...meta, testedBy, dateTested },
  };
}
export async function loadCombinedSoilReport(projectId: number, meta: CombinedProjectMeta = {}): Promise<CombinedSoilReport> {
  const res = await listRecords<CombinedTestRow>("test_results", { limit: 5000, orderBy: "updated_at", direction: "DESC" });
  const rows = (res.data || []).filter((row) => Number(row.project_id) === Number(projectId));
  const gRow = rows.find((row) => row.test_key === "grading") ?? null;
  const pRow = rows.find((row) => row.test_key === "proctor") ?? null;
  return buildCombinedSoilReport(gRow?.payload_json, pRow?.payload_json, meta);
}


