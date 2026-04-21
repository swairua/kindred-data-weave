import { useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceDot } from "recharts";
import { Plus, X, Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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
  calculateLogLinearRegression,
  calculatePlasticityIndex,
  getALinePI,
  classifySoil,
} from "@/lib/atterbergCalculations";
import { cn } from "@/lib/utils";
import PlasticityChart from "./PlasticityChart";

interface LiquidLimitSectionProps {
  trials: LiquidLimitTrial[];
  result: number | null;
  onChangeTrials: (trials: LiquidLimitTrial[]) => void;
  recordId?: string;
  plasticLimit?: number | null;
  passing425um?: string;
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

const LiquidLimitSection = ({ trials, result, onChangeTrials, recordId, plasticLimit, passing425um }: LiquidLimitSectionProps) => {
  const graphData = useMemo(() => getLiquidLimitGraphData(trials), [trials]);
  const [showALine, setShowALine] = useState(false);

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

      {graphData.length >= 2 && (() => {
        // Calculate log-linear regression for line of best fit (ASTM D4318 compliant)
        const regressionPoints = graphData
          .map((d) => ({ x: d.penetration || 0, y: d.moisture || 0 }))
          .filter((d) => !isNaN(d.x) && !isNaN(d.y) && d.x > 0);
        const regressionData = calculateLogLinearRegression(regressionPoints);

        const penetrationValues = graphData.map((d) => d.penetration);
        const minPen = Math.min(...penetrationValues);
        const maxPen = Math.max(...penetrationValues);
        // Extend regression line so 20 mm is always covered
        const xStart = Math.min(minPen, 18);
        const xEnd = Math.max(maxPen, 26);

        // LL at 20 mm via log-linear regression: LL = m·log₁₀(20) + b
        const llAt20 = regressionData
          ? Number((regressionData.slope * Math.log10(20) + regressionData.intercept).toFixed(2))
          : null;

        // Build merged chart data: data points + regression endpoints
        // For log-linear regression, the Y value is calculated as: y = m·log₁₀(x) + b
        const mergedChartData = [
          ...(regressionData
            ? [{ penetration: xStart, moisture: null as number | null, regressionMoisture: regressionData.slope * Math.log10(xStart) + regressionData.intercept }]
            : []),
          ...graphData.map((d) => ({
            penetration: d.penetration,
            moisture: d.moisture as number | null,
            regressionMoisture: regressionData && d.penetration > 0
              ? regressionData.slope * Math.log10(d.penetration) + regressionData.intercept
              : null,
          })),
          ...(regressionData
            ? [{ penetration: xEnd, moisture: null as number | null, regressionMoisture: regressionData.slope * Math.log10(xEnd) + regressionData.intercept }]
            : []),
        ].sort((a, b) => a.penetration - b.penetration);

        const moistureValues = graphData.map((d) => d.moisture);
        const yMin = Math.min(...moistureValues, llAt20 ?? Infinity);
        const yMax = Math.max(...moistureValues, llAt20 ?? -Infinity);
        const yPad = Math.max((yMax - yMin) * 0.1, 1);

        // Live derived values
        const llValue = result ?? llAt20;
        const piValue = calculatePlasticityIndex(llValue ?? null, plasticLimit ?? null);
        const aLineThreshold = llValue !== null && llValue !== undefined ? getALinePI(llValue) : null;
        const classification = classifySoil(llValue ?? null, piValue);

        return (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Graph on the left - takes 2 columns */}
              <div className="lg:col-span-2 rounded-lg border bg-card p-3">
                <h4 className="mb-3 text-sm font-medium text-foreground">Moisture Content vs Penetration (Semi-Log, ASTM D4318)</h4>
                <div className="overflow-x-auto">
                  <div className="h-[280px] min-w-[520px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={mergedChartData} margin={{ top: 16, right: 20, left: 0, bottom: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis
                          dataKey="penetration"
                          type="number"
                          scale="log"
                          domain={[xStart, xEnd]}
                          allowDataOverflow={true}
                          stroke="hsl(var(--muted-foreground))"
                          tick={{ fontSize: 12 }}
                          label={{ value: "Penetration (mm, log scale)", position: "insideBottom", offset: -4, fontSize: 12 }}
                        />
                        <YAxis
                          stroke="hsl(var(--muted-foreground))"
                          tick={{ fontSize: 12 }}
                          label={{ value: "Moisture Content (%)", angle: -90, position: "insideLeft", fontSize: 12 }}
                          type="number"
                          domain={[Math.max(0, yMin - yPad), yMax + yPad]}
                          allowDecimals
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "hsl(var(--background))",
                            borderColor: "hsl(var(--border))",
                            borderRadius: 8,
                          }}
                          formatter={(value: number | null, name: string) =>
                            value === null ? ["-", name] : [`${value.toFixed(2)}%`, name === "regressionMoisture" ? "Best Fit" : "Moisture"]
                          }
                          labelFormatter={(label) => `Penetration: ${Number(label).toFixed(1)}mm`}
                        />
                        <ReferenceLine x={20} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" label={{ value: "20mm", position: "top", fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                        {regressionData && (
                          <Line
                            type="linear"
                            dataKey="regressionMoisture"
                            name="Line of Fit"
                            stroke="hsl(var(--primary))"
                            strokeWidth={2}
                            dot={false}
                            connectNulls
                            isAnimationActive={false}
                          />
                        )}
                        <Line
                          type="linear"
                          dataKey="moisture"
                          name="Data Points"
                          stroke="transparent"
                          dot={{ fill: "hsl(var(--primary))", r: 4 }}
                          activeDot={{ r: 5 }}
                          connectNulls={false}
                          isAnimationActive={false}
                        />
                        {regressionData && llAt20 !== null && (
                          <ReferenceDot
                            x={20}
                            y={llAt20}
                            r={6}
                            fill="hsl(var(--destructive))"
                            stroke="hsl(var(--background))"
                            strokeWidth={2}
                            label={{ value: `LL = ${llAt20}%`, position: "right", fontSize: 11, fill: "hsl(var(--destructive))" }}
                          />
                        )}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                {regressionData && (
                  <p className="mt-2 text-xs text-muted-foreground font-mono">
                    y = {regressionData.slope.toFixed(3)}·log₁₀(x) + {regressionData.intercept.toFixed(3)} &nbsp;|&nbsp; R² = {regressionData.rSquared.toFixed(3)}
                  </p>
                )}
              </div>

              {/* Live Computed Values panel */}
              <div className="flex flex-col gap-3">
                <div className="rounded-lg border bg-muted/40 p-3">
                  <span className="text-xs font-medium text-muted-foreground">Liquid Limit (LL) @ 20mm</span>
                  <div className="text-2xl font-bold text-primary mt-1">{llValue !== null && llValue !== undefined ? `${llValue}%` : "-"}</div>
                </div>
                <div className="rounded-lg border bg-card p-3 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Plastic Limit (PL)</span>
                    <span className="font-medium">{plasticLimit !== null && plasticLimit !== undefined ? `${plasticLimit}%` : "-"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Plasticity Index (PI)</span>
                    <span className="font-medium">{piValue !== null ? `${piValue}%` : "-"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">A-line PI = 0.73(LL−20)</span>
                    <span className="font-medium">{aLineThreshold !== null ? `${aLineThreshold}` : "-"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">USCS Class</span>
                    <span className="font-semibold text-foreground">{classification}</span>
                  </div>
                  {passing425um && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Passing 425µm</span>
                      <span className="font-medium">{passing425um}%</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between rounded-lg border p-2">
                  <Label htmlFor={`a-line-toggle-${recordId ?? "x"}`} className="text-xs cursor-pointer">
                    Show A-line preview
                  </Label>
                  <Switch
                    id={`a-line-toggle-${recordId ?? "x"}`}
                    checked={showALine}
                    onCheckedChange={setShowALine}
                  />
                </div>
              </div>
            </div>

            {showALine && llValue !== null && llValue !== undefined && piValue !== null && (
              <div className="rounded-lg border bg-card p-3">
                <h4 className="mb-2 text-sm font-medium text-foreground">Plasticity Chart Preview</h4>
                <PlasticityChart liquidLimit={llValue} plasticityIndex={piValue} />
              </div>
            )}

            {/* Off-screen semi-log chart for PDF/Excel export — must be rendered (not display:none)
                so Recharts ResponsiveContainer measures real dimensions and paints the data + regression line. */}
            <div
              aria-hidden="true"
              className={`liquid-limit-export-chart${recordId ? `-${recordId}` : ""}`}
              style={{ position: "absolute", left: "-100000px", top: 0, pointerEvents: "none" }}
            >
              <div className="bg-white p-2" style={{ width: "900px", height: "700px" }}>
                {graphData.length > 0 && (() => {
                  // Calculate log-linear regression for line of best fit (ASTM D4318 compliant)
                  const regressionDataExport = calculateLogLinearRegression(
                    graphData
                      .map((d) => ({
                        x: d.penetration || 0,
                        y: d.moisture || 0,
                      }))
                      .filter((d) => !isNaN(d.x) && !isNaN(d.y) && d.x > 0)
                  );

                  const penetrationValuesExport = graphData.map((d) => d.penetration);
                  const minPenExport = Math.min(...penetrationValuesExport);
                  const maxPenExport = Math.max(...penetrationValuesExport);
                  const xStartExport = Math.min(minPenExport, 18);
                  const xEndExport = Math.max(maxPenExport, 26);

                  // Build merged chart data: data points + regression endpoints
                  // For log-linear regression, the Y value is calculated as: y = m·log₁₀(x) + b
                  const mergedChartDataExport = [
                    ...(regressionDataExport
                      ? [{ penetration: xStartExport, moisture: null as number | null, regressionMoisture: regressionDataExport.slope * Math.log10(xStartExport) + regressionDataExport.intercept }]
                      : []),
                    ...graphData.map((d) => ({
                      penetration: d.penetration,
                      moisture: d.moisture as number | null,
                      regressionMoisture: regressionDataExport && d.penetration > 0
                        ? regressionDataExport.slope * Math.log10(d.penetration) + regressionDataExport.intercept
                        : null,
                    })),
                    ...(regressionDataExport
                      ? [{ penetration: xEndExport, moisture: null as number | null, regressionMoisture: regressionDataExport.slope * Math.log10(xEndExport) + regressionDataExport.intercept }]
                      : []),
                  ].sort((a, b) => a.penetration - b.penetration);

                  return (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={mergedChartDataExport} margin={{ top: 20, right: 30, left: 60, bottom: 60 }}>
                        <CartesianGrid stroke="#e5e7eb" strokeWidth={1.5} fill="#F5E6D3" />
                        <XAxis
                          dataKey="penetration"
                          type="number"
                          scale="log"
                          domain={[xStartExport, xEndExport]}
                          allowDataOverflow={true}
                          stroke="#000"
                          strokeWidth={2}
                          label={{ value: "Penetration (mm, Log Scale)", position: "bottom", offset: 15, fontSize: 16, fontWeight: "bold", fill: "#111827" }}
                          tick={{ fontSize: 14, fill: "#111827" }}
                        />
                        <YAxis
                          stroke="#000"
                          strokeWidth={2}
                          domain={["auto", "auto"]}
                          label={{ value: "Moisture Content (%)", angle: -90, position: "left", offset: 15, fontSize: 16, fontWeight: "bold", fill: "#111827" }}
                          tick={{ fontSize: 14, fill: "#111827" }}
                        />
                        <ReferenceLine x={20} stroke="#000" strokeDasharray="4 4" />
                        {/* Data points line */}
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
                        {/* Line of best fit */}
                        {regressionDataExport && (
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
                  );
                })()}
              </div>
            </div>
          </>
        );
      })()}
    </div>
  );
};

export default LiquidLimitSection;
