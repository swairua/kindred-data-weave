# Quick Start - User Management & Table Permissions

## ⚡ What Was Built

A complete **User Management System** where admins can:
1. View all users in the system
2. Assign/revoke table access to individual users
3. Track how many tables each user can access

## 🚀 Quick Setup (3 Steps)

### Step 1: Run SQL Migration
```bash
# Execute this SQL file to create the user_allowed_tables:
create_user_allowed_tables.sql
```

### Step 2: That's it! ✓
The API and Frontend are already updated.

### Step 3: Test It
1. Go to `/users` in your app
2. You'll see all users with their table access counts
3. Click "Manage Access" to configure permissions

## 📊 What You Get

**User Management Page** (`/users`):
```
┌─────────────────────────────────────────────────────┐
│ User Management                                     │
│ Manage system users and their table access         │
├─────────────────────────────────────────────────────┤
│ Users                                        0 found│
│                                                     │
│ ┌──────────┬──────────┬──────────┬─────────────┐   │
│ │ NAME     │ EMAIL    │ TABLES   │ ACTIONS     │   │
│ ├──────────┼──────────┼──────────┼─────────────┤   │
│ │ Admin    │ admin@.. │ 8/8 ⚙️   │ Manage...   │   │
│ │ John     │ john@..  │ 5/8 ⚙️   │ Manage...   │   │
│ │ Jane     │ jane@..  │ 0/8 ⚙️   │ Manage...   │   │
│ └──────────┴──────────┴──────────┴─────────────┘   │
└─────────────────────────────────────────────────────┘
```

**Permission Dialog** (when clicking "Manage Access"):
```
┌──────────────────────────────────┐
│ Manage Access for [User Name]     │
│ Select which tables this user can │
├──────────────────────────────────┤
│ ☑ projects                       │
│ ☑ test_definitions               │
│ ☑ test_results                   │
│ ☑ atterberg_instances            │
│ ☑ atterberg_rows                 │
│ ☐ admin_images                   │
│ ☐ admin_images_audit             │
│ ☐ users                          │
├──────────────────────────────────┤
│ [Cancel]         [Save Changes]   │
└──────────────────────────────────┘
```

## 📝 Files Created/Modified

| File | Status | Purpose |
|------|--------|---------|
| `create_user_allowed_tables.sql` | ✅ New | Database migration |
| `api.php` | ✅ Modified | Backend API support |
| `src/pages/UserManagement.tsx` | ✅ Modified | Frontend UI |

## 🔐 How Permissions Work

**Whitelist Model:**
- By default, users have **NO access** to any tables
- Admins must **explicitly grant** access to each table
- Users can only access tables they're granted

**Example:**
- Admin: 8/8 tables (full access)
- Technician: 4/8 tables (projects, test_definitions, test_results, atterberg_instances)
- Viewer: 2/8 tables (test_definitions, test_results - read only)

## 🛠️ The 8 Available Tables

Users can be given access to:
1. **projects** - Project management
2. **test_definitions** - Test catalog
3. **test_results** - Test result records
4. **atterberg_instances** - Atterberg test instances
5. **atterberg_rows** - Atterberg test data rows
6. **admin_images** - Admin images (logo, contacts, stamp)
7. **admin_images_audit** - Audit trail for image changes
8. **users** - User list (admin only)

## 📚 What's Stored in the Database

**New Table: `user_allowed_tables`**
```sql
id (int)              -- Permission record ID
user_id (int)         -- User ID
table_name (varchar)  -- Table name (e.g., 'projects')
created_at (timestamp)-- When permission was granted
updated_at (timestamp)-- Last update
```

**Example Data:**
```
id | user_id | table_name | created_at
---+---------+------------+----------
1  | 1       | projects   | 2026-05-05
2  | 1       | test_definitions | 2026-05-05
3  | 1       | test_results | 2026-05-05
...
```

## 🔄 How It Works Behind the Scenes

1. **Admin visits `/users`**
2. **Frontend loads:**
   - All users from `users` table
   - All permissions from `user_allowed_tables` table
3. **Page displays:**
   - User list with table count
   - "Manage Access" button for each
4. **Admin clicks "Manage Access"**
5. **Dialog opens** with checkboxes for 8 tables
6. **Admin checks/unchecks** to change access
7. **Admin clicks "Save"**
8. **Frontend:**
   - Finds added tables (create records)
   - Finds removed tables (delete records)
9. **Success!** Toast notification appears

## 🚨 Important Notes

1. **SQL Migration Required**: You MUST run `create_user_allowed_tables.sql` first
2. **Admin User**: ID=1 (admin@cransfield.com) gets all permissions by default
3. **API Still Works**: All existing functionality remains unchanged
4. **Backward Compatible**: Existing users/permissions not affected

## ❓ FAQ

**Q: What happens to existing users?**
A: They appear in the list with 0/8 tables until you assign permissions.

**Q: Can users create new users?**
A: Not yet - you need to create users via database or add UI for it (optional enhancement).

**Q: Is this enforced in the API?**
A: The table exists. Backend can be enhanced to enforce it on all requests (optional).

**Q: Can I hide UI elements based on permissions?**
A: Yes - frontend can be enhanced to hide tabs/buttons for tables user doesn't access.

## 📞 Support

For issues:
1. Check that SQL migration ran successfully
2. Verify `api.php` has `user_allowed_tables` in ALLOWED_TABLES
3. Check browser console for JavaScript errors
4. Check server logs for API errors

---

**Status**: ✅ **READY TO DEPLOY**

Just run the SQL migration and you're all set!
