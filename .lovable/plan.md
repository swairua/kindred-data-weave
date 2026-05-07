Root cause: the print output is not inheriting from the PDF export. It is using the browser print DOM/CSS path. The latest change made the chart SVG 760px wide inside a print grid column that is only about 84mm wide, then CSS forced the SVG to shrink visually. Recharts still lays out labels, margins, and plotting area from the original oversized SVG, which is why the right side is clipped/hidden. The footer issue is also CSS: `.aps-footer` has a fixed `margin-top: 24mm` plus `padding-top: 12mm`, so it stays far down regardless of chart height.

Plan:
1. Add a print-specific chart mode in `LiquidLimitFlowChart.tsx`
   - Add an optional `variant="print"` prop.
   - For print, use smaller margins, smaller axis/label fonts, and a compact chart title so the full SVG content fits inside the browser print column.
   - Keep the normal preview chart unchanged.

2. Fix the print sheet chart sizing in `AtterbergPrintSheet.tsx`
   - Replace the oversized `width={760} height={360}` with a compact, print-column-safe fixed size such as `width={360} height={230}`.
   - Pass `variant="print"` to the chart.
   - This is the key trick: do not render a large chart and rely on CSS scaling after Recharts has already calculated its internal layout.

3. Tighten the browser print CSS in `src/index.css`
   - Make `.aps-chart-box` centered and explicitly `overflow: visible`.
   - Stop forcing descendant SVGs/divs to `width: 100%` in a way that distorts a fixed Recharts SVG.
   - Use compact print sizing for the grid and footer.
   - Reduce `.aps-footer` spacing from the current large `24mm + 12mm` gap to a small margin/padding so it moves up under the report content like the reference image.

4. Improve print readiness in `AtterbergTest.tsx`
   - After applying `data-print-mode`, wait two animation frames before `window.print()` so the print-only sheet is visible before the browser snapshots it.
   - Keep image loading wait, but make the final print call wait for layout settlement too.

Expected result:
- The chart prints fully, including right-side data/axis labels.
- The chart is closer to the clear preview proportions but scaled for the print report column.
- The footer moves upward and no longer leaves the oversized gap shown in the current printout.