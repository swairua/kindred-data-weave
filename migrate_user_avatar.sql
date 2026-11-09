-- Adds the avatar_url column used by the Profile page.
-- Run once on the live database. Fails harmlessly if the column already exists.
ALTER TABLE `users` ADD COLUMN `avatar_url` VARCHAR(500) NULL DEFAULT NULL;
