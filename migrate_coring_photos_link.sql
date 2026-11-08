-- =============================================================================
--  Link Coring photos to their project and test result
--  Run after migrate_coring_photos.sql
-- =============================================================================

ALTER TABLE `coring_photos`
  ADD COLUMN `project_id` int UNSIGNED DEFAULT NULL COMMENT "projects.id" AFTER `uploaded_by`,
  ADD COLUMN `test_result_id` int UNSIGNED DEFAULT NULL COMMENT "test_results.id" AFTER `project_id`,
  ADD KEY `idx_coring_photos_project` (`project_id`),
  ADD KEY `idx_coring_photos_test_result` (`test_result_id`),
  ADD CONSTRAINT `fk_coring_photos_project`
        FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`)
        ON DELETE SET NULL,
  ADD CONSTRAINT `fk_coring_photos_test_result`
        FOREIGN KEY (`test_result_id`) REFERENCES `test_results` (`id`)
        ON DELETE SET NULL;
