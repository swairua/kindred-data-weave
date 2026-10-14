-- =============================================================================
--  Normalize the live lab database (wayrusc1_labdatacraft)
--  Cransfield Geotechnical Lab
-- =============================================================================
--
--  WHY THIS EXISTS
--  --------------
--  A dump of the live database was diffed against what the app expects
--  (database/main.sql + migrate_*.sql). Findings:
--
--  Schema: live already carries every column the app needs (compressive_tests
--  .county/.lab_ref, the five projects detail columns, test_results sample_*
--  columns). Part 1 below only VERIFIES that — nothing to add. If any check
--  returns no rows, run the matching migration file instead
--  (migrate_compressive_county.sql, migrate_compressive_lab_ref.sql,
--  migrate_atterberg_samples.sql).
--
--  Data: exactly one invalid value was found across 110 test_results rows —
--  row id 407 (the compressive row for project 42) has status '', which is
--  not one of the enum's ('not-started','in-progress','completed') and can
--  break status badges and filters. Part 2 repairs it. The WHERE clause only
--  matches invalid statuses, so re-running this file changes nothing.
--
--  Deliberately NOT touched here:
--  - compressive_tests id 2 (project 42) and compressive_cubes id 40 look
--    like accidental artifacts of saving from a blank form (empty details,
--    a 3 kN load, no dates). Deleting user data automatically is unsafe, so
--    they are only reported by the Part 1 diagnostics. See the notes at the
--    bottom if you decide they are junk.
--  - Empty-string vs NULL text values ('66dd'-style placeholders, '' details)
--    are the technicians' real input; the app treats both the same.
--
--  HOW TO RUN
--  ----------
--  phpMyAdmin -> select the lab database -> SQL tab -> paste this whole file
--  -> Go. Part 1 is read-only; Part 2 writes a single row at most.
-- =============================================================================


-- -----------------------------------------------------------------------------
--  Part 1. Diagnostics + schema verification.  (read-only)
-- -----------------------------------------------------------------------------

-- 1a. Columns the app needs. Each query should return exactly one row.
SHOW COLUMNS FROM `compressive_tests` LIKE 'county';
SHOW COLUMNS FROM `compressive_tests` LIKE 'lab_ref';
SHOW COLUMNS FROM `compressive_tests` LIKE 'date_tested';
SHOW COLUMNS FROM `compressive_cubes` LIKE 'date_of_cast';
SHOW COLUMNS FROM `compressive_cubes` LIKE 'date_of_test';
SHOW COLUMNS FROM `projects` LIKE 'contractor';
SHOW COLUMNS FROM `projects` LIKE 'county';
SHOW COLUMNS FROM `projects` LIKE 'lab_organization';
SHOW COLUMNS FROM `projects` LIKE 'date_reported';
SHOW COLUMNS FROM `projects` LIKE 'checked_by';
SHOW COLUMNS FROM `test_results` LIKE 'sample_key';
SHOW COLUMNS FROM `test_results` LIKE 'sort_order';

-- 1b. Row counts per table touched by this normalization.
SELECT 'compressive_tests' AS tbl, COUNT(*) AS rows FROM `compressive_tests`
UNION ALL SELECT 'compressive_cubes', COUNT(*) FROM `compressive_cubes`
UNION ALL SELECT 'test_results', COUNT(*) FROM `test_results`;

-- 1c. Any test_results row whose status is outside the enum. Should return
--     no rows after Part 2 has run once.
SELECT `id`, `project_id`, `test_key`, `name`, `status`, `updated_at`
  FROM `test_results`
 WHERE `status` NOT IN ('not-started', 'in-progress', 'completed');

-- 1d. Compressive cubes pointing at a missing test (orphans). Should be empty;
--     the foreign key normally prevents these.
SELECT c.`id`, c.`test_id`, c.`cube_mark`, c.`date_of_cast`, c.`date_of_test`, c.`load_kn`
  FROM `compressive_cubes` AS c
  LEFT JOIN `compressive_tests` AS t ON t.`id` = c.`test_id`
 WHERE t.`id` IS NULL;

-- 1e. Compressive tests per project. More than one row per project is legal
--     (the app opens the newest), but worth eyeballing.
SELECT `project_id`, COUNT(*) AS tests, GROUP_CONCAT(`id` ORDER BY `id`) AS ids
  FROM `compressive_tests`
 GROUP BY `project_id`;

-- 1f. The known near-empty artifacts, for review (see notes at the bottom).
SELECT `id`, `project_id`, `date_tested`, `cement`, `contractor`, `county`,
       `concrete_class`, `status`, `updated_at`
  FROM `compressive_tests`
 WHERE (`cement` IS NULL OR `cement` = '')
   AND (`contractor` IS NULL OR `contractor` = '');
SELECT `id`, `test_id`, `cube_mark`, `date_of_cast`, `date_of_test`, `load_kn`
  FROM `compressive_cubes`
 WHERE (`load_kn` IS NULL OR `load_kn` <= 0)
    OR (`date_of_cast` IS NULL AND `date_of_test` IS NULL AND (`cube_mark` IS NULL OR `cube_mark` = ''));


-- -----------------------------------------------------------------------------
--  Part 2. Data repair.  Each statement only touches invalid values, so the
--  whole file is safe to re-run.
-- -----------------------------------------------------------------------------

-- 2a. Repair test_results rows with an invalid status. Today that is only
--     row 407 (compressive, project 42): '' -> 'in-progress'. The row links
--     to compressive_tests.id 2 via payload {"test_id":2} and stays linked.
UPDATE `test_results`
   SET `status` = 'in-progress'
 WHERE `status` NOT IN ('not-started', 'in-progress', 'completed');


-- -----------------------------------------------------------------------------
--  Verification. Re-run 1c: it must now return no rows.
-- -----------------------------------------------------------------------------


-- =============================================================================
--  NOTES — only act on these if you have confirmed the rows are junk
-- =============================================================================
--
--  If compressive_tests id 2 and compressive_cubes id 40 are confirmed
--  accidental (empty details, a 3 kN load with no dates or mark), remove them
--  with the two statements below. The test row must go last: its foreign key
--  cascades, but being explicit is safer. Afterwards, EITHER delete the
--  orphaned test_results row 407 as well OR repoint a real test at it —
--  otherwise opening that overview entry resolves to nothing and shows blank.
--
--    DELETE FROM `compressive_cubes` WHERE `id` = 40;
--    DELETE FROM `compressive_tests` WHERE `id` = 2;
--    DELETE FROM `test_results` WHERE `id` = 407;
--
--  If instead the 3 kN cube is real data with missing dates, fill the dates
--  in the app (open the test from the project overview — it now resolves —
--  enter Date of Cast / Date of Test, save) rather than editing here.
-- =============================================================================
