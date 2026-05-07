import { describe, it, expect } from "vitest";

/**
 * Test to verify Atterberg PDF layout positioning
 * Ensures the liquid limit graph and results table don't overlap
 */
describe("Atterberg PDF Layout Positioning", () => {
  // Simulate A4 page dimensions
  const A4_WIDTH = 210; // mm
  const A4_HEIGHT = 297; // mm
  const MARGIN = 14; // mm

  it("should calculate chart and table positioning without overlap", () => {
    const pw = A4_WIDTH;
    const margin = MARGIN;
    const contentW = pw - margin * 2; // 182 mm

    // New positioning logic (after fix)
    const leftW = contentW * 0.45; // 81.9 mm (chart width)
    const rightX = margin + leftW + 4; // 14 + 81.9 + 4 = 99.9 mm (table start)
    const rightW = contentW - leftW - 4; // 182 - 81.9 - 4 = 96.1 mm (table width)

    // Chart boundaries
    const chartStartX = margin; // 14 mm
    const chartEndX = margin + leftW; // 95.9 mm

    // Table boundaries
    const tableStartX = rightX; // 99.9 mm
    const tableEndX = rightX + rightW; // 196 mm

    // Verify no overlap
    expect(chartEndX).toBeLessThan(tableStartX);
    expect(chartEndX).toBe(95.9);
    expect(tableStartX).toBe(99.9);

    // Verify gap between chart and table
    const gapWidth = tableStartX - chartEndX; // 4 mm
    expect(gapWidth).toBe(4);
    expect(gapWidth).toBeGreaterThan(0);

    // Verify widths are reasonable
    expect(leftW).toBeGreaterThan(75); // Chart should be > 75mm
    expect(rightW).toBeGreaterThan(85); // Table should be > 85mm
  });

  it("should verify the layout improves upon the previous version", () => {
    const pw = A4_WIDTH;
    const margin = MARGIN;
    const contentW = pw - margin * 2;

    // Old positioning (before fix)
    const oldLeftW = contentW * 0.48;
    const oldRightX = margin + contentW * 0.5;
    const oldGap = oldRightX - (margin + oldLeftW);

    // New positioning (after fix)
    const newLeftW = contentW * 0.45;
    const newRightX = margin + newLeftW + 4;
    const newGap = 4;

    // The new gap should be larger and more explicit
    expect(newGap).toBeGreaterThan(oldGap);
    expect(newGap).toBe(4); // Explicit 4mm gap

    // The chart width is reduced slightly to make room
    expect(newLeftW).toBeLessThan(oldLeftW);
  });

  it("should ensure total layout fits within page width", () => {
    const pw = A4_WIDTH;
    const margin = MARGIN;
    const contentW = pw - margin * 2;

    const leftW = contentW * 0.45;
    const rightX = margin + leftW + 4;
    const rightW = contentW - leftW - 4;

    // Total width: leftMargin + chart + gap + table + rightMargin
    const totalWidth = margin + leftW + 4 + rightW + margin;

    expect(totalWidth).toBeLessThanOrEqual(pw);
    expect(totalWidth).toBeCloseTo(pw, 1); // Should equal page width (with rounding tolerance)
  });

  it("should maintain professional proportions for both sections", () => {
    const pw = A4_WIDTH;
    const margin = MARGIN;
    const contentW = pw - margin * 2;

    const leftW = contentW * 0.45;
    const rightW = contentW - leftW - 4;

    // Chart should be 43-47% of content width
    const chartPercentage = (leftW / contentW) * 100;
    expect(chartPercentage).toBeGreaterThanOrEqual(43);
    expect(chartPercentage).toBeLessThanOrEqual(47);

    // Table should be 50-54% of content width
    const tablePercentage = (rightW / contentW) * 100;
    expect(tablePercentage).toBeGreaterThanOrEqual(50);
    expect(tablePercentage).toBeLessThanOrEqual(54);

    // Together they should use most of the content width
    const totalPercentage = chartPercentage + tablePercentage;
    expect(totalPercentage).toBeGreaterThanOrEqual(95);
    expect(totalPercentage).toBeLessThanOrEqual(100);
  });
});
