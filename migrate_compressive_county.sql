-- =============================================================================
--  Add compressive_tests.county + project detail columns
--  Cransfield Geotechnical Lab
-- =============================================================================
--
--  WHY THIS EXISTS
--  --------------
--  The concrete cube compressive strength report carries Contractor and County
--  fields, and the app sends `county` in the test_data payload on every save.
--  Neither `compressive_tests.county` nor the project detail columns below
--  exist in older databases, and api.php skips payload keys that are not real
--  columns — silently on some paths, with an unknown-column SQL error on
--  others. Either way the values never persist, so a saved compressive test
--  reopens with a blank county (and project contractor/county edits vanish
--  the same way).
--
--  WHAT THIS CHANGES (all purely additive, all nullable — safe on live data)
--  -----------------
--    compressive_tests.county            varchar(255) NULL   -- after contractor
--    projects.contractor                 varchar(255) NULL   -- after project_date
--    projects.county                     varchar(255) NULL   -- after contractor
--    projects.lab_organization           varchar(255) NULL   -- after county
--    projects.date_reported              date NULL           -- after lab_organization
--    projects.checked_by                 varchar(255) NULL   -- after date_reported
--
--  Nothing is read, updated or deleted.
--
--  HOW TO RUN
--  ----------
--  phpMyAdmin -> select the lab database -> SQL tab -> paste below -> Go.
--
--  Each step 1 query is read-only: run it first to see whether the column
--  already exists (a fresh import of database/main.sql already has them all).
--  Only run the matching step 2 if step 1 returned no rows.
--
--  Every statement here works on shared hosting, where the database user cannot
--  read information_schema. Nothing in this file needs privileges beyond those
--  the user already holds on the two tables.
--
--  If a step 2 reports "Duplicate column name", the column is already there -
--  go on to the next step. That message is safe to ignore, not a failure.
--
--  VERIFY
--  ------
--  The step 3 queries should return the new columns. Then open a saved
--  compressive strength test from the project overview: the report form,
--  including county and the cube dates, should be fully populated.
-- =============================================================================


-- -----------------------------------------------------------------------------
--  compressive_tests.county — Step 1. Does it exist?  (read-only)
-- -----------------------------------------------------------------------------
SHOW COLUMNS FROM `compressive_tests` LIKE 'county';


-- -----------------------------------------------------------------------------
--  compressive_tests.county — Step 2. Add it.  Run only if step 1 had no rows.
-- -----------------------------------------------------------------------------
ALTER TABLE `compressive_tests`
  ADD COLUMN `county` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `contractor`;


-- -----------------------------------------------------------------------------
--  compressive_tests.county — Step 3. Confirm.  (read-only)
-- -----------------------------------------------------------------------------
SHOW COLUMNS FROM `compressive_tests` LIKE 'county';


-- -----------------------------------------------------------------------------
--  projects detail columns — Step 1. Which are missing?  (read-only)
--  Returns one row per column that already exists.
-- -----------------------------------------------------------------------------
SHOW COLUMNS FROM `projects` LIKE 'contractor';
SHOW COLUMNS FROM `projects` LIKE 'county';
SHOW COLUMNS FROM `projects` LIKE 'lab_organization';
SHOW COLUMNS FROM `projects` LIKE 'date_reported';
SHOW COLUMNS FROM `projects` LIKE 'checked_by';


-- -----------------------------------------------------------------------------
--  projects detail columns — Step 2. Add the missing ones.  Run only the
--  statements whose step 1 query returned no rows.
-- -----------------------------------------------------------------------------
ALTER TABLE `projects`
  ADD COLUMN `contractor` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `project_date`;

ALTER TABLE `projects`
  ADD COLUMN `county` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `contractor`;

ALTER TABLE `projects`
  ADD COLUMN `lab_organization` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `county`;

ALTER TABLE `projects`
  ADD COLUMN `date_reported` date DEFAULT NULL AFTER `lab_organization`;

ALTER TABLE `projects`
  ADD COLUMN `checked_by` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `date_reported`;


-- -----------------------------------------------------------------------------
--  projects detail columns — Step 3. Confirm.  (read-only)
-- -----------------------------------------------------------------------------
SHOW COLUMNS FROM `projects` LIKE 'contractor';
SHOW COLUMNS FROM `projects` LIKE 'county';
SHOW COLUMNS FROM `projects` LIKE 'lab_organization';
SHOW COLUMNS FROM `projects` LIKE 'date_reported';
SHOW COLUMNS FROM `projects` LIKE 'checked_by';
