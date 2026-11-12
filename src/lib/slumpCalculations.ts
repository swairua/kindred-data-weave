/**
 * Slump Test calculations - BS EN 12350-2:2019 / EN 206 consistence classes.
 *
 * Standalone module so the formulas reference document can cite the exact
 * implementation (see formulasReference.ts) and the derived fields (slump,
 * class, workability, compliance, validity) are recomputed from raw readings
 * alone - on load and on every edit.
 *
 * Units: all lengths in millimetres.
 */

/** Standard Abrams cone height (mm): 200 mm base, 100 mm top, 300 mm tall. */
export const STANDARD_CONE_HEIGHT = 300;

/** One slump test entry, as edited on the form / stored in payload_json. */
export interface SlumpEntry {
  mouldHeight: string; // cone height, mm (300 unless a non-standard cone is used)
  measuredHeight: string; // height of the subsided concrete, mm
  targetSlump: string; // optional specification target, mm
  slump: string; // slump, mm - derived from the heights (legacy payloads carry it directly)
}

/** Everything derived from an entry, recomputed as one consistent bundle. */
export interface SlumpDerived {
  entry: SlumpEntry;
  slump: string; // mm
  slumpClass: string; // EN 206 class S1-S5, or "" when unclassifiable
  workability: string; // placement guidance descriptor
  compliance: string; // verdict against the optional target
  notes: string; // validity notes ("" = valid true-slump reading)
}

const parse = (v: string): number => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : NaN;
};

/**
 * Slump = cone height - height of the subsided concrete (EN 12350-2:2019).
 * A measured height equal to the cone height is a legitimate zero slump;
 * a reading above the cone height is not physical and yields NaN.
 */
export const calculateSlump = (mouldHeight: number, measuredHeight: number): number => {
  if (!Number.isFinite(mouldHeight) || mouldHeight <= 0) return NaN;
  if (!Number.isFinite(measuredHeight) || measuredHeight < 0) return NaN;
  if (measuredHeight > mouldHeight) return NaN;
  return mouldHeight - measuredHeight;
};

/**
 * EN 206 consistence class (BS 8500-1 ranges): S1 10-40, S2 50-90,
 * S3 100-150, S4 160-210, S5 above 210 mm. The class table leaves gaps
 * between bands (41-49, 91-99, 151-159); an intermediate reading rounds to
 * the nearest class at the midpoints (45, 95, 155, 215) so every slump in
 * the sensitive range classifies - the same gap-closure rule used for the
 * Robertson SBT chart. Below 10 mm is beneath the EN 12350-2 sensitive
 * range and reports "Below S1" rather than a class.
 */
export const classifySlumpClass = (slump: number): string => {
  if (!Number.isFinite(slump) || slump < 0) return "";
  if (slump < 10) return "Below S1";
  if (slump <= 45) return "S1";
  if (slump <= 95) return "S2";
  if (slump <= 155) return "S3";
  if (slump <= 215) return "S4";
  return "S5";
};

/**
 * Placement guidance per slump band (Lyons 2007 / common practice):
 * very dry mixes pave roads, low slumps suit foundations, medium slumps
 * normal reinforced concrete placed with vibration, high slumps flow
 * between congested reinforcement, and above the cone's sensitive range
 * a slump-flow (SCC) test is the appropriate measure.
 */
export const describeWorkability = (slump: number): string => {
  if (!Number.isFinite(slump) || slump < 0) return "";
  if (slump < 10) return "Very low - pavements and roads";
  if (slump <= 40) return "Low - foundations, light reinforcement";
  if (slump <= 90) return "Medium - normal reinforced concrete, vibration";
  if (slump <= 150) return "High - congested reinforcement, pumped concrete";
  if (slump <= 210) return "Very high - flow placements";
  return "Extreme - beyond cone sensitivity; use slump flow (SCC)";
};

/**
 * Spot-sample tolerance on a target slump (BS 8500-1 basis, Concrete
 * Society): +/-30 mm for targets up to 40 mm, +/-40 mm for 50-90 mm and
 * +/-50 mm from 100 mm. Returns 0 when no usable target is given.
 */
export const toleranceBand = (targetSlump: number): number => {
  if (!Number.isFinite(targetSlump) || targetSlump < 0) return 0;
  if (targetSlump <= 40) return 30;
  if (targetSlump <= 90) return 40;
  return 50;
};

/**
 * Compliance verdict against the optional target. Empty string when no
 * target or slump is available (targets are optional, never an error).
 */
export const assessCompliance = (slump: number, targetSlump: number): string => {
  if (!Number.isFinite(slump) || slump < 0) return "";
  if (!Number.isFinite(targetSlump) || targetSlump < 0) return "";
  const band = toleranceBand(targetSlump);
  const deviation = slump - targetSlump;
  if (Math.abs(deviation) <= band) return `Within tolerance (+/-${band} mm)`;
  return `Outside tolerance by ${Math.round(Math.abs(deviation) - band)} mm`;
};

/**
 * Validity notes against the EN 12350-2:2019 sensitive range (10-210 mm)
 * and collapse behaviour. Empty string for a valid true-slump reading.
 */
export const assessValidity = (slump: number): string => {
  if (!Number.isFinite(slump) || slump < 0) return "";
  if (slump === 0) return "Zero slump - too stiff for cone sensitivity (below the EN 10 mm range)";
  if (slump < 10) return "Below the EN 12350-2 sensitive range (10 mm minimum)";
  if (slump > 210) return "Above the EN 12350-2 sensitive range (210 mm) - collapse likely; use a slump flow (SCC) test";
  return "";
};

const round1 = (n: number): number => Math.round(n * 10) / 10;

/**
 * Recompute every derived field from the raw entry. The slump is derived
 * from the heights when a measured height is present; otherwise a legacy
 * value carried directly in the payload (e.g. the production dump) passes
 * through unchanged.
 */
export const rederiveSlumpEntry = (entry: SlumpEntry): SlumpDerived => {
  const mould = Number.isFinite(parse(entry.mouldHeight)) && parse(entry.mouldHeight) > 0
    ? parse(entry.mouldHeight)
    : STANDARD_CONE_HEIGHT;
  const measured = parse(entry.measuredHeight);
  const fromHeights = calculateSlump(mould, measured);
  const slump = Number.isFinite(fromHeights) ? fromHeights : parse(entry.slump);
  const target = parse(entry.targetSlump);

  const nextEntry: SlumpEntry = {
    ...entry,
    mouldHeight: String(mould),
    slump: Number.isFinite(slump) && slump >= 0 ? String(round1(slump)) : "",
  };

  return {
    entry: nextEntry,
    slump: nextEntry.slump,
    slumpClass: classifySlumpClass(slump),
    workability: describeWorkability(slump),
    compliance: assessCompliance(slump, target),
    notes: assessValidity(slump),
  };
};
