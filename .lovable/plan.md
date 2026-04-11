

## Fix: Remove Auth Polling & Atterberg Save Behavior

Two issues to address:

### 1. Remove `waitForAuthentication` retry loop from `TestDataContext.tsx`

**Problem**: On every page load, `TestDataContext` polls `fetchCurrentUser()` up to 10 times (1 second apart) before loading test definitions — generating ~10 unnecessary `?action=me` requests.

**Fix**: Remove the `waitForAuthentication` function entirely. Call `attemptLoad()` directly. If the user isn't authenticated, the API returns 401, the catch block handles it, and defaults are used. The existing 3-retry exponential backoff in `attemptLoad` is sufficient for transient errors.

**File**: `src/context/TestDataContext.tsx` (lines 174-190 removed, lines 237-248 simplified)

---

### 2. Atterberg save behavior — confirm current state is correct

**Current behavior** (already implemented correctly):
- **No autosave to API** — line 618-633 only saves to `localStorage`, not API
- **Manual save** via the Save button calls `handleSave` (line 727) which persists to API
- **User can save multiple times** — each click updates the same record (upsert logic)
- **Concurrent save protection** — `isSavingRef` prevents double-clicks

**Missing: "Final save" that opens a new project page**

The user wants a "Final Save" action that:
- Saves the data to the API (same as current save)
- Then navigates to a new/project page (e.g., `/projects` or clears state for a fresh project)

**Fix**: Add a "Final Save" button (or convert existing Save to have two modes). After successful save, navigate using `useNavigate()` to a projects list or reset state for a new project.

**File**: `src/components/soil/AtterbergTest.tsx`
- Add `useNavigate` from react-router-dom
- Add a `handleFinalSave` callback that calls the existing save logic, then on success navigates to a projects/dashboard page
- Add a "Final Save" or "Save & Close" button in the TestSection header area

**File**: `src/components/TestSection.tsx`
- Add optional `onFinalSave` prop to render a second button like "Save & New Project"

---

### Summary of changes

| File | Change |
|------|--------|
| `src/context/TestDataContext.tsx` | Remove `waitForAuthentication` 10-retry loop; call `attemptLoad()` directly |
| `src/components/soil/AtterbergTest.tsx` | Add `handleFinalSave` that saves then navigates to project page |
| `src/components/TestSection.tsx` | Add optional `onFinalSave` prop with "Save & Close" button |

