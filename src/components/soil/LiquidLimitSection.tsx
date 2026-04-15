import { useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { Plus, X, Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip as UITooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import type { LiquidLimitTrial } from "@/context/TestDataContext";
import {
  getLiquidLimitGraphData,
  isLiquidLimitTrialStarted,
  isLiquidLimitTrialValid,
  sanitizeNumericInput,
  getWaterMass,
  getDrySoilMass,
  getTrialMoisture,
  calculateLinearRegression,
} from "@/lib/atterbergCalculations";
import { cn } from "@/lib/utils";

interface LiquidLimitSectionProps {
  trials: LiquidLimitTrial[];
  result: number | null;
  onChangeTrials: (trials: LiquidLimitTrial[]) => void;
  recordId?: string;
}

const createTrial = (index: number): LiquidLimitTrial => ({
  id: `trial-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  trialNo: String(index + 1),
  penetration: "",
  moisture: "",
});

interface TooltipHeaderProps {
  label: string;
  tooltip: string;
}

const TooltipHeader = ({ label, tooltip }: TooltipHeaderProps) => (
  <UITooltip>
    <TooltipTrigger asChild>
      <span className="flex items-center gap-1 cursor-help">
        {label}
        <Info className="h-3.5 w-3.5 text-muted-foreground" />
      </span>
    </TooltipTrigger>
    <TooltipContent side="top" className="max-w-xs">
      {tooltip}
    </TooltipContent>
  </UITooltip>
);

const LiquidLimitSection = ({ trials, result, onChangeTrials, recordId }: LiquidLimitSectionProps) => {
  const graphData = useMemo(() => getLiquidLimitGraphData(trials), [trials]);

  const updateTrial = (index: number, field: keyof LiquidLimitTrial, value: string) => {
    onChangeTrials(
      trials.map((trial, trialIndex) =>
        trialIndex === index
          ? {
              ...trial,
              [field]: field === "trialNo" || field === "containerNo" ? value : sanitizeNumericInput(value),
            }
          : trial,
      ),
    );
  };

  const addTrial = () => {
    onChangeTrials([...trials, createTrial(trials.length)]);
  };

  const removeTrial = (index: number) => {
    const nextTrials =
      trials.length > 1
        ? trials.filter((_, trialIndex) => trialIndex !== index)
        : [createTrial(0)];

    onChangeTrials(nextTrials.map((trial, trialIndex) => ({ ...trial, trialNo: String(trialIndex + 1) })));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>BS 1377 Cone Penetration Method. Enter mass data to auto-calculate moisture.</span>
        <span>Incomplete rows are ignored.</span>
      </div>

      <div className="rounded-lg border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="bg-muted border-b">
                <th className="px-2 py-2 text-left font-medium text-muted-foreground w-14">Trial</th>
                <th className="px-2 py-2 text-left font-medium text-muted-foreground w-16">
                  <TooltipHeader label="Cont. No" tooltip="Container Number" />
                </th>
                <th className="px-2 py-2 text-left font-medium text-muted-foreground">
                  <TooltipHeader label="Pen. (mm)" tooltip="Penetration in millimeters" />
                </th>
                <th className="px-2 py-2 text-left font-medium text-muted-foreground">
                  <TooltipHeader label="Cont+Wet (g)" tooltip="Weight of container + wet soil (grams)" />
                </th>
                <th className="px-2 py-2 text-left font-medium text-muted-foreground">
                  <TooltipHeader label="Cont+Dry (g)" tooltip="Weight of container + dry soil (grams)" />
                </th>
                <th className="px-2 py-2 text-left font-medium text-muted-foreground">
                  <TooltipHeader label="Cont. (g)" tooltip="Weight of empty container (grams)" />
                </th>
                <th className="px-2 py-2 text-left font-medium text-muted-foreground">
                  <TooltipHeader label="Wt Water (g)" tooltip="Weight of water (auto-calculated) | Formula: Cont+Wet (g) − Cont+Dry (g)" />
                </th>
                <th className="px-2 py-2 text-left font-medium text-muted-foreground">
                  <TooltipHeader label="Wt Dry (g)" tooltip="Weight of dry soil (auto-calculated) | Formula: Cont+Dry (g) − Cont. (g)" />
                </th>
                <th className="px-2 py-2 text-left font-medium text-muted-foreground">
                  <TooltipHeader label="MC (%)" tooltip="Moisture Content as percentage of dry soil mass (auto-calculated) | Formula: (Wt Water / Wt Dry) × 100" />
                </th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {trials.map((trial, index) => {
                const started = isLiquidLimitTrialStarted(trial);
                const valid = isLiquidLimitTrialValid(trial);
                const waterMass = getWaterMass(trial);
                const drySoilMass = getDrySoilMass(trial);
                const autoMoisture = getTrialMoisture(trial);
                const hasAutoMoisture = trial.containerWetMass && trial.containerDryMass && trial.containerMass;

                return (
                  <tr
                    key={trial.id}
                    className={cn(
                      "border-b border-border/60 transition-colors",
                      started && !valid && "bg-amber-50/70 dark:bg-amber-950/20",
                    )}
                  >
                    <td className="px-2 py-1.5">
                      <Input value={trial.trialNo} disabled className="h-8 bg-muted/50 w-12" />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        value={trial.containerNo || ""}
                        onChange={(e) => updateTrial(index, "containerNo", e.target.value)}
                        className="h-8 w-16"
                        placeholder="101"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={trial.penetration}
                        onChange={(e) => updateTrial(index, "penetration", e.target.value)}
                        className={cn("h-8", started && !valid && !trial.penetration && "border-amber-300")}
                        placeholder="20"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={trial.containerWetMass || ""}
                        onChange={(e) => updateTrial(index, "containerWetMass", e.target.value)}
                        className="h-8"
                        placeholder="23.8"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={trial.containerDryMass || ""}
                        onChange={(e) => updateTrial(index, "containerDryMass", e.target.value)}
                        className="h-8"
                        placeholder="17.6"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={trial.containerMass || ""}
                        onChange={(e) => updateTrial(index, "containerMass", e.target.value)}
                        className="h-8"
                        placeholder="5.0"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <span className="text-sm text-muted-foreground">{waterMass !== null ? waterMass : "-"}</span>
                    </td>
                    <td className="px-2 py-1.5">
                      <span className="text-sm text-muted-foreground">{drySoilMass !== null ? drySoilMass : "-"}</span>
                    </td>
                    <td className="px-2 py-1.5">
                      {hasAutoMoisture ? (
                        <span className="text-sm font-medium">{autoMoisture || "-"}</span>
                      ) : (
                        <Input
                          type="text"
                          inputMode="decimal"
                          value={trial.moisture}
                          onChange={(e) => updateTrial(index, "moisture", e.target.value)}
                          className={cn("h-8", started && !valid && !trial.moisture && "border-amber-300")}
                          placeholder="35"
                        />
                      )}
                    </td>
                    <td className="px-1 py-1.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => removeTrial(index)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Button type="button" variant="outline" size="sm" className="w-full" onClick={addTrial}>
        <Plus className="mr-1 h-3.5 w-3.5" /> Add Trial
      </Button>

      {graphData.length >= 2 && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Graph on the left - takes 2 columns */}
            <div className="lg:col-span-2 rounded-lg border bg-card p-3">
              <h4 className="mb-3 text-sm font-medium text-foreground">Moisture vs Penetration (Semi-log Scale)</h4>
              <div className="overflow-x-auto">
                <div className="h-[280px] min-w-[520px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={graphData} margin={{ top: 16, right: 20, left: 0, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="penetration" stroke="hsl(var(--muted-foreground))" label={{ value: "Penetration (mm)", position: "insideBottom", offset: -4 }} />
                      <YAxis scale="log" stroke="hsl(var(--muted-foreground))" label={{ value: "Moisture (%) - Log Scale", angle: -90, position: "insideLeft" }} type="number" domain={[Math.min(...graphData.map(d => d.moisture)) * 0.8, Math.max(...graphData.map(d => d.moisture)) * 1.2]} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--background))",
                          borderColor: "hsl(var(--border))",
                          borderRadius: 8,
                        }}
                        formatter={(value: number) => [`${value.toFixed(2)}%`, "Moisture"]}
                        labelFormatter={(label) => `Penetration: ${label}mm`}
                      />
                      <ReferenceLine x={20} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" />
                      <Line
                        type="monotone"
                        dataKey="moisture"
                        name="Moisture"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        dot={{ fill: "hsl(var(--primary))", r: 4 }}
                        activeDot={{ r: 5 }}
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Summary on the right - takes 1 column */}
            <div className="flex flex-col gap-3">
              <div className="rounded-lg border bg-muted/40 p-3 flex-1 flex flex-col justify-center">
                <span className="text-sm font-medium text-muted-foreground">Liquid Limit (LL) at 20mm penetration</span>
                <span className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-2">{result !== null ? `${result}%` : "-"}</span>
              </div>
            </div>
          </div>

          {/* Hidden linear scale chart for Excel export - will be captured by the export process */}
          <div style={{ display: "none" }} className={`liquid-limit-export-chart${recordId ? `-${recordId}` : ""}`}>
            <div className="bg-white p-6" style={{ width: "600px", height: "400px" }}>
              {graphData.length > 0 && (() => {
                // Calculate linear regression for line of best fit
                const regressionData = calculateLinearRegression(
                  graphData
                    .map((d) => ({
                      x: d.penetration || 0,
                      y: d.moisture || 0,
                    }))
                    .filter((d) => !isNaN(d.x) && !isNaN(d.y))
                );

                // Generate regression line points
                const regressionLineData = [];
                if (regressionData && graphData.length >= 2) {
                  const penetrationValues = graphData
                    .map((d) => d.penetration || 0)
                    .filter((x) => !isNaN(x));
                  const minPen = Math.min(...penetrationValues);
                  const maxPen = Math.max(...penetrationValues);

                  // Create two points for the regression line
                  const y1 = regressionData.slope * minPen + regressionData.intercept;
                  const y2 = regressionData.slope * maxPen + regressionData.intercept;

                  regressionLineData.push(
                    { penetration: minPen, regressionMoisture: y1, moisture: null },
                    { penetration: maxPen, regressionMoisture: y2, moisture: null }
                  );
                }

                return (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={graphData} margin={{ top: 20, right: 30, left: 60, bottom: 60 }}>
                      <CartesianGrid stroke="#e5e7eb" />
                      <XAxis
                        dataKey="penetration"
                        stroke="#000"
                        label={{ value: "Penetration (mm)", position: "bottom", offset: 10, fontSize: 12 }}
                        tick={{ fontSize: 11 }}
                      />
                      <YAxis
                        stroke="#000"
                        label={{ value: "Moisture Content (%)", angle: -90, position: "left", offset: 10, fontSize: 12 }}
                        tick={{ fontSize: 11 }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#ffffff",
                          border: "1px solid #d1d5db",
                          borderRadius: 4,
                        }}
                        formatter={(value: number) => [`${value.toFixed(2)}%`, "Moisture"]}
                        labelFormatter={(label) => `Penetration: ${label}mm`}
                      />
                      {/* Data points line */}
                      <Line
                        type="monotone"
                        dataKey="moisture"
                        name="Moisture"
                        stroke="#ef4444"
                        strokeWidth={2}
                        dot={{ fill: "#ef4444", r: 4 }}
                        activeDot={{ r: 5 }}
                        isAnimationActive={false}
                      />
                      {/* Line of best fit */}
                      {regressionData && regressionLineData.length > 0 && (
                        <Line
                          data={regressionLineData}
                          type="linear"
                          dataKey="regressionMoisture"
                          name="Line of Best Fit"
                          stroke="#000000"
                          strokeWidth={1.5}
                          dot={false}
                          isAnimationActive={false}
                        />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                );
              })()}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default LiquidLimitSection;
