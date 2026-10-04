-- =============================================================================
--  Add compressive_tests.lab_ref
--  Cransfield Geotechnical Lab
-- =============================================================================
--
--  WHY THIS EXISTS
--  --------------
--  The concrete cube compressive strength report is printed on the laboratory's
--  own "COMPRESSIVE STRENGTH OF CONCRETE CUBES" sheet (BS EN 12390-3:2002),
--  which carries a "LAB REF" field — the laboratory's own sample reference,
--  separate from the client's reference.
--
--  The app had no field for it. Until now the sheet printed a blank rule where
--  LAB REF belongs. CompressiveStrengthTest now collects the value and sends it
--  as `lab_ref` in the test_data payload on every save.
--
--  Because api.php spreads that payload straight into the record, saving a test
--  that carries a lab ref FAILS with an unknown-column SQL error until this
--  migration has been run. Existing rows keep working: the column is nullable.
--
--  WHAT THIS CHANGES
--  -----------------
--    compressive_tests.lab_ref  varchar(255) NULL   -- placed after client_ref
--
--  Nothing is read, updated or deleted. The column is purely additive, so it is
--  safe to run against a live database.
--
--  HOW TO RUN
--  ----------
--  phpMyAdmin -> select the lab database -> SQL tab -> paste below -> Go.
--
--  Step 1 is read-only: run it first to see whether the column already exists
--  (a fresh import of database/main.sql will already have it). Only run step 2
--  if step 1 returned no rows.
--
--  Every statement here works on shared hosting, where the database user cannot
--  read information_schema. Nothing in this file needs privileges beyond those
--  the user already holds on compressive_tests.
--
--  If step 2 reports "Duplicate column name 'lab_ref'", the column is already
--  there - go to step 3. That message is safe to ignore, not a failure.
--
--  VERIFY
--  ------
--  Step 3 should return the new column. Then save a compressive strength test
--  with a Lab Ref filled in: it should succeed and keep the value on reload.
-- =============================================================================


-- -----------------------------------------------------------------------------
--  Step 1. Does the column already exist?  (read-only)
--  Returns one row if lab_ref is present, none if it needs adding.
--
--  SHOW COLUMNS is used rather than a query against information_schema: on
--  shared hosting the database user is granted rights only on its own schema,
--  and reading information_schema fails with
--      #1044 - Access denied for user '<user>'@'localhost' to database
--             'information_schema'
--  SHOW COLUMNS only needs the rights the user already has on compressive_tests.
-- -----------------------------------------------------------------------------
SHOW COLUMNS FROM `compressive_tests` LIKE 'lab_ref';


-- -----------------------------------------------------------------------------
--  Step 2. Add it.  Run only if step 1 returned no rows.
-- -----------------------------------------------------------------------------
ALTER TABLE `compressive_tests`
  ADD COLUMN `lab_ref` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `client_ref`;


-- -----------------------------------------------------------------------------
--  Step 3. Confirm the column is in place.  (read-only)
-- -----------------------------------------------------------------------------
SHOW COLUMNS FROM `compressive_tests` LIKE 'lab_ref';