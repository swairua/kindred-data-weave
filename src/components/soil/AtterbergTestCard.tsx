import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, ChevronRight, Edit2, X, AlertCircle, Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AtterbergTest, AtterbergTestType, LiquidLimitTrial, PlasticLimitTrial, ShrinkageLimitTrial } from "@/context/TestDataContext";
import {
  areCalculatedResultsEqual,
  calculateTestResult,
  countValidTrials,
  getActiveResultValue,
  getTestValidationMessages,
  isAtterbergTestComplete,
  isLiquidLimitTrialStarted,
  isPlasticLimitTrialStarted,
  isShrinkageLimitTrialStarted,
} from "@/lib/atterbergCalculations";
import LiquidLimitSection from "./LiquidLimitSection";
import PlasticLimitSection from "./PlasticLimitSection";
import ShrinkageLimitSection from "./ShrinkageLimitSection";

interface AtterbergTestCardProps {
  test: AtterbergTest;
  recordId?: string;
  liquidLimitMoisture?: number | null; // For PR trial in PL section
  recordPlasticLimit?: number | null;
  recordPassing425um?: string;
  onDelete: () => void;
  onUpdateTitle: (title: string) => void;
  onUpdateType: (type: AtterbergTestType) => void;
  onToggleExpanded: () => void;
  onUpdateLiquidLimitTrials: (trials: LiquidLimitTrial[]) => void;
  onUpdatePlasticLimitTrials: (trials: PlasticLimitTrial[]) => void;
  onUpdateShrinkageLimitTrials: (trials: ShrinkageLimitTrial[]) => void;
  onSyncResult: (test: AtterbergTest) => void;
}

const testTypeLabels: Record<AtterbergTestType, string> = {
  liquidLimit: "Liquid Limit",
  plasticLimit: "Plastic Limit",
  shrinkageLimit: "Linear Shrinkage",
};

const AtterbergTestCard = ({
  test,
  recordId,
  liquidLimitMoisture,
  recordPlasticLimit,
  recordPassing425um,
  onDelete,
  onUpdateTitle,
  onUpdateType,
  onToggleExpanded,
  onUpdateLiquidLimitTrials,
  onUpdatePlasticLimitTrials,
  onUpdateShrinkageLimitTrials,
  onSyncResult,
}: AtterbergTestCardProps) => {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState(test.title);
  const [pendingType, setPendingType] = useState<AtterbergTestType | null>(null);

  useEffect(() => {
    setDraftTitle(test.title);
  }, [test.title]);

  const computedResult = useMemo(() => calculateTestResult(test), [test]);
  const activeResult = getActiveResultValue(test, computedResult);
  const validTrials = countValidTrials(test);
  const isComplete = isAtterbergTestComplete(test);
  const hasStartedData =
    (test.type === "liquidLimit" && test.trials.some(isLiquidLimitTrialStarted)) ||
    (test.type === "plasticLimit" && test.trials.some(isPlasticLimitTrialStarted)) ||
    (test.type === "shrinkageLimit" && test.trials.some(isShrinkageLimitTrialStarted));

  useEffect(() => {
    if (!areCalculatedResultsEqual(test.result, computedResult)) {
      onSyncResult({ ...test, result: computedResult });
    }
  }, [computedResult, onSyncResult, test]);

  const saveTitle = () => {
    onUpdateTitle(draftTitle.trim() || testTypeLabels[test.type]);
    setIsEditingTitle(false);
  };

  const requestTypeChange = (type: AtterbergTestType) => {
    if (type === test.type) return;

    if (hasStartedData) {
      setPendingType(type);
      return;
    }

    onUpdateType(type);
  };

  const confirmTypeChange = () => {
    if (pendingType) {
      onUpdateType(pendingType);
    }
    setPendingType(null);
  };

  const validationMessages = useMemo(() => {
    return getTestValidationMessages(test);
  }, [test]);

  return (
    <Card className="border shadow-sm transition-all hover:shadow-md print:shadow-none">
      <CardHeader className="space-y-2 pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 w-9 flex-shrink-0 bg-accent/10 hover:bg-accent/20 border-accent/40 text-accent hover:text-accent hover:border-accent/70 transition-all duration-200 hover:shadow-md group"
              onClick={onToggleExpanded}
              title={test.isExpanded ? "Click to collapse" : "Click to expand"}
            >
              {test.isExpanded ? <ChevronDown className="h-4 w-4 transition-transform group-hover:scale-110" /> : <ChevronRight className="h-4 w-4 transition-transform group-hover:scale-110" />}
            </Button>

            {isEditingTitle ? (
              <div className="flex flex-1 items-center gap-1">
                <Input
                  value={draftTitle}
                  onChange={(event) => setDraftTitle(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") saveTitle();
                  }}
                  autoFocus
                  className="h-8"
                />
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={saveTitle}>
                  <Check className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <button
                type="button"
                className="group flex min-w-0 flex-1 items-center gap-2 text-left"
                onClick={() => setIsEditingTitle(true)}
              >
                <span className="truncate text-sm font-semibold">{test.title}</span>
                <Edit2 className="h-3.5 w-3.5 flex-shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            )}
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 flex-shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={onDelete}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Test Type</span>
            <Select value={test.type} onValueChange={(value) => requestTypeChange(value as AtterbergTestType)}>
              <SelectTrigger className="h-8 w-[190px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="liquidLimit">Liquid Limit</SelectItem>
                <SelectItem value="plasticLimit">Plastic Limit</SelectItem>
                <SelectItem value="shrinkageLimit">Linear Shrinkage</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="text-xs text-muted-foreground">
            {validTrials} valid trial{validTrials === 1 ? "" : "s"}
          </div>
        </div>
      </CardHeader>

      {test.isExpanded && (
        <CardContent className="space-y-3 pt-2">
          {test.type === "liquidLimit" && (
            <LiquidLimitSection
              trials={test.trials}
              result={computedResult.liquidLimit ?? null}
              onChangeTrials={onUpdateLiquidLimitTrials}
              recordId={recordId}
              plasticLimit={recordPlasticLimit ?? null}
              passing425um={recordPassing425um}
            />
          )}

          {test.type === "plasticLimit" && (
            <PlasticLimitSection
              trials={test.trials}
              result={computedResult.plasticLimit ?? null}
              onChangeTrials={onUpdatePlasticLimitTrials}
              liquidLimitMoisture={liquidLimitMoisture}
            />
          )}

          {test.type === "shrinkageLimit" && (
            <ShrinkageLimitSection
              trials={test.trials}
              result={computedResult.linearShrinkage ?? computedResult.shrinkageLimit ?? null}
              onChangeTrials={onUpdateShrinkageLimitTrials}
            />
          )}

          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 rounded-lg border border-dashed p-3 sm:grid-cols-2">
              <div>
                <div className="text-xs font-medium text-muted-foreground">Computed Result</div>
                <div className="mt-1 text-lg font-bold">{activeResult !== null ? `${activeResult}%` : "-"}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-muted-foreground">Summary</div>
                <div className="mt-1 text-sm text-foreground">
                  {activeResult !== null
                    ? isComplete
                      ? `${testTypeLabels[test.type]} complete from ${validTrials} valid trial${validTrials === 1 ? "" : "s"}.`
                      : `${testTypeLabels[test.type]} incomplete (${validTrials} valid trial${validTrials === 1 ? "" : "s"}). Additional data needed.`
                    : "Enter complete numeric rows to calculate this test."}
                </div>
              </div>
            </div>

            {validationMessages.errors.length > 0 && (
              <div className="flex gap-2 rounded-lg border border-red-200/50 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900/30 dark:bg-red-950/20 dark:text-red-200">
                <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  {validationMessages.errors.map((err, i) => (
                    <div key={i}>{err}</div>
                  ))}
                </div>
              </div>
            )}
            {validationMessages.warnings.length > 0 && validationMessages.errors.length === 0 && (
              <div className="flex gap-2 rounded-lg border border-amber-200/50 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/30 dark:bg-amber-950/20 dark:text-amber-200">
                <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  {validationMessages.warnings.map((warn, i) => (
                    <div key={i}>{warn}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      )}

      <AlertDialog open={pendingType !== null} onOpenChange={(open) => !open && setPendingType(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change test type?</AlertDialogTitle>
            <AlertDialogDescription>
              This test already has entered data. Changing the type will reset the current rows and result.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingType(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmTypeChange}>Change type</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};

export default AtterbergTestCard;
