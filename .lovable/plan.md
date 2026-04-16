

## Plan: Fix Atterberg Excel Export — Images + Computed Values

### What's Wrong

1. **Images not appearing**: The regex `extractBase64FromDataUrl` uses `\w+` which fails for MIME types like `image/svg+xml` (contains `+` and `/`). Image dimensions are also tiny (80x24 pixels). Stamp is placed at row 7 instead of near the footer "Checked by" area.

2. **Layout**: The current export has a separate "PLASTIC LIMIT - BACK CALCULATION" section (lines 601-739) that doesn't exist in the reference. The reference has a clean unified table with LL + PL trials side by side, and all derived values computed inline.

3. **Secondary data table (columns K-Q)**: The reference Excel has these as manual support calculations. Per user instructions, these should NOT be exported — the system auto-computes everything instead.

### Changes

#### File: `src/lib/xlsxExporter.ts`

**1. Fix image regex and sizing (line 67):**
- Change regex from `/^data:image\/\w+;base64,(.+)$/` to `/^data:image\/[^;]+;base64,(.+)$/`
- Detect actual image extension from data URL instead of hardcoding `"png"`
- Increase logo size to ~200x60, contacts to ~200x60, stamp to ~120x50
- Move stamp from row 7 (A7) to the footer row near "Checked by"

**2. Remove the back-calculation section (lines 601-739):**
- Delete the entire "PLASTIC LIMIT - BACK CALCULATION" section
- All derived values (water mass, dry soil, moisture%) are already computed inline in the main data table via back-calculation logic

**3. Ensure all computed columns are populated:**
- The inline back-calculation at lines 358-369 already computes water mass and wet soil from moisture% when mass data is missing
- Verify that `getTrialMoisture()` is always called and written for every trial (LL and PL)
- For PL trials in the unified table, ensure moisture% is written even when only entered directly (not from masses)

**4. Add row 7 summary line matching reference:**
- The reference has LL, PL, PI, shrinkage, and USCS description in the header area (row after sample info)
- Add computed values: `75.91 | 33.45 | 42.45 | 20.00 | CLAY OF HIGH OF PLASTICITY`

**5. AASHTO classification with comparison values:**
- Currently AASHTO row is empty. Compute and write the classification using `classifySoilAASHTOSimple` from atterbergCalculations.ts
- Show the result (e.g., "A-7-5") in the AASHTO cell in the soil classification section

### Technical Details

**Image regex fix:**
```typescript
const match = dataUrl.match(/^data:image\/[^;]+;base64,(.+)$/);
```

**Image extension detection:**
```typescript
const getImageExtension = (dataUrl: string): "png" | "jpeg" => {
  const m = dataUrl.match(/^data:image\/([\w+]+);/);
  if (!m) return "png";
  return m[1] === "jpeg" || m[1] === "jpg" ? "jpeg" : "png";
};
```

**Stamp moved to footer:**
```typescript
// Near footerRow, not at row 7
ws.addImage(stampId, {
  tl: { col: 8, row: footerRow - 1 },
  ext: { width: 120, height: 50 },
});
```

**Files to modify:**
1. `src/lib/xlsxExporter.ts` — fix image handling, remove back-calc section, add AASHTO value, add summary row

