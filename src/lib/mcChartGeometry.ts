import type { PlotPoint } from "./psdChartGeometry";

/**
 * Geometry for the BS 1377-4:1990, 3.3 density/moisture content graph.
 *
 * Dry density in kg/m3 is plotted against moisture content in per cent. Unlike
 * the grading curve both axes are linear and neither has a natural fixed
 * domain, so each axis is fitted to the data with "nice" round tick steps, the
 * way the reference sheet does. These helpers are pure so the same numbers
 * drive the on-screen SVG (`MoistureDensityChart`) and the native jsPDF fallback
 * in `mcPdfGenerator`, which keeps the printed report and the screen identical.
 */

/** A measured or computed point on the compaction graph. */
export interface McPoint {
  /** Moisture content in per cent. */
  moisture: number;
  /** Dry density in kg/m3. */
  dryDensity: number;
}

/** A dashed constant-air-voids line with the caption printed beside it. */
export interface McVoidLine {
  /** Air voids percentage the line represents, for the "5 % voids" caption. */
  percent: number;
  points: McPoint[];
}

/** A chosen axis: its limits and the tick values printed along it. */
export interface McScale {
  min: number;
  max: number;
  /** Tick interval. */
  step: number;
  ticks: number[];
}

/** Both axes of the graph, decided together so every curve lands inside the plot. */
export interface McScales {
  x: McScale;
  y: McScale;
}

/**
 * Nice tick steps. Moisture content is labelled to one decimal, so a 2 % step is
 * the print-sheet default; dry densities are labelled as whole numbers. The larger
 * steps keep a stray wide reading (say a moisture content of several hundred per
 * cent from a mistyped tare) on a readable axis instead of stacking dozens of
 * overlapping labels on top of each other.
 */
export const MC_X_STEPS = [0.5, 1, 2, 2.5, 5, 10, 20, 25, 50, 100];
export const MC_Y_STEPS = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000];

/** Smallest step from `candidates` that covers the range in at most `targetTicks` intervals. */
const niceStep = (range: number, targetTicks: number, candidates: ReadonlyArray<number>): number => {
  const wanted = range / Math.max(targetTicks, 1);
  return candidates.find((candidate) => candidate >= wanted * 0.999) ?? candidates[candidates.length - 1];
};

/**
 * Axis limits snapped outwards to whole ticks, with the tick values between
 * them. A single reading, or several identical ones, still yields a readable
 * axis rather than a zero-width one.
 */
export const mcScale = (
  values: ReadonlyArray<number>,
  candidates: ReadonlyArray<number>,
  fallbackRange: number,
  targetTicks: number,
  /** Optional manual axis window; when both limits are given they override the data-derived domain. */
  manual?: Readonly<{ min: number; max: number }>,
): McScale => {
  let rawMin: number;
  let rawMax: number;
  if (manual && Number.isFinite(manual.min) && Number.isFinite(manual.max) && manual.max > manual.min) {
    rawMin = manual.min;
    rawMax = manual.max;
  } else {
    const finite = values.filter((value) => Number.isFinite(value));
    if (finite.length === 0) return mcScale([0, fallbackRange], candidates, fallbackRange, targetTicks);
    rawMin = Math.min(...finite);
    rawMax = Math.max(...finite);
  }
  const step = niceStep(rawMax - rawMin > 0 ? rawMax - rawMin : fallbackRange, targetTicks, candidates);
  const min = Math.floor(rawMin / step) * step;
  let max = Math.ceil(rawMax / step) * step;
  // Identical readings snap to the same tick on both ends, which would leave the axis
  // with no width at all and every projection a division by zero.
  if (max <= min) max = min + step;

  const ticks: number[] = [];
  // Accumulate by index rather than repeated addition, so floating point cannot
  // drift the last tick off a round value.
  const count = Math.round((max - min) / step);
  for (let index = 0; index <= count; index += 1) ticks.push(Number((min + index * step).toPrecision(10)));
  return { min, max, step, ticks };
};

/**
 * Both axes for one plot. The void lines are included in the domain: they are
 * the upper boundary of a compaction graph and would otherwise be clipped off
 * the top of the sheet.
 */
export const mcScales = (
  measured: ReadonlyArray<McPoint>,
  curves: ReadonlyArray<ReadonlyArray<McPoint>>,
  /** Optional manual axis windows; xManual sets x min/max, yManual sets y min/max. */
  manual?: Readonly<{ x?: { min: number; max: number }; y?: { min: number; max: number } }>,
): McScales => {
  const plotted = [...measured, ...curves.flat()].filter(isMcPoint);
  // 16 target intervals give ~1% moisture gridlines over typical compaction ranges
  // (good horizontal resolution); wider ranges still widen to 2% or 5%.
  return {
    x: mcScale(plotted.map((point) => point.moisture), MC_X_STEPS, 10, 16, manual?.x),
    y: mcScale(plotted.map((point) => point.dryDensity), MC_Y_STEPS, 100, 6, manual?.y),
  };
};

/**
 * Cubic control points for one segment of a projected curve. Both ends clamp to
 * the neighbouring point, which is what gives the first and last segments their
 * tangent.
 */
const mcSegmentControls = (projected: ReadonlyArray<PlotPoint>, index: number) => {
  const start = projected[index];
  const end = projected[index + 1];
  const previous = projected[index - 1] ?? start;
  const next = projected[index + 2] ?? end;
  return {
    start,
    end,
    control1: { x: start.x + (end.x - previous.x) / 6, y: start.y + (end.y - previous.y) / 6 },
    control2: { x: end.x - (next.x - start.x) / 6, y: end.y - (next.y - start.y) / 6 },
  };
};

/**
 * SVG path for the fitted compaction curve.
 *
 * A compaction curve rises to the optimum and then falls away, so it must be
 * allowed to turn over: the grading curve's monotone fit is deliberately not
 * used here. BS 1377-4 asks for a smooth curve drawn by hand through the
 * plotted points, which a Catmull-Rom style cubic through those points matches.
 */
export const mcCurvePath = (projected: ReadonlyArray<PlotPoint>): string => {
  if (projected.length < 2) return "";
  const commands = [`M ${projected[0].x.toFixed(2)} ${projected[0].y.toFixed(2)}`];
  for (let index = 0; index < projected.length - 1; index += 1) {
    const { control1, control2, end } = mcSegmentControls(projected, index);
    commands.push(
      `C ${control1.x.toFixed(2)} ${control1.y.toFixed(2)},`
      + ` ${control2.x.toFixed(2)} ${control2.y.toFixed(2)},`
      + ` ${end.x.toFixed(2)} ${end.y.toFixed(2)}`,
    );
  }
  return commands.join(" ");
};

/**
 * Sample the fitted curve exactly as `mcCurvePath` describes it, so the native
 * jsPDF fallback draws an identical curve without parsing path data.
 */
export const mcCurveSamples = (projected: ReadonlyArray<PlotPoint>, samplesPerSegment = 12): PlotPoint[] => {
  if (projected.length === 0) return [];
  if (projected.length === 1) return [projected[0]];

  const samples: PlotPoint[] = [projected[0]];
  for (let index = 0; index < projected.length - 1; index += 1) {
    const { start, control1, control2, end } = mcSegmentControls(projected, index);
    for (let step = 1; step <= samplesPerSegment; step += 1) {
      const t = step / samplesPerSegment;
      const u = 1 - t;
      const uu = u * u;
      const tt = t * t;
      samples.push({
        x: uu * u * start.x + 3 * uu * t * control1.x + 3 * u * tt * control2.x + tt * t * end.x,
        y: uu * u * start.y + 3 * uu * t * control1.y + 3 * u * tt * control2.y + tt * t * end.y,
      });
    }
  }
  return samples;
};

/** Measured readings are joined as taken, with no smoothing between the points. */
export const mcMeasuredPath = (projected: ReadonlyArray<PlotPoint>): string =>
  projected
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ");

/**
 * Air voids lines run over the measured moisture range only. The lines are
 * hyperbolic (rd = K / (1 + w.Gs/100)), not straight rules, so they are traced
 * through the sampled points rather than chorded between the end points -
 * a straight chord between the ends can sit tens of kg/m3 above the true line,
 * and the error grows with Gs. The caller supplies the sampled curve (see
 * zeroAirVoidsCurve/airVoidsCurve), which is interpolated piecewise-linearly;
 * with 40 samples along the curve that is visually indistinguishable from it.
 */
export const mcVoidSamples = (
  line: ReadonlyArray<McPoint>,
  plotWidth: number,
  plotHeight: number,
  xScale: McScale,
  yScale: McScale,
  samples = 24,
): PlotPoint[] => {
  const ordered = line.filter(isMcPoint).sort((a, b) => a.moisture - b.moisture);
  if (ordered.length < 2) return toMcPlotPoints(ordered, plotWidth, plotHeight, xScale, yScale);
  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  const dryDensityAt = (moisture: number): number => {
    let index = 0;
    // Largest left-hand bracket whose next point is at or beyond `moisture`.
    while (index < ordered.length - 2 && ordered[index + 1].moisture < moisture) index += 1;
    const from = ordered[index];
    const to = ordered[index + 1];
    const span = to.moisture - from.moisture;
    if (span === 0) return from.dryDensity;
    const t = (moisture - from.moisture) / span;
    return from.dryDensity + (to.dryDensity - from.dryDensity) * t;
  };
  const grid: McPoint[] = Array.from({ length: samples }, (_, index) => {
    const t = index / (samples - 1);
    const moisture = first.moisture + (last.moisture - first.moisture) * t;
    return { moisture, dryDensity: dryDensityAt(moisture) };
  });
  return toMcPlotPoints(grid, plotWidth, plotHeight, xScale, yScale);
};

/** Moisture content tick label: one decimal place, as printed on the sheet. */
export const formatMoistureTick = (value: number): string => value.toFixed(1);

/** Dry density tick label: whole numbers, as printed on the sheet. */
export const formatDensityTick = (value: number): string =>
  Number.isInteger(value) ? String(value) : value.toFixed(1);

/**
 * Label indices for a tick list: every `stride`-th tick, always including both
 * end ticks, so an axis never loses its first or last value. Gridlines stay on
 * every tick; only captions thin out, which keeps even a pathological axis
 * legible. The final entry may sit closer to its neighbour than the others,
 * but both axis ends are always captioned.
 */
export const mcTickLabelIndices = (count: number, maxLabels: number): number[] => {
  if (count <= 0) return [];
  const cap = Math.max(1, maxLabels);
  if (count <= cap) return Array.from({ length: count }, (_, index) => index);
  const stride = Math.max(1, Math.ceil((count - 1) / (cap - 1)));
  const indices: number[] = [];
  for (let index = 0; index < count; index += stride) indices.push(index);
  if (indices[indices.length - 1] !== count - 1) indices.push(count - 1);
  return indices;
};

/**
 * Label stride for a tick list: label every `stride`-th tick so at most
 * `maxLabels` captions print. Gridlines stay on every tick; only the captions
 * thin out, which keeps even a pathological axis legible.
 */
export const mcTickLabelStride = (ticks: ReadonlyArray<number>, maxLabels: number): number =>
  Math.max(1, Math.ceil(ticks.length / Math.max(maxLabels, 1)));

/** Caption beside an air voids line, matching the wording of the printed sheet. */
export const voidLineCaption = (percent: number): string =>
  `${percent === 0 ? "0% voids" : `${percent} % voids`}`;

/** Horizontal position of a moisture content within a plot of `plotWidth` units. */
export const mcX = (moisture: number, plotWidth: number, scale: McScale): number =>
  scale.max === scale.min ? 0 : ((moisture - scale.min) / (scale.max - scale.min)) * plotWidth;

/** Vertical position of a dry density within a plot of `plotHeight` units, lowest at the bottom. */
export const mcY = (dryDensity: number, plotHeight: number, scale: McScale): number =>
  scale.max === scale.min ? plotHeight : plotHeight - ((dryDensity - scale.min) / (scale.max - scale.min)) * plotHeight;

/** Axis-aligned clipping rectangle, in plot-local units. */
export interface McClipRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Clip the straight segment a-b to an axis-aligned rectangle (Liang-Barsky).
 * Returns the visible sub-segment, or null when the segment misses the rect.
 * Used by the native jsPDF graph, which has no clip-path primitive.
 */
export const mcClipSegment = (
  a: PlotPoint,
  b: PlotPoint,
  rect: McClipRect,
): [PlotPoint, PlotPoint] | null => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const left = rect.x;
  const right = rect.x + rect.width;
  const top = rect.y;
  const bottom = rect.y + rect.height;
  let t0 = 0;
  let t1 = 1;
  const clip = (p: number, q: number): boolean => {
    if (p === 0) return q >= 0; // Parallel to this boundary; keep if it lies inside.
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };
  if (!clip(-dx, a.x - left)) return null;
  if (!clip(dx, right - a.x)) return null;
  if (!clip(-dy, a.y - top)) return null;
  if (!clip(dy, bottom - a.y)) return null;
  if (t0 > t1) return null;
  return [
    { x: a.x + t0 * dx, y: a.y + t0 * dy },
    { x: a.x + t1 * dx, y: a.y + t1 * dy },
  ];
};

/** True when a plot-local point falls inside the plot rect (captions and markers). */
export const mcPointInRect = (point: PlotPoint, rect: McClipRect): boolean =>
  point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;

/** A point is drawable only when both readings are finite. */
export const isMcPoint = (point: McPoint | null | undefined): point is McPoint =>
  !!point && Number.isFinite(point.moisture) && Number.isFinite(point.dryDensity);

/** Project a series into plot-local units, ordered by ascending moisture content. */
export const toMcPlotPoints = (
  points: ReadonlyArray<McPoint>,
  plotWidth: number,
  plotHeight: number,
  xScale: McScale,
  yScale: McScale,
): PlotPoint[] => points
  .filter(isMcPoint)
  .map((point) => ({ x: mcX(point.moisture, plotWidth, xScale), y: mcY(point.dryDensity, plotHeight, yScale) }))
  .sort((a, b) => a.x - b.x);