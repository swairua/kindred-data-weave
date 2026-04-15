

## Plan: Fix All TypeScript Build Errors

There are **~40 build errors** across multiple files, falling into 6 categories. Here's what needs to be fixed:

### 1. ProjectContext missing properties (12 errors)
**Files:** `SlumpTest.tsx`, `CBRTest.tsx`, `GradingTest.tsx`, `ProctorTest.tsx`

`ProjectContextType` lacks `labOrganization`, `dateReported`, `checkedBy`. Also, `GenericExcelExportOptions` doesn't accept `projectName`, `clientName`, `date` as top-level properties.

**Fix:** Add `labOrganization`, `dateReported`, `checkedBy` to `ProjectContextType` in `ProjectContext.tsx`. Add `projectName`, `clientName`, `date`, `labOrganization`, `dateReported`, `checkedBy` to `GenericExcelExportOptions` in `genericExcelExporter.ts`.

### 2. LiquidLimitSection parseFloat on number (3 errors)
**File:** `LiquidLimitSection.tsx` lines 290, 291, 300

`graphData` items have `penetration: number` and `moisture: number` (from `getValidLiquidLimitTrials`), but code calls `parseFloat()` on them.

**Fix:** Remove `parseFloat()` wrappers — use `d.penetration`, `d.moisture` directly since they're already numbers.

### 3. Missing `moisture` property in benchmark tests (9 errors)
**File:** `atterbergCalculations.benchmark.test.ts`

`PlasticLimitTrial` and `LiquidLimitTrial` require `moisture: string`, but test objects omit it.

**Fix:** Add `moisture: ""` to all affected trial objects in the test file.

### 4. AdminImages type mismatch (3 errors)
**Files:** `atterbergPdfGenerator.ts`, `genericExcelExporter.ts`, `xlsxExporter.ts`

`{ logo: undefined, contacts: undefined, stamp: undefined }` (all required) is assigned from `fetchAdminImagesAsBase64()` which returns `AdminImages` (all optional).

**Fix:** Type the `images` variable as `AdminImages` instead of the literal type with required properties.

### 5. ExcelJS type issues in benchmarkValidator.ts and debugExcel.ts (7 errors)
**Files:** `benchmarkValidator.ts`, `debugExcel.ts`

- `Buffer` type mismatch with ExcelJS `.load()` — cast to `ArrayBuffer`
- `ws.margins`, `ws.printArea` don't exist on ExcelJS `Worksheet` — remove or wrap in try/catch
- `file.name` access on `Buffer | File` union — add type guard
- `ws.dimensions.ref` — use optional chaining

**Fix:** Add proper type guards and casts; remove invalid worksheet property assignments.

### 6. Vertical alignment type error in genericExcelExporter.ts (2 errors)
**File:** `genericExcelExporter.ts` lines 132, 203

`"center"` is not valid for ExcelJS vertical alignment — should be `"middle"`.

**Fix:** Change `"center"` to `"middle"` for vertical alignment.

### Technical Details

**Files to modify:**
1. `src/context/ProjectContext.tsx` — add 3 properties to interface
2. `src/lib/genericExcelExporter.ts` — expand options type, fix alignment, fix AdminImages type
3. `src/components/soil/LiquidLimitSection.tsx` — remove parseFloat wrappers
4. `src/lib/__tests__/atterbergCalculations.benchmark.test.ts` — add missing `moisture` fields
5. `src/lib/atterbergPdfGenerator.ts` — type images as `AdminImages`
6. `src/lib/xlsxExporter.ts` — type images as `AdminImages`
7. `src/lib/benchmarkValidator.ts` — fix Buffer/type issues, remove invalid property access
8. `src/lib/debugExcel.ts` — fix Buffer type cast
9. `src/components/concrete/SlumpTest.tsx` — no change needed (fixed by #1)
10. `src/components/soil/CBRTest.tsx` — no change needed (fixed by #1)
11. `src/components/soil/GradingTest.tsx` — no change needed (fixed by #1)
12. `src/components/soil/ProctorTest.tsx` — no change needed (fixed by #1)

