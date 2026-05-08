## Root cause (new hypothesis, different from prior attempts)

Earlier attempts kept tweaking `.aps-chart-box`, `.aps-grid` widths, and `LiquidLimitFlowChart`'s `width/height` props. None of them worked because the real problem is not CSS sizing — it is that **recharts' `ResponsiveContainer` cannot measure a parent that is `display: none` on screen**.

Evidence:
- `src/index.css:469` — `@media screen { .atterberg-print-sheet { display: none } }`. The print sheet (and therefore the chart) is `display:none` whenever the user is on screen.
- `LiquidLimitFlowChart` wraps `<LineChart>` in `<ResponsiveContainer width="100%" height="100%">`. ResponsiveContainer uses a `ResizeObserver` on its parent. When the parent has `display:none`, the observed box is 0×0 and the container renders an SVG with width 0, height 0 (no chart inside).
- During `window.print()` the browser flips to `@media print`, the print sheet becomes `display: block`, but ResponsiveContainer's ResizeObserver callback is asynchronous. By the time it fires (or doesn't) the print snapshot has already been taken with an empty/clipped SVG.
- That is exactly what the user's screenshot shows: an SVG rendered at a tiny intrinsic width, axis ticks only reach ~30 (so the pen=35 and pen=43 dots fall off the right), and the whole chart looks "squeezed inside a fixed window".
- The Reports preview chart works because that view is `display: block` on screen, so ResponsiveContainer measures correctly.

The 60/40 grid, the `.aps-chart-box` height, the `aps-side` table widths — all of these are red herrings. Resizing the box doesn't help when the chart itself was rendered at 0×0.

## Fix

### 1. Render the print chart with explicit pixel dimensions (no ResponsiveContainer)
`src/components/soil/LiquidLimitFlowChart.tsx`
- When `variant === "print"`, render `<LineChart width={W} height={H}>` directly (the recharts standalone form), bypassing `<ResponsiveContainer>`. Use fixed pixels sized for an A4 print cell, e.g. `W = 560`, `H = 380`. This makes the SVG render at its final size at component-mount time, not at layout-measurement time, so `display:none` on screen no longer matters.
- Keep the existing tick / domain / regression logic exactly as is — that math is fine.
- Outer wrapper: drop the `width: 100%, height: ...` style for the print variant; just let the SVG sit at its natural pixel size.

### 2. Make the chart cell host the fixed-size SVG cleanly
`src/index.css` — `.atterberg-print-sheet`
- `.aps-chart-box`: remove `display: flex; align-items: center; justify-content: center; height: 100%`. Replace with `display: block; padding: 2mm`. The fixed-size SVG will sit at its native size and the box will hug it.
- `.aps-chart-box > div`: drop `height: 100%`; set `width: auto; height: auto`.
- `.aps-chart-box svg`: remove `height: auto` (this was actively distorting the aspect ratio when paired with `max-width: 100%`). Use `width: 100%; height: auto; max-width: 100%` only for the screen variant — but since print sheet is print-only, just set `display: block` and let the intrinsic 560×380 carry through.
- `.aps-grid`: keep `grid-template-columns` but switch to `560px minmax(0, 1fr)` so the left cell exactly matches the chart's pixel width. Drop `min-height: 180mm` (was forcing extra whitespace under the chart, which is the "footer too close" feeling — actually the opposite, content above is over-stretched).

### 3. Push the footer away from the content
`src/index.css` — `.atterberg-print-sheet .aps-footer`
- Increase `margin-top` from `6mm` to `14mm` and `padding-top` from `3mm` to `6mm`. The stamp `.aps-stamp` `top` shifts to `14px` so it remains aligned with the new spacing.

### 4. (Sanity) make the screen-hidden render measurable
`src/index.css`
- Even though we no longer depend on it, change `@media screen { .atterberg-print-sheet { display: none } }` to use `position: absolute; left: -10000px; top: 0; width: 800px; height: auto; visibility: hidden; pointer-events: none;` instead of `display: none`. This guarantees the chart has a real layout box on screen too — useful insurance for any future code that captures the chart via html2canvas.

## Files touched
- `src/components/soil/LiquidLimitFlowChart.tsx` — branch on `variant === "print"` to render fixed-size `<LineChart>` without `ResponsiveContainer`.
- `src/components/soil/AtterbergPrintSheet.tsx` — call `<LiquidLimitFlowChart variant="print" />` (no width/height props needed; the component owns those for the print variant).
- `src/index.css` — adjust `.aps-chart-box`, `.aps-chart-box > div`, `.aps-chart-box svg`, `.aps-grid`, `.aps-footer`, `.aps-stamp`, and the screen-hidden rule for `.atterberg-print-sheet`.

## Out of scope
- `getLiquidLimitGraphData`, regression math, axis ticks, legend, colors — all confirmed correct.
- The Reports/preview chart — already works.
- `runBrowserPrint` image-load gate — already correct from previous turn.
