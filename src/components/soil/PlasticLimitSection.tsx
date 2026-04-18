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
    onChangeTrials(
      displayTrials.map((trial, trialIndex) =>
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
    onChangeTrials([...displayTrials, createTrial(displayTrials.length)]);
  };

  const removeTrial = (index: number) => {
    const nextTrials = displayTrials.filter((_, trialIndex) => trialIndex !== index);
    onChangeTrials(nextTrials.length === 0 ? [createTrial(0)] : nextTrials);
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

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Enter mass data to auto-calculate moisture, or enter moisture directly.</span>
        <span>Incomplete rows are ignored.</span>
      </div>

      <div className="rounded-lg border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-sm">
            <thead>
              <tr className="bg-muted border-b">
                <th className="px-2 py-2 text-left font-medium text-muted-foreground w-14">Trial</th>
                <th className="px-2 py-2 text-left font-medium text-muted-foreground w-16">Cont. No</th>
                <th className="px-2 py-2 text-left font-medium text-muted-foreground">Cont+Wet (g)</th>
                <th className="px-2 py-2 text-left font-medium text-muted-foreground">Cont+Dry (g)</th>
                <th className="px-2 py-2 text-left font-medium text-muted-foreground">Cont. (g)</th>
                <th className="px-2 py-2 text-left font-medium text-muted-foreground">Wt Water (g)</th>
                <th className="px-2 py-2 text-left font-medium text-muted-foreground">Wt Dry (g)</th>
                <th className="px-2 py-2 text-left font-medium text-muted-foreground">MC (%)</th>
                <th className="w-10" />
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
                    <td className="px-2 py-1.5">
                      <Input value={trial.trialNo} disabled className="h-8 bg-muted/50 w-12" />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        value={trial.containerNo || ""}
                        onChange={(e) => updateTrial(index, "containerNo", e.target.value)}
                        className="h-8 w-16"
                        placeholder="201"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={trial.containerWetMass || ""}
                        onChange={(e) => updateTrial(index, "containerWetMass", e.target.value)}
                        className="h-8"
                        placeholder="22.0"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={trial.containerDryMass || ""}
                        onChange={(e) => updateTrial(index, "containerDryMass", e.target.value)}
                        className="h-8"
                        placeholder="16.5"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={trial.containerMass || ""}
                        onChange={(e) => updateTrial(index, "containerMass", e.target.value)}
                        className="h-8"
                        placeholder="4.8"
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
                        <span className="text-sm font-medium">{effectiveMoisture || "-"}</span>
                      ) : (
                        <Input
                          type="text"
                          inputMode="decimal"
                          value={trial.moisture}
                          onChange={(e) => updateTrial(index, "moisture", e.target.value)}
                          className={cn("h-8", started && !valid && !trial.moisture && "border-amber-300")}
                          placeholder="24"
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
