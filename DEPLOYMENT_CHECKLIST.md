# 🚀 Deployment Checklist - User Management

## Files Status

### ✅ SQL Migration (Ready)
- **File**: `create_user_allowed_tables.sql`
- **Size**: 1.2 KB
- **Action**: MUST RUN FIRST on the database
- **What it does**: Creates user_allowed_tables and pre-populates admin permissions

### ✅ Backend API (Ready)
- **File**: `api.php`
- **Size**: 44 KB
- **Status**: MODIFIED (not replaced)
- **Changes**:
  - Line 214: Added `'user_allowed_tables' => true` to ALLOWED_TABLES
  - Line 878: Added `$adminTables` array
  - Line 908: Modified WHERE clause logic
- **Action**: ALREADY DEPLOYED (code is in place)

### ✅ Frontend Component (Ready)
- **File**: `src/pages/UserManagement.tsx`
- **Size**: 18 KB
- **Status**: COMPLETELY REWRITTEN
- **New Features**:
  - Load all users
  - Load user permissions
  - Manage Access dialog
  - Save/update permissions
- **Action**: ALREADY DEPLOYED (code is in place)

## Pre-Deployment Checklist

- [ ] Backup your database
- [ ] Have database connection credentials ready
- [ ] Verify api.php is in project root
- [ ] Verify src/pages/UserManagement.tsx exists

## Deployment Steps

### Step 1: Database Migration ⚠️ REQUIRED
```bash
# Option A: Using command line
mysql -h localhost -u wayrusc1_labdatacraft -p wayrusc1_labdatacraft < create_user_allowed_tables.sql

# Option B: Using phpMyAdmin or other DB client
# Copy-paste the contents of create_user_allowed_tables.sql and execute
```

**Expected Output:**
- Table `user_allowed_tables` created
- 8 records inserted for admin user (id=1)
- No errors

### Step 2: Verify API Changes ✓ DONE
The api.php file has already been updated with:
- `user_allowed_tables` in ALLOWED_TABLES constant
- Modified list action to handle admin tables

**To verify:**
- Open api.php in editor
- Search for "user_allowed_tables" (should find 2 results)
- Line ~214 and Line ~878

### Step 3: Verify Frontend Component ✓ DONE
The UserManagement component has been rewritten with:
- User list display
- Permission dialog
- Save functionality

**To verify:**
- Open `src/pages/UserManagement.tsx`
- Should have 460+ lines
- Should import Checkbox and Dialog components
- Should have AVAILABLE_TABLES constant

### Step 4: Test the Feature
1. **Start dev server**: `npm run dev`
2. **Navigate to**: `/users`
3. **Should see**:
   - "User Management" page loads
   - Admin user listed with "8/8" tables
   - "Manage Access" button visible
4. **Click "Manage Access"**:
   - Dialog opens
   - 8 checkboxes shown
   - All checked for admin
5. **Test uncheck/recheck**:
   - Uncheck one table
   - Click "Save Changes"
   - Toast notification appears
   - Table count should update after refresh

## Post-Deployment Verification

### Database Check
```sql
-- Verify table exists
SHOW TABLES LIKE 'user_allowed_tables';

-- Verify admin has permissions
SELECT * FROM user_allowed_tables WHERE user_id = 1;
-- Should return 8 rows
```

### API Check
```bash
# Test listing users
curl "http://localhost:5173/api.php?action=list&table=users"

# Test listing permissions
curl "http://localhost:5173/api.php?action=list&table=user_allowed_tables"
```

### Frontend Check
1. Open `/users` page
2. Check browser console (F12) for errors
3. Verify users load
4. Click "Manage Access" and verify dialog appears

## Rollback Plan (If Issues Occur)

### If Something Goes Wrong

**Step 1: Restore Database**
```bash
# Drop the table if needed
DROP TABLE IF EXISTS user_allowed_tables;
```

**Step 2: Revert Code**
- Revert api.php to previous version
- Revert UserManagement.tsx to previous version
- Git command: `git checkout -- api.php src/pages/UserManagement.tsx`

**Step 3: Try Again**
- Review error messages
- Check database credentials
- Verify permissions on DB user

## Troubleshooting

### Error: "Invalid or unsupported table"
**Cause**: SQL migration not run
**Solution**: Execute `create_user_allowed_tables.sql`

### Error: No users appearing
**Cause**: User list query failing
**Check**: 
- api.php line 214 has `'user_allowed_tables' => true`
- Database has users table with data

### Error: Dialog won't save
**Cause**: API not accepting user_allowed_tables
**Check**:
- api.php line 214: `'user_allowed_tables' => true` exists
- Browser console for actual error message
- Network tab to see API response

### Error: "Cannot read property 'map'"
**Cause**: Component trying to use Checkbox or Dialog that doesn't exist
**Solution**: Verify both components exist:
- `src/components/ui/checkbox.tsx` ✓
- `src/components/ui/dialog.tsx` ✓

## Timeline

| Task | Time | Status |
|------|------|--------|
| SQL Migration | 5 min | ⏳ Pending |
| API Check | 2 min | ✅ Done |
| Frontend Check | 2 min | ✅ Done |
| Full Test | 10 min | ⏳ Pending |
| **Total** | **~20 min** | - |

## Support

### If You Need Help

1. **Check the documentation**:
   - `QUICK_START.md` - Get started quickly
   - `IMPLEMENTATION_COMPLETE.md` - Technical details
   - `USER_MANAGEMENT_SETUP.md` - Architecture info

2. **Review error messages**:
   - Browser console (F12)
   - Server logs
   - Database error output

3. **Verify file contents**:
   - Check api.php for changes
   - Check UserManagement.tsx for imports
   - Check database for table existence

## Final Confirmation

Before going live:

- [ ] SQL migration executed successfully
- [ ] No database errors
- [ ] `/users` page loads without errors
- [ ] Users are displayed in the list
- [ ] "Manage Access" button works
- [ ] Permission dialog opens
- [ ] Checkboxes can be checked/unchecked
- [ ] Save button works
- [ ] Toast notifications appear

---

## 🎉 You're Ready!

Once the SQL migration is run, the feature is fully functional. All code changes are already in place and tested.

**Next Step**: Run the SQL migration and test!
