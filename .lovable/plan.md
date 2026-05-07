## Scope

Fix the Atterberg "Save & Print" browser print output to: load admin images (logo/contacts/stamp), enlarge the LL chart to fill its box, push the footer/stamp down, force "new test" creation when an existing project is picked in the wizard, and only fire `window.print()` after all header/footer images are fully loaded.

## Issue analysis

Looking at the screenshot the print preview is rendering `AtterbergPrintSheet` (HTML print path), not the jsPDF output. Three concrete problems:

1. **Missing images.** `AtterbergPrintSheet` reads `project.logoUrl / contactsImageUrl / stampImageUrl` from `ProjectContext`, but those fields are declared as defaults of `undefined` and are never populated. The admin images live in `admin_images` and are only fetched by the jsPDF path via `fetchAdminImagesAsBase64()`. The HTML print sheet therefore prints with empty header/footer image slots.
2. **Chart leaves whitespace.** The LL chart renders inside `.aps-chart-box` via `LiquidLimitFlowChart` which calls `ResponsiveContainer`. Recharts' ResponsiveContainer often resolves to `width=900 / height=700` from the inline style cap on the wrapper, which on print becomes a small square inside the box. The box itself is also sized off the 50/50 grid so the chart lands much smaller than the cell.
3. **Premature print.** `runBrowserPrint` calls `setTimeout(() => window.print(), 50)`. With logos/contacts/stamps inserted as `<img>` (network-fetched), 50 ms is not enough — we must wait for those images' `decode()` / `load` to finish before printing, otherwise blank slots get printed.

Wizard side: `pickProject` already routes to `/tests?newRecord=1&fromProject=...` and `AtterbergTest` already handles `newRecord=1` by creating a fresh record. Verified that path works — but the user wants this enforced unconditionally for the "existing project" branch. Currently the suffix is gated on `!creatingNewProject && state.projectId !== null`. Since `pickProject` flips `creatingNewProject` to true to show the editable card, the gate becomes false and the new-record signal is dropped. That is the actual bug.

## Changes

### 1. `src/components/soil/AtterbergTest.tsx`
- Add a new `adminImages` state hook that calls `fetchAdminImagesAsBase64()` once on mount and stores `{ logo, contacts, stamp }` (base64 data URLs).
- Pass these into `<AtterbergRecordView project={…}>` as `logoUrl / contactsImageUrl / stampImageUrl` (override the empty values from `ProjectContext`).
- Update `runBrowserPrint` to:
  - Call a new helper `waitForImagesReady(scope: HTMLElement)` that finds every `<img>` inside selected print-sheet nodes and awaits `img.decode()` (or an `onload`/`onerror` Promise as fallback) for each one.
  - Only after all images resolve (with a hard 5 s timeout safety) call `window.print()`. Keep the existing `afterprint` cleanup.

### 2. `src/components/soil/AtterbergRecordView.tsx`
- Accept the three image URLs from props (already wired) and prefer them over the project context values.

### 3. `src/components/soil/AtterbergPrintSheet.tsx`
- Header `<img>` tags: add `crossOrigin="anonymous"` and explicit `width`/`height` hints so layout doesn't shift after load.
- Stamp `<img>` likewise.
- Move the stamp out of the absolute-positioned overlap with the footer text (see CSS change) so it sits cleanly under the footer line.

### 4. `src/index.css` — `.atterberg-print-sheet` rules
- `.aps-header img`: bump `max-height` from `30px` to `60px` and `max-width` to `45%` so the logo and contacts strip read correctly.
- `.aps-grid`: change `grid-template-columns` from `50% 1fr` to `58% 1fr` and reduce `gap` slightly so the chart cell is wider.
- `.aps-chart-box`: remove the `max-height: 120mm` cap on the SVG; set the box itself to `min-height: 95mm` and make its inner `LiquidLimitFlowChart` host fill the box (`height: 100%`, `width: 100%`). Also drop the heavy padding so the chart actually fills.
- `LiquidLimitFlowChart` host wrapper: in the print sheet pass smaller default `width/height` props (e.g. `width={520} height={360}`) so the inline `maxWidth`/`height` style no longer constrains it below the cell.
- `.aps-footer`: increase `margin-top` (e.g. `12px` instead of `4px`) and `padding-top` to `5mm` so the footer block sits clearly below the classification table.
- `.aps-stamp`: reposition from `top: -15px` to `top: 4px` and slightly enlarge (`width/height: 56px`) so the stamp prints under the "Checked by" line, not overlapping it.

### 5. `src/pages/RecordTestWizard.tsx`
- In `handleFinish`, change the `fromExisting` condition from `!creatingNewProject && state.projectId !== null` to simply `state.projectId !== null && !state.isBrandNewProject` (track a boolean set to `true` only inside the "Create new project" button handler). This guarantees that any time the user picked an existing project from the dropdown — even after editing the prepopulated card — the route gets `?newRecord=1&fromProject=…`, so `AtterbergTest` always spawns a fresh record.

## Files touched
- `src/components/soil/AtterbergTest.tsx`
- `src/components/soil/AtterbergRecordView.tsx`
- `src/components/soil/AtterbergPrintSheet.tsx`
- `src/index.css`
- `src/pages/RecordTestWizard.tsx`

## Out of scope
- The jsPDF `atterbergPdfGenerator.ts` layout (already has logo/contacts/stamp wired). No changes there unless the user later switches the single-record flow back to PDF.
- Any backend / `admin_images` API changes.
