import React, { useMemo } from "react";
import { useWizard } from "@/context/WizardContext";
import MaterialSelection from "./MaterialSelection";
import TestTypeSelection from "./TestTypeSelection";
import ProjectSelection from "./ProjectSelection";
import SampleSetup from "./SampleSetup";
import WizardDataEntry from "./WizardDataEntry";
import WizardStepIndicator from "./WizardStepIndicator";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";

interface WizardContainerProps {
  onComplete?: () => void;
  onCancel?: () => void;
}

const WizardContainer: React.FC<WizardContainerProps> = ({ onComplete, onCancel }) => {
  const { state, goToStep } = useWizard();

  const steps = useMemo(
    () => [
      { id: "material", label: "Material", order: 1 },
      { id: "testType", label: "Test type", order: 2 },
      { id: "project", label: "Project", order: 3 },
      { id: "sample", label: "Sample setup", order: 4 },
      { id: "dataEntry", label: "Data entry", order: 5 },
    ],
    [],
  );

  const currentStepIndex = steps.findIndex((s) => s.id === state.currentStep);
  const currentStepOrder = steps[currentStepIndex]?.order || 1;

  const handleNext = () => {
    if (currentStepIndex < steps.length - 1) {
      goToStep(steps[currentStepIndex + 1].id as any);
    }
  };

  const handlePrev = () => {
    if (currentStepIndex > 0) {
      goToStep(steps[currentStepIndex - 1].id as any);
    }
  };

  const renderStep = () => {
    switch (state.currentStep) {
      case "material":
        return <MaterialSelection onNext={handleNext} />;
      case "testType":
        return <TestTypeSelection onNext={handleNext} onPrev={handlePrev} />;
      case "project":
        return <ProjectSelection onNext={handleNext} onPrev={handlePrev} />;
      case "sample":
        return <SampleSetup onNext={handleNext} onPrev={handlePrev} />;
      case "dataEntry":
        return <WizardDataEntry onComplete={onComplete} onPrev={handlePrev} />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-6 sm:py-12">
          {/* Step Indicator */}
          <WizardStepIndicator
            steps={steps}
            currentStep={state.currentStep}
            completedSteps={steps.filter((s) => s.order < currentStepOrder).map((s) => s.id)}
          />

          {/* Step Content */}
          <div className="mt-10">{renderStep()}</div>
        </div>
      </div>

      {/* Back/Cancel Button */}
      {currentStepIndex > 0 && (
        <div className="sticky bottom-0 px-4 py-4 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="max-w-2xl mx-auto">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handlePrev}
              className="gap-2"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </Button>
          </div>
        </div>
      )}

      {/* Cancel Button (top right) */}
      {onCancel && (
        <div className="absolute top-4 right-4">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
          >
            ✕
          </Button>
        </div>
      )}
    </div>
  );
};

export default WizardContainer;
