-- =============================================================================
--  Duplicate test_results cleanup  (Density/Moisture Content Relationship)
--  Cransfield Geotechnical Lab
-- =============================================================================
--
--  WHY THIS EXISTS
--  --------------
--  api.php opens the connection with a plain `new mysqli(...)` (no
--  MYSQLI_OPT_INT_AND_FLOAT_NATIVE) and hydrateRow() only JSON-decodes the
--  `*_json` columns. Every other column therefore reaches the browser as a
--  STRING, while the TypeScript row types declared `number`.
--
--  Three comparisons mixed a string field with a number, so they were always
--  false:
--     AtterbergTest  row.project_id === projectRow.id  -> the cleanup that was
--                    supposed to delete the previous row deleted nothing
--     GradingTest    row.id === selectedResultId      -> ?resultId= never matched
--     GradingTest    row.id === targetResultId        -> "Clear" was a no-op
--
--  On top of that the Atterberg save path always INSERTed a new row instead of
--  updating, and migrate_atterberg_constraint.php had dropped the
--  uq_test_results_project_test_key unique index.
--
--  Net effect: every save added another row, permanently.
--
--  WHAT THE DUMP SHOWED
--  -------------------
--    63 test_results rows, all of them test_key = 'atterberg'
--    19 distinct (project, test) pairs  ->  17 pairs held duplicates
--    44 rows are redundant
--    0 pairs where the newest row held fewer samples than a row being deleted
--
--  RUN ORDER
--  ---------
--  Run the steps one at a time and check the stated expected result before
--  moving on. Steps 0-4 are read-only or additive. Step 5 is the only
--  destructive one and it is wrapped in a transaction you can inspect before
--  committing.
--
--  WARNING  Step 6 (ALTER TABLE) CAUSES AN IMPLICIT COMMIT IN MYSQL.
--           It must be a separate statement, NOT inside the Step 5 transaction.
--
--  WARNING  Step 6 will FAIL if any duplicate survived Step 5. That is a
--           safety net, not a problem to work around - re-check Step 5.
-- =============================================================================


-- =============================================================================
-- STEP 0  Is a cleanup actually needed?
-- Expect: total_rows = 63, distinct_projects = 19
-- If total_rows already equals distinct_projects, Steps 1-5 are no-ops.
-- =============================================================================
SELECT COUNT(*)                   AS total_rows,
       COUNT(DISTINCT project_id) AS distinct_projects
FROM `test_results`;


-- =============================================================================
-- STEP 1  Preview - which row survives, what gets deleted
-- Expect: 17 rows, and will_delete summing to 44
-- =============================================================================
SELECT
    t.project_id,
    t.test_key,
    COUNT(*)                 AS rows_now,
    SUM(t.id = k.keep_id)    AS will_keep,
    SUM(t.id <> k.keep_id)   AS will_delete
FROM `test_results` t
JOIN (
    SELECT
        project_id,
        test_key,
        CAST(RIGHT(
            MAX(CONCAT(DATE_FORMAT(updated_at, '%Y%m%d%H%i%s'), LPAD(id, 12, '0'))),
            12
        ) AS UNSIGNED) AS keep_id
    FROM `test_results`
    WHERE project_id IS NOT NULL
    GROUP BY project_id, test_key
    HAVING COUNT(*) > 1
) k ON k.project_id = t.project_id AND k.test_key = t.test_key
GROUP BY t.project_id, t.test_key
ORDER BY t.project_id;

-- Row-level detail, so you can eyeball exactly what the keeper rule picks.
-- Rule: keep the newest updated_at; ties broken by the highest id.
SELECT
    t.id, t.project_id, t.test_key, t.status, t.data_points, t.updated_at,
    CASE WHEN t.id = k.keep_id THEN 'KEEP' ELSE 'DELETE' END AS action
FROM `test_results` t
JOIN (
    SELECT
        project_id,
        test_key,
        CAST(RIGHT(
            MAX(CONCAT(DATE_FORMAT(updated_at, '%Y%m%d%H%i%s'), LPAD(id, 12, '0'))),
            12
        ) AS UNSIGNED) AS keep_id
    FROM `test_results`
    WHERE project_id IS NOT NULL
    GROUP BY project_id, test_key
    HAVING COUNT(*) > 1
) k ON k.project_id = t.project_id AND k.test_key = t.test_key
ORDER BY t.project_id, t.updated_at DESC, t.id DESC;


-- =============================================================================
-- STEP 2  Data-loss check  (requires MySQL 5.7+)
-- Expect: no output at all.
--   If any DELETE row holds more samples than its KEEP row, STOP and merge
--   that project by hand. Keeping the newest row would discard real samples.
-- =============================================================================
SELECT
    t.project_id,
    t.test_key,
    JSON_LENGTH(JSON_EXTRACT(t.payload_json, '$.project.records')) AS samples,
    t.id,
    t.updated_at,
    CASE WHEN t.id = k.keep_id THEN 'KEEP' ELSE 'DELETE' END AS action
FROM `test_results` t
JOIN (
    SELECT
        project_id,
        test_key,
        CAST(RIGHT(
            MAX(CONCAT(DATE_FORMAT(updated_at, '%Y%m%d%H%i%s'), LPAD(id, 12, '0'))),
            12
        ) AS UNSIGNED) AS keep_id
    FROM `test_results`
    WHERE project_id IS NOT NULL
    GROUP BY project_id, test_key
    HAVING COUNT(*) > 1
) k ON k.project_id = t.project_id AND k.test_key = t.test_key
ORDER BY t.project_id, samples DESC;


-- =============================================================================
-- STEP 3  Audit cascade preview  (read-only)
-- atterberg_save_audit.test_result_id -> test_results(id) ON DELETE CASCADE,
-- so deleting test_results rows also removes the matching audit rows.
-- Expect: 46 on this database
-- =============================================================================
SELECT COUNT(*) AS audit_rows_will_be_cascaded
FROM `atterberg_save_audit` a
JOIN `test_results` t ON t.id = a.test_result_id
WHERE t.id NOT IN (
    SELECT CAST(RIGHT(keep_key, 12) AS UNSIGNED)
    FROM (
        SELECT MAX(CONCAT(DATE_FORMAT(updated_at, '%Y%m%d%H%i%s'), LPAD(id, 12, '0'))) AS keep_key
        FROM `test_results`
        WHERE project_id IS NOT NULL
        GROUP BY project_id, test_key
        HAVING COUNT(*) > 1
    ) AS keepers
);


-- =============================================================================
-- STEP 4  Backup  (creates a table; does not touch test_results)
-- Expect: 44
-- This is the rollback path. Do not drop it until you are satisfied.
-- =============================================================================
CREATE TABLE `test_results_dedupe_backup` AS
SELECT t.*
FROM `test_results` t
JOIN (
    SELECT
        project_id,
        test_key,
        CAST(RIGHT(
            MAX(CONCAT(DATE_FORMAT(updated_at, '%Y%m%d%H%i%s'), LPAD(id, 12, '0'))),
            12
        ) AS UNSIGNED) AS keep_id
    FROM `test_results`
    WHERE project_id IS NOT NULL
    GROUP BY project_id, test_key
    HAVING COUNT(*) > 1
) k ON k.project_id = t.project_id AND k.test_key = t.test_key
WHERE t.id <> k.keep_id;

SELECT COUNT(*) AS backed_up_rows FROM `test_results_dedupe_backup`;


-- =============================================================================
-- STEP 5  Delete the redundant rows  (inside a transaction)
-- Expect: 44 rows affected, test_results down to 19 rows
--
-- The extra nesting of the derived table avoids MySQL error 1093
-- ("You can't specify target table for update in FROM clause").
--
-- The two verification SELECTs run BEFORE the COMMIT. Read them: only
-- commit if rows_left = 19 and the second query returns no rows.
-- =============================================================================
START TRANSACTION;

DELETE t
FROM `test_results` t
JOIN (
    SELECT project_id, test_key, keep_key
    FROM (
        SELECT
            project_id,
            test_key,
            MAX(CONCAT(DATE_FORMAT(updated_at, '%Y%m%d%H%i%s'), LPAD(id, 12, '0'))) AS keep_key
        FROM `test_results`
        WHERE project_id IS NOT NULL
        GROUP BY project_id, test_key
        HAVING COUNT(*) > 1
    ) AS inner_k
) AS k
  ON k.project_id = t.project_id
 AND k.test_key  = t.test_key
 AND CONCAT(DATE_FORMAT(t.updated_at, '%Y%m%d%H%i%s'), LPAD(t.id, 12, '0')) < k.keep_key;

-- check 1: expect 19
SELECT COUNT(*) AS rows_left FROM `test_results`;

-- check 2: expect NO rows returned
SELECT project_id, test_key, COUNT(*) AS c
FROM `test_results`
GROUP BY project_id, test_key
HAVING c > 1;

COMMIT;


-- =============================================================================
-- STEP 6  Re-add the unique index so this cannot happen again
--
-- WARNING  MUST BE ITS OWN STATEMENT. ALTER TABLE triggers an implicit commit,
--          so it cannot run inside the Step 5 transaction.
-- WARNING  This cannot be rolled back. Run it only after Step 5 is confirmed.
-- WARNING  It will FAIL if any duplicate survived - that is intentional.
-- =============================================================================
ALTER TABLE `test_results`
  ADD UNIQUE KEY `uq_test_results_project_test_key` (`project_id`, `test_key`);


-- =============================================================================
-- STEP 7  Final verification
-- Expect: total_rows = 19, no duplicate pairs, Non_unique = 0
-- =============================================================================
SELECT COUNT(*) AS total_rows FROM `test_results`;                -- expect 19

SELECT project_id, test_key, COUNT(*) AS c
FROM `test_results`
GROUP BY project_id, test_key
HAVING c > 1;                                                     -- expect 0 rows

SHOW INDEX FROM `test_results`
WHERE Key_name = 'uq_test_results_project_test_key';              -- expect Non_unique = 0


-- =============================================================================
-- ROLLBACK  (only if you have NOT yet run Step 6)
-- Restores the 44 deleted rows from the Step 4 backup.
-- =============================================================================
-- INSERT INTO `test_results` (`id`, `user_id`, `project_id`, `test_key`, `name`,
--     `category`, `status`, `data_points`, `key_results_json`, `payload_json`,
--     `created_at`, `updated_at`, `last_saved_at`)
-- SELECT * FROM `test_results_dedupe_backup`;


-- =============================================================================
-- CLEANUP  (only once you are happy with the result)
-- =============================================================================
-- DROP TABLE `test_results_dedupe_backup`;


-- =============================================================================
-- NOTE ON SCOPE
-- ------------
-- The unique index enforces ONE row per (project, test_key).
--
--   Atterberg  - correct as-is. Multiple samples for a project live inside the
--                one row as payload_json.project.records[] (the "Add Record"
--                button). All 19 surviving rows are Atterberg.
--   Grading / Proctor - one sample per row, and the UI can only open the
--                newest row for a project. So the index matches today's
--                behaviour, but if you ever need several PSDs or compaction
--                tests in one project (one per borehole), the key would need
--                to include a sample identifier, e.g.
--                UNIQUE (project_id, test_key, sample_key).
-- =============================================================================

