import React, { useMemo } from "react";
import { useWizard } from "@/context/WizardContext";
import { Button } from "@/components/ui/button";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface TestTypeSelectionProps {
  onNext: () => void;
  onPrev: () => void;
}

const testTypesByMaterial: Record<string, { id: string; name: string; description: string }[]> = {
  soil: [
    { id: "atterbergLimits", name: "Atterberg Limits", description: "Liquid & plastic limit testing (BS 1377)" },
    { id: "compaction", name: "Compaction", description: "Standard proctor compaction test" },
    { id: "cbr", name: "CBR", description: "California bearing ratio" },
  ],
  rock: [
    { id: "compressiveStrength", name: "Compressive Strength", description: "Rock uniaxial compressive strength" },
    { id: "pointLoad", name: "Point Load Index", description: "PLI testing for rock classification" },
  ],
  concrete: [
    { id: "slump", name: "Slump Test", description: "Concrete slump measurement" },
    { id: "compressiveStrength", name: "Compressive Strength", description: "Concrete cube/cylinder strength" },
  ],
};

const TestTypeSelection: React.FC<TestTypeSelectionProps> = ({ onNext, onPrev }) => {
  const { state, setTestType } = useWizard();

  const availableTests = useMemo(() => {
    return state.material ? testTypesByMaterial[state.material] || [] : [];
  }, [state.material]);

  const handleSelect = (testType: string) => {
    setTestType(testType);
  };

  const handleNext = () => {
    if (state.testType) {
      onNext();
    }
  };

  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-foreground">Select a test type</h2>
        <p className="text-muted-foreground">Choose the test to run for {state.material || "material"}</p>
      </div>

      <div className="space-y-3">
        {availableTests.map((test) => (
          <button
            key={test.id}
            onClick={() => handleSelect(test.id)}
            className={cn(
              "w-full p-4 rounded-lg border-2 transition-all text-left",
              state.testType === test.id
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/50 bg-card",
            )}
          >
            <h3 className="font-semibold text-foreground">{test.name}</h3>
            <p className="text-sm text-muted-foreground mt-1">{test.description}</p>
          </button>
        ))}
      </div>

      <div className="flex justify-between pt-8">
        <Button type="button" variant="outline" onClick={onPrev}>
          Back
        </Button>
        <Button
          onClick={handleNext}
          disabled={!state.testType}
          className="gap-2"
        >
          Continue
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

export default TestTypeSelection;
