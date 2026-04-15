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
  // Ensure PR and MG trials exist in the trials array
  const ensureFixedTrials = (currentTrials: PlasticLimitTrial[]): PlasticLimitTrial[] => {
    const prExists = currentTrials.some((t) => t.containerNo === "PR");
    const mgExists = currentTrials.some((t) => t.containerNo === "MG");

    let updated = [...currentTrials];
    if (!prExists) {
      updated.push(createTrial(updated.length, "PR"));
    }
    if (!mgExists) {
      updated.push(createTrial(updated.length, "MG"));
    }
    return updated;
  };

  const ensuredTrials = ensureFixedTrials(trials);

  // Sync fixed trials with parent component
  useEffect(() => {
    const trialsNeedSync = !trials.some((t) => t.containerNo === "PR") || !trials.some((t) => t.containerNo === "MG");
    if (trialsNeedSync) {
      onChangeTrials(ensuredTrials);
    }
  }, []); // Only run once on mount

  const updateTrial = (index: number, field: keyof PlasticLimitTrial, value: string) => {
    onChangeTrials(
      ensuredTrials.map((trial, trialIndex) =>
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
    onChangeTrials(ensureFixedTrials([...ensuredTrials, createTrial(ensuredTrials.length)]));
  };

  const removeTrial = (index: number) => {
    const trial = ensuredTrials[index];
    // Don't allow removing fixed trials (PR, MG)
    if (trial.containerNo === "PR" || trial.containerNo === "MG") {
      return;
    }

    const nextTrials = ensuredTrials.filter((_, trialIndex) => trialIndex !== index);
    onChangeTrials(nextTrials.length === 0 ? [createTrial(0)] : nextTrials);
  };

  // Calculate moisture content for PR trial from LL
  const getPRMoisture = (): string => {
    const prTrial = ensuredTrials.find((t) => t.containerNo === "PR");
    if (!prTrial) return "";
    if (liquidLimitMoisture !== null && liquidLimitMoisture !== undefined) {
      return String(liquidLimitMoisture);
    }
    return prTrial.moisture;
  };

  // Calculate moisture content for MG trial from MG source data
  const getMGMoisture = (): string => {
    const mgSourceTrial = ensuredTrials.find((t) => t.containerNo === "MG");
    if (!mgSourceTrial) return "";
    // Check if we have the full data entry for MG (wet, dry, container)
    const mg = calculateMoistureFromMass(
      mgSourceTrial.containerWetMass,
      mgSourceTrial.containerDryMass,
      mgSourceTrial.containerMass,
    );
    if (mg) return mg;
    return mgSourceTrial.moisture;
  };

  return (
    <div className="space-y-4">
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
              {ensuredTrials.map((trial, index) => {
                const isFixedTrial = trial.containerNo === "PR" || trial.containerNo === "MG";
                const started = isPlasticLimitTrialStarted(trial);
                const valid = isPlasticLimitTrialValid(trial);
                const waterMass = getWaterMass(trial);
                const drySoilMass = getDrySoilMass(trial);
                const autoMoisture = getTrialMoisture(trial);
                const hasAutoMoisture = trial.containerWetMass && trial.containerDryMass && trial.containerMass;

                // For PR trial, use liquid limit moisture
                let effectiveMoisture = autoMoisture;
                if (trial.containerNo === "PR") {
                  effectiveMoisture = getPRMoisture();
                } else if (trial.containerNo === "MG") {
                  effectiveMoisture = getMGMoisture();
                }

                return (
                  <tr
                    key={trial.id}
                    className={cn(
                      "border-b border-border/60 transition-colors",
                      isFixedTrial && "bg-blue-50/40 dark:bg-blue-950/10",
                      started && !valid && !isFixedTrial && "bg-amber-50/70 dark:bg-amber-950/20",
                    )}
                  >
                    <td className="px-2 py-1.5">
                      <Input value={trial.trialNo} disabled className="h-8 bg-muted/50 w-12" />
                    </td>
                    <td className="px-2 py-1.5">
                      {isFixedTrial ? (
                        <Input value={trial.containerNo || ""} disabled className="h-8 bg-muted/50 w-16 font-bold" />
                      ) : (
                        <Input
                          value={trial.containerNo || ""}
                          onChange={(e) => updateTrial(index, "containerNo", e.target.value)}
                          className="h-8 w-16"
                          placeholder="201"
                        />
                      )}
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
                      {isFixedTrial || hasAutoMoisture ? (
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
                      {!isFixedTrial ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => removeTrial(index)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      ) : (
                        <div className="h-7 w-7" />
                      )}
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
