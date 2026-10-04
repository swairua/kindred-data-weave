import { LineChart, Line, XAxis, YAxis, CartesianGrid, ReferenceLine, ResponsiveContainer } from "recharts";
import type { LiquidLimitTrial } from "@/context/TestDataContext";
import { getLiquidLimitGraphData, calculateLogLinearRegression } from "@/lib/atterbergCalculations";

interface LiquidLimitFlowChartProps {
  trials: LiquidLimitTrial[];
  width?: number | string;
  /** Numeric height, or "100%" to fill the parent container (used for export capture). */
  height?: number | string;
  variant?: "preview" | "print";
}

/**
 * Liquid Limit (cone penetration) semi-log flow curve.
 * Data points + log-linear regression line, ASTM D4318 compliant.
 * Used both for in-app preview and for off-screen capture into PDF/Excel exports.
 */
const LiquidLimitFlowChart = ({ trials, width, height, variant = "preview" }: LiquidLimitFlowChartProps) => {
  const graphData = getLiquidLimitGraphData(trials);
  const finalWidth = width ?? "100%";
  const finalHeight = height ?? (variant === "print" ? 600 : 480);
  const isPrint = variant === "print";
  const axisTickSize = isPrint ? 10 : 14;
  const axisLabelSize = isPrint ? 11 : 16;
  const dotR = isPrint ? 4.5 : 6;
  const chartMargin = isPrint
    ? { top: 10, right: 18, left: 10, bottom: 22 }
    : { top: 8, right: 12, left: 12, bottom: 24 };
  // When height is "100%" the chart stretches to its parent; keep a floor so the
  // chart never collapses if the parent's percentage height cannot resolve.
  const rootStyle: { width: number | string; height: number | string; minHeight?: number } = {
    width: finalWidth,
    height: finalHeight,
    ...(finalHeight === "100%" ? { minHeight: 420 } : null),
  };

  if (graphData.length === 0) {
    return (
      <div
        className="flex items-center justify-center bg-white text-sm text-muted-foreground"
        style={rootStyle}
      >
        Enter penetration & moisture to view the flow curve
      </div>
    );
  }

  const regression = calculateLogLinearRegression(
    graphData
      .map((d) => ({ x: d.penetration || 0, y: d.moisture || 0 }))
      .filter((d) => !isNaN(d.x) && !isNaN(d.y) && d.x > 0),
  );

  const penetrationValues = graphData.map((d) => d.penetration);
  const minPen = Math.min(...penetrationValues);
  const maxPen = Math.max(...penetrationValues);
  const xStart = Math.min(minPen * 0.95, 18);
  const xEnd = Math.max(maxPen * 1.08, 26);

  const merged = [
    ...(regression
      ? [{ penetration: xStart, moisture: null as number | null, regressionMoisture: regression.slope * Math.log10(xStart) + regression.intercept }]
      : []),
    ...graphData.map((d) => ({
      penetration: d.penetration,
      moisture: d.moisture as number | null,
      regressionMoisture: regression && d.penetration > 0
        ? regression.slope * Math.log10(d.penetration) + regression.intercept
        : null,
    })),
    ...(regression
      ? [{ penetration: xEnd, moisture: null as number | null, regressionMoisture: regression.slope * Math.log10(xEnd) + regression.intercept }]
      : []),
  ].sort((a, b) => a.penetration - b.penetration);

  // ── LL marker geometry ──────────────────────────────────────────────
  // The flow curve, the vertical guide (x = 20) and the horizontal guide
  // (y = LL) all cross at exactly (20, LL). Both guides are drawn as
  // `segment` lines so they stop at that intersection instead of spanning
  // the whole plot: the vertical one runs down to the x-axis, the horizontal
  // one runs back to the y-axis.
  const llValue = regression
    ? regression.slope * Math.log10(20) + regression.intercept
    : null;

  // Plotted moisture range, used to push the vertical guide's lower endpoint
  // below the auto Y domain so ifOverflow="hidden" clips it back to the x-axis.
  const plottedMoisture = [
    ...graphData.map((d) => d.moisture),
    ...(regression
      ? [
          regression.slope * Math.log10(xStart) + regression.intercept,
          regression.slope * Math.log10(xEnd) + regression.intercept,
        ]
      : []),
  ].filter((v): v is number => typeof v === "number" && Number.isFinite(v));

  const yLow = plottedMoisture.length ? Math.min(...plottedMoisture) : 0;
  const yHigh = plottedMoisture.length ? Math.max(...plottedMoisture) : 1;
  const llGuideBottom = yLow - Math.max(yHigh - yLow, 1);

  const chartInner = (
    <LineChart
      data={merged}
      margin={chartMargin}
      {...(isPrint ? { width: 560, height: 380 } : {})}
    >
      <CartesianGrid stroke="#e5e7eb" strokeWidth={1.5} fill="#F5E6D3" />
      <XAxis
        dataKey="penetration"
        type="number"
        scale="log"
        domain={[xStart, xEnd]}
        ticks={[10, 12, 15, 18, 20, 22, 25, 30, 40].filter((t) => t >= xStart && t <= xEnd)}
        allowDataOverflow
        stroke="#000"
        strokeWidth={2}
        label={{ value: "Penetration (mm, Log Scale)", position: "bottom", offset: 8, fontSize: axisLabelSize, fontWeight: "bold", fill: "#111827" }}
        tick={{ fontSize: axisTickSize, fill: "#111827" }}
      />
      <YAxis
        stroke="#000"
        strokeWidth={2}
        domain={["auto", "auto"]}
        label={{ value: "Moisture Content (%)", angle: -90, position: "left", offset: 8, fontSize: axisLabelSize, fontWeight: "bold", fill: "#111827" }}
        tick={{ fontSize: axisTickSize, fill: "#111827" }}
      />
      {llValue !== null ? (
        <>
          {/* Vertical guide: from the LL intersection (20, LL) down to the x-axis only.
              The lower endpoint sits below the Y domain and is clipped by ifOverflow="hidden". */}
          <ReferenceLine
            segment={[{ x: 20, y: llValue }, { x: 20, y: llGuideBottom }]}
            stroke="#000"
            strokeDasharray="4 4"
            ifOverflow="hidden"
          />
          {/* Horizontal guide: from the y-axis to the LL intersection only. */}
          <ReferenceLine
            segment={[{ x: xStart, y: llValue }, { x: 20, y: llValue }]}
            stroke="#166534"
            strokeDasharray="4 4"
            label={{ value: `LL ${llValue.toFixed(1)}%`, position: "top", fontSize: axisTickSize, fontWeight: "bold", fill: "#166534" }}
          />
        </>
      ) : (
        /* No regression yet (fewer than 2 valid points) — keep the plain 20mm marker. */
        <ReferenceLine x={20} stroke="#000" strokeDasharray="4 4" />
      )}
      <Line
        type="linear"
        dataKey="moisture"
        name="Data Points"
        stroke="none"
        strokeWidth={3}
        dot={{ fill: "#ef4444", r: dotR, strokeWidth: 0 }}
        activeDot={{ r: dotR + 1 }}
        isAnimationActive={false}
      />
      {regression && (
        <Line
          type="linear"
          dataKey="regressionMoisture"
          name="Line of Best Fit"
          stroke="#000000"
          strokeWidth={2.5}
          dot={false}
          connectNulls
          isAnimationActive={false}
        />
      )}
    </LineChart>
  );

  if (isPrint) {
    return (
      <div className="bg-white" style={{ width: 560, height: 380 }}>
        {chartInner}
      </div>
    );
  }

  return (
    <div className="bg-white w-full h-full" style={rootStyle}>
      <ResponsiveContainer width="100%" height="100%">
        {chartInner}
      </ResponsiveContainer>
    </div>
  );
};

export default LiquidLimitFlowChart;
