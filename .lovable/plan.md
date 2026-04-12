

## Fix: Session Write Error — "Column 'user_id' cannot be null"

### Root Cause

In `api.php` line 89-122, `DatabaseSessionHandler::write()` tries to INSERT/UPDATE the `sessions` table with `user_id`. When the session has no authenticated user (e.g., the `?action=me` check on first load), `$userId` is `null`. The database rejects this because `user_id` is `NOT NULL`.

Additionally, line 114 has a **bind_param type mismatch**: `'ssiii'` but the 4th parameter is `$data` (a string), not an integer.

### Changes

**1. `api.php` — Fix `DatabaseSessionHandler::write()` (lines 89-122)**

- Make `$userId` default to `0` or handle null properly in the SQL
- Fix bind_param types from `'ssiii'` to `'ssisi'`
- Allow null user_id by using a conditional query or defaulting to 0

```php
public function write(string $id, string $data): bool
{
    try {
        $userId = null;
        if ($data !== '') {
            // PHP session data is NOT standard serialized — use session_decode workaround
            $tempData = $_SESSION ?? [];
            $userId = isset($tempData['user_id']) ? (int)$tempData['user_id'] : null;
        }

        // Default user_id to 0 for unauthenticated sessions
        $userIdValue = $userId ?? 0;

        $sql = "INSERT INTO `sessions` (session_id, session_data, expires_at, updated_at, user_id)
                VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 30 MINUTE), NOW(), ?)
                ON DUPLICATE KEY UPDATE session_data = ?, updated_at = NOW(), expires_at = DATE_ADD(NOW(), INTERVAL 30 MINUTE), user_id = ?";
        $stmt = $this->conn->prepare($sql);
        if (!$stmt) return false;

        $stmt->bind_param('ssisi', $id, $data, $userIdValue, $data, $userIdValue);
        $stmt->execute();
        $stmt->close();
        return true;
    } catch (Exception $e) {
        error_log('Session write error: ' . $e->getMessage());
        return false;
    }
}
```

**Key fixes:**
- Read `user_id` from `$_SESSION` directly (PHP session data uses a custom serialization format, not standard `unserialize`)
- Default `$userId` to `0` when null so the NOT NULL constraint is satisfied
- Fix bind types to `'ssisi'` (string, string, int, string, int)

**2. `migrate_sessions_table.sql` — Alternative: make `user_id` nullable**

If you'd prefer a cleaner approach, alter the column:
```sql
ALTER TABLE `sessions` MODIFY COLUMN `user_id` INT NULL DEFAULT NULL;
```

I recommend **both** — make the column nullable AND default to null in code, so unauthenticated sessions are stored cleanly.

### Technical Details

| Issue | Location | Fix |
|-------|----------|-----|
| `user_id` cannot be null | `sessions` table schema | `ALTER TABLE` to allow NULL |
| `unserialize()` doesn't work on PHP session data | `write()` line 94-103 | Read from `$_SESSION` directly |
| Wrong bind_param types `'ssiii'` | `write()` line 114 | Change to `'ssisi'` |

