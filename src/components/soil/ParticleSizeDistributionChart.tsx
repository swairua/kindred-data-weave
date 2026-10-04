import {
  PSD_DECADE_LINES,
  PSD_DECADE_TICKS,
  PSD_FRACTIONS,
  PSD_MINOR_TICKS,
  PSD_SUB_LABELS,
  psdCurvePath,
  psdX,
  psdY,
  type PsdPoint,
} from "@/lib/psdChartGeometry";

/**
 * Reproduces the BS 1377-2 particle size distribution sheet. Layout is expressed
 * in the same millimetre-derived units as the printed form so the on-screen
 * proportions match the report exactly; the SVG scales to whatever width the
 * caller gives it.
 */
const VIEW_W = 384.28;
const VIEW_H = 222;

const FRAME = { x: 0, y: 14, w: 384.28, h: 200 };
const PLOT = { x: 37.72, y: 27.81, w: 334.28, h: 160.86 };

/** Baseline rows below the plot, top to bottom. */
const DECADE_LABEL_Y = 192.4;
const SUB_LABEL_Y = 198.6;
const FRACTION_LABEL_Y = 205.6;
const FRACTION_SUB_LABEL_Y = 210.8;
const FRACTION_RULE_Y = 213.6;
const AXIS_TITLE_Y = 219.6;

const FONT = "Helvetica, Arial, sans-serif";
const PLOT_FILL = "#f2dcdb";
const CURVE_COLOR = "#c00000";
/** Reference sheet line weights: hairline grid, heavier axis rules. */
const GRID_WIDTH = 0.14;
const AXIS_WIDTH = 1.24;
const FRAME_WIDTH = 0.14;
const PASSING_STEPS = Array.from({ length: 11 }, (_, step) => step * 10);

interface ParticleSizeDistributionChartProps {
  /** Grading series in millimetres and per cent passing. */
  points: ReadonlyArray<PsdPoint>;
  /** Applied to the wrapping element so html2canvas can capture it by id. */
  id?: string;
  className?: string;
}

export default function ParticleSizeDistributionChart({ points, id, className }: ParticleSizeDistributionChartProps) {
  const curve = psdCurvePath(points, PLOT.w, PLOT.h);

  return (
    <div id={id} className={className}>
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="h-full w-full"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Particle size distribution graph, particle size against percentage passing"
      >
        <rect x={FRAME.x} y={FRAME.y} width={FRAME.w} height={FRAME.h} fill="#ffffff" stroke="#000000" strokeWidth={FRAME_WIDTH} />

        {/* Plot area: one uniform pink field, as printed, with no fraction tinting. */}
        <rect x={PLOT.x} y={PLOT.y} width={PLOT.w} height={PLOT.h} fill={PLOT_FILL} />

        {/* The 2-9 gridlines inside every decade. */}
        {PSD_MINOR_TICKS.map((size) => {
          const x = PLOT.x + psdX(size, PLOT.w);
          return <line key={`minor-${size}`} x1={x} y1={PLOT.y} x2={x} y2={PLOT.y + PLOT.h} stroke="#000000" strokeWidth={GRID_WIDTH} />;
        })}

        {PSD_DECADE_LINES.map((size) => {
          const x = PLOT.x + psdX(size, PLOT.w);
          return <line key={`decade-${size}`} x1={x} y1={PLOT.y} x2={x} y2={PLOT.y + PLOT.h} stroke="#000000" strokeWidth={GRID_WIDTH} />;
        })}

        {PASSING_STEPS.map((value) => {
          const y = PLOT.y + psdY(value, PLOT.h);
          return <line key={`passing-${value}`} x1={PLOT.x} y1={y} x2={PLOT.x + PLOT.w} y2={y} stroke="#000000" strokeWidth={GRID_WIDTH} />;
        })}

        {/* Left and bottom axes carry the weight of the frame. */}
        <line x1={PLOT.x} y1={PLOT.y} x2={PLOT.x} y2={PLOT.y + PLOT.h} stroke="#000000" strokeWidth={AXIS_WIDTH} />
        <line x1={PLOT.x} y1={PLOT.y + PLOT.h} x2={PLOT.x + PLOT.w} y2={PLOT.y + PLOT.h} stroke="#000000" strokeWidth={AXIS_WIDTH} />

        {curve && (
          <path d={curve} fill="none" stroke={CURVE_COLOR} strokeWidth={0.74} transform={`translate(${PLOT.x} ${PLOT.y})`} />
        )}
        {PASSING_STEPS.map((value) => (
          <text
            key={`y-label-${value}`}
            x={PLOT.x - 4}
            y={PLOT.y + psdY(value, PLOT.h)}
            fontFamily={FONT}
            fontSize={6}
            fill="#000000"
            textAnchor="end"
            dominantBaseline="middle"
          >
            {value.toFixed(1)}
          </text>
        ))}
        <text
          x={PLOT.x - 22}
          y={PLOT.y + PLOT.h / 2}
          fontFamily={FONT}
          fontSize={7.5}
          fontWeight="bold"
          fill="#000000"
          textAnchor="middle"
          dominantBaseline="middle"
          transform={`rotate(-90 ${PLOT.x - 22} ${PLOT.y + PLOT.h / 2})`}
        >
          Passing (%)
        </text>

        {/* Decade labels, each centred on its gridline. */}
        {PSD_DECADE_TICKS.map((size) => (
          <text
            key={`x-label-${size}`}
            x={PLOT.x + psdX(size, PLOT.w)}
            y={DECADE_LABEL_Y}
            fontFamily={FONT}
            fontSize={6}
            fill="#000000"
            textAnchor="middle"
          >
            {size.toFixed(3)}
          </text>
        ))}

        {/* CLAY / Fine / Medium / Coarse row, centred on each sub-fraction. */}
        {PSD_SUB_LABELS.map((band, index) => (
          <text
            key={`sub-${band.label}-${index}`}
            x={PLOT.x + psdX(band.from, PLOT.w)}
            y={SUB_LABEL_Y}
            fontFamily={FONT}
            fontSize={5.2}
            fill="#000000"
            textAnchor="middle"
          >
            {band.label}
          </text>
        ))}

        {/* Fraction bands. Each label is centred on the geometric mean of its own
            band: anchoring to the band edge collides with the left-hand "FRACTION"
            caption, because the silt band starts almost on the axis. */}
        {PSD_FRACTIONS.map((band) => (
          <text
            key={`fraction-${band.label}`}
            x={PLOT.x + psdX(Math.sqrt(band.from * band.to), PLOT.w)}
            y={band.label === "CLAY" ? FRACTION_LABEL_Y : FRACTION_SUB_LABEL_Y}
            fontFamily={FONT}
            fontSize={5.2}
            fill="#000000"
            textAnchor="middle"
          >
            {band.label}
          </text>
        ))}
        <text
          x={PLOT.x}
          y={FRACTION_SUB_LABEL_Y}
          fontFamily={FONT}
          fontSize={5.2}
          fill="#000000"
          textAnchor="start"
        >
          FRACTION
        </text>

        <line x1={PLOT.x} y1={FRACTION_RULE_Y} x2={PLOT.x + PLOT.w} y2={FRACTION_RULE_Y} stroke="#000000" strokeWidth={0.37} />
        <text
          x={PLOT.x + PLOT.w / 2}
          y={AXIS_TITLE_Y}
          fontFamily={FONT}
          fontSize={7}
          fontWeight="bold"
          fill="#000000"
          textAnchor="middle"
        >
          Particle size (mm)
        </text>

        <text
          x={PLOT.x + PLOT.w / 2}
          y={9}
          fontFamily={FONT}
          fontSize={7.5}
          fontWeight="bold"
          fill="#000000"
          textAnchor="middle"
        >
          PARTICLE SIZE DISTRIBUTION GRAPH
        </text>
      </svg>
    </div>
  );
}