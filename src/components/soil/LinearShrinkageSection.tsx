import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ShrinkageLimitTrial } from "@/context/TestDataContext";
import { isShrinkageLimitTrialStarted, isShrinkageLimitTrialValid, sanitizeNumericInput } from "@/lib/atterbergCalculations";
import { cn } from "@/lib/utils";

interface LinearShrinkageSectionProps {
  trials: ShrinkageLimitTrial[];
  result: number | null;
  onChangeTrials: (trials: ShrinkageLimitTrial[]) => void;
}

const createTrial = (index: number): ShrinkageLimitTrial => ({
  id: `trial-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  trialNo: String(index + 1),
  initialLength: "140",
  finalLength: "",
});

const LinearShrinkageSection = ({ trials, result, onChangeTrials }: LinearShrinkageSectionProps) => {
  const updateTrial = (index: number, field: keyof ShrinkageLimitTrial, value: string) => {
    onChangeTrials(
      trials.map((trial, trialIndex) =>
        trialIndex === index
          ? {
              ...trial,
              [field]: field === "trialNo" ? value : sanitizeNumericInput(value),
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
        <span>Provide initial and final length measurements for linear shrinkage.</span>
        <span>Incomplete rows are ignored in the LS calculation.</span>
      </div>

      <div className="rounded-lg border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[500px] text-sm">
            <thead>
              <tr className="bg-muted border-b">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Trial</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Initial Length (mm)</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Final Length (mm)</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Shrinkage (%)</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {trials.map((trial, index) => {
                const started = isShrinkageLimitTrialStarted(trial);
                const valid = isShrinkageLimitTrialValid(trial);
                const shrinkagePct = valid
                  ? (((Number(trial.initialLength) - Number(trial.finalLength)) / Number(trial.initialLength)) * 100).toFixed(1)
                  : null;

                return (
                  <tr
                    key={trial.id}
                    className={cn(
                      "border-b border-border/60 transition-colors",
                      started && !valid && "bg-amber-50/70 dark:bg-amber-950/20",
                    )}
                  >
                    <td className="px-3 py-1.5">
                      <Input value={trial.trialNo} disabled className="h-8 bg-muted/50" />
                    </td>
                    <td className="px-3 py-1.5">
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={trial.initialLength}
                        onChange={(event) => updateTrial(index, "initialLength", event.target.value)}
                        className={cn("h-8", started && !valid && !trial.initialLength && "border-amber-300")}
                        placeholder="140"
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={trial.finalLength}
                        onChange={(event) => updateTrial(index, "finalLength", event.target.value)}
                        className={cn(
                          "h-8",
                          started && !valid && !trial.finalLength && "border-amber-300",
                        )}
                        placeholder="130"
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <span className="text-sm text-muted-foreground">{shrinkagePct !== null ? `${shrinkagePct}%` : "-"}</span>
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
          <span className="text-sm font-medium text-muted-foreground">Linear Shrinkage (%)</span>
          <span className="text-lg font-bold text-amber-600 dark:text-amber-400">{result !== null ? `${result}%` : "-"}</span>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Linear shrinkage = (Initial Length - Final Length) / Initial Length × 100
        </p>
      </div>
    </div>
  );
};

export default LinearShrinkageSection;
