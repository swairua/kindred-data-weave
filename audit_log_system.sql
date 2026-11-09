-- Audit Log System SQL
-- Run this to ensure all required tables and indexes exist

-- 1. Main audit_log table (created by migrate_settings.sql)
-- Already exists with structure:
-- id, company_id, user_id, action, entity_type, entity_id, changes(JSON), ip_address, user_agent, user_name, created_at

-- 2. Additional indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_audit_user_action ON audit_log (user_id, action);
CREATE INDEX IF NOT EXISTS idx_audit_company_created ON audit_log (company_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log (entity_type, entity_id);

-- 3. Ensure admin_images_audit table exists (for image-specific audit)
-- This table is created by the image upload API automatically
-- Structure: id, image_id, image_type, action, old_file_path, new_file_path, uploaded_by, created_at

-- 4. View for combined audit log (optional - for easier querying)
CREATE OR REPLACE VIEW combined_audit_log AS
SELECT 
    id,
    company_id,
    user_id,
    action,
    entity_type,
    entity_id,
    changes,
    ip_address,
    user_agent,
    user_name,
    created_at,
    'system' as log_source
FROM audit_log
UNION ALL
SELECT 
    id,
    1 as company_id,
    uploaded_by as user_id,
    action,
    'image' as entity_type,
    image_id as entity_id,
    JSON_OBJECT('image_type', image_type, 'file_name', file_name) as changes,
    '' as ip_address,
    '' as user_agent,
    '' as user_name,
    created_at,
    'image' as log_source
FROM admin_images_audit
ORDER BY created_at DESC;

-- 5. Function to clean old audit logs (optional - run periodically)
-- DELETE FROM audit_log WHERE created_at < DATE_SUB(NOW(), INTERVAL 1 YEAR);
-- DELETE FROM admin_images_audit WHERE created_at < DATE_SUB(NOW(), INTERVAL 1 YEAR);