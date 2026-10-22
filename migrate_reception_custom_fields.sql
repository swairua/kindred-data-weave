-- =============================================================================
--  Reception custom-field definitions + consignment photos
--  Cransfield Geotechnical Lab
-- =============================================================================

-- -----------------------------------------------------------------------------
--  reception_field_definitions
--  Reusable, user-defined fields for the three reception areas:
--    area = 'consignment' | 'transport' | 'sample'
--  Custom values themselves live inside reception_consignments.payload_json,
--  keyed by field_key, so no column changes are needed on consignments.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `reception_field_definitions` (
  `id` int UNSIGNED NOT NULL AUTO_INCREMENT,
  `area` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL
 COMMENT "consignment | transport | sample",
  `field_key` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL
        COMMENT "stable key stored with the value in payload_json",
  `label` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL
        COMMENT "human label shown on the reception form",
  `value_type` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'text'
        COMMENT "text | number | date | select",
  `options` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL
        COMMENT "JSON array of allowed values, used when value_type = 'select'",
  `sort_order` int NOT NULL DEFAULT 0,
  `is_required` tinyint(1) NOT NULL DEFAULT 0,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_area_field_key` (`area`, `field_key`),
  KEY `idx_area_active` (`area`, `is_active`, `sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
--  reception_photos
--  Images attached to a consignment (rc_no). Files live in uploads/reception/.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `reception_photos` (
  `id` int UNSIGNED NOT NULL AUTO_INCREMENT,
  `rc_no` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_path` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL
        COMMENT "relative path, e.g. /uploads/reception/RC-26-0418_20261022_ab12cd.jpg",
  `original_filename` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `file_size` int UNSIGNED DEFAULT NULL,
  `mime_type` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `caption` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `uploaded_by` int UNSIGNED DEFAULT NULL COMMENT "users.id",
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_rc_no` (`rc_no`),
  KEY `idx_uploaded_by` (`uploaded_by`),
  CONSTRAINT `fk_reception_photos_user`
        FOREIGN KEY (`uploaded_by`) REFERENCES `users` (`id`)
        ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
--  Example definitions (optional — delete if not wanted).
--  Mirrors the mockups: consignment details, transport checks, sample details.
-- -----------------------------------------------------------------------------
INSERT INTO `reception_field_definitions`
 (`area`, `field_key`, `label`, `value_type`, `options`, `sort_order`, `is_required`, `is_active`)
VALUES
  ('consignment', 'chainage',      'Chainage / chainage from', 'text',   NULL, 10, 0, 1),
  ('consignment', 'weather',       'Weather on arrival',       'select', '["Sunny","Cloudy","Overcast","Rainy","Windy","Stormy"]', 20, 0, 1),
  ('consignment', 'site_contact',  'Site contact',             'text',   NULL, 30, 0, 1),
  ('transport',   'cooler_temp',   'Cool box temperature (°C)', 'number', NULL, 10, 0, 1),
  ('transport',   'delay_hours',   'Delay in transit (h)',      'number', NULL, 20, 0, 1),
  ('sample',      'borehole',      'Borehole / trial pit',      'text',   NULL, 10, 0, 1),
  ('sample',      'strata',        'Strata description',        'text',   NULL, 20, 0, 1)
ON DUPLICATE KEY UPDATE
  `label`      = VALUES(`label`),
  `value_type` = VALUES(`value_type`),
  `options`    = VALUES(`options`),
  `sort_order` = VALUES(`sort_order`),
  `is_required`= VALUES(`is_required`),
  `is_active`  = VALUES(`is_active`);
