-- Migration: Fix sessions table for token-based auth

-- Drop the existing FK constraint that prevents NULL user_id
ALTER TABLE `sessions` DROP FOREIGN KEY `fk_sessions_user`;

-- Allow NULL user_id for unauthenticated sessions
ALTER TABLE `sessions` MODIFY COLUMN `user_id` INT NULL DEFAULT NULL;

-- Re-add FK with ON DELETE SET NULL
ALTER TABLE `sessions` ADD CONSTRAINT `fk_sessions_user` 
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL;

-- Ensure session_data column exists
-- ALTER TABLE `sessions` ADD COLUMN `session_data` LONGTEXT DEFAULT '' AFTER `session_id`;

-- Ensure index on expires_at for garbage collection
-- CREATE INDEX `idx_expires_at` ON `sessions` (`expires_at`);

-- Verify
DESCRIBE `sessions`;
