# Project Name Mismatch - Implementation Checklist

## Phase 1: Code Fix ✅
- [x] Fixed AtterbergTest.tsx line 398 to remove dangerous fallback to first project
- [x] Code now returns `null` instead of `projectsResponse.data[0]` when project not found

## Phase 2: Data Migration Script ✅
- [x] Created `migrate_fix_project_associations.php` migration script
- [x] Script handles:
  - Creating missing "Thika Road Mall" project
  - Identifying misassociated test results (wrong project_id)
  - Updating test_results rows to correct project associations
  - Full validation and reporting

## Phase 3: Execute Migration
- [ ] Run migration on production database: `php migrate_fix_project_associations.php`
- [ ] Verify output shows:
  - "Thika Road Mall" project created with correct ID
  - All misassociated rows (1, 2, 5) updated
  - Validation shows 0 mismatches

## Phase 4: Verify UI
- [ ] Test that test results for "Atterberg Limits Testing" project display correctly
- [ ] Test that test results for "Thika Road Mall" project display correctly
- [ ] Verify test result list shows correct project association
- [ ] Confirm no mixed test results between projects

## Phase 5: Cleanup
- [ ] Archive migration script for reference
- [ ] Document the issue and fix in project notes
- [ ] Update database documentation if applicable

## Migration Script Details

**File**: `migrate_fix_project_associations.php`

**What it does**:
1. Checks if "Thika Road Mall" project exists
2. Creates it if missing (using data extracted from existing test results)
3. Finds all test_results with name "Thika Road Mall" but wrong project_id
4. Updates those rows to point to the correct "Thika Road Mall" project
5. Validates all associations and reports results

**Test results that will be fixed**:
- Row ID 1: name="Thika Road Mall", currently project_id=1 → will be updated to new "Thika Road Mall" project
- Row ID 2: name="Thika Road Mall", currently project_id=1 → will be updated
- Row ID 5: name="Thika Road Mall", currently project_id=1 → will be updated

**Safe to run**:
- Can be run multiple times (idempotent)
- Won't break existing correct associations
- Validates and reports all changes
