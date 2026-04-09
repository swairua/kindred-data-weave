import {
  LineChart,
  Line,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

interface PlasticityChartProps {
  liquidLimit: number | null;
  plasticityIndex: number | null;
  samples?: Array<{ ll: number; pi: number; label: string }>;
}

/**
 * Calculate A-line: PI = 0.73(LL - 20)
 * This line separates clays from silts on the Plasticity Chart
 */
const getALineData = (minLL: number, maxLL: number) => {
  const points = [];
  for (let ll = minLL; ll <= maxLL; ll += 2) {
    const pi = 0.73 * (ll - 20);
    if (pi >= 0) {
      points.push({ ll, pi });
    }
  }
  return points;
};

/**
 * Calculate U-line: PI = 0.9(LL - 8)
 * Upper limit for field identification
 */
const getULineData = (minLL: number, maxLL: number) => {
  const points = [];
  for (let ll = minLL; ll <= maxLL; ll += 2) {
    const pi = 0.9 * (ll - 8);
    points.push({ ll, pi });
  }
  return points;
};

/**
 * Classify soil based on LL and PI using ASTM D2487 / BS 1377
 */
const getSoilClassification = (ll: number | null, pi: number | null): string => {
  if (ll === null || pi === null) return "No data";
  if (pi < 0) return "Non-plastic";
  if (pi === 0) return "Non-plastic";
  if (ll < 50) {
    if (pi < 4) return "Silt (ML)";
    if (pi <= 0.73 * (ll - 20)) return "Silt (ML)";
    return "Clay (CL)";
  } else {
    if (pi < 4) return "Silt (MH)";
    if (pi <= 0.73 * (ll - 20)) return "Silt (MH)";
    return "Clay (CH)";
  }
};

const PlasticityChart: React.FC<PlasticityChartProps> = ({ liquidLimit, plasticityIndex, samples = [] }) => {
  // Determine chart bounds based on data
  const allLLValues = [
    liquidLimit,
    ...samples.map((s) => s.ll),
  ].filter((v) => v !== null && v !== undefined) as number[];
  const allPIValues = [
    plasticityIndex,
    ...samples.map((s) => s.pi),
  ].filter((v) => v !== null && v !== undefined) as number[];

  const minLL = Math.max(0, allLLValues.length > 0 ? Math.min(...allLLValues) - 10 : 0);
  const maxLL = allLLValues.length > 0 ? Math.max(...allLLValues) + 20 : 100;
  const maxPI = allPIValues.length > 0 ? Math.max(...allPIValues) + 15 : 60;

  const aLineData = getALineData(minLL, maxLL);
  const uLineData = getULineData(minLL, maxLL);

  // Prepare chart data combining A-line and U-line for better visualization
  const chartData = aLineData.map((point) => ({
    ...point,
    aLine: point.pi,
  }));

  // Add U-line data
  uLineData.forEach((uPoint) => {
    const existing = chartData.find((p) => p.ll === uPoint.ll);
    if (existing) {
      existing.uLine = uPoint.pi;
    } else {
      chartData.push({ ll: uPoint.ll, aLine: undefined, uLine: uPoint.pi });
    }
  });

  // Sort by LL
  chartData.sort((a, b) => a.ll - b.ll);

  // Prepare scatter data for current sample and additional samples
  const scatterData = [];
  if (liquidLimit !== null && plasticityIndex !== null) {
    scatterData.push({
      x: liquidLimit,
      y: plasticityIndex,
      name: "Current Sample",
      fill: "#ef4444",
    });
  }
  samples.forEach((sample) => {
    scatterData.push({
      x: sample.ll,
      y: sample.pi,
      name: sample.label,
      fill: "#3b82f6",
    });
  });

  const classification = getSoilClassification(liquidLimit, plasticityIndex);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-white p-4 dark:bg-slate-950">
        <h3 className="text-sm font-semibold mb-4">Plasticity Chart (ASTM D2487)</h3>

        {liquidLimit !== null ? (
          <ResponsiveContainer width="100%" height={400}>
            <ScatterChart margin={{ top: 20, right: 20, bottom: 60, left: 60 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                type="number"
                dataKey="x"
                name="Liquid Limit (%)"
                label={{ value: "Liquid Limit (%)", offset: 40, position: "insideBottomRight" }}
                domain={[minLL, maxLL]}
              />
              <YAxis
                type="number"
                dataKey="y"
                name="Plasticity Index (%)"
                label={{ value: "Plasticity Index (%)", angle: -90, position: "insideLeft" }}
                domain={[0, maxPI]}
              />
              <Tooltip
                cursor={{ strokeDasharray: "3 3" }}
                content={({ active, payload }) => {
                  if (active && payload && payload[0]) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-white dark:bg-slate-800 p-2 border rounded shadow">
                        <p className="text-xs font-semibold">{data.name}</p>
                        <p className="text-xs">LL: {data.x}%</p>
                        <p className="text-xs">PI: {data.y}%</p>
                      </div>
                    );
                  }
                  return null;
                }}
              />

              {/* Reference lines for zones */}
              <ReferenceLine x={50} stroke="#e5e7eb" strokeDasharray="5 5" />
              <ReferenceLine y={7} stroke="#e5e7eb" strokeDasharray="5 5" />

              {/* A-line */}
              <Line
                type="monotone"
                dataKey="aLine"
                data={chartData}
                stroke="#8b5cf6"
                dot={false}
                name="A-line"
                strokeWidth={2}
                isAnimationActive={false}
              />

              {/* U-line */}
              <Line
                type="monotone"
                dataKey="uLine"
                data={chartData}
                stroke="#ef4444"
                dot={false}
                name="U-line"
                strokeWidth={1}
                strokeDasharray="5 5"
                isAnimationActive={false}
              />

              {/* Current sample scatter */}
              {liquidLimit !== null && plasticityIndex !== null && (
                <Scatter
                  dataKey="y"
                  data={[{ x: liquidLimit, y: plasticityIndex, name: "Current Sample" }]}
                  fill="#ef4444"
                  name="Current Sample"
                  shape="circle"
                />
              )}

              {/* Additional samples scatter */}
              {samples.length > 0 && (
                <Scatter
                  dataKey="y"
                  data={samples.map((s) => ({ x: s.ll, y: s.pi, name: s.label }))}
                  fill="#3b82f6"
                  name="Other Samples"
                  shape="square"
                />
              )}

              <Legend />
            </ScatterChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-80 bg-muted rounded text-muted-foreground">
            <p>Enter Liquid Limit and Plastic Limit to view Plasticity Chart</p>
          </div>
        )}
      </div>

      {/* Classification info */}
      <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Liquid Limit (LL)</span>
            <p className="font-semibold text-lg">{liquidLimit !== null ? `${liquidLimit}%` : "—"}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Plasticity Index (PI)</span>
            <p className="font-semibold text-lg">{plasticityIndex !== null ? `${plasticityIndex}%` : "—"}</p>
          </div>
        </div>
        <div className="border-t pt-2">
          <span className="text-xs text-muted-foreground">Classification</span>
          <p className="font-semibold text-base">{classification}</p>
        </div>
      </div>

      {/* Legend explaining the zones */}
      <div className="rounded-lg border bg-muted/40 p-3 space-y-2 text-xs text-muted-foreground">
        <div className="space-y-1">
          <div>
            <span className="font-semibold">A-line (PI = 0.73(LL-20)):</span> Separates clays from silts
          </div>
          <div>
            <span className="font-semibold">U-line:</span> Upper limit for natural soils
          </div>
          <div>
            <span className="font-semibold">LL &lt;50 above A-line:</span> Clay (CL)
          </div>
          <div>
            <span className="font-semibold">LL &lt;50 below A-line:</span> Silt (ML)
          </div>
          <div>
            <span className="font-semibold">LL ≥50 above A-line:</span> Clay (CH)
          </div>
          <div>
            <span className="font-semibold">LL ≥50 below A-line:</span> Silt (MH)
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlasticityChart;
