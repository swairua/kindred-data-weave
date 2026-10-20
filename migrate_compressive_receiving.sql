-- =============================================================================
--  Add compressive_tests receiving/reporting fields
--  Cransfield Geotechnical Lab
-- =============================================================================
--
--  WHY THIS EXISTS
--  --------------
--  The laboratory's own "COMPRESSIVE STRENGTH OF CONCRETE CUBES" sheet
--  (BS EN 12390-3:2002) carries a receiving block and a results summary that
--  the app had no fields for:
--      REPORT NO., DATE RECEIVED, CURING, MODE OF FAILURE, COMMENT
--  api.php spreads the test_data payload straight into the record, so saving
--  a test that carries any of them FAILS with an unknown-column SQL error
--  (or silently drops them) until this migration has been run.
--
--  WHAT THIS CHANGES (all purely additive, all nullable — safe on live data)
--  -----------------
--    compressive_tests.report_no        varchar(255) NULL   -- after lab_ref
--    compressive_tests.date_received    date NULL           -- after report_no
--    compressive_tests.curing           varchar(255) NULL   -- after date_received
--    compressive_tests.mode_of_failure  varchar(255) NULL   -- after curing
--    compressive_tests.comment          text NULL           -- after mode_of_failure
--
--  Nothing is read, updated or deleted.
--
--  HOW TO RUN
--  ----------
--  phpMyAdmin -> select the lab database -> SQL tab -> paste below -> Go.
--
--  Each Step 1 query is read-only: run it first to see whether the column
--  already exists (a fresh import of database/main.sql already has them all).
--  Only run the matching Step 2 if Step 1 returned no rows.
--
--  Every statement here works on shared hosting, where the database user cannot
--  read information_schema. Nothing in this file needs privileges beyond those
--  the user already holds on compressive_tests.
--
--  If a Step 2 reports "Duplicate column name", the column is already there -
--  go on to the next step. That message is safe to ignore, not a failure.
--
--  VERIFY
--  ------
--  The Step 3 queries should return the new columns. Then save a compressive
--  strength test with any of the new fields filled in: it should succeed and
--  keep the value on reload.
-- =============================================================================


-- -----------------------------------------------------------------------------
--  report_no — Step 1. Does it exist?  (read-only)
-- -----------------------------------------------------------------------------
SHOW COLUMNS FROM `compressive_tests` LIKE 'report_no';

-- -----------------------------------------------------------------------------
--  report_no — Step 2. Add it.  Run only if step 1 returned no rows.
-- -----------------------------------------------------------------------------
ALTER TABLE `compressive_tests`
  ADD COLUMN `report_no` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `lab_ref`;

-- -----------------------------------------------------------------------------
--  report_no — Step 3. Confirm.  (read-only)
-- -----------------------------------------------------------------------------
SHOW COLUMNS FROM `compressive_tests` LIKE 'report_no';


-- -----------------------------------------------------------------------------
--  date_received — Step 1. Does it exist?  (read-only)
-- -----------------------------------------------------------------------------
SHOW COLUMNS FROM `compressive_tests` LIKE 'date_received';

-- -----------------------------------------------------------------------------
--  date_received — Step 2. Add it.  Run only if step 1 returned no rows.
-- -----------------------------------------------------------------------------
ALTER TABLE `compressive_tests`
  ADD COLUMN `date_received` date DEFAULT NULL AFTER `report_no`;

-- -----------------------------------------------------------------------------
--  date_received — Step 3. Confirm.  (read-only)
-- -----------------------------------------------------------------------------
SHOW COLUMNS FROM `compressive_tests` LIKE 'date_received';


-- -----------------------------------------------------------------------------
--  curing — Step 1. Does it exist?  (read-only)
-- -----------------------------------------------------------------------------
SHOW COLUMNS FROM `compressive_tests` LIKE 'curing';

-- -----------------------------------------------------------------------------
--  curing — Step 2. Add it.  Run only if step 1 returned no rows.
-- -----------------------------------------------------------------------------
ALTER TABLE `compressive_tests`
  ADD COLUMN `curing` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `date_received`;

-- -----------------------------------------------------------------------------
--  curing — Step 3. Confirm.  (read-only)
-- -----------------------------------------------------------------------------
SHOW COLUMNS FROM `compressive_tests` LIKE 'curing';


-- -----------------------------------------------------------------------------
--  mode_of_failure — Step 1. Does it exist?  (read-only)
-- -----------------------------------------------------------------------------
SHOW COLUMNS FROM `compressive_tests` LIKE 'mode_of_failure';

-- -----------------------------------------------------------------------------
--  mode_of_failure — Step 2. Add it.  Run only if step 1 returned no rows.
-- -----------------------------------------------------------------------------
ALTER TABLE `compressive_tests`
  ADD COLUMN `mode_of_failure` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `curing`;

-- -----------------------------------------------------------------------------
--  mode_of_failure — Step 3. Confirm.  (read-only)
-- -----------------------------------------------------------------------------
SHOW COLUMNS FROM `compressive_tests` LIKE 'mode_of_failure';


-- -----------------------------------------------------------------------------
--  comment — Step 1. Does it exist?  (read-only)
-- -----------------------------------------------------------------------------
SHOW COLUMNS FROM `compressive_tests` LIKE 'comment';

-- -----------------------------------------------------------------------------
--  comment — Step 2. Add it.  Run only if step 1 returned no rows.
-- -----------------------------------------------------------------------------
ALTER TABLE `compressive_tests`
  ADD COLUMN `comment` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `mode_of_failure`;

-- -----------------------------------------------------------------------------
--  comment — Step 3. Confirm.  (read-only)
-- -----------------------------------------------------------------------------
SHOW COLUMNS FROM `compressive_tests` LIKE 'comment';
