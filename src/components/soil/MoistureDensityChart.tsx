import {
  formatDensityTick,
  formatMoistureTick,
  mcCurvePath,
  mcPointInRect,
  mcScales,
  mcTickLabelIndices,
  mcVoidSamples,
  toMcPlotPoints,
  voidLineCaption,
  type McPoint,
  type McVoidLine,
} from "@/lib/mcChartGeometry";

/**
 * Reproduces the density/moisture content graph of the printed report sheet.
 * Layout is expressed in the same millimetre-derived units as the printed form,
 * so the on-screen proportions match the report exactly; the SVG scales to
 * whatever width the caller gives it.
 */
const VIEW_W = 384.28;
const VIEW_H = 214;

/** White sheet inside the red rule the printed graph is boxed in. */
const FRAME = { x: 0, y: 8, w: 384.28, h: 198 };
const PLOT = { x: 44, y: 20, w: 316, h: 150 };

const X_LABEL_Y = 180;
const AXIS_TITLE_Y = 190;
const TITLE_Y = 7;

const FONT = "Helvetica, Arial, sans-serif";
const PLOT_FILL = "#f2dcdb";
const CURVE_COLOR = "#c00000";
const VOID_COLOR = "#000000";
const GRID_WIDTH = 0.14;
const AXIS_WIDTH = 0.5;
const FRAME_WIDTH = 0.5;

interface MoistureDensityChartProps {
  /** Measured moisture content / dry density pairs. */
  points: ReadonlyArray<McPoint>;
  /** Points of the fitted compaction curve, empty when no curve was fitted. */
  fitted: ReadonlyArray<McPoint>;
  /** Dashed constant-air-voids lines drawn behind the curve. */
  voidLines: ReadonlyArray<McVoidLine>;
  /** Optional manual axis windows, e.g. { y: { min: 1300, max: 1500 } } to zoom in on a narrow band. */
  axisLimits?: Readonly<{ x?: { min: number; max: number }; y?: { min: number; max: number } }>;
  /** Applied to the wrapping element so html2canvas can capture it by id. */
  id?: string;
  className?: string;
}

export default function MoistureDensityChart({ points, fitted, voidLines, axisLimits, id, className }: MoistureDensityChartProps) {
  const scales = mcScales(points, [fitted, ...voidLines.map((line) => line.points)], axisLimits);
  // Gridlines stay on every tick; only the captions thin out so a stray wide
  // axis can never stack dozens of overlapping labels. Both end ticks always keep their caption.
  const xLabelIndices = new Set(mcTickLabelIndices(scales.x.ticks.length, 14));
  const yLabelIndices = new Set(mcTickLabelIndices(scales.y.ticks.length, 12));
  const plotRect = { x: PLOT.x, y: PLOT.y, width: PLOT.w, height: PLOT.h };
  // A clip path keeps the curve, the points and the void lines inside the plot, however the axis is windowed.
  const clipId = id ? `${id}-clip` : "mc-plot-clip";
  const measured = toMcPlotPoints(points, PLOT.w, PLOT.h, scales.x, scales.y);
  const curve = toMcPlotPoints(fitted, PLOT.w, PLOT.h, scales.x, scales.y);
  /** Converts a plotted position back into absolute millimetres on the sheet. */
  const place = (point: { x: number; y: number }) => ({ x: PLOT.x + point.x, y: PLOT.y + point.y });
  const tickX = (value: number) => PLOT.x + ((value - scales.x.min) / (scales.x.max - scales.x.min)) * PLOT.w;
  const tickY = (value: number) => PLOT.y + PLOT.h - ((value - scales.y.min) / (scales.y.max - scales.y.min)) * PLOT.h;

  return (
    <div id={id} className={className}>
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="h-full w-full"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Dry density moisture content relationship graph, dry density against moisture content"
      >
        <defs>
          <clipPath id={clipId}>
            <rect x={PLOT.x} y={PLOT.y} width={PLOT.w} height={PLOT.h} />
          </clipPath>
        </defs>

        <rect x={FRAME.x} y={FRAME.y} width={FRAME.w} height={FRAME.h} fill="#ffffff" stroke={CURVE_COLOR} strokeWidth={FRAME_WIDTH} />

        {/* Plot area: one uniform pink field, as printed. */}
        <rect x={PLOT.x} y={PLOT.y} width={PLOT.w} height={PLOT.h} fill={PLOT_FILL} />

        {scales.y.ticks.map((value) => (
          <line key={`grid-y-${value}`} x1={PLOT.x} y1={tickY(value)} x2={PLOT.x + PLOT.w} y2={tickY(value)} stroke={VOID_COLOR} strokeWidth={GRID_WIDTH} />
        ))}
        {scales.x.ticks.map((value) => (
          <line key={`grid-x-${value}`} x1={tickX(value)} y1={PLOT.y} x2={tickX(value)} y2={PLOT.y + PLOT.h} stroke={VOID_COLOR} strokeWidth={GRID_WIDTH} />
        ))}

        {/* Left and bottom axes carry the weight of the frame. */}
        <line x1={PLOT.x} y1={PLOT.y} x2={PLOT.x} y2={PLOT.y + PLOT.h} stroke={VOID_COLOR} strokeWidth={AXIS_WIDTH} />
        <line x1={PLOT.x} y1={PLOT.y + PLOT.h} x2={PLOT.x + PLOT.w} y2={PLOT.y + PLOT.h} stroke={VOID_COLOR} strokeWidth={AXIS_WIDTH} />

        {/* Plotted data is clipped to the pink plot rectangle, so a manual axis window never spills onto the frame, the captions or the titles. */}
        <g clipPath={`url(#${clipId})`}>
          {voidLines.map((line) => {
            const samples = mcVoidSamples(line.points, PLOT.w, PLOT.h, scales.x, scales.y);
            if (samples.length < 2) return null;
            const captionAt = place(samples[Math.round((samples.length - 1) * 0.12)]);
            // Skip the caption rather than print it half-cut over the frame when the line sits outside the window.
            const captionVisible = mcPointInRect(captionAt, plotRect);
            return (
              <g key={`void-${line.percent}`}>
                <polyline
                  points={samples.map((point) => `${(PLOT.x + point.x).toFixed(2)},${(PLOT.y + point.y).toFixed(2)}`).join(" ")}
                  fill="none"
                  stroke={VOID_COLOR}
                  strokeWidth={0.6}
                  strokeDasharray="2.4 1.6"
                />
                {captionVisible && (
                  <text x={captionAt.x} y={captionAt.y + 7} fontFamily={FONT} fontSize={5.4} fontWeight="bold" fill={VOID_COLOR} textAnchor="middle">
                    {voidLineCaption(line.percent)}
                  </text>
                )}
              </g>
            );
          })}

          {/* The compaction curve runs through the measured points, as drawn on
              the laboratory sheets. */}
          {curve.length > 1 && <path d={mcCurvePath(curve.map(place))} fill="none" stroke={CURVE_COLOR} strokeWidth={0.74} />}
          {measured.map((point, index) => {
            const position = place(point);
            return <circle key={`measured-${index}`} cx={position.x} cy={position.y} r={2.2} fill={CURVE_COLOR} />;
          })}
        </g>
{scales.y.ticks.map((value, index) => yLabelIndices.has(index) && (
          <text
            key={`y-label-${value}`}
            x={PLOT.x - 3}
            y={tickY(value)}
            fontFamily={FONT}
            fontSize={5.4}
            fill={VOID_COLOR}
            textAnchor="end"
            dominantBaseline="middle"
          >
            {formatDensityTick(value)}
          </text>
        ))}
        <text
          x={PLOT.x - 30}
          y={PLOT.y + PLOT.h / 2}
          fontFamily={FONT}
          fontSize={7}
          fontWeight="bold"
          fill={VOID_COLOR}
          textAnchor="middle"
          dominantBaseline="middle"
          transform={`rotate(-90 ${PLOT.x - 30} ${PLOT.y + PLOT.h / 2})`}
        >
          Dry Density (kg/m³)
        </text>

        {scales.x.ticks.map((value, index) => xLabelIndices.has(index) && (
          <text
            key={`x-label-${value}`}
            x={tickX(value)}
            y={X_LABEL_Y}
            fontFamily={FONT}
            fontSize={5.4}
            fill={VOID_COLOR}
            textAnchor="middle"
          >
            {formatMoistureTick(value)}
          </text>
        ))}
        <text
          x={PLOT.x + PLOT.w / 2}
          y={AXIS_TITLE_Y}
          fontFamily={FONT}
          fontSize={7}
          fontWeight="bold"
          fill={VOID_COLOR}
          textAnchor="middle"
        >
          Moisture Content (%)
        </text>

        <text
          x={VIEW_W / 2}
          y={TITLE_Y}
          fontFamily={FONT}
          fontSize={7.5}
          fontWeight="bold"
          fill={VOID_COLOR}
          textAnchor="middle"
        >
          DRY DENSITY / MOISTURE CONTENT RELATIONSHIP
        </text>
      </svg>
    </div>
  );
}
