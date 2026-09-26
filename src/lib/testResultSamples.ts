import type { AtterbergRecord } from "@/context/TestDataContext";

/**
 * Reading `test_results` rows as samples.
 *
 * A row used to hold every sample for a (project, test_key) pair inside
 * `payload_json.project.records[]`, so one project with 13 samples was one row and
 * the lists showed a single record.
 *
 * `migrate_atterberg_samples.sql` splits that array out: each sample becomes its
 * own row carrying `sample_key`, `sample_label`, `sample_depth` and `sort_order`,
 * and `records[]` is reduced to a one-element array.
 *
 * These helpers read BOTH shapes, so behaviour is identical in all three states:
 *
 *   before    one row per pair, `sample_key` column absent  -> legacy path
 *   during    the legacy row and the new sample rows coexist -> new rows win
 *   after     one row per sample                            -> new path
 */

export interface TestResultSampleRow {
  /**
   * api.php opens mysqli without MYSQLI_OPT_INT_AND_FLOAT_NATIVE and hydrateRow() only
   * decodes `*_json`, so ids can arrive as strings. api.ts coerces them for the normal
   * flow, but this helper is reached from tests and any future caller, so it accepts
   * both and normalises internally rather than silently dropping rows.
   */
  id: number | string;
  project_id: number | string;
  test_key: string;
  /** Record id for the migrated shape. Absent, NULL or '' means legacy. */
  sample_key?: string | null;
  sample_label?: string | null;
  sample_depth?: string | null;
  sort_order?: number | null;
  payload_json?: unknown;
  /** Present on test_results and used for the list columns. */
  name?: string | null;
  category?: string | null;
  status?: string | null;
  /** api.php joins projects for test_results, so this arrives with every row. */
  project_name?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface AssembledSample {
  /** The row this sample was read from. */
  row: TestResultSampleRow;
  /** test_results.id as a number, so "Open" can target exactly this sample's row. */
  resultId: number;
  /** The record's own id, stable across saves. */
  sampleKey: string;
  label: string;
  depth: string;
  record: AtterbergRecord | null;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readString = (value: unknown): string => (typeof value === "string" ? value : "");

/** Read a string field off a stored record without widening the record type. */
export const recordField = (record: AtterbergRecord | null, field: string): string =>
  readString((record as unknown as Record<string, unknown> | null)?.[field]);

const stampOf = (row: TestResultSampleRow): string => row.updated_at || row.created_at || "";

const sortOrderOf = (row: TestResultSampleRow): number =>
  typeof row.sort_order === "number" ? row.sort_order : 0;

/** The row id as a number, or null when the row cannot be identified. */
export const rowIdOf = (row: TestResultSampleRow): number | null => {
  const parsed = Number(row?.id);
  return Number.isFinite(parsed) ? parsed : null;
};

/** Collapse "19" and 19 to the same key so mixed id types group together. */
const keyPart = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  const parsed = Number(value);
  return Number.isFinite(parsed) && String(value).trim() !== "" ? String(parsed) : String(value);
};

export const sampleKeyOf = (row: TestResultSampleRow): string => readString(row.sample_key).trim();

export const pairKeyOf = (row: TestResultSampleRow): string => `${keyPart(row.project_id)}::${row.test_key}`;

/** The `records[]` array held by a row's payload. Always returns an array. */
export const readSampleRecords = (row: TestResultSampleRow): unknown[] => {
  const payload = row.payload_json;
  if (!isObject(payload)) return [];
  const project = isObject(payload.project) ? payload.project : payload;
  return Array.isArray(project.records) ? project.records : [];
};

/** A row whose first stored record is null opens as a blank form. */
const isUsableRow = (row: TestResultSampleRow): boolean => isObject(readSampleRecords(row)[0]);

const newestFirst = (a: TestResultSampleRow, b: TestResultSampleRow): number => {
  const sa = stampOf(a);
  const sb = stampOf(b);
  if (sa !== sb) return sb > sa ? 1 : -1;
  return (rowIdOf(b) ?? 0) - (rowIdOf(a) ?? 0);
};

/**
 * Collapse a raw list down to one row per sample, newest first within a sample.
 *
 * Handles the duplicate rows that older databases accumulated, and ignores the
 * legacy project-level row once per-sample rows exist for that pair.
 */
export const selectSampleRows = (rows: TestResultSampleRow[]): TestResultSampleRow[] => {
  const groups = new Map<string, TestResultSampleRow[]>();
  for (const row of rows ?? []) {
    if (!row || rowIdOf(row) === null) continue;
    const key = pairKeyOf(row);
    const bucket = groups.get(key);
    if (bucket) bucket.push(row);
    else groups.set(key, [row]);
  }

  const selected: TestResultSampleRow[] = [];
  for (const bucket of groups.values()) {
    // The migrated shape wins. Once any row for the pair carries a sample_key,
    // the legacy project-level row is a migration leftover and must not be
    // counted as an extra sample.
    const migrated = bucket.filter((row) => sampleKeyOf(row) !== "");
    const pool = migrated.length > 0 ? migrated : bucket;

    // One row per sample_key. A row with no usable record is only used when the
    // sample has nothing better, so a blank row never shadows real data.
    const bySample = new Map<string, TestResultSampleRow[]>();
    for (const row of pool) {
      const key = sampleKeyOf(row);
      const list = bySample.get(key);
      if (list) list.push(row);
      else bySample.set(key, [row]);
    }

    for (const list of bySample.values()) {
      const usable = list.filter(isUsableRow);
      const candidates = (usable.length > 0 ? usable : list).slice().sort(newestFirst);
      selected.push(candidates[0]);
    }
  }

  // Group by pair, then by the sample's own order, so the form rebuilds in the
  // order the technician entered it.
  return selected.sort((a, b) => {
    const pa = pairKeyOf(a);
    const pb = pairKeyOf(b);
    if (pa !== pb) return pa < pb ? -1 : 1;
    const oa = sortOrderOf(a);
    const ob = sortOrderOf(b);
    if (oa !== ob) return oa - ob;
    return newestFirst(a, b);
  });
};

/** One entry per sample across every (project, test_key) pair in the list. */
export const collectSamples = (rows: TestResultSampleRow[]): AssembledSample[] => {
  const samples: AssembledSample[] = [];
  for (const row of selectSampleRows(rows)) {
    for (const raw of readSampleRecords(row)) {
      if (!isObject(raw)) continue;
      const record = raw as unknown as AtterbergRecord;
      samples.push({
        row,
        resultId: rowIdOf(row) ?? 0,
        sampleKey: sampleKeyOf(row) || recordField(record, "id"),
        label: readString(row.sample_label) || recordField(record, "label"),
        depth: readString(row.sample_depth) || recordField(record, "sampleNumber"),
        record,
      });
    }
  }
  return samples;
};

/** The records for the form, in stored order, from either storage shape. */
export const assembleRecords = (rows: TestResultSampleRow[]): AtterbergRecord[] =>
  collectSamples(rows)
    .map((sample) => sample.record)
    .filter((record): record is AtterbergRecord => record !== null);

