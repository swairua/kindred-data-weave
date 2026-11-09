-- Create user_allowed_tables table for table-level access control
-- This table stores which tables each user has access to

CREATE TABLE IF NOT EXISTS `user_allowed_tables` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `user_id` INT NOT NULL,
    `table_name` VARCHAR(255) NOT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- Prevent duplicate permissions for the same user and table
    UNIQUE KEY `unique_user_table` (user_id, table_name),
    
    -- Foreign key to users table
    FOREIGN KEY `fk_user_allowed_tables_user` (user_id) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create indexes for better performance
CREATE INDEX `idx_user_allowed_tables_user_id` ON `user_allowed_tables` (`user_id`);
CREATE INDEX `idx_user_allowed_tables_table_name` ON `user_allowed_tables` (`table_name`);

-- Insert default permissions for admin user (id=1)
-- Admin user gets access to ALL tables
INSERT INTO `user_allowed_tables` (`user_id`, `table_name`) VALUES
    (1, 'projects'),
    (1, 'test_definitions'),
    (1, 'test_results'),
    (1, 'atterberg_instances'),
    (1, 'atterberg_rows'),
    (1, 'admin_images'),
    (1, 'admin_images_audit'),
    (1, 'users'),
    (1, 'lab_reference_sequences');

-- Add comment about the permission model
-- This table implements a WHITELIST permission model:
-- By default, users have NO access to any tables
-- Admins must explicitly grant access to each table
-- Users can only access/modify records in tables they've been granted access to
