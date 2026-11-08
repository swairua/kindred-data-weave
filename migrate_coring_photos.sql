-- =============================================================================
--  Coring core photographs
--  Cransfield Geotechnical Lab
-- =============================================================================

-- -----------------------------------------------------------------------------
--  coring_photos
--  Before/after photographs of individual cores. Files live in uploads/coring/.
--  Each core row in test_results.payload_json keeps the file_path it uses, so
--  this table is the upload record and is not joined to projects.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `coring_photos` (
  `id` int UNSIGNED NOT NULL AUTO_INCREMENT,
  `image_type` enum('before','after') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_path` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL
        COMMENT "relative path, e.g. /uploads/coring/coring_before_20261107_ab12cd.jpg",
  `original_filename` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `file_size` int UNSIGNED DEFAULT NULL,
  `mime_type` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `uploaded_by` int UNSIGNED DEFAULT NULL COMMENT "users.id",
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_coring_photos_uploaded_by` (`uploaded_by`),
  CONSTRAINT `fk_coring_photos_user`
        FOREIGN KEY (`uploaded_by`) REFERENCES `users` (`id`)
        ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
