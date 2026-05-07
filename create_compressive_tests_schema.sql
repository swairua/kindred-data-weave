-- Create compressive_tests table for storing test details
CREATE TABLE IF NOT EXISTS `compressive_tests` (
  `id` int UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `project_id` int UNSIGNED,
  `test_key` varchar(50) DEFAULT 'compressive',
  `date_tested` date,
  `cement` varchar(255),
  `fine_aggregate` varchar(255),
  `coarse_aggregate` varchar(255),
  `contractor` varchar(255),
  `concrete_class` varchar(50),
  `section` varchar(255),
  `made_by` varchar(255),
  `slump` varchar(100),
  `client_ref` varchar(255),
  `status` varchar(50) DEFAULT 'draft',
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE,
  KEY `idx_project_test_key` (`project_id`, `test_key`),
  KEY `idx_status` (`status`),
  KEY `idx_updated_at` (`updated_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create compressive_cubes table for storing individual cube test results
CREATE TABLE IF NOT EXISTS `compressive_cubes` (
  `id` int UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `test_id` int UNSIGNED NOT NULL,
  `cube_id` varchar(50),
  `load_kn` decimal(10, 2),
  `width_mm` decimal(10, 2),
  `height_mm` decimal(10, 2),
  `age_days` int,
  `cast_date` date,
  `test_date` date,
  `calculated_strength_mpa` decimal(10, 2),
  `density_kg_m3` decimal(10, 2),
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`test_id`) REFERENCES `compressive_tests`(`id`) ON DELETE CASCADE,
  KEY `idx_test_id` (`test_id`),
  KEY `idx_cube_id` (`cube_id`),
  KEY `idx_updated_at` (`updated_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
