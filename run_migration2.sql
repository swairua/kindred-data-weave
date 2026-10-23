-- =============================================================================
--  Sample compressive test migration
--  Cransfield Geotechnical Lab
--  Matches the WhatsApp report images in compress/
-- =============================================================================

-- 1. Run this FIRST to add fresh columns (skips all steps if already present)
-- -----------------------------------------------------------------------------
SELECT 'compressive_tests columns pre-check:' AS status;
SELECT 'report_no' AS column_name, COUNT(*) AS present FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'compressive_tests' AND COLUMN_NAME = 'report_no';
SELECT 'date_received' AS column_name, COUNT(*) AS present FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'compressive_tests' AND COLUMN_NAME = 'date_received';
SELECT 'curing' AS column_name, COUNT(*) AS present FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'compressive_tests' AND COLUMN_NAME = 'curing';
SELECT 'mode_of_failure' AS column_name, COUNT(*) AS present FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'compressive_tests' AND COLUMN_NAME = 'mode_of_failure';
SELECT 'comment' AS column_name, COUNT(*) AS present FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'compressive_tests' AND COLUMN_NAME = 'comment';

-- 2. If any of the 5 above return 0, run the ALTER TABLE cascades below.
--    (Already applied -- this step is now a no-op check.)

-- 3. NOW META-MIGRATE: add a sample compressive test.
-- -----------------------------------------------------------------------------
-- Match the WhatsApp report images in compress/: the RC-26-0418 consignment,
-- job 26-0418, KUMIP Line 1, Kenya Railways. This is the record that populates
-- the lab-receipt PDF and the cube-sheet labels.
-- -----------------------------------------------------------------------------
INSERT INTO `compressive_tests` (
  `project_id`, `test_key`, `date_tested`, `cement`, `fine_aggregate`, `coarse_aggregate`,
  `contractor`, `concrete_class`, `section`, `made_by`, `slump`, `client_ref`,
  `lab_ref`, `report_no`, `date_received`, `curing`, `mode_of_failure`, `comment`,
  `status`, `created_at`, `updated_at`
) VALUES (
  26,                    -- project_id: Kenya Railways job 26-0418
  'compressive',            -- test_key
  '2026-10-19',              -- date_tested: cubes tested today
  'PPC 42.5N',                 -- cement
  'River sand',                -- fine_aggregate
  '20 mm crushed',             -- coarse_aggregate
  'Cransfield Geotechnical',     -- contractor
  'C25/30',                    -- concrete_class
  'Tank slab',                 -- section
  'Eng. Anthony Murage',       -- made_by
  '75',                        -- slump (mm)
  'KR-SSF-0093',               -- client_ref (CRBC client request form)
  '26-0418/01',                -- lab_ref (reception Lab ID)
  'RC-26-0418',                -- report_no (receipt number)
  '2026-10-19',                 -- date_received
  '20±2°C water',                -- curing
  'Satisfactory',                -- mode_of_failure
  'Cubes cured at ambient temp, 20-25°C; 150 mm dia. Three per mould.',  -- comment
  'submitted',                  -- status
  NOW(),
  NOW()
);

SET @last_id = LAST_INSERT_ID();
SELECT CONCAT('Inserted compressive test `', @last_id, '` with report_no = RC-26-0418') AS result;

-- 4. Attach the first cube row (the report's first cube) so the sample test
--    has something to render on the PDF.
-- -----------------------------------------------------------------------------
INSERT INTO `compressive_cubes` (
  `test_id`, `cube_mark`, `date_of_cast`, `date_of_test`,
  `load`, `width`, `height`, `depth`, `density`, `comments`
) VALUES (
  @last_id,              -- test_id (the sample compressive test)
  'KU-TANK-S-01',        -- cube_mark (tank slab cube, per BS EN 12390)
  '2026-10-14',           -- date_of_cast
  '2026-10-19',            -- date_of_test
  '312',                  -- load (kN)
  '150',                  -- width (mm)
  '150',                  -- height (mm)
  '150',                  -- depth (mm)
  '2416',                  -- density (kg/m3)
  NULL                      -- comments
);

SELECT 'Sample compressive test migrated.' AS summary;

-- 5. VERIFY: print the migrated test row.
-- -----------------------------------------------------------------------------
SELECT `id`, `project_id`, `test_key`, `date_tested`, `report_no`, `date_received`,
       `curing`, `mode_of_failure`, `comment`, `status`
FROM `compressive_tests`
WHERE `id` = @last_id;
