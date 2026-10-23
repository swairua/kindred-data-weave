import {
  PSD_DECADE_LINES,
  PSD_DECADE_TICKS,
  PSD_FRACTIONS,
  PSD_LAYOUT,
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
const {
  viewW: VIEW_W,
  viewH: VIEW_H,
  frame: FRAME,
  plot: PLOT,
  titleY: TITLE_Y,
  decadeLabelY: DECADE_LABEL_Y,
  decadeRuleY: DECADE_RULE_Y,
  decadeRuleLeft: DECADE_RULE_LEFT,
  decadeRuleRight: DECADE_RULE_RIGHT,
  subLabelY: SUB_LABEL_Y,
  bandTopY: BAND_TOP_Y,
  bandBottomY: BAND_BOTTOM_Y,
  fractionRowY: FRACTION_ROW_Y,
  bandRuleLeft: BAND_RULE_LEFT,
  bandRuleRight: BAND_RULE_RIGHT,
  axisTitleY: AXIS_TITLE_Y,
} = PSD_LAYOUT;
const PLOT_BOTTOM = PLOT.y + PLOT.h;

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
            fontSize={5.4}
            fill="#000000"
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {size.toFixed(3)}
          </text>
        ))}

        {/* CLAY FRACTION / Fine / Medium / Coarse / BOULDERS row, each label
            centred on the geometric mean of its own band. */}
        {PSD_SUB_LABELS.map((band, index) => (
          <text
            key={`sub-${band.label}-${index}`}
            x={PLOT.x + psdX(band.from, PLOT.w)}
            y={SUB_LABEL_Y}
            fontFamily={FONT}
            fontSize={4.4}
            fill="#000000"
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {band.label}
          </text>
        ))}

        {/* Fraction band: the SILT / SAND / GRAVEL captions sit between a top
            rule (silt start to gravel end) and a wider bottom rule, divided by
            hairlines at the 0.063 / 2 / 63 mm boundaries. The CLAY FRACTION
            and BOULDERS captions live on the sub-fraction row above instead. */}
        <line x1={DECADE_RULE_LEFT} y1={DECADE_RULE_Y} x2={DECADE_RULE_RIGHT} y2={DECADE_RULE_Y} stroke="#000000" strokeWidth={GRID_WIDTH} />
        {PSD_DECADE_LINES.map((size) => {
          const x = PLOT.x + psdX(size, PLOT.w);
          return <line key={`comb-${size}`} x1={x} y1={PLOT_BOTTOM} x2={x} y2={BAND_TOP_Y} stroke="#000000" strokeWidth={GRID_WIDTH} />;
        })}
        <line
          x1={PLOT.x + psdX(0.002, PLOT.w)}
          y1={BAND_TOP_Y}
          x2={PLOT.x + psdX(63, PLOT.w)}
          y2={BAND_TOP_Y}
          stroke="#000000"
          strokeWidth={GRID_WIDTH}
        />
        {[0.063, 2, 63].map((size) => {
          const x = PLOT.x + psdX(size, PLOT.w);
          return <line key={`band-${size}`} x1={x} y1={BAND_TOP_Y} x2={x} y2={BAND_BOTTOM_Y} stroke="#000000" strokeWidth={GRID_WIDTH} />;
        })}
        <line x1={BAND_RULE_LEFT} y1={BAND_BOTTOM_Y} x2={BAND_RULE_RIGHT} y2={BAND_BOTTOM_Y} stroke="#000000" strokeWidth={0.37} />
        {PSD_FRACTIONS.slice(1, 4).map((band) => (
          <text
            key={`fraction-${band.label}`}
            x={PLOT.x + psdX(Math.sqrt(band.from * band.to), PLOT.w)}
            y={FRACTION_ROW_Y}
            fontFamily={FONT}
            fontSize={5.2}
            fill="#000000"
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {band.label}
          </text>
        ))}

        <text
          x={PLOT.x + PLOT.w / 2}
          y={AXIS_TITLE_Y}
          fontFamily={FONT}
          fontSize={7}
          fontWeight="bold"
          fill="#000000"
          textAnchor="middle"
          dominantBaseline="middle"
        >
          Particle size (mm)
        </text>

        <text
          x={PLOT.x + PLOT.w / 2}
          y={TITLE_Y}
          fontFamily={FONT}
          fontSize={7.5}
          fontWeight="bold"
          fill="#000000"
          textAnchor="middle"
          dominantBaseline="middle"
        >
          PARTICLE SIZE DISTRIBUTION GRAPH
        </text>
      </svg>
    </div>
  );
}