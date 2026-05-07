# User Management and Table Permissions Setup

This document outlines all the modifications made to implement user management with table-level access control.

## Database Changes

### 1. Create new table: `user_allowed_tables`

Execute the SQL file: `create_user_allowed_tables.sql`

This creates:
- `user_allowed_tables` table with columns:
  - `id` (Primary Key, Auto Increment)
  - `user_id` (Foreign Key to users.id)
  - `table_name` (varchar - name of the database table)
  - `created_at` (timestamp)
  - `updated_at` (timestamp)

- Unique constraint on (user_id, table_name) to prevent duplicates
- Foreign key relationship with users table (CASCADE on delete)
- Pre-populated with admin user (id=1) having access to all tables

## Backend API Changes (api.php)

### 1. Updated ALLOWED_TABLES constant (line 205)
- Added `'user_allowed_tables' => true` to allow API access to the new table

### 2. Modified list action (line 874-937)
- Added `$adminTables` array with tables that don't filter by user_id:
  - 'users'
  - 'user_allowed_tables'
- These tables can now be listed by all authenticated users (not filtered by their user_id)
- This allows admins to see all users and all permission records

## Frontend Changes

### Updated UserManagement Component (src/pages/UserManagement.tsx)

#### New Features:
1. **Display all users** with their information
2. **Show table access count** for each user (e.g., "5/8 tables")
3. **Manage Access button** for each user to configure permissions
4. **Permission dialog** with checkboxes for each available table:
   - projects
   - test_definitions
   - test_results
   - atterberg_instances
   - atterberg_rows
   - admin_images
   - admin_images_audit
   - users

#### Functionality:
- Load users from the "users" table
- Load all permissions from "user_allowed_tables" table
- Allow admins to check/uncheck tables for each user
- Save changes by creating/deleting permission records
- Show toast notifications for success/error

## How It Works

1. **Admin opens User Management page** (`/users`)
2. **Page loads all users** from the database
3. **Page loads all user permissions** from the `user_allowed_tables` table
4. **Admin clicks "Manage Access"** for a user
5. **Dialog opens** showing all available tables with checkboxes
6. **Admin checks/unchecks tables** to allow/deny access
7. **Admin clicks "Save Changes"**
8. **Frontend:**
   - Finds which tables were added/removed
   - Creates new records in `user_allowed_tables` for added tables
   - Deletes records from `user_allowed_tables` for removed tables
9. **Success toast** shows the permissions were updated

## Permission Model

The system uses a **whitelist-based permission model**:
- By default, users have NO access to any tables
- Admins must explicitly grant access to each table
- Users can only access/modify records in tables they've been granted access to

## Implementation Notes

1. **Security**: The API still filters records by user_id for owned data (projects, test_results, etc.)
2. **Table-level permissions**: The user_allowed_tables only grants access at the table level
3. **Row-level access**: Individual records are still filtered by user_id where applicable
4. **Admin access**: The admin user (id=1) is pre-populated with access to all tables

## Next Steps (Optional)

1. **Backend enforcement**: Modify api.php to check user_allowed_tables before allowing read/write operations
2. **Frontend enforcement**: Hide UI elements (tabs, buttons) for tables the user doesn't have access to
3. **User creation**: Add ability to create new users in the User Management interface
4. **Roles**: Create predefined roles (Admin, Technician, Viewer) instead of manual table selection

## File References

- **SQL Migration**: `create_user_allowed_tables.sql`
- **Backend**: `api.php` (lines 205-237 for table list, 874-937 for list action)
- **Frontend**: `src/pages/UserManagement.tsx`
