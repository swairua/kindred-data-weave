/**
 * Geometry for the BS 1377-2 particle size distribution graph.
 *
 * The graph is a semi-log grading curve: particle size on a logarithmic axis
 * from 0.001 mm to 100 mm, percentage passing on a linear axis from 0 to 100 %.
 * These helpers are pure so the same numbers drive the on-screen SVG
 * (`ParticleSizeDistributionChart`) and the native jsPDF fallback in
 * `psdPdfGenerator`, which keeps the printed report and the screen identical.
 */

export interface PsdPoint {
  /** Particle size in millimetres. */
  size: number;
  /** Percentage passing, 0-100. */
  passing: number;
}

export interface PsdBand {
  label: string;
  /** Lower size bound in millimetres. */
  from: number;
  /** Upper size bound in millimetres. */
  to: number;
}

/** Left edge of the logarithmic size axis. */
export const PSD_X_MIN = 0.001;
/** Right edge of the logarithmic size axis. */
export const PSD_X_MAX = 100;
/** The axis spans exactly five decades, so a decade is always 1/5 of the plot width. */
export const PSD_DECADES = 5;
export const PSD_Y_MIN = 0;
export const PSD_Y_MAX = 100;

/** Decade boundaries, labelled to three decimals as millimetres. */
export const PSD_DECADE_TICKS = [0.001, 0.01, 0.1, 1, 10, 100];

/**
 * Decades that get a full-height rule. The first and last decades are the plot
 * edges themselves, so only the four interior ones need drawing.
 */
export const PSD_DECADE_LINES = [0.01, 0.1, 1, 10];

/**
 * The 2-9 gridlines inside every decade. Five decades of eight is the 40
 * vertical rules the BS grading sheet draws behind the curve.
 */
export const PSD_MINOR_TICKS = Array.from({ length: PSD_DECADES }, (_, decadeIndex) =>
  [2, 3, 4, 5, 6, 7, 8, 9].map((multiplier) => PSD_X_MIN * (10 ** decadeIndex) * multiplier),
).flat();

/** Geometric mean of two sizes: the centre of a fraction band on a log axis. */
export const psdBandCentre = (from: number, to: number) => Math.sqrt(from * to);

/**
 * BS 1377-2 particle size fractions, as printed under the grading curve.
 * Cobbles start at 63 mm; the axis stops at 100 mm so boulders fall off the
 * right-hand edge, exactly as the reference sheet does.
 */
export const PSD_FRACTIONS: PsdBand[] = [
  { label: "CLAY", from: 0.001, to: 0.002 },
  { label: "SILT FRACTION", from: 0.002, to: 0.063 },
  { label: "SAND FRACTION", from: 0.063, to: 2 },
  { label: "GRAVEL FRACTION", from: 2, to: 63 },
  { label: "COBBLES", from: 63, to: PSD_X_MAX },
];

/**
 * The CLAY / Fine / Medium / Coarse row that sits under the axis line itself.
 * Each sub-fraction is centred on the geometric mean of its own band.
 */
export const PSD_SUB_LABELS: PsdBand[] = [
  { label: "CLAY", from: 0.001, to: 0.002 },
  { label: "Fine", from: 0.002, to: 0.006 },
  { label: "Medium", from: 0.006, to: 0.02 },
  { label: "Coarse", from: 0.02, to: 0.063 },
  { label: "Fine", from: 0.063, to: 0.2 },
  { label: "Medium", from: 0.2, to: 0.6 },
  { label: "Coarse", from: 0.6, to: 2 },
  { label: "Fine", from: 2, to: 6 },
  { label: "Medium", from: 6, to: 20 },
  { label: "Coarse", from: 20, to: 63 },
  { label: "COBBLES", from: 63, to: PSD_X_MAX },
].map((band) => ({ label: band.label, from: psdBandCentre(band.from, band.to), to: band.to }));

/** Position of a size in decades from the left edge of the axis, clamped to the domain. */
export const psdDecadePosition = (size: number): number => {
  if (!Number.isFinite(size) || size <= 0) return 0;
  const decades = Math.log10(size / PSD_X_MIN);
  return Math.min(Math.max(decades, 0), PSD_DECADES);
};

/** Horizontal position of a particle size within a plot of `plotWidth` units. */
export const psdX = (size: number, plotWidth: number): number =>
  (psdDecadePosition(size) / PSD_DECADES) * plotWidth;

/** Vertical position of a percentage within a plot of `plotHeight` units, 0 % at the bottom. */
export const psdY = (passing: number, plotHeight: number): number => {
  const clamped = Math.min(Math.max(Number.isFinite(passing) ? passing : 0, PSD_Y_MIN), PSD_Y_MAX);
  return plotHeight - ((clamped - PSD_Y_MIN) / (PSD_Y_MAX - PSD_Y_MIN)) * plotHeight;
};

/** A point is drawable only when it is finite and inside the plotted domain. */
export const isPlotablePsdPoint = (point: PsdPoint | null | undefined): point is PsdPoint =>
  !!point
  && Number.isFinite(point.size)
  && Number.isFinite(point.passing)
  && point.size >= PSD_X_MIN
  && point.size <= PSD_X_MAX
  && point.passing >= PSD_Y_MIN
  && point.passing <= PSD_Y_MAX;

/**
 * Merge sieve and hydrometer readings into a single ascending grading series.
 *
 * A particle size measured by both methods keeps the sieve value when both are
 * present: the sieve is the coarser, more repeatable measurement. Sizes
 * repeated inside one group keep the first occurrence.
 */
export const mergePsdSeries = (...groups: ReadonlyArray<ReadonlyArray<PsdPoint | null | undefined>>): PsdPoint[] => {
  const points = new Map<number, number>();
  for (const group of groups) {
    for (const point of group) {
      if (!isPlotablePsdPoint(point)) continue;
      const key = Number(point.size.toPrecision(6));
      if (!points.has(key)) points.set(key, point.passing);
    }
  }
  return [...points.entries()]
    .map(([size, passing]) => ({ size, passing }))
    .sort((a, b) => a.size - b.size);
};

export interface PlotPoint {
  x: number;
  y: number;
}

/** Project a grading series into plot-local units, dropping anything out of domain. */
export const toPlotPoints = (points: ReadonlyArray<PsdPoint>, plotWidth: number, plotHeight: number): PlotPoint[] =>
  points
    .filter(isPlotablePsdPoint)
    .map((point) => ({ x: psdX(point.size, plotWidth), y: psdY(point.passing, plotHeight) }));
/**
 * Fritsch-Carlson monotone cubic tangents.
 *
 * A grading curve must never overshoot: a passing value above 100 % or a
 * non-monotonic wiggle between sieves is physically meaningless, and the plain
 * Catmull-Rom curve the reference sheet uses produces both.
 */
const monotoneTangents = (points: ReadonlyArray<PlotPoint>): number[] => {
  const count = points.length;
  const tangents = new Array<number>(count).fill(0);
  if (count < 2) return tangents;

  const slopes: number[] = [];
  for (let index = 0; index < count - 1; index += 1) {
    slopes.push((points[index + 1].y - points[index].y) / (points[index + 1].x - points[index].x));
  }

  tangents[0] = slopes[0];
  tangents[count - 1] = slopes[count - 2];
  for (let index = 1; index < count - 1; index += 1) {
    tangents[index] = slopes[index - 1] * slopes[index] <= 0 ? 0 : (slopes[index - 1] + slopes[index]) / 2;
  }

  for (let index = 0; index < count - 1; index += 1) {
    const slope = slopes[index];
    if (slope === 0) {
      tangents[index] = 0;
      tangents[index + 1] = 0;
      continue;
    }
    const a = tangents[index] / slope;
    const b = tangents[index + 1] / slope;
    const magnitude = a * a + b * b;
    if (magnitude > 9) {
      const limit = 3 / Math.sqrt(magnitude);
      tangents[index] = limit * a * slope;
      tangents[index + 1] = limit * b * slope;
    }
  }

  return tangents;
};

/** Control points of the monotone cubic through one segment of a projected series. */
const segmentControls = (
  points: ReadonlyArray<PlotPoint>,
  tangents: ReadonlyArray<number>,
  index: number,
) => {
  const start = points[index];
  const end = points[index + 1];
  const span = (end.x - start.x) / 3;
  return {
    start,
    end,
    control1: { x: start.x + span, y: start.y + tangents[index] * span },
    control2: { x: end.x - span, y: end.y - tangents[index + 1] * span },
  };
};

/**
 * SVG path for a monotone cubic through already-projected plot points.
 *
 * Domain independent, so the compaction curve on the density/moisture graph can
 * reuse it: it is the same "never overshoot" guarantee, which matters just as
 * much when the curve must not exceed the maximum dry density.
 */
export const monotoneCurvePath = (projected: ReadonlyArray<PlotPoint>): string => {
  if (projected.length < 2) return "";

  const tangents = monotoneTangents(projected);
  const commands = [`M ${projected[0].x.toFixed(2)} ${projected[0].y.toFixed(2)}`];

  for (let index = 0; index < projected.length - 1; index += 1) {
    const { start, end, control1, control2 } = segmentControls(projected, tangents, index);
    commands.push(
      `C ${control1.x.toFixed(2)} ${control1.y.toFixed(2)},`
      + ` ${control2.x.toFixed(2)} ${control2.y.toFixed(2)},`
      + ` ${end.x.toFixed(2)} ${end.y.toFixed(2)}`,
    );
  }

  return commands.join(" ");
};

/** Sample the same monotone curve `monotoneCurvePath` describes, for the native jsPDF fallback. */
export const monotoneCurveSamples = (
  projected: ReadonlyArray<PlotPoint>,
  samplesPerSegment = 12,
): PlotPoint[] => {
  if (projected.length === 0) return [];
  if (projected.length === 1) return [projected[0]];

  const tangents = monotoneTangents(projected);
  const samples: PlotPoint[] = [projected[0]];

  for (let index = 0; index < projected.length - 1; index += 1) {
    const { start, end, control1, control2 } = segmentControls(projected, tangents, index);
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

/**
 * SVG path for a smooth grading curve through already-projected plot points.
 * Returns an empty string for fewer than two points, which is what the chart
 * renders before any sieve weights are entered.
 */
export const psdCurvePath = (points: ReadonlyArray<PsdPoint>, plotWidth: number, plotHeight: number): string =>
  monotoneCurvePath(toPlotPoints(points, plotWidth, plotHeight));

/**
 * Sample the same monotone curve the SVG path uses, so the native jsPDF fallback
 * draws an identical grading curve without having to parse path data.
 */
export const psdCurveSamples = (
  points: ReadonlyArray<PsdPoint>,
  plotWidth: number,
  plotHeight: number,
  samplesPerSegment = 12,
): PlotPoint[] => monotoneCurveSamples(toPlotPoints(points, plotWidth, plotHeight), samplesPerSegment);