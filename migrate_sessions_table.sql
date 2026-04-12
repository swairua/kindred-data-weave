-- Migration: Add session_data column to sessions table for new session handler
-- This allows PHP's custom session handler to store serialized session data

ALTER TABLE `sessions` ADD COLUMN `session_data` LONGTEXT DEFAULT '' AFTER `session_id`;

-- Ensure the expires_at column exists (should already be there, but just in case)
-- ALTER TABLE `sessions` MODIFY COLUMN `expires_at` DATETIME NOT NULL DEFAULT (DATE_ADD(NOW(), INTERVAL 30 MINUTE));

-- Update the table to make session_id the primary key if not already
-- ALTER TABLE `sessions` DROP PRIMARY KEY;
-- ALTER TABLE `sessions` ADD PRIMARY KEY (`session_id`);

-- Optional: Create an index on expires_at for the garbage collection query
CREATE INDEX `idx_expires_at` ON `sessions` (`expires_at`);

-- Allow unauthenticated sessions (user not logged in yet)
ALTER TABLE `sessions` MODIFY COLUMN `user_id` INT NULL DEFAULT NULL;

-- Display the table structure to verify
DESCRIBE `sessions`;
