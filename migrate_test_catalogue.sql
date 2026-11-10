-- =============================================================================
--  Test catalogue: Soil / Concrete / Rock
--  Cransfield Geotechnical Lab
-- =============================================================================
--
--  WHAT THIS CHANGES
--  -----------------
--  The lab offers exactly eleven tests, grouped under three materials:
--
--    Soil      Atterberg Limits
--              Particle Size Distribution
--              Density/Moisture Content Relationship
--              SPT Test
--              Cone Penetration Test (CPT)
--
--    Concrete  Compressive Strength Test
--              Slump Test
--              NDT (Rebound Hammer)
--              Compressive Strength of Concrete Cores (BS EN 12504-1)
--
--    Rock      Schmidt Hammer Test
--              UCS Test
--              Point Load Test
--
--  Every other test stays disabled. A disabled test is not offered by the
--  record wizard and is not listed in the test register or the projects list.
--
--  `sort_order` gives the order the tests appear in within their material.
--
--  RUN ORDER
--  ---------
--  This is idempotent: running it twice leaves the catalogue unchanged.
--
-- =============================================================================

-- -----------------------------------------------------------------------------
--  Soil
-- -----------------------------------------------------------------------------
UPDATE `test_definitions` SET `name` = 'Atterberg Limits', `category` = 'soil',     `sort_order` = 1, `enabled` = 1 WHERE `test_key` = 'atterberg';
UPDATE `test_definitions` SET `name` = 'Particle Size Distribution', `category` = 'soil', `sort_order` = 2, `enabled` = 1 WHERE `test_key` = 'grading';
UPDATE `test_definitions` SET `name` = 'Density/Moisture Content Relationship', `category` = 'soil', `sort_order` = 3, `enabled` = 1 WHERE `test_key` = 'proctor';
UPDATE `test_definitions` SET `name` = 'SPT Test', `category` = 'soil',     `sort_order` = 4, `enabled` = 1 WHERE `test_key` = 'spt';
UPDATE `test_definitions` SET `name` = 'Cone Penetration Test (CPT)', `category` = 'soil', `sort_order` = 5, `enabled` = 1 WHERE `test_key` = 'cpt';

-- -----------------------------------------------------------------------------
--  Concrete
-- -----------------------------------------------------------------------------
UPDATE `test_definitions` SET `name` = 'Compressive Strength Test', `category` = 'concrete', `sort_order` = 1, `enabled` = 1 WHERE `test_key` = 'compressive';
UPDATE `test_definitions` SET `name` = 'Slump Test', `category` = 'concrete', `sort_order` = 2, `enabled` = 1 WHERE `test_key` = 'slump';
UPDATE `test_definitions` SET `name` = 'NDT (Rebound Hammer)', `category` = 'concrete', `sort_order` = 3, `enabled` = 1 WHERE `test_key` = 'ndt';
UPDATE `test_definitions` SET `name` = 'Compressive Strength of Concrete Cores (BS EN 12504-1)', `category` = 'concrete', `sort_order` = 4, `enabled` = 1 WHERE `test_key` = 'coring';

-- -----------------------------------------------------------------------------
--  Rock
-- -----------------------------------------------------------------------------
UPDATE `test_definitions` SET `name` = 'Schmidt Hammer Test', `category` = 'rock', `sort_order` = 1, `enabled` = 1 WHERE `test_key` = 'schmidt_rock';
UPDATE `test_definitions` SET `name` = 'UCS Test', `category` = 'rock', `sort_order` = 2, `enabled` = 1 WHERE `test_key` = 'ucs';
UPDATE `test_definitions` SET `name` = 'Point Load Test', `category` = 'rock', `sort_order` = 3, `enabled` = 1 WHERE `test_key` = 'pointload';

-- -----------------------------------------------------------------------------
--  Everything else stays disabled
-- -----------------------------------------------------------------------------
UPDATE `test_definitions` SET `sort_order` = 99, `enabled` = 0 WHERE `test_key` IN (
  'cbr', 'shear', 'consolidation', 'upvt', 'cubes', 'porosity', 'dcp', 'schmidt'
);

-- -----------------------------------------------------------------------------
--  Expected result
-- -----------------------------------------------------------------------------
--  SELECT `test_key`, `name`, `category`, `sort_order`, `enabled`
--  FROM `test_definitions` ORDER BY `category`, `sort_order`;
--
--  12 rows with enabled = 1:
--    soil      1  atterberg     Atterberg Limits
--    soil      2  grading       Particle Size Distribution
--    soil      3  proctor       Density/Moisture Content Relationship
--    soil      4  spt           SPT Test
--    soil      5  cpt           Cone Penetration Test (CPT)
--    concrete  1  compressive   Compressive Strength Test
--    concrete  2  slump         Slump Test
--    concrete  3  ndt           NDT (Rebound Hammer)
--    concrete  4  coring        Compressive Strength of Concrete Cores (BS EN 12504-1)
--    rock      1  schmidt_rock  Schmidt Hammer Test
--    rock      2  ucs           UCS Test
--    rock      3  pointload     Point Load Test
--  Every other row: enabled = 0, sort_order = 99.
-- =============================================================================
