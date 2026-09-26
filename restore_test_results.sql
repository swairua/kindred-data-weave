-- ############################################################################
--  restore_test_results.sql
--
--  RECOVERY for the migrate_atterberg_samples.sql incident of 2026-09-26.
--
--  WHAT HAPPENED
--  -------------
--  The backfill was submitted inside START TRANSACTION ... without a COMMIT.
--  phpMyAdmin closes the MySQL connection at the end of each submission, and
--  InnoDB rolls back an open transaction when the connection closes. So the
--  106 rows reported as "inserted" were discarded before the next submission
--  read them - check 1 correctly reported 0.
--
--  The 19 original rows were then deleted, because the DELETE and its COMMIT
--  were in the same submission and therefore did persist. test_results ended
--  up empty.
--
--  Check 6 caught it: it reported migrated_samples = 0 for all 19 backup rows.
--  That check is the reason this is recoverable rather than a data loss.
--
--  THE GOOD NEWS
--  -------------
--  Nothing is lost. test_results_sample_migration_backup holds all 19 rows
--  with their complete payloads - all 106 samples between them. This script
--  puts them back.
--
--  HOW TO RUN
--  ----------
--  phpMyAdmin -> SQL tab -> paste ONE STEP AT A TIME. Every step here is
--  autocommit; there is deliberately no transaction (see the warning in
--  migrate_atterberg_samples.sql).
-- ############################################################################


-- =============================================================================
-- STEP R1  Confirm the backup is intact BEFORE writing anything
-- Expect: 19 rows and 106 samples
-- =============================================================================
SELECT COUNT(*) AS backup_rows
FROM `test_results_sample_migration_backup`;

SELECT COUNT(*) AS total_samples
FROM `test_results_sample_migration_backup`
WHERE `test_key` = 'atterberg'
  AND JSON_LENGTH(JSON_EXTRACT(`payload_json`, '$.project.records')) > 0;

-- If STEP R1 does not report 19 and 106, STOP. The backup is the only copy.


-- =============================================================================
-- STEP R2  Confirm test_results really is empty
-- Expect: 0
-- =============================================================================
SELECT COUNT(*) AS total_rows FROM `test_results`;


-- =============================================================================
-- STEP R3  Restore the 19 rows
--
-- The backup was taken after the STEP 2 ALTER, so it already carries
-- sample_key / sample_label / sample_depth / sort_order, and every row has
-- sample_key = ''. That is exactly the pre-migration shape the app already
-- reads correctly, so the restored table is the same as before the attempt.
--
-- The unique key (project_id, test_key, sample_key) is satisfied: one row per
-- project with sample_key = ''.
--
-- Expect: "19 row(s) affected"
-- =============================================================================
INSERT INTO `test_results`
  (`id`, `user_id`, `project_id`, `test_key`, `sample_key`, `sample_label`, `sample_depth`,
   `name`, `category`, `status`, `data_points`, `sort_order`,
   `key_results_json`, `payload_json`, `created_at`, `updated_at`, `last_saved_at`)
SELECT
  `id`, `user_id`, `project_id`, `test_key`, `sample_key`, `sample_label`, `sample_depth`,
  `name`, `category`, `status`, `data_points`, `sort_order`,
  `key_results_json`, `payload_json`, `created_at`, `updated_at`, `last_saved_at`
FROM `test_results_sample_migration_backup`;


-- =============================================================================
-- STEP R4  Verify the restore
--
-- 1. expect 19
-- =============================================================================
SELECT COUNT(*) AS total_rows FROM `test_results`;

-- 2. expect 19 projects and 106 samples - this must match STEP R1
SELECT
    COUNT(*)                                                          AS project_rows,
    SUM(JSON_LENGTH(JSON_EXTRACT(`payload_json`, '$.project.records')))
                                                                      AS total_samples
FROM `test_results`
WHERE `test_key` = 'atterberg';

-- 3. expect no rows: nothing should carry a sample_key yet
SELECT COUNT(*) AS rows_with_a_sample_key
FROM `test_results`
WHERE `sample_key` <> '';

-- 4. expect 19 rows, all with sample_key = '' and sort_order = 0
SELECT `id`, `project_id`, `sample_key`, `sort_order`
FROM `test_results`
ORDER BY `project_id`;

-- 5. expect NO rows
SELECT `project_id`, `test_key`, `sample_key`, COUNT(*) AS c
FROM `test_results`
GROUP BY `project_id`, `test_key`, `sample_key`
HAVING c > 1;


-- =============================================================================
-- AFTER R4
-- =============================================================================
--  The app is back to normal: the Test Records list shows all 106 samples
--  across the 19 projects, because the dual-read build expands a single
--  project row into one entry per sample.
--
--  Keep test_results_sample_migration_backup until the migration is redone
--  successfully.
--
--  To attempt the migration again, use migrate_atterberg_samples.sql, which
--  no longer uses START TRANSACTION. The essential habit is: after STEP 4,
--  re-run STEP 5 check 1 in a NEW submission and confirm it reports 106
--  before running anything else.
