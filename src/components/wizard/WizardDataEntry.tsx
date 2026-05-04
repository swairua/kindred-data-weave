import React from "react";
import { useWizard } from "@/context/WizardContext";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";

interface WizardDataEntryProps {
  onComplete?: () => void;
  onPrev: () => void;
}

const WizardDataEntry: React.FC<WizardDataEntryProps> = ({ onComplete, onPrev }) => {
  const { state } = useWizard();

  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-foreground">
          Enter test data
        </h2>
        <p className="text-muted-foreground">
          Record Atterberg Limits testing data for {state.sampleId}
        </p>
        {state.projectName && (
          <p className="text-sm text-muted-foreground">
            Project: <span className="font-medium text-foreground">{state.projectName}</span>
          </p>
        )}
      </div>

      <div className="bg-secondary rounded-lg p-6 border-2 border-dashed border-border">
        <p className="text-center text-muted-foreground">
          Atterberg form will be rendered here
        </p>
        <p className="text-center text-xs text-muted-foreground mt-2">
          This is where AtterbergRecordView component would be integrated
        </p>
      </div>

      <div className="flex justify-between pt-8">
        <Button
          type="button"
          variant="outline"
          onClick={onPrev}
          className="gap-2"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </Button>
        <Button
          onClick={onComplete}
          className="gap-2"
        >
          Complete
        </Button>
      </div>
    </div>
  );
};

export default WizardDataEntry;
