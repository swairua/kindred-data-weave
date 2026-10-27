# NDT Test Enable Summary

## Issue
NDT test was not selectable when rock material was chosen in the Record Test Wizard (step 2).

## Root Cause
In `RecordTestWizard.tsx`, the test definitions are filtered by **category first**, then by **allowance**:

```typescript
return testData.testDefinitions
  .filter((definition) => definition.category === state.material && ...)  // Category filter runs FIRST
  .sort(...)
  .map((definition) => ({..., isAllowed: isTestAllowed(state.material, definition.test_key), ...}))  // Allowance check
```

For rock material, only tests with `category: "rock"` pass the filter. If `ndt` has category "concrete", it's filtered out before `isTestAllowed` is even evaluated — even though `isTestAllowed(rock, 'ndt')` returns `true`.

## Fixes Applied

### 1. `TestDataContext.tsx` — `defaultTests` entries
Added both `ndt` and `schmidt_rock` to `defaultTests` with `category: "rock"`:
```typescript
ndt: { id: "ndt", name: "NDT (Rebound Hammer)", category: "rock", status: "not-started", dataPoints: 0, keyResults: [] },
schmidt_rock: { id: "schmidt_rock", name: "Schmidt Hammer Test", category: "rock", status: "not-started", dataPoints: 0, keyResults: [] },
```

### 2. SQL Backup — `backup_labdatacraft_20261020.sql`
- `ndt` (ID 19) already has category `"rock"` in the SQL dump (line 405: `(19,'ndt','NDT (Rebound Hammer)','rock',0,1,...)`)
- `schmidt_rock` (ID 20) added with category `"rock"`

### 3. `recordTestWizard.ts` — `ALLOWED_TEST_KEYS`
```typescript
rock: new Set(["coring", "ucs", "pointload", "porosity", "schmidt_rock", "ndt"]),
```
Both `ndt` and `schmidt_rock` are included for rock material.

### 4. `testRegistration.ts` — Test Registration
```typescript
registry.registerTest("ndt", SchmidtHammerTest);
registry.registerTest("schmidt_rock", SchmidtHammerTest);
```

### 5. `SchmidtHammerTest.tsx` — PDF Export
Export functionality for both test types.

## Result
All pieces are now in place. Since MySQL is not running in this environment, the app falls back to `defaultTests`, which has `ndt` with category **"rock"**. When rock material is selected, both `schmidt_rock` and `ndt` will appear in the test selection list.

**Note:** If the app connects to the API/SQL database, ensure the `ndt` category in the database is also "rock" (already updated in the SQL backup).