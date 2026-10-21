-- =============================================================================
--  Add custom fields and lab reference sequence support
--  Cransfield Geotechnical Lab
-- =============================================================================

-- custom_fields on compressive_tests
SHOW COLUMNS FROM `compressive_tests` LIKE 'custom_fields';
ALTER TABLE `compressive_tests`
  ADD COLUMN `custom_fields` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `comment`;

-- lab_reference_sequences table
CREATE TABLE IF NOT EXISTS `lab_reference_sequences` (
  `scope` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `next_number` int UNSIGNED NOT NULL DEFAULT 1,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`scope`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed the global compressive report sequence from existing rows so existing
-- report numbers are not reused. Safe to run repeatedly.
INSERT INTO `lab_reference_sequences` (`scope`, `next_number`)
SELECT 'compressive_report', COUNT(*) + 1 FROM `compressive_tests`
ON DUPLICATE KEY UPDATE `next_number` = GREATEST(`next_number`, VALUES(`next_number`));

-- reception_consignments table (backend persistence for reception)
CREATE TABLE IF NOT EXISTS `reception_consignments` (
  `id` int UNSIGNED NOT NULL AUTO_INCREMENT,
  `rc_no` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `job_no` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `payload_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_rc_no` (`rc_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
