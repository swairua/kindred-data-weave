

## Fix: Atterberg PDF — first column cut off, AASHTO classification blank, footer overflowing to page 2

### Issue 1 — Main table first column text cut off
**Cause** (`src/lib/atterbergPdfGenerator.ts` lines 487 & 582): the row label column is only 12mm wide with font size 5.5pt. Labels like "Cont + Wet Soil (g)", "Cont + Dry Soil (g)", "Moisture Content (%)" overflow and get clipped by the next cell (visible in the screenshot — "Container N…", "Cont + Wet …", "Moisture Co…").

**Fix**: Widen the label column from `labelW = 12` to `labelW = 32` and right-pad the label text by 1.5mm so it never touches the cell border. The remaining width is redistributed to trial columns (still fits 4 LL + 2 PL = 6 trials at ~22mm each). Keep font size 5.5 for trials but render the first-column label at 6.5pt for readability.

### Issue 2 — AASHTO classification blank, USCS uses inline simplified logic
**Cause** (lines 709–757): the PDF computes USCS inline with a tiny if/else and leaves the AASHTO row's value cell empty.

**Fix**: Import `classifySoilUSCS` and `classifySoilAASHTO` from `src/lib/soilClassification.ts`. Build a `GrainSizeDistribution` from `record.grainSize` if present, otherwise pass a zeroed object so the helpers fall back to plasticity-only classification (they already handle missing grain size — see lines 60–135 of `soilClassification.ts`). Render:
- USCS row: `result.uscsDescription` in the wide cell, `result.uscsSymbol` in the right cell.
- AASHTO row: split into label (20%) + group (20%) + description (60%); fill with `aashtoGroup` and `aashtoDescription`.

This makes the classification section drive entirely from the shared, tested helper that already handles non-plastic, low/high plasticity, and A-line cases.

### Issue 3 — Footer + stamp pushed to page 2
**Cause**: With the current chart height (`leftW * 0.78` ≈ 65mm) plus the right-side stack (LS 24mm + Results 52mm + Classification 20mm = ~96mm) starting at ~y=110, the content bottom lands at ~y=210. With `footerY = contentBottom + 8 = 218` and the page-break guard `footerY + 34 > 297 - 12 = 285` triggering at `218 + 34 = 252 > 285` — wait, 252 < 285, so it shouldn't trigger. Re-checking: header (24) + title (16) + meta (44) + table (9 + 8×5 = 49) + PL row (9) = ~151 before the two-column section starts. Then chart 65mm → bottom at 216, plus footer block 34 → 250. That fits. **The actual trigger is the page-break guard at line 607** (`sectionStartY + 85 > ph - 15`) which fires when `sectionStartY > 197`, pushing the entire right-side stack and footer to page 2 unnecessarily.

**Fix**:
1. Tighten vertical spacing throughout the upper section to free up room:
   - Metadata rows: 11mm → 9mm each (saves 8mm).
   - Combined trials table row height: 5mm → 4.5mm (saves ~4mm across 9 rows).
   - PL result row: 9mm → 7mm (saves 2mm).
   - Gap after table: 3mm → 2mm.
2. Reduce the early page-break trigger at line 607: change `sectionStartY + 85 > ph - 15` to `sectionStartY + 95 > ph - 12` AND only trigger if BOTH the right-side stack height (~95mm) and the footer block (34mm) cannot fit. Compute `requiredBottom = sectionStartY + Math.max(chartH, 95) + 8 + 34` and only `addPage()` if `requiredBottom > ph - 10`.
3. Reduce right-side block heights:
   - Linear Shrinkage rows: 6mm → 5mm each (saves 3mm).
   - Results Summary rows: 6mm → 5mm each (saves 6mm).
   - Classification rows: 6mm → 5mm each (saves 2mm).
4. Shrink chart slightly: `chartH = leftW * 0.7` instead of `0.78` (saves ~6mm), keeping aspect close enough that the captured 900×700 image still reads cleanly.
5. Stamp size: keep at 28mm but anchor `stampY = footerY + 2` (below the footer text, not overlapping it). With the savings above, total page consumption drops from ~250mm to ~215mm, leaving 80mm headroom for footer + stamp + page number on the same page.

### File changed
- `src/lib/atterbergPdfGenerator.ts` (only)

### Out of scope
- Chart capture pipeline, Excel exporter, calculation library, grain-size data entry UI.

### What the user will see
- All row labels in the trials table render fully ("Cont + Wet Soil (g)", "Moisture Content (%)", etc.) without clipping.
- AASHTO row shows a populated group (e.g. "A-7-6 — Highly plastic soil") and USCS uses the shared classification helper.
- The full record — header, table, chart, results, classification, footer text, and stamp — fits on a single page. Page 2 only appears if a record has so many trials that the table itself overflows.

