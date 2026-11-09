# Multi-Company Support — Architecture, SQL & Implementation Plan

> **Document version:** 1.0  
> **Created:** 2026-11-09  
> **Status:** Planning / Documentation only — no existing code was modified

---

## 1. Current State Summary

The system is built for a **single company** (company_id = 1). There is no tenant isolation, subscription logic, or company switching.

| Area | Current Implementation |
|---|---|
| **Settings tables** | 9 tables (organisation_details, billing_settings, automation_settings, policy_settings, workflow_settings, compliance_settings, audit_log, connectivity_settings, integrations) |
| **Schema** | `company_id INT UNSIGNED NOT NULL DEFAULT 1` with `UNIQUE KEY (company_id)` — only one row per table, always company_id = 1 |
| **SQL migration** | Default rows: `INSERT IGNORE INTO ... (company_id) VALUES (1);` |
| **API** | `api.php:339` — `$companyId = $data['company_id'] ?? 1;` — hard default to 1 |
| **Settings page** | Operates on single company model; no company selector UI |
| **Audit log** | `company_id` column exists but defaults to same pattern |
| **No tenant isolation** | No logic to look up, switch, or isolate by company_id |

**Conclusion:** Multi-company support does **not** exist. New companies cannot be onboarded, and data is not isolated between tenants.

---

## 2. Target Architecture: Multi-Tenant SaaS

### 2.1 High-Level Design

```
┌─────────────────────────────────────────────────────┐
│                  USER AUTHENTICATION                  │
│              (email/password, SSO, OAuth)             │
└──────────────────┬──────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────┐
│              COMPANY CONTEXT MIDDLEWARE               │
│  • Resolve active company_id from session/token      │
│  • Validate user has access to company                │
│  • Inject company_id into all DB queries             │
└──────────────────┬──────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────┐
│              COMPANY-AWARE CRUD LAYER                 │
│  • All reads: WHERE company_id = ?                   │
│  • All writes: auto-set company_id from context      │
│  • Audit logging: per-company scope                   │
└──────────────────┬──────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────┐
│              DATABASE (MULTI-TENANT)                  │
│  • companies table (registry)                        │
│  • settings tables: multiple rows per company        │
│  • company_users junction table                      │
│  • subscriptions table                               │
└─────────────────────────────────────────────────────┘
```

### 2.2 Key Principles

1. **Shared database, shared schema** — All tenants use the same tables, isolated by `company_id`.
2. **Row-level security** — Every query includes `WHERE company_id = ?`.
3. **Backward compatible** — Existing data remains under company_id = 1; new companies can be added.
4. **Plan-based limits** — Subscription tier controls features and resource caps.
5. **Company switching** — Users can belong to multiple companies and switch context.

---

## 3. SQL Migration Plan

### 3.1 New Table: `companies`

```sql
-- ============================================================
-- TABLE: companies (tenant registry)
-- ============================================================
CREATE TABLE IF NOT EXISTS companies (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(50) DEFAULT NULL,
  address TEXT DEFAULT NULL,
  city VARCHAR(100) DEFAULT NULL,
  country VARCHAR(100) DEFAULT NULL,
  tax_id VARCHAR(100) DEFAULT NULL,
  registration_number VARCHAR(100) DEFAULT NULL,
  plan_type ENUM('free', 'pro', 'enterprise') DEFAULT 'free',
  status ENUM('active', 'trial', 'suspended', 'cancelled') DEFAULT 'active',
  trial_ends_at DATETIME DEFAULT NULL,
  subscription_id VARCHAR(255) DEFAULT NULL,
  max_users INT UNSIGNED DEFAULT 2,
  max_projects INT UNSIGNED DEFAULT 100,
  max_storage_gb INT UNSIGNED DEFAULT 10,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_status (status),
  INDEX idx_plan (plan_type),
  INDEX idx_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

### 3.2 New Table: `company_users` (junction)

```sql
-- ============================================================
-- TABLE: company_users (user-to-company access)
-- ============================================================
CREATE TABLE IF NOT EXISTS company_users (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  company_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  role ENUM('owner', 'admin', 'member', 'viewer') DEFAULT 'member',
  is_primary BOOLEAN DEFAULT FALSE,
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_company_user (company_id, user_id),
  INDEX idx_user (user_id),
  INDEX idx_company (company_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

### 3.3 New Table: `subscriptions`

```sql
-- ============================================================
-- TABLE: subscriptions (billing & plan tracking)
-- ============================================================
CREATE TABLE IF NOT EXISTS subscriptions (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  company_id INT UNSIGNED NOT NULL,
  plan_type ENUM('free', 'pro', 'enterprise') NOT NULL,
  status ENUM('active', 'trialing', 'past_due', 'cancelled', 'expired') DEFAULT 'trialing',
  billing_cycle ENUM('monthly', 'annual') DEFAULT 'monthly',
  price_usd DECIMAL(10,2) DEFAULT 0.00,
  currency VARCHAR(10) DEFAULT 'USD',
  current_period_start DATETIME DEFAULT NULL,
  current_period_end DATETIME DEFAULT NULL,
  trial_ends_at DATETIME DEFAULT NULL,
  stripe_subscription_id VARCHAR(255) DEFAULT NULL,
  stripe_customer_id VARCHAR(255) DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  INDEX idx_company (company_id),
  INDEX idx_status (status),
  INDEX idx_plan (plan_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

### 3.4 New Table: `plan_limits`

```sql
-- ============================================================
-- TABLE: plan_limits (feature gating per plan)
-- ============================================================
CREATE TABLE IF NOT EXISTS plan_limits (
  plan_type ENUM('free', 'pro', 'enterprise') PRIMARY KEY,
  max_companies INT UNSIGNED DEFAULT 1,
  max_users INT UNSIGNED DEFAULT 2,
  max_projects INT UNSIGNED DEFAULT 100,
  max_storage_gb INT UNSIGNED DEFAULT 10,
  max_audit_log_retention_days INT UNSIGNED DEFAULT 30,
  features JSON DEFAULT '{}'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Seed plan limits
INSERT IGNORE INTO plan_limits (plan_type, max_companies, max_users, max_projects, max_storage_gb, max_audit_log_retention_days, features) VALUES
  ('free', 1, 2, 100, 10, 30, '{"audit_log": false, "custom_branding": false, "cross_company_analytics": false}'),
  ('pro', 5, 10, 500, 50, 365, '{"audit_log": true, "custom_branding": true, "cross_company_analytics": false}'),
  ('enterprise', 999, 999, 9999, 500, 3650, '{"audit_log": true, "custom_branding": true, "cross_company_analytics": true}');
```

### 3.5 Modify Existing Settings Tables

**Remove `UNIQUE KEY (company_id)` and add regular index on `company_id`:**

```sql
-- ============================================================
-- ALTER: Remove UNIQUE KEY, add regular INDEX on company_id
-- for all 9 settings tables
-- ============================================================

ALTER TABLE organisation_details DROP INDEX IF EXISTS unique_company;
ALTER TABLE organisation_details ADD INDEX idx_company (company_id);

ALTER TABLE billing_settings DROP INDEX IF EXISTS unique_company;
ALTER TABLE billing_settings ADD INDEX idx_company (company_id);

ALTER TABLE automation_settings DROP INDEX IF EXISTS unique_company;
ALTER TABLE automation_settings ADD INDEX idx_company (company_id);

ALTER TABLE policy_settings DROP INDEX IF EXISTS unique_company;
ALTER TABLE policy_settings ADD INDEX idx_company (company_id);

ALTER TABLE workflow_settings DROP INDEX IF EXISTS unique_company;
ALTER TABLE workflow_settings ADD INDEX idx_company (company_id);

ALTER TABLE compliance_settings DROP INDEX IF EXISTS unique_company;
ALTER TABLE compliance_settings ADD INDEX idx_company (company_id);

ALTER TABLE audit_log DROP INDEX IF EXISTS unique_company;
ALTER TABLE audit_log ADD INDEX idx_company (company_id);

ALTER TABLE connectivity_settings DROP INDEX IF EXISTS unique_company;
ALTER TABLE connectivity_settings ADD INDEX idx_company (company_id);

ALTER TABLE integrations DROP INDEX IF EXISTS unique_company;
ALTER TABLE integrations ADD INDEX idx_company (company_id);
```

> **Note:** If the UNIQUE constraint is named differently (e.g., `company_id` or `UNIQUE KEY (company_id)`), run `SHOW INDEX FROM organisation_details;` to find the actual index name, then replace above.

### 3.6 Default Company Setup (Migration)

```sql
-- ============================================================
-- MIGRATE: Create default company from existing company_info
-- ============================================================

-- Step 1: Create default company from existing company_info
INSERT INTO companies (id, name, email, plan_type, status)
SELECT 1, name, email, 'free', 'active'
FROM company_info WHERE id = 1
ON DUPLICATE KEY UPDATE name = VALUES(name), email = VALUES(email);

-- Step 2: Create default subscription for company 1
INSERT IGNORE INTO subscriptions (company_id, plan_type, status, billing_cycle)
VALUES (1, 'free', 'active', 'monthly');

-- Step 3: Link existing user to company 1 (if users table exists)
-- INSERT IGNORE INTO company_users (company_id, user_id, role, is_primary)
-- SELECT 1, id, 'owner', TRUE FROM users WHERE company_id = 1 OR company_id IS NULL;
```

### 3.7 Audit Log Company Scoping

```sql
-- ============================================================
-- ALTER: audit_log — add company_id filtering support
-- ============================================================
-- (Already has company_id column; ensure it's indexed)
ALTER TABLE audit_log ADD INDEX IF NOT EXISTS idx_company_created (company_id, created_at);
```

---

## 4. API Changes (api.php)

### 4.1 Company Context Resolution

Add this function near the top of `api.php`:

```php
/**
 * Resolve active company_id from request context.
 *
 * Priority:
 * 1. Explicit $_GET['company_id'] or $_POST['company_id']
 * 2. Session-stored company_id
 * 3. Default to 1 (backward compatibility)
 */
function resolveCompanyId(): int
{
    if (isset($_GET['company_id']) && is_numeric($_GET['company_id'])) {
        return (int) $_GET['company_id'];
    }
    if (isset($_POST['company_id']) && is_numeric($_POST['company_id'])) {
        return (int) $_POST['company_id'];
    }
    if (isset($_SESSION['company_id']) && is_numeric($_SESSION['company_id'])) {
        return (int) $_SESSION['company_id'];
    }
    return 1; // backward-compatible default
}
```

### 4.2 Inject company_id into All CRUD Operations

In each CRUD handler (create, read, update, delete), inject:

```php
// In create handler:
$companyId = resolveCompanyId();
$data['company_id'] = $companyId;

// In read handler (list):
$companyId = resolveCompanyId();
$conditions[] = "company_id = ?";
$params[] = $companyId;

// In update handler:
$companyId = resolveCompanyId();
// Add to WHERE clause: AND company_id = ?
```

### 4.3 Company Switching Endpoint

```php
// New endpoint: POST /api.php?action=switch_company
case 'switch_company':
    $user = requireAuth($conn);
    $targetCompanyId = (int) $body['company_id'];
    
    // Validate user has access to this company
    $stmt = $conn->prepare("SELECT role FROM company_users WHERE user_id = ? AND company_id = ? LIMIT 1");
    $stmt->bind_param('ii', $user['id'], $targetCompanyId);
    $stmt->execute();
    $result = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    
    if (!$result) {
        respond(['error' => 'Access denied to this company'], 403);
    }
    
    $_SESSION['company_id'] = $targetCompanyId;
    respond(['success' => true, 'company_id' => $targetCompanyId, 'role' => $result['role']]);
    break;
```

### 4.4 Company List Endpoint

```php
// New endpoint: GET /api.php?action=list_companies
case 'list_companies':
    $user = requireAuth($conn);
    $stmt = $conn->prepare("
        SELECT c.*, cu.role, cu.is_primary 
        FROM companies c
        JOIN company_users cu ON c.id = cu.company_id
        WHERE cu.user_id = ?
        ORDER BY cu.is_primary DESC, c.name ASC
    ");
    $stmt->bind_param('i', $user['id']);
    $stmt->execute();
    $companies = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmt->close();
    respond(['data' => $companies]);
    break;
```

### 4.5 Company Creation Endpoint

```php
// New endpoint: POST /api.php?action=create_company
case 'create_company':
    $user = requireAuth($conn);
    
    // Check plan limit
    $planLimit = getPlanLimit($conn, $user['id']);
    $stmt = $conn->prepare("SELECT COUNT(*) as cnt FROM company_users WHERE user_id = ? AND role = 'owner'");
    $stmt->bind_param('i', $user['id']);
    $stmt->execute();
    $count = $stmt->get_result()->fetch_assoc()['cnt'];
    $stmt->close();
    
    if ($count >= $planLimit['max_companies']) {
        respond(['error' => 'Company limit reached. Upgrade your plan.'], 403);
    }
    
    // Create company
    $stmt = $conn->prepare("INSERT INTO companies (name, email, plan_type, status) VALUES (?, ?, 'free', 'trial')");
    $stmt->bind_param('ss', $body['name'], $body['email']);
    $stmt->execute();
    $companyId = $conn->insert_id;
    $stmt->close();
    
    // Link user as owner
    $stmt = $conn->prepare("INSERT INTO company_users (company_id, user_id, role, is_primary) VALUES (?, ?, 'owner', TRUE)");
    $stmt->bind_param('ii', $companyId, $user['id']);
    $stmt->execute();
    $stmt->close();
    
    // Create default settings rows
    $tables = ['organisation_details', 'billing_settings', 'automation_settings', 'policy_settings', 'workflow_settings', 'compliance_settings', 'connectivity_settings'];
    foreach ($tables as $table) {
        $stmt = $conn->prepare("INSERT IGNORE INTO `$table` (company_id) VALUES (?)");
        $stmt->bind_param('i', $companyId);
        $stmt->execute();
        $stmt->close();
    }
    
    // Create subscription
    $stmt = $conn->prepare("INSERT INTO subscriptions (company_id, plan_type, status, billing_cycle) VALUES (?, 'free', 'trialing', 'monthly')");
    $stmt->bind_param('i', $companyId);
    $stmt->execute();
    $stmt->close();
    
    respond(['success' => true, 'company_id' => $companyId]);
    break;
```

---

## 5. Frontend Changes (React/TypeScript)

### 5.1 Company Context Provider

**New file: `src/context/CompanyContext.tsx`**

```tsx
import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { listRecords, readRecord } from "@/lib/api";

interface Company {
  id: number;
  name: string;
  email: string;
  plan_type: "free" | "pro" | "enterprise";
  status: string;
  role: string;
}

interface CompanyContextType {
  companies: Company[];
  activeCompany: Company | null;
  switchCompany: (companyId: number) => Promise<void>;
  createCompany: (name: string, email: string) => Promise<void>;
  isLoading: boolean;
}

const CompanyContext = createContext<CompanyContextType | undefined>(undefined);

export function CompanyProvider({ children }: { children: ReactNode }) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [activeCompany, setActiveCompany] = useState<Company | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadCompanies();
  }, []);

  const loadCompanies = async () => {
    try {
      const res = await listRecords<Company>("companies", { limit: 100 });
      setCompanies(res.data || []);
      if (res.data && res.data.length > 0) {
        // Set first company as active (or from localStorage)
        const stored = localStorage.getItem("active_company_id");
        const active = stored
          ? res.data.find((c) => c.id === Number(stored)) || res.data[0]
          : res.data[0];
        setActiveCompany(active);
      }
    } catch (error) {
      console.error("Failed to load companies:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const switchCompany = async (companyId: number) => {
    // Call API
    await fetch("/api.php?action=switch_company", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company_id: companyId }),
    });
    const company = companies.find((c) => c.id === companyId);
    if (company) {
      setActiveCompany(company);
      localStorage.setItem("active_company_id", String(companyId));
    }
  };

  const createCompany = async (name: string, email: string) => {
    const res = await fetch("/api.php?action=create_company", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email }),
    });
    const data = await res.json();
    if (data.success) {
      await loadCompanies();
    }
    return data;
  };

  return (
    <CompanyContext.Provider
      value={{ companies, activeCompany, switchCompany, createCompany, isLoading }}
    >
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  const context = useContext(CompanyContext);
  if (!context) throw new Error("useCompany must be used within CompanyProvider");
  return context;
}
```

### 5.2 Company Selector Component

**New file: `src/components/CompanySelector.tsx`**

```tsx
import { useCompany } from "@/context/CompanyContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Building2, Plus } from "lucide-react";

export function CompanySelector() {
  const { companies, activeCompany, switchCompany, createCompany } = useCompany();

  return (
    <div className="flex items-center gap-2">
      <Building2 className="h-4 w-4 text-muted-foreground" />
      <Select
        value={activeCompany?.id.toString()}
        onValueChange={(val) => switchCompany(Number(val))}
      >
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder="Select company" />
        </SelectTrigger>
        <SelectContent>
          {companies.map((company) => (
            <SelectItem key={company.id} value={company.id.toString()}>
              {company.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
```

### 5.3 API Client Updates (`src/lib/api.ts`)

Add `company_id` to all API calls:

```typescript
// In createRecord, updateRecord, deleteRecord, readRecord, listRecords:
// Add company_id to the payload/params automatically from CompanyContext

// Example modification to listRecords:
export async function listRecords<T>(
  table: string,
  params?: Record<string, unknown>
): Promise<{ data: T[]; total: number }> {
  const companyId = getActiveCompanyId(); // from CompanyContext or localStorage
  const queryParams = new URLSearchParams({
    ...params,
    company_id: String(companyId),
  } as Record<string, string>);
  // ... rest of fetch
}
```

### 5.4 Settings Page Updates

The Settings page already has 10 tabs. Changes needed:

1. **Header**: Add `<CompanySelector />` component
2. **Data loading**: All `readRecord` calls already filter by `company_id` via API
3. **Save handlers**: All `updateRecord` calls pass `company_id` automatically
4. **No structural changes** to tabs — only data scoping

### 5.5 Audit Log Company Scoping

The audit log already has a `company_id` column. Changes:
- `fetchAuditLog()` in `auditLogger.ts` filters by active company
- Settings page audit tab shows only current company's logs

---

## 6. Implementation Roadmap

### Phase 1: Foundation (Week 1)
- [ ] Run SQL migration: create `companies`, `company_users`, `subscriptions`, `plan_limits` tables
- [ ] Run SQL: remove `UNIQUE KEY` from all 9 settings tables
- [ ] Run SQL: create default company (id=1) from existing `company_info`
- [ ] Update `api.php`: add `resolveCompanyId()` function
- [ ] Update `api.php`: inject `company_id` into all CRUD operations

### Phase 2: Company Management (Week 2)
- [ ] Add `switch_company`, `list_companies`, `create_company` endpoints to `api.php`
- [ ] Create `CompanyContext.tsx` in frontend
- [ ] Create `CompanySelector.tsx` component
- [ ] Wrap app in `CompanyProvider`
- [ ] Add company selector to Settings page header

### Phase 3: Data Isolation (Week 3)
- [ ] Update all `readRecord`/`updateRecord`/`createRecord` in `src/lib/api.ts` to include `company_id`
- [ ] Update `src/pages/Settings.tsx` to use company context
- [ ] Update audit log fetching to filter by company
- [ ] Update report generators to accept `company_id` parameter
- [ ] Test: create company 2, verify data isolation from company 1

### Phase 4: Subscriptions & Limits (Week 4)
- [ ] Implement plan limit enforcement in API
- [ ] Add upgrade/downgrade flow
- [ ] Add trial period management
- [ ] Add feature gating based on plan
- [ ] Create pricing page UI

### Phase 5: Testing & Migration (Week 5)
- [ ] Write integration tests for multi-company isolation
- [ ] Test backward compatibility (existing single-company installs)
- [ ] Create migration script for existing databases
- [ ] Document upgrade path for existing users

---

## 7. Backward Compatibility Strategy

### Existing Installations
1. **Default company created** with `id=1` from existing `company_info` data
2. **All existing settings data** remains under `company_id=1`
3. **All existing audit logs** remain under `company_id=1`
4. **API defaults** to `company_id=1` if not specified
5. **No user-facing changes** until company switching is enabled

### Upgrade Path
```bash
# For existing installations:
1. Backup database
2. Run migration SQL (creates companies table, modifies settings tables)
3. Run data migration script (creates default company)
4. Deploy updated API + frontend
5. Users continue working normally (company_id=1)
6. Optional: Enable multi-company in settings
```

---

## 8. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Data leakage between companies | All queries include `WHERE company_id = ?`; integration tests for isolation |
| Breaking existing installations | Backward compat: default company_id=1; optional upgrade path |
| Performance degradation | Index `company_id` on all tables; query optimization |
| Migration data loss | Full backup before migration; validation scripts |
| UI complexity | Start with single-company mode; add switching as opt-in |
| Plan limit enforcement bugs | Thorough testing of edge cases; graceful degradation |

---

## 9. Testing Strategy

### 9.1 Unit Tests
- `resolveCompanyId()` returns correct default
- `resolveCompanyId()` respects explicit company_id
- `resolveCompanyId()` respects session company_id

### 9.2 Integration Tests
- Create company 2, verify company 1's data is not visible
- Switch company context, verify data changes
- Plan limit enforcement blocks operations beyond limit

### 9.3 E2E Tests
- User can create new company
- User can switch between companies
- Settings saved per company
- Audit log filtered per company

---

## 10. Files to Create/Modify (When Implementing)

### New Files
| File | Description |
|---|---|
| `src/context/CompanyContext.tsx` | Company state management provider |
| `src/components/CompanySelector.tsx` | Company switching dropdown |
| `migrate_multi_company.sql` | SQL migration for all changes |
| `migrate_data_to_multi.php` | PHP data migration script |

### Modified Files
| File | Changes |
|---|---|
| `api.php` | Add `resolveCompanyId()`, company endpoints, inject company_id into CRUD |
| `src/lib/api.ts` | Add company_id to all API calls |
| `src/pages/Settings.tsx` | Add CompanySelector to header |
| `migrate_settings.sql` | Add companies, company_users, subscriptions, plan_limits tables; remove UNIQUE KEY |

---

## 11. Decision Points for User

1. **Plan tiers**: Should we implement free/pro/enterprise, or keep it simpler?
2. **User access**: Can users belong to multiple companies, or one company per user?
3. **Data isolation**: Strict row-level (current plan) or separate databases per company?
4. **Billing**: Stripe integration, or manual invoicing?
5. **Migration timing**: Big-bang migration or gradual rollout?

---

*This document is for planning purposes. No existing code has been modified.*
