-- ############################################################################
--  migrate_atterberg_samples.sql
--  Give every Atterberg sample its own test_results row.
-- ############################################################################
--
--  WHY
--  ---
--  test_results currently stores ONE row per (project, test_key). For
--  Atterberg that row's payload_json.project.records[] holds every sample
--  (borehole x depth) for the project, so a project with 13 samples is a
--  single row. Test Results therefore shows 19 rows for 21 projects and
--  hides 87 samples: TestResults.tsx reads records[0] only.
--
--  This script splits each project row into one row per sample.
--
--  MEASURED BASELINE (from database/normalized.sql, a dump taken after the
--  duplicate cleanup, so the numbers are known-good):
--
--      projects                21
--      test_results rows       19   (all test_key = 'atterberg')
--      samples inside them    106
--      after this migration   106 rows in test_results
--
--  Per-project sample counts to check against in STEP 1/STEP 7:
--      12=3   13=3   14=4   15=2   16=2   18=11  19=13  20=3   21=6
--      22=10  23=13  24=9   25=7   26=2   27=3   28=3   29=3   30=2
--      31=7                                                            total 106
--
--  WHAT CHANGES
--  -----------
--    + sample_key    varchar(120) NOT NULL DEFAULT ''   (record id, or '' for
--                                                      single-sample tests)
--    + sample_label  varchar(100)   borehole, display only
--    + sample_depth  varchar(60)    sampleNumber, display only
--    + sort_order    int UNSIGNED   record order
--    ~ uq_test_results_project_test_key (project_id, test_key)
--      becomes
--      uq_test_results_project_test_sample (project_id, test_key, sample_key)
--
--  sample_key is NOT NULL DEFAULT '' and never NULL on purpose: MySQL allows
--  unlimited NULLs inside a unique index, so a nullable column would silently
--  remove the uniqueness guarantee for grading/proctor rows.
--
--  NO api.php CHANGE IS NEEDED. test_results is already in ALLOWED_TABLES and
--  api.php already joins projects for it, so project_name keeps working.
--
--  ---------------------------------------------------------------------------
--  ORDER OF WORK (do not reorder)
--  ---------------------------------------------------------------------------
--    1. Deploy the dual-read application build. The current app calls
--       .find() on the list and would pick one of the new 106 rows, showing a
--       single sample. Shipping dual-read first means the app is already
--       tolerant of both shapes and the database change can happen live.
--    2. Run STEP 0 to STEP 7 of this file.
--    3. Later, switch writes to per-sample and remove the legacy branch.
--
--  ---------------------------------------------------------------------------
--  HOW TO RUN
--  ---------------------------------------------------------------------------
--  phpMyAdmin -> SQL tab -> paste ONE STEP AT A TIME -> read the stated
--  expected result before continuing. Do not paste the whole file.
--
--  ####################################################################
--  ##  DO NOT USE START TRANSACTION / COMMIT IN phpMyAdmin.             ##
--  ##                                                                  ##
--  ##  phpMyAdmin runs each submission and then closes the MySQL        ##
--  ##  connection. An open transaction is rolled back when that          ##
--  ##  connection closes, so a "BEGIN ... INSERT" batch is silently      ##
--  ##  UNDONE before you can see the result. The next submission then   ##
--  ##  reports the old row count, and if you keep going you delete the  ##
--  ##  originals with nothing to replace them.                          ##
--  ##                                                                  ##
--  ##  This file therefore uses AUTOCOMMIT only. The backup table is the ##
--  ##  safety net, and STEP 4b explicitly undoes the backfill if a check  ##
--  ##  fails. That is more robust here than a transaction, because        ##
--  ##  nothing here can half-apply.                                       ##
--  ####################################################################
--
--  STEP 2 is the only DDL. It is a single ALTER, so MySQL 8 applies it
--  atomically.
--
--  A full ROLLBACK is at the end of this file. Keep
--  test_results_sample_migration_backup until you are satisfied.
-- ############################################################################

-- =============================================================================
-- STEP 0  Pre-flight - is there anything to migrate?
-- Expect: total_rows = 19, atterberg_rows = 19, sample_rows = 0
--         (sample_key does not exist yet, so sample_rows is reported as 0)
-- If total_rows is already 106, this migration has been run - stop.
-- =============================================================================
SELECT
    COUNT(*)                                                  AS total_rows,
    SUM(test_key = 'atterberg')                               AS atterberg_rows,
    SUM(payload_json IS NOT NULL
        AND JSON_LENGTH(JSON_EXTRACT(payload_json, '$.project.records')) > 0)
                                                            AS projects_with_samples
FROM `test_results`;


-- =============================================================================
-- STEP 1  Record the per-project sample baseline
-- Expect: the 19 rows below, summing to 106
-- Write the result down - STEP 7 compares against it.
-- =============================================================================
SELECT
    tr.`project_id`,
    COUNT(*)                                                       AS row_count,
    SUM(JSON_LENGTH(JSON_EXTRACT(tr.`payload_json`, '$.project.records')))
                                                                    AS samples,
    SUM(tr.`data_points`)                                          AS data_points
FROM `test_results` tr
WHERE tr.`test_key` = 'atterberg'
GROUP BY tr.`project_id`
ORDER BY tr.`project_id`;

-- Sanity: the total must be 106. If it is not, STOP and report the number.
SELECT
    COUNT(*)                                                          AS project_rows,
    SUM(JSON_LENGTH(JSON_EXTRACT(tr.`payload_json`, '$.project.records')))
                                                                      AS total_samples
FROM `test_results` tr
WHERE tr.`test_key` = 'atterberg';


-- =============================================================================
-- STEP 2  Schema change (the only DDL - single atomic ALTER, implicit commit)
--
-- Adds the four sample columns and swaps the unique key.
--   sample_key NOT NULL DEFAULT '' keeps the current one-row-per-project
--   guarantee for grading and proctor, which have no samples.
--
-- Expect: success. This is safe to re-run - MySQL errors with "Duplicate
--         column name" / "Duplicate key name" if it already ran.
-- =============================================================================
ALTER TABLE `test_results`
  ADD COLUMN `sample_key`   varchar(120) NOT NULL DEFAULT ''  AFTER `test_key`,
  ADD COLUMN `sample_label` varchar(100)          DEFAULT NULL AFTER `sample_key`,
  ADD COLUMN `sample_depth` varchar(60)           DEFAULT NULL AFTER `sample_label`,
  ADD COLUMN `sort_order`   int UNSIGNED NOT NULL DEFAULT 0   AFTER `data_points`,
  DROP INDEX `uq_test_results_project_test_key`,
  ADD UNIQUE KEY `uq_test_results_project_test_sample` (`project_id`, `test_key`, `sample_key`);

-- Verify: expect 0 rows (every existing row has the '' placeholder)
SELECT COUNT(*) AS rows_with_a_sample_key
FROM `test_results`
WHERE `sample_key` <> '';


-- =============================================================================
-- STEP 3  Back up the 19 project-level rows (must be OUTSIDE the transaction)
--
-- CREATE TABLE ... AS SELECT is DDL, so it forces an implicit commit. That is
-- why the backup cannot live inside the STEP 4 transaction.
--
-- Expect: 19 rows. This is the rollback path - do not drop it.
-- =============================================================================
CREATE TABLE `test_results_sample_migration_backup` AS
SELECT *
FROM `test_results`
WHERE `test_key` = 'atterberg'
  AND `sample_key` = '';

SELECT COUNT(*) AS backup_rows FROM `test_results_sample_migration_backup`;


-- =============================================================================
-- STEP 4  Backfill one row per sample  (AUTOCOMMIT - no BEGIN, no COMMIT)
--
-- JSON_TABLE walks payload_json.project.records[] and emits one output row per
-- sample, carrying the project's columns through unchanged.
--
--   sample_key   = the record's own id, e.g. record-1780395331712-1as0ch.
--                  This is stable and unique, which is why it is used instead
--                  of the borehole label: the live data contains BH01, BH1,
--                  "BH 03" and BHO1 for what are clearly the same holes.
--                  The fallback only matters for a payload with no record id.
--   sort_order   = ORDINALITY, i.e. the sample's position in the form.
--   payload_json = the SAME project envelope, but with records reduced to a
--                  ONE-ELEMENT array. extractAtterbergPayload and the PDF
--                  path therefore need no change at all.
--   data_points / key_results_json / status are copied verbatim, so every
--   sample row carries the project aggregate. That is deliberate: it keeps the
--   reports byte-identical to today.
--
-- These 106 new rows coexist with the 19 originals because their sample_keys
-- are non-empty while the originals hold ''. Nothing is overwritten, so if the
-- STEP 5 checks fail, run STEP 4b and you are back where you started.
--
-- Expect: "106 rows inserted."  Then IMMEDIATELY re-run check 1 below in its
-- own submission - it must report 106. If it reports 0, the insert did not
-- stick and you must stop.
-- =============================================================================
INSERT INTO `test_results`
  (`user_id`, `project_id`, `test_key`, `sample_key`, `sample_label`, `sample_depth`,
   `name`, `category`, `status`, `data_points`, `key_results_json`, `payload_json`,
   `created_at`, `updated_at`, `sort_order`)
SELECT
  tr.`user_id`,
  tr.`project_id`,
  tr.`test_key`,
  COALESCE(
    JSON_UNQUOTE(JSON_EXTRACT(r.rec, '$.id')),
    CONCAT('legacy-', tr.`id`, '-', r.ord)
  ),
  JSON_UNQUOTE(JSON_EXTRACT(r.rec, '$.label')),
  JSON_UNQUOTE(JSON_EXTRACT(r.rec, '$.sampleNumber')),
  tr.`name`,
  tr.`category`,
  tr.`status`,
  tr.`data_points`,
  tr.`key_results_json`,
  JSON_OBJECT(
    'exportDate', JSON_EXTRACT(tr.`payload_json`, '$.exportDate'),
    'version',    JSON_EXTRACT(tr.`payload_json`, '$.version'),
    'project', JSON_OBJECT(
      'title',       JSON_EXTRACT(tr.`payload_json`, '$.project.title'),
      'projectName', JSON_EXTRACT(tr.`payload_json`, '$.project.projectName'),
      'clientName',  JSON_EXTRACT(tr.`payload_json`, '$.project.clientName'),
      'date',        JSON_EXTRACT(tr.`payload_json`, '$.project.date'),
      'records',     JSON_ARRAY(r.rec)
    )
  ),
  tr.`created_at`,
  tr.`updated_at`,
  r.ord
FROM `test_results` tr
JOIN JSON_TABLE(
        tr.`payload_json`,
        '$.project.records[*]' COLUMNS (ord FOR ORDINALITY, rec JSON PATH '$')
     ) r
WHERE tr.`test_key` = 'atterberg'
  AND tr.`sample_key` = '';


-- -----------------------------------------------------------------------------
-- STEP 4b  UNDO the backfill - run this if ANY check in STEP 5 fails, or if
-- check 1 does not report 106.
--
-- The 19 originals were never modified, so deleting the 106 rows returns the
-- table to exactly its pre-STEP-4 state. Nothing is lost by running this.
--
-- Expect: "106 row(s) affected", then total_rows back to 19.
-- -----------------------------------------------------------------------------
-- DELETE FROM `test_results` WHERE `sample_key` <> '';
--
-- SELECT COUNT(*) AS total_rows FROM `test_results`;                    -- expect 19
-- SELECT COUNT(*) AS rows_holding_samples
--   FROM `test_results` WHERE `test_key` = 'atterberg'
--   AND JSON_LENGTH(JSON_EXTRACT(`payload_json`, '$.project.records')) > 0;


-- -----------------------------------------------------------------------------
-- STEP 5  Verify BEFORE removing anything.
--
-- Check 1: expect 106
-- -----------------------------------------------------------------------------
SELECT COUNT(*) AS sample_rows FROM `test_results` WHERE `sample_key` <> '';

-- -----------------------------------------------------------------------------
-- Check 2: expect 125 (19 originals + 106 new)
-- -----------------------------------------------------------------------------
SELECT COUNT(*) AS total_rows FROM `test_results`;

-- -----------------------------------------------------------------------------
-- Check 3: expect NO rows. A sample_key collision would mean two rows for the
-- same sample, which is exactly the duplication this whole change removes.
-- -----------------------------------------------------------------------------
SELECT `project_id`, `test_key`, `sample_key`, COUNT(*) AS c
FROM `test_results`
GROUP BY `project_id`, `test_key`, `sample_key`
HAVING c > 1;

-- -----------------------------------------------------------------------------
-- Check 4: expect one row per project, and the counts must equal STEP 1
--   12=3  13=3  14=4  15=2  16=2  18=11 19=13 20=3  21=6
--   22=10 23=13 24=9  25=7  26=2  27=3  28=3  29=3  30=2  31=7
-- -----------------------------------------------------------------------------
SELECT `project_id`, COUNT(*) AS samples, SUM(`data_points`) AS data_points
FROM `test_results`
WHERE `sample_key` <> ''
GROUP BY `project_id`
ORDER BY `project_id`;

-- -----------------------------------------------------------------------------
-- Check 5: expect 106. Every new row must hold exactly ONE sample.
-- -----------------------------------------------------------------------------
SELECT COUNT(*) AS rows_not_holding_exactly_one_sample
FROM `test_results`
WHERE `sample_key` <> ''
  AND JSON_LENGTH(JSON_EXTRACT(`payload_json`, '$.project.records')) <> 1;

-- -----------------------------------------------------------------------------
-- Check 6: RECOVERABILITY - the important one. Expect NO rows.
-- For each backed-up project row, counts how many of ITS samples actually made
-- it into the new rows and compares that with how many it had. Anything at all
-- here means samples are missing, so do NOT commit: roll back instead.
-- (Comparing only the first record would miss a partial loss.)
-- -----------------------------------------------------------------------------
SELECT b.`id`                                                    AS backup_row_id,
       b.`project_id`,
       JSON_LENGTH(JSON_EXTRACT(b.`payload_json`, '$.project.records'))
                                                                  AS backup_samples,
       COUNT(n.`id`)                                             AS migrated_samples
FROM `test_results_sample_migration_backup` b
JOIN JSON_TABLE(b.`payload_json`, '$.project.records[*]'
        COLUMNS (migrated_key VARCHAR(120) PATH '$.id')) jt
LEFT JOIN `test_results` n
       ON n.`project_id` = b.`project_id`
      AND n.`test_key`   = b.`test_key`
      AND n.`sample_key` = jt.migrated_key
GROUP BY b.`id`, b.`project_id`
HAVING migrated_samples <> backup_samples;


-- =============================================================================
-- STEP 6  Remove the 19 project-level rows
--
-- Only do this once STEP 5 is completely clean. After this the originals are
-- gone from test_results; they remain in test_results_sample_migration_backup,
-- which is what makes this reversible.
--
-- There is no COMMIT: this runs in autocommit. That is deliberate, because a
-- transaction opened in one phpMyAdmin submission is rolled back when that
-- submission's connection closes - see the warning at the top of this file.
--
-- Expect: "19 row(s) affected", then 106.
-- =============================================================================
DELETE FROM `test_results`
WHERE `test_key` = 'atterberg'
  AND `sample_key` = '';

SELECT COUNT(*) AS total_rows FROM `test_results`;


-- =============================================================================
-- STEP 7  Final verification
-- =============================================================================
-- 1. expect 106
SELECT COUNT(*) AS total_rows FROM `test_results`;

-- 2. expect NO rows
SELECT `project_id`, `test_key`, `sample_key`, COUNT(*) AS c
FROM `test_results`
GROUP BY `project_id`, `test_key`, `sample_key`
HAVING c > 1;

-- 3. expect NO rows - the '' placeholder must be gone
SELECT COUNT(*) AS leftover_placeholder_rows
FROM `test_results`
WHERE `sample_key` = '';

-- 4. expect Non_unique = 0, and the three columns project_id/test_key/sample_key
SHOW INDEX FROM `test_results`
WHERE Key_name = 'uq_test_results_project_test_sample';


-- =============================================================================
-- ROLLBACK
--
-- Only valid if the application has NOT yet written sample rows of its own.
-- If the app has saved since the migration, roll FORWARD by restoring the
-- backup of whichever sample rows it overwrote instead.
--
-- Run in this order. The unique key must be swapped back before the original
-- '' rows can be inserted again, otherwise 19 rows would collide on
-- (project_id, test_key, sample_key = '').
-- =============================================================================
-- 1. drop the 106 sample rows
-- DELETE FROM `test_results` WHERE `sample_key` <> '';
--
-- 2. swap the unique key back
-- ALTER TABLE `test_results`
--   DROP INDEX `uq_test_results_project_test_sample`,
--   ADD UNIQUE KEY `uq_test_results_project_test_key` (`project_id`, `test_key`);
--
-- 3. restore the 19 original project-level rows
-- INSERT INTO `test_results`
--   (`id`,`user_id`,`project_id`,`test_key`,`name`,`category`,`status`,
--    `data_points`,`key_results_json`,`payload_json`,
--    `created_at`,`updated_at`,`last_saved_at`)
-- SELECT
--   `id`,`user_id`,`project_id`,`test_key`,`name`,`category`,`status`,
--   `data_points`,`key_results_json`,`payload_json`,
--   `created_at`,`updated_at`,`last_saved_at`
-- FROM `test_results_sample_migration_backup`;
--
-- 4. verify: expect 19
-- SELECT COUNT(*) AS total_rows FROM `test_results`;
--
-- 5. remove the added columns
-- ALTER TABLE `test_results`
--   DROP COLUMN `sample_key`,
--   DROP COLUMN `sample_label`,
--   DROP COLUMN `sample_depth`,
--   DROP COLUMN `sort_order`;
--
-- 6. only once satisfied
-- DROP TABLE `test_results_sample_migration_backup`;


-- =============================================================================
-- POST-MIGRATION HEALTH CHECK
--
-- data_points and key_results_json are the PROJECT aggregate, denormalised onto
-- every sample row. This query is the guard that they stay in agreement: it
-- lists any project whose samples disagree. Expect NO rows.
-- =============================================================================
SELECT `project_id`,
       COUNT(*)              AS sample_rows,
       COUNT(DISTINCT `data_points`)  AS distinct_data_points,
       COUNT(DISTINCT `key_results_json`) AS distinct_key_results,
       MIN(`data_points`)    AS data_points
FROM `test_results`
WHERE `sample_key` <> ''
GROUP BY `project_id`
HAVING distinct_data_points > 1 OR distinct_key_results > 1;


-- =============================================================================
-- NOTES
-- =============================================================================
--  SCOPE
--    Atterberg only. Grading, proctor, CBR, consolidation and shear are all
--    single-sample per project, so they keep sample_key = '' and continue to
--    get exactly one row per (project, test_key) - the guarantee the duplicate
--    cleanup established is preserved.
--
--  sample_key IS THE IDENTITY
--    It is the record id that already existed inside the payload, so a save can
--    tell "same sample, edited" from "new sample". Never rebuild it from the
--    borehole label: the live data contains BH01, BH1, "BH 03" and BHO1 for the
--    same holes, and label+depth is not unique either - project 19 holds
--    BH01 at 0.0-3.0 and BH01 at 7.5-10.0.
--
--  WHY THE AGGREGATE IS DENORMALISED
--    data_points is a project total. It was measured against the payloads:
--    it equals SUM(startedDataPoints) for all 16 completed projects, and only
--    the 3 in-progress projects (12, 23, 24) differ, because started exceeds
--    valid there. Copying it to every sample row keeps reports identical to
--    today and needs no recompute path.
--
--  api.php IS NOT INVOLVED
--    test_results is already in ALLOWED_TABLES, already joins projects for
--    project_name, and already filters by user_id. No PHP upload is required.
--
--  NOT USED: atterberg_instances, atterberg_rows
--    Both exist with a UNIQUE (project_id, borehole_id) and hold 0 rows. That
--    design is one row per BOREHOLE with only (depth, ll, pl), which cannot
--    hold the per-test trials (penetration, container masses, initial and
--    final length) that the app actually records. That is almost certainly why
--    it was never used. Left untouched; dropping it is a separate tidy-up that
--    would also touch ALLOWED_TABLES, user_allowed_tables and
--    UserManagement.tsx.
-- =============================================================================

