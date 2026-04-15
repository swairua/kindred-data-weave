-- Add the missing 'enabled' column to test_definitions table
ALTER TABLE `test_definitions` ADD COLUMN `enabled` tinyint(1) NOT NULL DEFAULT 1 AFTER `sort_order`;

-- Update test_key values to match the frontend component names
UPDATE `test_definitions` SET `test_key` = 'schmidt' WHERE `test_key` = 'schmidt_hammer';
UPDATE `test_definitions` SET `test_key` = 'cubes' WHERE `test_key` = 'concrete_cubes';
UPDATE `test_definitions` SET `test_key` = 'compressive' WHERE `test_key` = 'compressive_strength';
UPDATE `test_definitions` SET `test_key` = 'pointload' WHERE `test_key` = 'point_load';

-- Verify the changes
SELECT id, test_key, name, category, enabled FROM `test_definitions` ORDER BY category, id;
