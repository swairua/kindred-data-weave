-- =============================================================================
-- Seed test definition for Coring (Enhanced) - Concrete Core Test
-- Standard: BS EN 12504-1:2009
-- =============================================================================
-- This migration adds/updates the test definition for the enhanced coring test
-- with before/after images, reception workflow, and project creation.
--
-- HOW TO RUN:
-- phpMyAdmin -> select the lab database -> SQL tab -> paste below -> Go.
-- =============================================================================

-- Check if test_definitions table exists and has the right structure
SHOW TABLES LIKE 'test_definitions';

-- Show current coring test definition if exists
SELECT * FROM `test_definitions` WHERE `test_key` = 'coring';

-- =============================================================================
-- STEP 1: Upsert the coring test definition
-- =============================================================================
-- The test_definitions table typically has these columns:
-- id, test_key, name, category, sort_order, enabled, created_at, updated_at

-- Option A: If test_key 'coring' exists, update it
-- Option B: If not exists, insert it

INSERT INTO `test_definitions` (
  `test_key`, 
  `name`, 
  `category`, 
  `sort_order`, 
  `enabled`,
  `created_at`,
  `updated_at`
) VALUES (
  'coring',
  'Compressive Strength of Concrete Cores (BS EN 12504-1)',
  'concrete',
  50,
  1,
  NOW(),
  NOW()
) ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `category` = VALUES(`category`),
  `sort_order` = VALUES(`sort_order`),
  `enabled` = VALUES(`enabled`),
  `updated_at` = NOW();

-- =============================================================================
-- STEP 2: Verify the test definition was created/updated
-- =============================================================================
SELECT * FROM `test_definitions` WHERE `test_key` = 'coring';

-- =============================================================================
-- STEP 3: Seed admin_images for pile_before and pile_after (optional demo images)
-- =============================================================================
-- Note: The actual image files need to be uploaded via the Settings page or API.
-- These rows just create placeholder entries that the system can reference.

-- Check current admin_images
SELECT * FROM `admin_images` WHERE `image_type` IN ('pile_before', 'pile_after');

-- If you have actual image files to seed, insert them like:
-- INSERT INTO `admin_images` (`image_type`, `file_path`, `original_filename`, `file_size`, `mime_type`, `uploaded_by`) VALUES
-- ('pile_before', '/uploads/admin/pile_before/pile_before_20261107_000000_demo.jpg', 'pile_before_demo.jpg', 102400, 'image/jpeg', 1),
-- ('pile_after', '/uploads/admin/pile_after/pile_after_20261107_000000_demo.jpg', 'pile_after_demo.jpg', 102400, 'image/jpeg', 1)
-- ON DUPLICATE KEY UPDATE `file_path` = VALUES(`file_path`), `updated_at` = NOW();

-- =============================================================================
-- STEP 4: Ensure admin_images table accepts pile_before/pile_after
-- =============================================================================
-- This ALTER is already in the previous migration but included here for completeness
ALTER TABLE `admin_images` 
  MODIFY COLUMN `image_type` 
  ENUM('logo','contacts','stamp','pile_before','pile_after') 
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;

-- =============================================================================
-- COMPLETE
-- =============================================================================
-- After running this:
-- 1. The 'coring' test definition will be available in the Concrete category
-- 2. The enhanced CoringTestEnhanced component will be used
-- 3. Images can be uploaded via Settings -> Images or directly in the test form
-- 4. The test will appear in the Test Wizard under Concrete category