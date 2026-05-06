import React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface Step {
  id: string;
  label: string;
  order: number;
}

interface WizardStepIndicatorProps {
  steps: Step[];
  currentStep: string;
  completedSteps: string[];
}

const WizardStepIndicator: React.FC<WizardStepIndicatorProps> = ({ steps, currentStep, completedSteps }) => {
  return (
    <div className="flex items-center justify-center w-full gap-1 sm:gap-2 flex-wrap">
      {steps.map((step, index) => {
        const isCompleted = completedSteps.includes(step.id);
        const isCurrent = currentStep === step.id;
        const isNext = steps[steps.findIndex((s) => s.id === currentStep) + 1]?.id === step.id;

        return (
          <React.Fragment key={step.id}>
            {/* Step Node */}
            <div className="flex flex-col items-center gap-2">
              <div
                className={cn(
                  "w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center font-semibold text-sm transition-all",
                  isCompleted && "bg-primary text-white",
                  isCurrent && "bg-primary/10 border-2 border-primary text-primary",
                  !isCompleted && !isCurrent && "bg-secondary text-muted-foreground",
                )}
              >
                {isCompleted ? <Check className="h-4 w-4 sm:h-5 sm:w-5" /> : step.order}
              </div>
              <span className={cn("text-xs sm:text-sm font-medium hidden sm:block text-center", isCurrent && "text-foreground", !isCurrent && "text-muted-foreground")}>
                {step.label}
              </span>
            </div>

            {/* Connector Line */}
            {index < steps.length - 1 && (
              <div
                className={cn(
                  "h-1 flex-1 max-w-24 rounded-full transition-all",
                  isCompleted ? "bg-primary" : "bg-secondary",
                )}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

export default WizardStepIndicator;
