import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import AtterbergTestCard from "./AtterbergTestCard";
import { type AtterbergTest, type AtterbergTestType, type LiquidLimitTest } from "@/context/TestDataContext";
import { calculateLiquidLimit } from "@/lib/atterbergCalculations";

interface TestTypeColumnProps {
  testType: AtterbergTestType;
  tests: AtterbergTest[];
  selectedTestId: string | null;
  onSelectTest: (testId: string) => void;
  recordId: string;
  recordPlasticLimit: number | null;
  recordPassing425um?: string;
  liquidLimitMoisture?: number | null;
  onAddTest: () => void;
  onDelete: (testId: string) => void;
  onUpdateTitle: (testId: string, title: string) => void;
  onUpdateType: (testId: string, type: AtterbergTestType) => void;
  onToggleExpanded: (testId: string) => void;
  onUpdateLiquidLimitTrials: (testId: string, trials: any[]) => void;
  onUpdatePlasticLimitTrials: (testId: string, trials: any[]) => void;
  onUpdateShrinkageLimitTrials: (testId: string, trials: any[]) => void;
  onSyncResult: (test: AtterbergTest) => void;
  allTests: AtterbergTest[];
}

const getTestTypeLabel = (type: AtterbergTestType): string => {
  switch (type) {
    case "liquidLimit":
      return "Liquid Limit";
    case "plasticLimit":
      return "Plastic Limit";
    case "shrinkageLimit":
      return "Linear Shrinkage";
    default:
      return "Test";
  }
};

export default function TestTypeColumn({
  testType,
  tests,
  selectedTestId,
  onSelectTest,
  recordId,
  recordPlasticLimit,
  recordPassing425um,
  onAddTest,
  onDelete,
  onUpdateTitle,
  onUpdateType,
  onToggleExpanded,
  onUpdateLiquidLimitTrials,
  onUpdatePlasticLimitTrials,
  onUpdateShrinkageLimitTrials,
  onSyncResult,
  allTests,
}: TestTypeColumnProps) {
  const selectedTest = tests.find((t) => t.id === selectedTestId);
  const label = getTestTypeLabel(testType);

  // Calculate liquid limit moisture for plastic limit tests
  let liquidLimitMoisture: number | null = null;
  if (testType === "plasticLimit") {
    const llTest = allTests.find((t) => t.type === "liquidLimit") as LiquidLimitTest | undefined;
    if (llTest) {
      liquidLimitMoisture = calculateLiquidLimit(llTest.trials);
    }
  }

  if (tests.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">{label}</h3>
        <button
          type="button"
          onClick={onAddTest}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-muted-foreground/40 bg-muted/10 p-6 text-sm text-muted-foreground transition-colors hover:border-primary hover:bg-muted/30 hover:text-foreground"
        >
          <Plus className="h-4 w-4" />
          Add {label} Test
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">{label}</h3>
      
      {tests.length > 1 && (
        <Select value={selectedTestId || ""} onValueChange={onSelectTest}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Select test" />
          </SelectTrigger>
          <SelectContent>
            {tests.map((test) => (
              <SelectItem key={test.id} value={test.id}>
                {test.title || `${label} ${tests.indexOf(test) + 1}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {selectedTest && (
        <AtterbergTestCard
          test={selectedTest}
          recordId={recordId}
          liquidLimitMoisture={liquidLimitMoisture}
          recordPlasticLimit={recordPlasticLimit}
          recordPassing425um={recordPassing425um}
          onDelete={() => onDelete(selectedTest.id)}
          onUpdateTitle={(title) => onUpdateTitle(selectedTest.id, title)}
          onUpdateType={(type) => onUpdateType(selectedTest.id, type)}
          onToggleExpanded={() => onToggleExpanded(selectedTest.id)}
          onUpdateLiquidLimitTrials={(trials) => onUpdateLiquidLimitTrials(selectedTest.id, trials)}
          onUpdatePlasticLimitTrials={(trials) => onUpdatePlasticLimitTrials(selectedTest.id, trials)}
          onUpdateShrinkageLimitTrials={(trials) => onUpdateShrinkageLimitTrials(selectedTest.id, trials)}
          onSyncResult={() => onSyncResult(selectedTest)}
        />
      )}

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onAddTest}
        className="self-start text-xs text-muted-foreground hover:text-foreground"
      >
        <Plus className="mr-1 h-3 w-3" /> Add another
      </Button>
    </div>
  );
}
