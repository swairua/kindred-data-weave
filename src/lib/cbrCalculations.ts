/**
 * CBR (California Bearing Ratio) calculations.
 *
 * Standard loads per BS 1377-4 / ASTM D1883:
 *   - 2.5 mm penetration: 13.24 kN
 *   - 5.0 mm penetration: 19.96 kN
 *
 * CBR (%) = (measured load / standard load) * 100
 * The reported CBR is the higher of the 2.5 mm and 5.0 mm values.
 */

const STANDARD_LOAD_2_5 = 13.24; // kN
const STANDARD_LOAD_5_0 = 19.96; // kN

export interface CBRRow {
  penetration: string;
  load: string;
}

export interface CBRResult {
  penetration: number;
  load: number;
  cbr: number;
}

export const calculateCBR = (penetration: string, load: string): number | null => {
  const p = parseFloat(penetration);
  const l = parseFloat(load);
  if (!p || !l) return null;
  if (p === 2.5) return (l / STANDARD_LOAD_2_5) * 100;
  if (p === 5.0) return (l / STANDARD_LOAD_5_0) * 100;
  return null;
};

export const calculateCBRRows = (rows: CBRRow[]): CBRResult[] => {
  const results: CBRResult[] = [];
  for (const row of rows) {
    const cbr = calculateCBR(row.penetration, row.load);
    const p = parseFloat(row.penetration);
    const l = parseFloat(row.load);
    if (cbr !== null && p && l) {
      results.push({ penetration: p, load: l, cbr });
    }
  }
  return results;
};

export const reportCBR = (rows: CBRRow[]): { cbr25: number | null; cbr50: number | null; reportedCBR: number | null } => {
  const cbr25 = calculateCBR("2.5", rows.find((r) => r.penetration === "2.5")?.load ?? "");
  const cbr50 = calculateCBR("5.0", rows.find((r) => r.penetration === "5.0")?.load ?? "");
  let reported: number | null = null;
  if (cbr25 !== null) reported = cbr25;
  if (cbr50 !== null && (reported === null || cbr50 > reported)) reported = cbr50;
  return { cbr25, cbr50, reportedCBR: reported };
};

export { STANDARD_LOAD_2_5, STANDARD_LOAD_5_0 };