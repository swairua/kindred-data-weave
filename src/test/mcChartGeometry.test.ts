import { describe, expect, it } from "vitest";

import {
  formatDensityTick,
  formatMoistureTick,
  mcCurvePath,
  mcCurveSamples,
  mcMeasuredPath,
  mcScale,
  mcScales,
  mcVoidSamples,
  toMcPlotPoints,
  voidLineCaption,
  type McPoint,
} from "@/lib/mcChartGeometry";
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

  it("includes the air voids lines, which sit above the measured points", () => {
    const saturation: McPoint[] = [{ moisture: 31.6, dryDensity: 1990 }, { moisture: 41.9, dryDensity: 1820 }];
    const scales = mcScales(MEASURED, [saturation]);

    expect(scales.y.max).toBeGreaterThanOrEqual(1990);
  });

  it("projects moisture left to right and dry density bottom to top", () => {
    const scales = mcScales(MEASURED, []);
    const projected = toMcPlotPoints(MEASURED, 300, 150, scales.x, scales.y);

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

  it("draws an air voids line straight across the measured moisture range", () => {
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

    expect(psdCurvePath(grading, 300, 150).startsWith("M 300.00 0.00")).toBe(true);
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