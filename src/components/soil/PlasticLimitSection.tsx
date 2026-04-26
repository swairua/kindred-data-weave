import { Plus, X } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PlasticLimitTrial } from "@/context/TestDataContext";
import {
  isPlasticLimitTrialStarted,
  isPlasticLimitTrialValid,
  sanitizeNumericInput,
  getWaterMass,
  getDrySoilMass,
  getTrialMoisture,
  calculateMoistureFromMass,
} from "@/lib/atterbergCalculations";
import { cn } from "@/lib/utils";

interface PlasticLimitSectionProps {
  trials: PlasticLimitTrial[];
  result: number | null;
  onChangeTrials: (trials: PlasticLimitTrial[]) => void;
  liquidLimitMoisture?: number | null; // Moisture from first LL trial (for PR trial)
}

const createTrial = (index: number, label?: string): PlasticLimitTrial => ({
  id: `trial-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  trialNo: label || String(index + 1),
  containerNo: label,
  moisture: "",
});

const PlasticLimitSection = ({ trials, result, onChangeTrials, liquidLimitMoisture }: PlasticLimitSectionProps) => {
  // Filter out PR and MG rows from display - these are computed, not user input
  const displayTrials = trials.filter((t) => t.containerNo !== "PR" && t.containerNo !== "MG");

  // Ensure at least 2 default trials on first mount
  useEffect(() => {
    // Only initialize if trials array is empty
    if (trials.length === 0) {
      onChangeTrials([createTrial(0), createTrial(1)]);
    }
  }, []); // Only run once on mount

  const updateTrial = (index: number, field: keyof PlasticLimitTrial, value: string) => {
    const updatedDisplayTrials = displayTrials.map((trial, trialIndex) =>
      trialIndex === index
        ? {
            ...trial,
            [field]: field === "trialNo" || field === "containerNo" ? value : sanitizeNumericInput(value),
          }
        : trial,
    );
    // Preserve any PR/MG rows that were filtered out
    const prMgRows = trials.filter((t) => t.containerNo === "PR" || t.containerNo === "MG");
    onChangeTrials([...updatedDisplayTrials, ...prMgRows]);
  };

  const addTrial = () => {
    const newDisplayTrials = [...displayTrials, createTrial(displayTrials.length)];
    // Preserve any PR/MG rows that were filtered out
    const prMgRows = trials.filter((t) => t.containerNo === "PR" || t.containerNo === "MG");
    onChangeTrials([...newDisplayTrials, ...prMgRows]);
  };

  const removeTrial = (index: number) => {
    const nextTrials = displayTrials.filter((_, trialIndex) => trialIndex !== index);
    const finalTrials = nextTrials.length === 0 ? [createTrial(0)] : nextTrials;
    // Preserve any PR/MG rows that were filtered out
    const prMgRows = trials.filter((t) => t.containerNo === "PR" || t.containerNo === "MG");
    onChangeTrials([...finalTrials, ...prMgRows]);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-blue-200/50 bg-blue-50/50 p-3 text-xs dark:border-blue-900/30 dark:bg-blue-950/10">
        <div className="text-blue-900 dark:text-blue-200">
          <strong>Plastic Limit (PL) Trial Guide:</strong>
          <div className="mt-1 space-y-1">
            <div>• Enter at least 2 trials with moisture content data</div>
            <div>• Enter mass data (wet, dry, container) to auto-calculate moisture, or enter moisture directly</div>
            <div>• <strong>Important:</strong> PL must never exceed LL. If results show PL &gt; LL, check your trial moisture percentages.</div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between text-xs text-muted-foreground">
        <span>Enter mass data to auto-calculate moisture, or enter moisture directly.</span>
        <span className="whitespace-nowrap">Incomplete rows are ignored.</span>
      </div>

      <div className="rounded-lg border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs sm:text-sm">
            <thead>
              <tr className="bg-muted border-b">
                <th className="px-1 sm:px-2 py-2 text-left font-medium text-muted-foreground w-10 sm:w-14">Trial</th>
                <th className="px-1 sm:px-2 py-2 text-left font-medium text-muted-foreground w-12 sm:w-16">Cont. No</th>
                <th className="px-1 sm:px-2 py-2 text-left font-medium text-muted-foreground hidden sm:table-cell">
                  <span className="hidden md:inline">Cont+Wet (g)</span>
                  <span className="md:hidden">C+W</span>
                </th>
                <th className="px-1 sm:px-2 py-2 text-left font-medium text-muted-foreground hidden sm:table-cell">
                  <span className="hidden md:inline">Cont+Dry (g)</span>
                  <span className="md:hidden">C+D</span>
                </th>
                <th className="px-1 sm:px-2 py-2 text-left font-medium text-muted-foreground hidden sm:table-cell">
                  <span className="hidden md:inline">Cont. (g)</span>
                  <span className="md:hidden">C</span>
                </th>
                <th className="px-1 sm:px-2 py-2 text-left font-medium text-muted-foreground hidden md:table-cell text-xs">
                  <span className="hidden lg:inline">Wt Water (g)</span>
                  <span className="lg:hidden">W.W</span>
                </th>
                <th className="px-1 sm:px-2 py-2 text-left font-medium text-muted-foreground hidden md:table-cell text-xs">
                  <span className="hidden lg:inline">Wt Dry (g)</span>
                  <span className="lg:hidden">W.D</span>
                </th>
                <th className="px-1 sm:px-2 py-2 text-left font-medium text-muted-foreground">
                  <span className="hidden sm:inline">MC (%)</span>
                  <span className="sm:hidden">MC%</span>
                </th>
                <th className="w-8 sm:w-10" />
              </tr>
            </thead>
            <tbody>
              {displayTrials.map((trial, index) => {
                const started = isPlasticLimitTrialStarted(trial);
                const valid = isPlasticLimitTrialValid(trial);
                const waterMass = getWaterMass(trial);
                const drySoilMass = getDrySoilMass(trial);
                const autoMoisture = getTrialMoisture(trial);
                const hasAutoMoisture = trial.containerWetMass && trial.containerDryMass && trial.containerMass;
                const effectiveMoisture = autoMoisture;

                return (
                  <tr
                    key={trial.id}
                    className={cn(
                      "border-b border-border/60 transition-colors",
                      started && !valid && "bg-amber-50/70 dark:bg-amber-950/20",
                    )}
                  >
                    <td className="px-1 sm:px-2 py-1.5">
                      <Input value={trial.trialNo} disabled className="h-7 sm:h-8 bg-muted/50 w-9 sm:w-12 text-xs sm:text-sm" />
                    </td>
                    <td className="px-1 sm:px-2 py-1.5">
                      <Input
                        value={trial.containerNo || ""}
                        onChange={(e) => updateTrial(index, "containerNo", e.target.value)}
                        className="h-7 sm:h-8 w-11 sm:w-16 text-xs sm:text-sm"
                        placeholder="201"
                      />
                    </td>
                    <td className="px-1 sm:px-2 py-1.5 hidden sm:table-cell">
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={trial.containerWetMass || ""}
                        onChange={(e) => updateTrial(index, "containerWetMass", e.target.value)}
                        className="h-7 sm:h-8 text-xs sm:text-sm"
                        placeholder="22.0"
                      />
                    </td>
                    <td className="px-1 sm:px-2 py-1.5 hidden sm:table-cell">
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={trial.containerDryMass || ""}
                        onChange={(e) => updateTrial(index, "containerDryMass", e.target.value)}
                        className="h-7 sm:h-8 text-xs sm:text-sm"
                        placeholder="16.5"
                      />
                    </td>
                    <td className="px-1 sm:px-2 py-1.5 hidden sm:table-cell">
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={trial.containerMass || ""}
                        onChange={(e) => updateTrial(index, "containerMass", e.target.value)}
                        className="h-7 sm:h-8 text-xs sm:text-sm"
                        placeholder="4.8"
                      />
                    </td>
                    <td className="px-1 sm:px-2 py-1.5 hidden md:table-cell">
                      <span className="text-xs sm:text-sm text-muted-foreground">{waterMass !== null ? waterMass : "-"}</span>
                    </td>
                    <td className="px-1 sm:px-2 py-1.5 hidden md:table-cell">
                      <span className="text-xs sm:text-sm text-muted-foreground">{drySoilMass !== null ? drySoilMass : "-"}</span>
                    </td>
                    <td className="px-1 sm:px-2 py-1.5">
                      {hasAutoMoisture ? (
                        <span className="text-xs sm:text-sm font-medium">{effectiveMoisture || "-"}</span>
                      ) : (
                        <Input
                          type="text"
                          inputMode="decimal"
                          value={trial.moisture}
                          onChange={(e) => updateTrial(index, "moisture", e.target.value)}
                          className={cn("h-7 sm:h-8 text-xs sm:text-sm", started && !valid && !trial.moisture && "border-amber-300")}
                          placeholder="24"
                        />
                      )}
                    </td>
                    <td className="px-0.5 sm:px-1 py-1.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 sm:h-7 sm:w-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => removeTrial(index)}
                      >
                        <X className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
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

      <div className="rounded-lg border bg-muted/40 p-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">Plastic Limit (PL)</span>
          <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{result !== null ? `${result}%` : "-"}</span>
        </div>
      </div>
    </div>
  );
};

export default PlasticLimitSection;
