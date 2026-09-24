-- Add the missing 'enabled' column to test_definitions table
ALTER TABLE `test_definitions` ADD COLUMN `enabled` tinyint(1) NOT NULL DEFAULT 1 AFTER `sort_order`;

-- Update test_key values to match the frontend component names
UPDATE `test_definitions` SET `test_key` = 'schmidt' WHERE `test_key` = 'schmidt_hammer';
UPDATE `test_definitions` SET `test_key` = 'cubes' WHERE `test_key` = 'concrete_cubes';
UPDATE `test_definitions` SET `test_key` = 'compressive' WHERE `test_key` = 'compressive_strength';
UPDATE `test_definitions` SET `test_key` = 'pointload' WHERE `test_key` = 'point_load';

UPDATE `test_definitions` SET `name` = 'Atterberg Limits', `category` = 'soil', `sort_order` = 1, `enabled` = 1 WHERE `test_key` = 'atterberg';
UPDATE `test_definitions` SET `name` = 'Particle Size Distribution', `category` = 'soil', `sort_order` = 2, `enabled` = 1 WHERE `test_key` = 'grading';
UPDATE `test_definitions` SET `name` = 'Density/Moisture Content Relationship', `category` = 'soil', `sort_order` = 3, `enabled` = 1 WHERE `test_key` = 'proctor';
UPDATE `test_definitions` SET `name` = 'Standard Penetration Test (SPT)', `category` = 'soil', `sort_order` = 4, `enabled` = 1 WHERE `test_key` = 'spt';
UPDATE `test_definitions` SET `name` = 'Unconfined Compressive Strength', `category` = 'rock', `sort_order` = 1, `enabled` = 1 WHERE `test_key` = 'ucs';
UPDATE `test_definitions` SET `name` = 'Point Load Index', `category` = 'rock', `sort_order` = 2, `enabled` = 1 WHERE `test_key` = 'pointload';
UPDATE `test_definitions` SET `name` = 'Compressive Strength Test', `category` = 'concrete', `sort_order` = 1, `enabled` = 1 WHERE `test_key` = 'compressive';
UPDATE `test_definitions` SET `name` = 'Slump Test', `category` = 'concrete', `sort_order` = 2, `enabled` = 1 WHERE `test_key` = 'slump';
UPDATE `test_definitions` SET `name` = 'NDT (Rebound Hammer)', `category` = 'concrete', `sort_order` = 3, `enabled` = 1 WHERE `test_key` = 'schmidt';
UPDATE `test_definitions` SET `enabled` = 0 WHERE `category` IN ('soil', 'rock', 'concrete') AND `test_key` NOT IN ('atterberg', 'grading', 'proctor', 'spt', 'cpt', 'ucs', 'pointload', 'schmidt_rock', 'compressive', 'slump', 'schmidt');

INSERT INTO `test_definitions` (`test_key`, `name`, `category`, `sort_order`, `enabled`)
SELECT 'cpt', 'Cone Penetration Test (CPT)', 'soil', 5, 1
WHERE NOT EXISTS (SELECT 1 FROM `test_definitions` WHERE `test_key` = 'cpt');

INSERT INTO `test_definitions` (`test_key`, `name`, `category`, `sort_order`, `enabled`)
SELECT 'schmidt_rock', 'Schmidt Hammer', 'rock', 3, 1
WHERE NOT EXISTS (SELECT 1 FROM `test_definitions` WHERE `test_key` = 'schmidt_rock');

UPDATE `test_definitions` SET `name` = 'Cone Penetration Test (CPT)', `category` = 'soil', `sort_order` = 5, `enabled` = 1 WHERE `test_key` = 'cpt';
UPDATE `test_definitions` SET `name` = 'Schmidt Hammer', `category` = 'rock', `sort_order` = 3, `enabled` = 1 WHERE `test_key` = 'schmidt_rock';

-- Verify the changes
SELECT id, test_key, name, category, enabled FROM `test_definitions` ORDER BY category, id;
