# Spec — `test_results` holds one row per Atterberg sample

**Status:** approved design, not yet implemented.
**Design:** D1 — add columns to `test_results` only. No new tables, no `api.php` change.
**Runbook:** [`../migrate_atterberg_samples.sql`](../migrate_atterberg_samples.sql)

---

## 1. Problem

`test_results` stores one row per `(project, test_key)`. For Atterberg that single row's
`payload_json.project.records[]` array holds *every* sample (borehole × depth) for the
project, so a project with 13 samples is one row.

`TestResults.tsx` reads only `records[0]` (`getFirstRecord`, lines 99–105, used at line
135), so the list shows **one row per project** and the remaining samples are invisible.

| | |
|---|---|
| Projects | 21 |
| `test_results` rows | 19 (all `test_key = 'atterberg'`) |
| Samples inside those rows | **106** |
| Rows the UI shows | 19 |

Project 19 alone holds 13 samples across 4 boreholes, all collapsed behind a single row
labelled `BH01`.

All figures are measured from `database/normalized.sql` (a dump taken after the duplicate
cleanup completed, so they reflect a known-good state), not estimated.

## 2. Constraints found in `api.php`

These drive the design and were confirmed by reading the code:

1. **`ALLOWED_TABLES` is a hardcoded PHP allowlist** (`api.php:212-225`). A new table name
   would require editing and manually uploading `api.php` to cPanel — it is *not* deployed
   by Render. D1 avoids this entirely.
2. **There are no transactions anywhere in `api.php`** — no `begin_transaction`, `commit`
   or `rollback`. Every write is an independent request, so a multi-row save is
   **non-atomic** and can leave partial data. This is the biggest risk and shapes the save
   algorithm.
3. **`list` joins `projects` only for `test_results`** (`api.php:900-903`), so
   `project_name` arrives free there and nowhere else.
4. **Ownership** — `update` enforces `user_id` match only when the column exists.
   `atterberg_instances` / `atterberg_rows` have no `user_id`, so they would rely solely
   on `user_allowed_tables`.
5. **MySQL NULL semantics** — a unique index permits unlimited `NULL`s. A nullable sample
   key would silently void the uniqueness guarantee for grading and proctor.
6. **Latent bug** — `api.php:1010` logs the Atterberg audit row on **create only**. Now
   that saves are updates, audit rows are no longer written. Unrelated to this work but
   worth fixing.

## 3. Schema

One statement. MySQL 8 applies DDL atomically per statement.

```sql
ALTER TABLE `test_results`
  ADD COLUMN `sample_key`   varchar(120) NOT NULL DEFAULT ''  AFTER `test_key`,
  ADD COLUMN `sample_label` varchar(100)          DEFAULT NULL AFTER `sample_key`,
  ADD COLUMN `sample_depth` varchar(60)           DEFAULT NULL AFTER `sample_label`,
  ADD COLUMN `sort_order`   int UNSIGNED NOT NULL DEFAULT 0   AFTER `data_points`,
  DROP INDEX `uq_test_results_project_test_key`,
  ADD UNIQUE KEY `uq_test_results_project_test_sample` (`project_id`, `test_key`, `sample_key`);
```

### Column semantics

| Column | Meaning |
|---|---|
| `sample_key` | the record's existing `id`, e.g. `record-1780395331712-1as0ch`. **`''` for single-sample tests.** Never derived from label text |
| `sample_label` | borehole, display only |
| `sample_depth` | `sampleNumber`, display only |
| `sort_order` | record index, preserves form order |
| `data_points` | **unchanged** — project aggregate, denormalised onto each sample row |
| `key_results_json` | **unchanged** — project aggregate, denormalised |
| `status` | **unchanged** — project-level |
| `payload_json` | `project.records` becomes a **one-element array** |

### Why `sample_key` is the record id

The live data spells the same boreholes four different ways: `BH01`, `BH1`, `BH 03`,
`BHO1`. Label + depth is not unique either — project 19 holds `BH01` at `0.0-3.0` **and**
`BH01` at `7.5-10.0`. The record `id` already exists in the payload, is stable, and is
unique, so a save can distinguish "same sample, edited" from "new sample".

### Why the payload keeps its shape

Reducing `records` to a one-element array means `extractAtterbergPayload`, the PDF
generator and the print sheet need **no change at all**. The client re-assembles the full
array on load.

### Why the aggregates are denormalised

`data_points` is a project total. Measured against the payloads, it equals
`SUM(startedDataPoints)` for all 16 completed projects; only the three **in-progress**
projects (12, 23, 24) differ, because started exceeds valid there. Copying the aggregate
onto every sample row keeps reports byte-identical to today and needs no recompute path.
The cost is 106 copies of one number, guarded by the health check in the runbook.

*Alternative considered:* per-sample `data_points` with the total as `SUM`. Deferred — the
list does not display it, and `key_results_json` is inherently project-level.

## 4. Migration

Full step-by-step SQL, with expected results and rollback, is in
`migrate_atterberg_samples.sql`. Order of work:

1. **STEP 0–1** — pre-flight and record the per-project sample baseline (106).
2. **STEP 2** — the single `ALTER`.
3. **STEP 3** — back up the 19 project-level rows. Must sit *outside* the transaction
   because `CREATE TABLE … AS SELECT` is DDL and forces an implicit commit.
4. **STEP 4** — backfill 106 rows with `JSON_TABLE` (MySQL 8.0.36), inside a transaction.
5. **STEP 5** — six verification queries, still inside the transaction.
6. **STEP 6** — delete the 19 originals, then `COMMIT`.
7. **STEP 7** — final verification.

The 106 new rows coexist with the 19 originals because their `sample_key` is non-empty
while the originals hold `''`, so the unique key cannot collide during the window.

**Check 6 is the safety net.** For every backed-up row it counts how many of *its* samples
landed in the new rows and compares that with how many it had. Any output means samples are
missing, so do not commit. An earlier draft compared only the first record, which would have
missed a partial loss.

## 5. Rollout order — dual-read must ship first

There is a degraded window if the data is migrated before the code: the current app calls
`.find()` and would pick one of the 106 rows, seeing a one-element `records[]` and showing
a single sample.

1. Deploy **dual-read** code — if any row for the pair has a non-empty `sample_key`,
   assemble from all sample rows; otherwise fall back to the legacy array. When the column
   does not exist yet `row.sample_key` is `undefined` and the legacy path is taken, so both
   states are handled correctly.
2. Run the migration. The app keeps working throughout.
3. Switch **writes** to the per-sample diff.
4. Remove the legacy branch in a later commit.

## 6. Application changes

| Area | Change |
|---|---|
| `TestResults.tsx` | One row per `test_results` row. Show `sample_label` **and** `sample_depth` — label alone is ambiguous. Dedup key becomes `(project_id, test_key, sample_key ?? '')`. Header reads "106 samples across 19 projects" |
| `AtterbergTest.tsx` load | Load **all** sample rows for the project, order by `sort_order`, merge into `records[]` |
| `AtterbergTest.tsx:318` | Honour `?resultId=` and focus that sample. It currently reads neither `resultId` nor `sampleKey`, a pre-existing gap |
| `AtterbergTest` save | Diff by `sample_key`: update matches → create new → **delete last**, so a mid-save failure never loses data. A create rejected by the unique key falls back to update (already built). Write the project aggregate in the same pass. Never fail the save for a cleanup error (existing pattern) |
| `ProjectOverview.tsx` | Sample counts, not project counts |
| `jsonExporter.ts`, PDF, print sheet | **unchanged** |
| `api.php` | optional: fire the audit log on update as well as create |


## 7. Test plan

- Backfill maps 106 rows; per-project counts match the baseline; every original payload is
  byte-recoverable from the combined sample rows.
- A single-sample test still yields exactly one row with `sample_key = ''` (regression).
- Diff-save: add a sample → 1 create; edit → 1 update and 0 creates; remove → 1 delete with
  no orphan.
- Reconciliation order: `sample_key` → `label` + `sampleNumber` → position.
- `?resultId=` opens and focuses the right sample.
- Simulated mid-save failure: no data loss, only extra rows that the next save reconciles.
- `npx tsc -p tsconfig.app.json --noEmit` · `npx vitest run` · `npx vite build`.

## 8. Risks

| Risk | Mitigation |
|---|---|
| Save is non-atomic | deletes last; idempotent retry; verify-then-repair |
| Duplicates return | `NOT NULL DEFAULT ''` + triple unique key + create→update fallback |
| Backfill loses a payload | backup first, check 6 before commit, documented rollback |
| Aggregates diverging across 106 rows | single writer; health-check query in the runbook |
| `data_points` / `status` meaning shift | kept project-level and denormalised — no change |

## 9. Deferred

- **Dropping `atterberg_instances` / `atterberg_rows`.** Both exist with
  `UNIQUE (project_id, borehole_id)` and hold 0 rows. That model is one row per *borehole*
  with only `(depth, ll, pl)`, which cannot hold the per-test trials the app records
  (penetration, container wet/dry/tare masses, initial and final length). That is almost
  certainly why it was never used. Dropping it is a separate tidy-up that would also touch
  `ALLOWED_TABLES`, `user_allowed_tables` (ids 4, 5) and `UserManagement.tsx`.
- `api.php` audit-on-update fix.
- Borehole label normalisation — affects report headings.
- Per-sample valid data points.

## 10. Honest cost

This is a schema change, a backfill, a read-path rewrite and a save-path rewrite, with a
dual-read transition. It costs materially more than the display-only alternative of
flattening `records[]` for the list, which produces the same 106 visible rows for a fraction
of the risk.

The reason to do it anyway is **queryability**: per-borehole reporting, per-sample status,
and a list whose rows map to real database rows. That is a legitimate goal — it just should
not be undertaken for the visual alone.

