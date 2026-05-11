-- Migration: Create user_allowed_tables table for role-based access control
-- This table stores which database tables each user is allowed to access

CREATE TABLE `user_allowed_tables` (
  `id` int UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `user_id` int UNSIGNED NOT NULL,
  `table_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- Unique constraint to prevent duplicate entries
  UNIQUE KEY `uq_user_table` (`user_id`, `table_name`),
  
  -- Foreign key to users table
  KEY `idx_user_id` (`user_id`),
  CONSTRAINT `fk_user_allowed_tables_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert default permissions for the admin user (can access all tables)
INSERT INTO `user_allowed_tables` (`user_id`, `table_name`) VALUES
(1, 'projects'),
(1, 'test_definitions'),
(1, 'test_results'),
(1, 'atterberg_instances'),
(1, 'atterberg_rows'),
(1, 'admin_images'),
(1, 'admin_images_audit'),
(1, 'users'),
(1, 'compressive_tests'),
(1, 'compressive_cubes');
