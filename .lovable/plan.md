

## Bug: Add LL/PL/SL doesn't show form

### Root cause
`RecordCard` receives `selectedTestIds` already scoped to the record (line 1853 passes `selectedTestIds[record.id]`, an object shaped `{liquidLimit, plasticLimit, shrinkageLimit}`). But inside `RecordCard`, the code reads it as if still keyed by record id:

- Line 2168: `selectedTestIds?.[record.id]?.liquidLimit` → `undefined.liquidLimit` → always `null`
- Line 1987: `selectedTestIds[record.id]` (same wrong access in the auto-select effect)

Result: when you click "Add Liquid Limit Test", a test IS created, but `selectedTestId` stays `null`, so `selectedTest` is undefined and `<AtterbergTestCard>` never renders. You only see the "+ Add another" button.

(The auto-select effect does fire `onSelectTest(...)` and the parent state gets the right ID, but on re-render the child still reads the wrong path so the value is invisible to the column.)

### Fix (single file: `src/components/soil/AtterbergTest.tsx`)

**1. Line 1987** — drop the redundant `[record.id]` lookup:
```ts
const recordIds = selectedTestIds; // already the per-record object
```

**2. Lines 2168, 2187, 2206** — read directly from the prop:
```ts
selectedTestId={selectedTestIds?.liquidLimit || null}
selectedTestId={selectedTestIds?.plasticLimit || null}
selectedTestId={selectedTestIds?.shrinkageLimit || null}
```

That's it. After this:
- Click **+ Add Liquid Limit Test** → test created with 4 default trial rows → auto-selected → `<AtterbergTestCard>` renders the LL form with the LL graph preview.
- Same flow for Plastic Limit (2 rows) and Linear Shrinkage (1 row).
- "Add another" continues to work for second LL/PL/SL inside the same record.

### Out of scope
No changes to `TestTypeColumn`, `createTest`, calculations, or persistence — the bug is a pure prop-shape mismatch in `RecordCard`.

