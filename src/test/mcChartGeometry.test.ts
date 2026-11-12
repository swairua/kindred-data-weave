import { describe, expect, it } from "vitest";

import {
  formatDensityTick,
  formatMoistureTick,
  mcClipSegment,
  mcCurvePath,
  mcCurveSamples,
  mcMeasuredPath,
  mcPointInRect,
  mcScale,
  mcScales,
  mcTickLabelIndices,
  mcTickLabelStride,
  mcVoidSamples,
  toMcPlotPoints,
  voidLineCaption,
  MC_X_STEPS,
  MC_Y_STEPS,
  type McPoint,
} from "@/lib/mcChartGeometry";
import { zeroAirVoidsCurve } from "@/lib/proctorRecords";
import { psdCurvePath, psdCurveSamples } from "@/lib/psdChartGeometry";

/** The six points of the printed sheet: 31.6 % to 41.9 % at 1270-1323 kg/m3. */
const MEASURED: McPoint[] = [
  { moisture: 31.6, dryDensity: 1274 },
  { moisture: 33.7, dryDensity: 1298 },
  { moisture: 35.8, dryDensity: 1319 },
  { moisture: 37.9, dryDensity: 1323 },
  { moisture: 39.9, dryDensity: 1302 },
  { moisture: 41.9, dryDensity: 1270 },
];

describe("moisture content axis", () => {
  it("snaps outwards to round ticks and includes both readings", () => {
    const scale = mcScale(MEASURED.map((point) => point.moisture), [0.5, 1, 2, 2.5, 5, 10], 10, 7);

    expect(scale.min).toBeLessThanOrEqual(31.6);
    expect(scale.max).toBeGreaterThanOrEqual(41.9);
    expect(scale.min % scale.step).toBeCloseTo(0, 6);
    expect(scale.max % scale.step).toBeCloseTo(0, 6);
    expect(scale.ticks.at(-1)).toBe(scale.max);
  });

  it("keeps every tick on a round value despite repeated addition", () => {
    // Fractional steps over a range like 8.1 to 9.9 drift badly if accumulated by addition.
    const scale = mcScale([8.1, 9.9], [0.2, 0.5, 1, 2], 10, 5);

    expect(scale.ticks).toContain(8);
    expect(scale.ticks).toContain(10);
    scale.ticks.forEach((tick) => expect(tick).toBeCloseTo(Number(tick.toFixed(1)), 6));
  });

  it("still produces a readable axis for a single reading", () => {
    const scale = mcScale([12.4], [0.5, 1, 2, 2.5, 5, 10], 10, 7);

    expect(scale.max).toBeGreaterThan(scale.min);
    expect(scale.ticks.length).toBeGreaterThan(1);
  });

  it("falls back to a default range when there is nothing to plot", () => {
    const scale = mcScale([], [0.5, 1, 2, 2.5, 5, 10], 10, 7);

    expect(scale.min).toBe(0);
    expect(scale.max).toBe(10);
  });

  it("honours a manual Y window such as 1300 to 1500 for a narrow band", () => {
    const scale = mcScale([1412, 1493], MC_Y_STEPS, 100, 6, { min: 1300, max: 1500 });

    expect(scale.min).toBe(1300);
    expect(scale.max).toBe(1500);
    expect(scale.step).toBe(50);
    expect(scale.ticks).toEqual([1300, 1350, 1400, 1450, 1500]);
  });

  it("keeps the manual window even when the data exceeds it", () => {
    const scale = mcScale([1270, 1800], MC_Y_STEPS, 100, 6, { min: 1300, max: 1500 });

    expect(scale.min).toBe(1300);
    expect(scale.max).toBe(1500);
    expect(scale.ticks).toHaveLength(5);
  });

  it("ignores a degenerate or inverted manual window", () => {
    const inverted = mcScale([1412, 1493], MC_Y_STEPS, 100, 6, { min: 1500, max: 1300 });

    expect(inverted.min).toBeLessThanOrEqual(1412);
    expect(inverted.max).toBeGreaterThanOrEqual(1493);
    // Invalid override falls back to data-derived limits.
    expect(inverted.min).not.toBe(0);
  });

  it("applies a manual Y window through mcScales while keeping X auto", () => {
    const scales = mcScales(MEASURED, [], { y: { min: 1300, max: 1500 } });

    expect(scales.y.min).toBe(1300);
    expect(scales.y.max).toBe(1500);
    expect(scales.x.step).toBeGreaterThan(0);
    expect(scales.x.max).toBeGreaterThanOrEqual(41.9);
  });

  it("keeps a stray wide moisture range on a readable axis instead of stacking labels", () => {
    // The recorded incident: mistyped tares produced moisture contents of 405% to
    // 1240%. With steps capped at 10 the axis stacked 85 overlapping captions;
    // the wider candidates keep it near a dozen.
    const scale = mcScale([405.2, 1240], MC_X_STEPS, 10, 7);

    expect(scale.step).toBeGreaterThanOrEqual(100);
    expect(scale.ticks.length).toBeLessThanOrEqual(11);
    expect(scale.min).toBeLessThanOrEqual(405.2);
    expect(scale.max).toBeGreaterThanOrEqual(1240);
  });

  it("thins tick captions when a pathological axis still yields many ticks", () => {
    expect(mcTickLabelStride(MC_X_STEPS.map((_, index) => index), 14)).toBe(1);
    expect(mcTickLabelStride(MC_X_STEPS.map((_, index) => index), 5)).toBe(2);
    expect(mcTickLabelStride([], 14)).toBe(1);
    // The wider step candidates now absorb the recorded incident (moisture
    // contents of 405% to 1240%) on their own, so no thinning is needed there.
    const incident = mcScale([405.2, 1240], MC_X_STEPS, 10, 7);
    expect(incident.ticks.length).toBeLessThanOrEqual(14);
    expect(mcTickLabelStride(incident.ticks, 14)).toBe(1);
    // A synthetic pathological axis with 85 ticks still thins to at most 14 captions.
    const many = Array.from({ length: 85 }, (_, index) => index * 10);
    expect(mcTickLabelStride(many, 14)).toBeGreaterThanOrEqual(7);
  });

  it("includes the air voids lines, which sit above the measured points", () => {
    const saturation: McPoint[] = [{ moisture: 31.6, dryDensity: 1990 }, { moisture: 41.9, dryDensity: 1820 }];
    const scales = mcScales(MEASURED, [saturation]);

    expect(scales.y.max).toBeGreaterThanOrEqual(1990);
  });

  it("projects moisture left to right and dry density bottom to top", () => {
    const scales = mcScales(MEASURED, []);
    const projected = toMcPlotPoints(MEASURED, 300, 150, scales.x, scales.y);

    // Ordered by moisture content regardless of the order given.
    expect(projected.map((point) => point.x)).toEqual([...projected.map((point) => point.x)].sort((a, b) => a - b));
    // The lowest reading sits inside the padded axis, not on its left edge, because the
    // limits snap outwards to whole ticks.
    expect(projected[0].x).toBeGreaterThan(0);
    expect(projected.at(-1)!.x).toBeLessThan(300);
    // The peak density is nearer the top of the plot than the lowest reading.
    expect(projected[3].y).toBeLessThan(projected[5].y);
  });
});

describe("compaction curve geometry", () => {
  it("returns no path for fewer than two points", () => {
    expect(mcCurvePath([{ x: 0, y: 0 }])).toBe("");
    expect(mcCurvePath([])).toBe("");
    expect(mcCurveSamples([])).toEqual([]);
    expect(mcCurveSamples([{ x: 1, y: 2 }])).toEqual([{ x: 1, y: 2 }]);
  });

  it("starts at the first point and ends at the last", () => {
    const path = mcCurvePath([{ x: 0, y: 10 }, { x: 50, y: 0 }, { x: 100, y: 20 }]);

    expect(path.startsWith("M 0.00 10.00")).toBe(true);
    expect(path).toContain("C ");
    expect(path.endsWith("100.00 20.00")).toBe(true);
  });

  it("may turn over at the optimum, unlike the monotone grading curve", () => {
    // A compaction curve rises then falls, and the fitted line must keep that shape.
    const plotted: McPoint[] = [
      { moisture: 0, dryDensity: 100 },
      { moisture: 50, dryDensity: 200 },
      { moisture: 100, dryDensity: 250 },
      { moisture: 150, dryDensity: 180 },
      { moisture: 200, dryDensity: 120 },
    ];
    const samples = mcCurveSamples(toMcPlotPoints(plotted, 200, 150, { min: 0, max: 200, step: 50, ticks: [] }, { min: 100, max: 250, step: 50, ticks: [] }), 8);
    const lowestY = samples.reduce((lowest, point) => Math.min(lowest, point.y), Infinity);

    // The peak of the drawn curve sits at or above the highest plotted density,
    // which a monotone fit could never do.
    expect(lowestY).toBeLessThanOrEqual(0);
  });

  it("samples between the same end points the path joins", () => {
    const projected = [{ x: 0, y: 10 }, { x: 100, y: 30 }];
    const samples = mcCurveSamples(projected, 12);

    expect(samples[0]).toEqual(projected[0]);
    expect(samples.at(-1)).toEqual(projected[1]);
    expect(samples).toHaveLength(13);
  });

  it("joins the measured readings without smoothing them", () => {
    expect(mcMeasuredPath([{ x: 0, y: 10 }, { x: 50, y: 20 }])).toBe("M 0.00 10.00 L 50.00 20.00");
  });

  it("traces an air voids line across the measured moisture range", () => {
    const scales = mcScales(MEASURED, []);
    const samples = mcVoidSamples(
      [{ moisture: 30, dryDensity: 2000 }, { moisture: 40, dryDensity: 1800 }],
      300,
      150,
      scales.x,
      scales.y,
      10,
    );

    expect(samples).toHaveLength(10);
    // Monotonic in x, and falling in y as the void line drops with increasing moisture.
    expect(samples[0].x).toBeLessThan(samples.at(-1)!.x);
    expect(samples[0].y).toBeLessThan(samples.at(-1)!.y);
  });

  it("leaves the grading curve's monotone helpers unchanged", () => {
    // The shared refactor must not have altered the particle size distribution curve.
    const grading = [
      { size: 0.063, passing: 100 },
      { size: 2, passing: 55 },
      { size: 20, passing: 12 },
    ];

    expect(psdCurvePath(grading, 300, 150).startsWith("M 107.96 0.00")).toBe(true);
    expect(psdCurveSamples(grading, 300, 150).length).toBeGreaterThan(3);
  });
});

describe("axis projection never produces NaN", () => {
  it("handles an empty plot", () => {
    const scales = mcScales([], []);

    expect(scales.x.max).toBeGreaterThan(scales.x.min);
    expect(scales.y.max).toBeGreaterThan(scales.y.min);
    expect(toMcPlotPoints([], 316, 150, scales.x, scales.y)).toEqual([]);
  });

  it("handles a single reading, whose snapped limits would otherwise coincide", () => {
    const single: McPoint[] = [{ moisture: 12.4, dryDensity: 1900 }];
    const scales = mcScales(single, []);
    const projected = toMcPlotPoints(single, 316, 150, scales.x, scales.y);

    expect(scales.x.max).toBeGreaterThan(scales.x.min);
    expect(scales.y.max).toBeGreaterThan(scales.y.min);
    projected.forEach((point) => {
      expect(Number.isFinite(point.x)).toBe(true);
      expect(Number.isFinite(point.y)).toBe(true);
    });
  });

  it("handles several identical readings", () => {
    const same: McPoint[] = [
      { moisture: 12.4, dryDensity: 1900 },
      { moisture: 12.4, dryDensity: 1900 },
    ];
    const scales = mcScales(same, []);

    expect(scales.x.max).toBeGreaterThan(scales.x.min);
    expect(scales.y.max).toBeGreaterThan(scales.y.min);
  });

  it("keeps the vertical axis usable when a density is zero", () => {
    const scales = mcScales([{ moisture: 10, dryDensity: 0 }], []);

    scales.y.ticks.forEach((tick) =>
      expect(Number.isFinite(((tick - scales.y.min) / (scales.y.max - scales.y.min)) * 150)).toBe(true));
  });
});

describe("printed tick captions", () => {
  it("labels moisture to one decimal and density as whole numbers", () => {
    expect(formatMoistureTick(30)).toBe("30.0");
    expect(formatDensityTick(1240)).toBe("1240");
    expect(formatDensityTick(1240.5)).toBe("1240.5");
  });

  it("captions the air voids lines as the sheet does", () => {
    expect(voidLineCaption(0)).toBe("0% voids");
    expect(voidLineCaption(5)).toBe("5 % voids");
    expect(voidLineCaption(10)).toBe("10 % voids");
  });
});

describe("air voids lines follow the hyperbola, not a chord", () => {
  it("renders the 0% voids line at the true ZAV ordinate, not the chord midpoint", () => {
    const curve = zeroAirVoidsCurve(2.7, [9.08, 19.75]);
    const scales = mcScales(MEASURED, [curve]);
    const samples = mcVoidSamples(curve, 300, 150, scales.x, scales.y, 25);

    // Moisture 14.4% is the mid-span of the curve; the chord would sit well above the hyperbola there.
    const midIndex = Math.round((samples.length - 1) / 2);
    const midY = samples[midIndex].y;
    const zav = (2700 / (1 + 0.14419 * 2.7));
    const trueY = 150 - ((zav - scales.y.min) / (scales.y.max - scales.y.min)) * 150;
    expect(midY).toBeCloseTo(trueY, 0);
    // And it must sit on the convex side of the endpoints (below the chord).
    expect(midY).toBeGreaterThan((samples[0].y + samples.at(-1)!.y) / 2 - 0.5);
  });

  it("follows a scaled (air-voids) curve as well as the ZAV line", () => {
    const curve = zeroAirVoidsCurve(2.7, [9.08, 19.75]).map((p) => ({ moisture: p.moisture, dryDensity: p.dryDensity! * 0.95 }));
    const scales = mcScales(MEASURED, [curve]);
    const samples = mcVoidSamples(curve, 300, 150, scales.x, scales.y, 25);

    expect(samples).toHaveLength(25);
    expect(samples[0].x).toBeLessThan(samples.at(-1)!.x);
    expect(samples[0].y).toBeLessThan(samples.at(-1)!.y);
  });
});

describe("tick caption endpoints are always labelled", () => {
  it.each([[4, 12], [6, 12], [13, 12], [14, 12], [16, 12], [24, 12], [6, 14], [7, 14], [16, 14], [30, 14]])(
    "labels both end ticks for %i ticks with %i captions",
    (count, cap) => {
      const indices = mcTickLabelIndices(count, cap);
      expect(indices[0]).toBe(0);
      expect(indices.at(-1)).toBe(count - 1);
      expect(indices).toEqual([...new Set(indices)].sort((a, b) => a - b));
      expect(indices.length).toBeLessThanOrEqual(cap);
    },
  );

  it("keeps a dense axis thinned without losing an endpoint", () => {
    // A 405%-to-1240% moisture axis produces hundreds of candidate ticks; caps must hold.
    const indices = mcTickLabelIndices(85, 14);
    expect(indices[0]).toBe(0);
    expect(indices.at(-1)).toBe(84);
    expect(indices.length).toBeLessThanOrEqual(15);
  });
});

describe("segments are clipped to the plot rectangle", () => {
  const rect = { x: 10, y: 10, width: 100, height: 80 };

  it("returns the original segment when it lies fully inside", () => {
    const a = { x: 20, y: 30 };
    const b = { x: 90, y: 70 };
    expect(mcClipSegment(a, b, rect)).toEqual([a, b]);
  });

  it("rejects a segment that misses the rectangle entirely", () => {
    expect(mcClipSegment({ x: 0, y: 0 }, { x: 5, y: 5 }, rect)).toBeNull();
    expect(mcClipSegment({ x: 0, y: 120 }, { x: 200, y: 140 }, rect)).toBeNull();
  });

  it("clips a diagonally crossing segment to the boundary", () => {
    const clipped = mcClipSegment({ x: 0, y: 0 }, { x: 60, y: 60 }, rect);
    expect(clipped).not.toBeNull();
    expect(clipped![0].x).toBeCloseTo(10, 6);
    expect(clipped![0].y).toBeCloseTo(10, 6);
    expect(clipped![1].x).toBeCloseTo(60, 6);
    expect(clipped![1].y).toBeCloseTo(60, 6);
  });

  it("clips horizontal and vertical sweeps, and reports points inside and outside", () => {
    const horizontal = mcClipSegment({ x: -10, y: 50 }, { x: 200, y: 50 }, rect);
    expect(horizontal).toEqual([{ x: 10, y: 50 }, { x: 110, y: 50 }]);
    const vertical = mcClipSegment({ x: 60, y: -10 }, { x: 60, y: 200 }, rect);
    expect(vertical).toEqual([{ x: 60, y: 10 }, { x: 60, y: 90 }]);
    expect(mcPointInRect({ x: 50, y: 50 }, rect)).toBe(true);
    expect(mcPointInRect({ x: 50, y: 200 }, rect)).toBe(false);
    expect(mcPointInRect({ x: -1, y: 50 }, rect)).toBe(false);
  });
});