import { LineChart, Line, XAxis, YAxis, CartesianGrid, ReferenceLine, ResponsiveContainer } from "recharts";
import type { LiquidLimitTrial } from "@/context/TestDataContext";
import { getLiquidLimitGraphData, calculateLogLinearRegression } from "@/lib/atterbergCalculations";

interface LiquidLimitFlowChartProps {
  trials: LiquidLimitTrial[];
  width?: number;
  height?: number;
}

/**
 * Liquid Limit (cone penetration) semi-log flow curve.
 * Data points + log-linear regression line, ASTM D4318 compliant.
 * Used both for in-app preview and for off-screen capture into PDF/Excel exports.
 */
const LiquidLimitFlowChart = ({ trials, width = 900, height = 700 }: LiquidLimitFlowChartProps) => {
  const graphData = getLiquidLimitGraphData(trials);

  if (graphData.length === 0) {
    return (
      <div
        className="flex items-center justify-center bg-white text-sm text-muted-foreground"
        style={{ width, height }}
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
  const xStart = Math.min(minPen, 18);
  const xEnd = Math.max(maxPen, 26);

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

  return (
    <div className="bg-white p-1 w-full" style={{ maxWidth: width, height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={merged} margin={{ top: 20, right: 30, left: 45, bottom: 40 }}>
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
            label={{ value: "Penetration (mm, Log Scale)", position: "bottom", offset: 8, fontSize: 16, fontWeight: "bold", fill: "#111827" }}
            tick={{ fontSize: 14, fill: "#111827" }}
          />
          <YAxis
            stroke="#000"
            strokeWidth={2}
            domain={["auto", "auto"]}
            label={{ value: "Moisture Content (%)", angle: -90, position: "left", offset: 8, fontSize: 16, fontWeight: "bold", fill: "#111827" }}
            tick={{ fontSize: 14, fill: "#111827" }}
          />
          <ReferenceLine x={20} stroke="#000" strokeDasharray="4 4" />
          <Line
            type="linear"
            dataKey="moisture"
            name="Data Points"
            stroke="none"
            strokeWidth={3}
            dot={{ fill: "#ef4444", r: 6, strokeWidth: 0 }}
            activeDot={{ r: 7 }}
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
      </ResponsiveContainer>
    </div>
  );
};

export default LiquidLimitFlowChart;
