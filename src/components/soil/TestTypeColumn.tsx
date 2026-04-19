import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  recordPassing425um: number | null;
  liquidLimitMoisture?: number | null;
  onDelete: (testId: string) => void;
  onUpdateTitle: (testId: string, title: string) => void;
  onUpdateType: (testId: string, type: AtterbergTestType) => void;
  onToggleExpanded: (testId: string) => void;
  onUpdateLiquidLimitTrials: (testId: string, trials: any[]) => void;
  onUpdatePlasticLimitTrials: (testId: string, trials: any[]) => void;
  onUpdateShrinkageLimitTrials: (testId: string, trials: any[]) => void;
  onSyncResult: (testId: string) => void;
  allTests: AtterbergTest[]; // All tests for calculating liquid limit moisture
}

const getTestTypeLabel = (type: AtterbergTestType): string => {
  switch (type) {
    case "liquidLimit":
      return "Liquid Limit";
    case "plasticLimit":
      return "Plastic Limit";
    case "shrinkageLimit":
      return "Shrinkage Limit";
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
        <h3 className="text-sm font-semibold">{getTestTypeLabel(testType)}</h3>
        <div className="rounded-lg border border-dashed border-muted-foreground/30 bg-muted/10 p-4 text-center">
          <p className="text-xs text-muted-foreground">No {getTestTypeLabel(testType).toLowerCase()} tests added</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">{getTestTypeLabel(testType)}</h3>
      
      {tests.length > 1 && (
        <Select value={selectedTestId || ""} onValueChange={onSelectTest}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Select test" />
          </SelectTrigger>
          <SelectContent>
            {tests.map((test) => (
              <SelectItem key={test.id} value={test.id}>
                {test.title || `${getTestTypeLabel(testType)} ${tests.indexOf(test) + 1}`}
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
          onSyncResult={() => onSyncResult(selectedTest.id)}
        />
      )}
    </div>
  );
}
