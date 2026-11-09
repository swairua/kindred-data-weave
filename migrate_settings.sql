-- ============================================================
-- Settings Tables Migration
-- Adds tables for Company, Organisation details, Billing,
-- Automation, Policies, Workflows, Compliance, Audit log,
-- Connectivity, and Integrations settings.
-- ============================================================

-- 1. Organisation details (extends company_info)
CREATE TABLE IF NOT EXISTS organisation_details (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  company_id INT UNSIGNED NOT NULL DEFAULT 1,
  legal_name VARCHAR(255) DEFAULT NULL,
  registration_number VARCHAR(100) DEFAULT NULL,
  tax_id VARCHAR(50) DEFAULT NULL,
  industry VARCHAR(100) DEFAULT NULL,
  year_established INT DEFAULT NULL,
  headquarters_country VARCHAR(100) DEFAULT NULL,
  description TEXT DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY (company_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 2. Billing settings
CREATE TABLE IF NOT EXISTS billing_settings (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  company_id INT UNSIGNED NOT NULL DEFAULT 1,
  payment_method ENUM('bank_transfer','card','mobile_money','check') DEFAULT 'bank_transfer',
  bank_name VARCHAR(255) DEFAULT NULL,
  account_name VARCHAR(255) DEFAULT NULL,
  account_number VARCHAR(50) DEFAULT NULL,
  billing_frequency ENUM('monthly','quarterly','annually') DEFAULT 'monthly',
  tax_rate DECIMAL(5,2) DEFAULT 0.00,
  invoice_template VARCHAR(100) DEFAULT 'standard',
  billing_contact_name VARCHAR(255) DEFAULT NULL,
  billing_contact_email VARCHAR(150) DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY (company_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 3. Automation settings
CREATE TABLE IF NOT EXISTS automation_settings (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  company_id INT UNSIGNED NOT NULL DEFAULT 1,
  auto_save_minutes INT DEFAULT 5,
  auto_export_reports TINYINT(1) DEFAULT 0,
  scheduled_report_time TIME DEFAULT '09:00:00',
  email_notifications TINYINT(1) DEFAULT 1,
  notification_emails TEXT DEFAULT NULL,
  data_retention_days INT DEFAULT 365,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY (company_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 4. Policy settings
CREATE TABLE IF NOT EXISTS policy_settings (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  company_id INT UNSIGNED NOT NULL DEFAULT 1,
  default_acceptance_margin_mpa DECIMAL(5,2) DEFAULT 4.00,
  require_photo_evidence TINYINT(1) DEFAULT 1,
  default_standard VARCHAR(50) DEFAULT 'BS EN 12390-3',
  compliance_mode ENUM('full','summary','minimal') DEFAULT 'full',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY (company_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 5. Workflow settings
CREATE TABLE IF NOT EXISTS workflow_settings (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  company_id INT UNSIGNED NOT NULL DEFAULT 1,
  require_approval_before_save TINYINT(1) DEFAULT 0,
  approval_role ENUM('senior_technician','lab_manager','admin') DEFAULT 'senior_technician',
  auto_advance_test_steps TINYINT(1) DEFAULT 0,
  save_and_next_test TINYINT(1) DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY (company_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 6. Compliance settings
CREATE TABLE IF NOT EXISTS compliance_settings (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  company_id INT UNSIGNED NOT NULL DEFAULT 1,
  active_standards JSON DEFAULT NULL,
  required_fields JSON DEFAULT NULL,
  audit_required TINYINT(1) DEFAULT 1,
  certificate_issuer VARCHAR(255) DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY (company_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 7. Audit log
CREATE TABLE IF NOT EXISTS audit_log (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  company_id INT UNSIGNED DEFAULT NULL,
  user_id INT UNSIGNED DEFAULT NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50) DEFAULT NULL,
  entity_id INT UNSIGNED DEFAULT NULL,
  changes JSON DEFAULT NULL,
  ip_address VARCHAR(45) DEFAULT NULL,
  user_agent TEXT DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_action (action),
  INDEX idx_created (created_at),
  INDEX idx_entity (entity_type, entity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 8. Integrations
CREATE TABLE IF NOT EXISTS integrations (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  company_id INT UNSIGNED NOT NULL DEFAULT 1,
  integration_type VARCHAR(50) DEFAULT NULL,
  provider VARCHAR(100) DEFAULT NULL,
  config JSON DEFAULT NULL,
  api_key_encrypted TEXT DEFAULT NULL,
  is_active TINYINT(1) DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY (company_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 9. Connectivity settings
CREATE TABLE IF NOT EXISTS connectivity_settings (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  company_id INT UNSIGNED NOT NULL DEFAULT 1,
  api_endpoint VARCHAR(255) DEFAULT NULL,
  network_timeout_seconds INT DEFAULT 30,
  enable_ssl TINYINT(1) DEFAULT 1,
  proxy_url VARCHAR(255) DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY (company_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Insert default rows for company_id = 1 (existing company)
INSERT IGNORE INTO organisation_details (company_id) VALUES (1);
INSERT IGNORE INTO billing_settings (company_id) VALUES (1);
INSERT IGNORE INTO automation_settings (company_id) VALUES (1);
INSERT IGNORE INTO policy_settings (company_id) VALUES (1);
INSERT IGNORE INTO workflow_settings (company_id) VALUES (1);
INSERT IGNORE INTO compliance_settings (company_id) VALUES (1);
INSERT IGNORE INTO connectivity_settings (company_id) VALUES (1);
INSERT IGNORE INTO integrations (company_id) VALUES (1);
