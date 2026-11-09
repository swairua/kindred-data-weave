-- Audit Log System SQL
-- Run this to ensure all required tables and indexes exist

-- 1. Main audit_log table (created by migrate_settings.sql)
-- Already exists with structure:
-- id, company_id, user_id, action, entity_type, entity_id, changes(JSON), ip_address, user_agent, created_at
-- NOTE: user_name column may be missing - add it if needed

-- 2. Add missing user_name column if not exists
-- Run this first if user_name column is missing:
-- ALTER TABLE audit_log ADD COLUMN user_name VARCHAR(255) DEFAULT NULL AFTER user_agent;

-- 3. Additional indexes for better query performance
-- MySQL doesn't support IF NOT EXISTS for indexes, so check first:
-- SELECT COUNT(*) FROM information_schema.STATISTICS 
-- WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'audit_log' AND INDEX_NAME = 'idx_audit_user_action';
-- If 0, run: ALTER TABLE audit_log ADD INDEX idx_audit_user_action (user_id, action);
-- ALTER TABLE audit_log ADD INDEX idx_audit_company_created (company_id, created_at);
-- ALTER TABLE audit_log ADD INDEX idx_audit_entity (entity_type, entity_id);

-- 4. View for combined audit log (optional - for easier querying)
-- admin_images_audit table structure:
-- id, admin_image_id, action, old_file_path, new_file_path, changed_by, changed_at
-- Fix collation mismatch by explicitly casting columns:
CREATE OR REPLACE VIEW combined_audit_log AS
SELECT 
    id,
    company_id,
    user_id,
    action COLLATE utf8mb4_0900_ai_ci as action,
    entity_type COLLATE utf8mb4_0900_ai_ci as entity_type,
    entity_id,
    changes,
    ip_address COLLATE utf8mb4_0900_ai_ci as ip_address,
    user_agent COLLATE utf8mb4_0900_ai_ci as user_agent,
    user_name COLLATE utf8mb4_0900_ai_ci as user_name,
    created_at,
    'system' COLLATE utf8mb4_0900_ai_ci as log_source
FROM audit_log
UNION ALL
SELECT 
    id,
    1 as company_id,
    changed_by as user_id,
    action COLLATE utf8mb4_0900_ai_ci as action,
    'image' COLLATE utf8mb4_0900_ai_ci as entity_type,
    admin_image_id as entity_id,
    JSON_OBJECT(
        'old_file_path', old_file_path,
        'new_file_path', new_file_path
    ) as changes,
    '' COLLATE utf8mb4_0900_ai_ci as ip_address,
    '' COLLATE utf8mb4_0900_ai_ci as user_agent,
    '' COLLATE utf8mb4_0900_ai_ci as user_name,
    changed_at as created_at,
    'image' COLLATE utf8mb4_0900_ai_ci as log_source
FROM admin_images_audit
ORDER BY created_at DESC;

-- 5. Function to clean old audit logs (optional - run periodically)
-- DELETE FROM audit_log WHERE created_at < DATE_SUB(NOW(), INTERVAL 1 YEAR);
-- DELETE FROM admin_images_audit WHERE changed_at < DATE_SUB(NOW(), INTERVAL 1 YEAR);