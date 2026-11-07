-- =============================================================================
-- Seed Sample Coring Test (BS EN 12504-1:2009) - PILE 3 BH2(TA)
-- Run this in phpMyAdmin or MySQL CLI
-- =============================================================================

-- 1. Ensure test_definitions has coring with correct name
INSERT INTO `test_definitions` (`test_key`, `name`, `category`, `sort_order`, `enabled`, `created_at`, `updated_at`)
VALUES ('coring', 'Compressive Strength of Concrete Cores (BS EN 12504-1)', 'concrete', 50, 1, NOW(), NOW())
ON DUPLICATE KEY UPDATE 
  `name` = VALUES(`name`),
  `category` = VALUES(`category`),
  `sort_order` = VALUES(`sort_order`),
  `enabled` = VALUES(`enabled`),
  `updated_at` = NOW();

-- 2. Ensure admin user exists
INSERT INTO `users` (`email`, `password`, `name`, `created_at`)
VALUES ('admin@cransfield.com', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Admin User', NOW())
ON DUPLICATE KEY UPDATE `password` = VALUES(`password`);

-- Note: password hash is for 'Pass123' (bcrypt)

-- 3. Create project
INSERT INTO `projects` (`name`, `client_name`, `project_date`, `test_type`, `contractor`, `county`, `submitted_by`, `date_submitted`, `lab_organization`, `date_reported`, `checked_by`, `created_at`, `updated_at`)
VALUES ('PROPOSED NSSF TWIN TOWERS, NAIROBI COUNTY', 'NSSF', '2026-10-09', 'compressive', 'TOWER A', 'Nairobi', 'PUAL N', '2026-10-09', 'Cransfield Geotechnical Lab', '2026-10-17', 'PUAL N', NOW(), NOW())
ON DUPLICATE KEY UPDATE `updated_at` = NOW();

-- Get project ID
SET @project_id = (SELECT `id` FROM `projects` WHERE `name` = 'PROPOSED NSSF TWIN TOWERS, NAIROBI COUNTY' LIMIT 1);

-- 4. Create test_result
INSERT INTO `test_results` (`project_id`, `test_key`, `sample_key`, `sample_label`, `sample_depth`, `name`, `category`, `status`, `data_points`, `created_at`, `updated_at`)
VALUES (@project_id, 'coring', 'CR1', 'PILE 03 BH2', '0.0-2.0', 'Compressive Strength of Concrete Cores - TOWER A', 'concrete', 'completed', 7, NOW(), NOW())
ON DUPLICATE KEY UPDATE `status` = 'completed', `updated_at` = NOW();

SET @test_result_id = LAST_INSERT_ID();

-- 5. Create compressive_tests entry
INSERT INTO `compressive_tests` (`project_id`, `test_key`, `date_received`, `lab_ref`, `status`, `created_at`, `updated_at`)
VALUES (@project_id, 'coring', '2026-10-09', 'PILE 03 BH2', 'completed', NOW(), NOW())
ON DUPLICATE KEY UPDATE `status` = 'completed', `updated_at` = NOW();

SET @comp_test_id = LAST_INSERT_ID();

-- 6. Insert 7 core samples matching PILE 3 BH2(TA) PDF
-- Depth, Diameter, L Before, L After, Load (kN), Weight (g), Corrected Strength (MPa), L/D, Cyl/Cube Ratio, Ca Factor, Excess Voidage, Failure Mode
DELETE FROM `compressive_cubes` WHERE `test_id` = @comp_test_id;

INSERT INTO `compressive_cubes` (`test_id`, `cube_mark`, `date_of_cast`, `date_of_test`, `load_kn`, `width_mm`, `height_mm`, `depth_mm`, `mass_g`, `density_kg_m3`, `calculated_strength_mpa`, `remarks`, `created_at`, `updated_at`) VALUES
(@comp_test_id, 'CR1', '2026-09-11', '2026-10-09', 963.0, 82, 82, 82, 2223, 2400, 49.1, 'Sparsely distributed aggregates with maximum size approximately 20mm', NOW(), NOW()),
(@comp_test_id, 'CR2', '2026-09-11', '2026-10-09', 981.0, 82, 82, 82, 2264, 2400, 49.7, 'Sparsely distributed aggregates with maximum size approximately 20mm', NOW(), NOW()),
(@comp_test_id, 'CR3', '2026-09-11', '2026-10-09', 1026.0, 82, 82, 82, 2368, 2400, 50.1, 'Sparsely distributed aggregates with maximum size approximately 20mm', NOW(), NOW()),
(@comp_test_id, 'CR4', '2026-09-11', '2026-10-09', 1019.0, 82, 82, 82, 2352, 2400, 48.6, 'Sparsely distributed aggregates with maximum size approximately 20mm', NOW(), NOW()),
(@comp_test_id, 'CR5', '2026-09-11', '2026-10-09', 1037.0, 82, 82, 82, 2394, 2400, 49.1, 'Sparsely distributed aggregates with maximum size approximately 20mm', NOW(), NOW()),
(@comp_test_id, 'CR6', '2026-09-11', '2026-10-09', 936.0, 82, 82, 82, 2161, 2400, 51.5, 'Sparsely distributed aggregates with maximum size approximately 20mm', NOW(), NOW()),
(@comp_test_id, 'CR7', '2026-09-11', '2026-10-09', 975.0, 82, 82, 82, 2251, 2400, 49.7, 'Sparsely distributed aggregates with maximum size approximately 20mm', NOW(), NOW());

-- 7. Insert admin images (before/after test images)
-- Note: You'll need to manually copy images from /coring/ to uploads/admin/ and update paths
-- These are placeholder entries - update file_path after copying actual images

INSERT INTO `admin_images` (`image_type`, `file_path`, `original_filename`, `file_size`, `mime_type`, `uploaded_by`, `uploaded_at`, `updated_at`)
VALUES 
('pile_before', '/uploads/admin/pile_before/beforetest_seed.jpg', 'beforetest.jpg', 26567, 'image/jpeg', (SELECT id FROM users WHERE email = 'admin@cransfield.com' LIMIT 1), NOW(), NOW()),
('pile_after', '/uploads/admin/pile_after/aftertest_seed.jpg', 'aftertest.jpg', 36830, 'image/jpeg', (SELECT id FROM users WHERE email = 'admin@cransfield.com' LIMIT 1), NOW(), NOW())
ON DUPLICATE KEY UPDATE 
  `file_path` = VALUES(`file_path`),
  `original_filename` = VALUES(`original_filename`),
  `file_size` = VALUES(`file_size`),
  `updated_at` = NOW();

-- =============================================================================
-- POST-SEEDING STEPS (MANUAL)
-- =============================================================================
-- 1. Copy images from project_root/coring/ to uploads/admin/:
--    mkdir -p uploads/admin/pile_before uploads/admin/pile_after
--    cp coring/beforetest.jpg uploads/admin/pile_before/beforetest_seed.jpg
--    cp coring/aftertest.jpg uploads/admin/pile_after/aftertest_seed.jpg
--
-- 2. Update admin_images table with correct file paths if needed
--
-- 3. Login: admin@cransfield.com / Pass123
--    Navigate to: /tests?projectId=<project_id>#coring
--    (Find project_id from projects table)
--
-- 3. The coring test will appear in the Concrete category in Test Wizard
-- =============================================================================