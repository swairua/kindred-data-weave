

## Fix: Authentication Broken — Session Token Not Exchanged

### Root Cause (3 issues)

1. **Login never returns `session_token`** — The client expects `session_token` in the login response body and stores it in localStorage. The backend never sends it.

2. **Backend ignores `X-Session-Token` header** — The client sends auth via `X-Session-Token` header, but the backend only reads `PHPSESSID` cookies. Cross-origin cookies are blocked between `*.lovableproject.com` and `lab.wayrus.co.ke`, so every request after login is unauthenticated.

3. **FK constraint on `user_id=0`** — The previous fix defaults `user_id` to `0`, but there's a foreign key `fk_sessions_user` referencing `users(id)`. No user with `id=0` exists, so session writes fail.

4. **CORS missing `X-Session-Token`** — Line 29 allows `Content-Type, Authorization` but not `X-Session-Token`.

### Changes

**`api.php` — 4 fixes:**

1. **Add `X-Session-Token` to CORS allowed headers** (line 29):
   ```php
   header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Session-Token');
   header('Access-Control-Expose-Headers: X-Session-Token');
   ```

2. **Before `session_start()`, check for `X-Session-Token` header and use it as session ID** (~line 170):
   ```php
   $incomingToken = $_SERVER['HTTP_X_SESSION_TOKEN'] ?? '';
   if ($incomingToken && preg_match('/^[a-zA-Z0-9,-]{22,256}$/', $incomingToken)) {
       session_id($incomingToken);
   }
   session_start();
   ```

3. **In login response, return `session_token: session_id()`** (~line 547):
   ```php
   respond([
       'message' => 'Logged in successfully',
       'user_id' => $userId,
       'session_token' => session_id(),
       'user' => [ ... ],
   ]);
   ```

4. **Fix session write FK error** — make `user_id` nullable and use `NULL` instead of `0`:
   - In `DatabaseSessionHandler::write()`, change `$userId ?? 0` to just `$userId` and use conditional binding for NULL
   - Or simpler: drop the FK constraint since `user_id=0` has no matching user

**`migrate_sessions_table.sql` — DB fix:**
```sql
ALTER TABLE `sessions` DROP FOREIGN KEY `fk_sessions_user`;
ALTER TABLE `sessions` MODIFY COLUMN `user_id` INT NULL DEFAULT NULL;
ALTER TABLE `sessions` ADD CONSTRAINT `fk_sessions_user` 
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL;
```
This re-adds the FK but allows NULL, so unauthenticated sessions work.

### Flow After Fix

1. User logs in → backend returns `session_token: "abc123..."` in response body
2. Client stores token in localStorage
3. All subsequent requests include `X-Session-Token: abc123...` header
4. Backend calls `session_id("abc123...")` before `session_start()`, restoring the session
5. `$_SESSION['user_id']` is available → authentication works

