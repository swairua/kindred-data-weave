

## Plan: Stop New Projects from Auto-Loading the Last Saved Project

### Root cause

When the user clicks **New Project**, `handleStartNewProject` in `src/pages/Index.tsx` (lines 332-354) clears localStorage and reloads the page. But on reload, `AtterbergTest` calls `loadAtterbergProjectFromApi`, which has this fallback (lines 337-340 of `AtterbergTest.tsx`):

```ts
if (!hasLookupCriteria(lookup)) {
  const latestResult = resultsResponse.data.find(...);
  return latestResult ? normalize(...) : null;
}
```

Because the new project has no name/client/date yet, this branch fires and **returns the most recent saved project's data** — that's the stale Record 1 with sample "009", dates 14/04/2026, etc., plus the populated overview tiles (Records: 1, Avg PI: 2.97%, Status: Completed).

### Fix

**File: `src/pages/Index.tsx`** (`handleStartNewProject`)
- Set a one-shot sessionStorage flag before reloading: `sessionStorage.setItem("atterberg.newProject", "1")`.
- Keep the existing localStorage clears + reload.

**File: `src/components/soil/AtterbergTest.tsx`** (`restoreProject` effect, ~line 627-666)
- At the start of `restoreProject`, check the flag. If set:
  - Consume it (`sessionStorage.removeItem(...)`),
  - Skip both API restore and localStorage restore,
  - Mark `hydratedRef.current = true` and leave `projectState` as `{ records: [] }`.
- Also remove the "find latest" fallback in `loadAtterbergProjectFromApi` (lines 337-340). This branch is dangerous: when the user has typed nothing, we should never auto-load a different project's data. Replace with `return null;`.

**File: `src/components/soil/AtterbergTest.tsx`** (`resetProject` event handler, ~line 683-696)
- After `setProjectState({ records: [] })`, also `localStorage.removeItem(STORAGE_KEY)` and `localStorage.removeItem("enhancedAtterbergTests")` so the next persist effect doesn't immediately re-save the cleared state on top of stale entries (defensive — Index already clears these but the order vs reload matters).

### Result

- Clicking **New Project** now reliably gives a blank slate: empty records list, overview tiles show 0 / `-` / Not Started, no auto-populated Record 1.
- Loading an existing project from the **History** dropdown still works (it sets `currentProjectId` + name/client, so the lookup branch — not the latest-fallback — is used).
- Saved projects in the API remain untouched.

### Files modified

1. `src/pages/Index.tsx` — set `sessionStorage` flag in `handleStartNewProject`.
2. `src/components/soil/AtterbergTest.tsx` — honour the flag in `restoreProject`, remove the "latest result" fallback in `loadAtterbergProjectFromApi`, clear localStorage in the `resetProject` event handler.

