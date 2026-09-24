import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface WizardStep {
  id: string;
  label: string;
}

interface WizardStepperProps {
  steps: WizardStep[];
  currentIndex: number;
  onStepClick?: (index: number) => void;
  disabledSteps?: number[];
}

const WizardStepper = ({ steps, currentIndex, onStepClick, disabledSteps = [] }: WizardStepperProps) => {
  return (
    <ol className="mx-auto flex w-fit max-w-full items-center justify-center overflow-x-auto py-1">
      {steps.map((step, idx) => {
        const isComplete = idx < currentIndex;
        const isActive = idx === currentIndex;
        const isDisabled = disabledSteps.includes(idx);
        const clickable = onStepClick && idx <= currentIndex && !isDisabled;
        return (
          <li key={step.id} className="flex min-w-fit items-center">
            <button
              type="button"
              aria-label={`Step ${idx + 1}: ${step.label}`}
              aria-current={isActive ? "step" : undefined}
              disabled={!clickable}
              onClick={() => clickable && onStepClick?.(idx)}
              className={cn(
                "group flex h-6 shrink-0 items-center justify-center rounded-full transition-colors",
                isActive && !isDisabled && "gap-1.5 bg-primary px-2 text-primary-foreground",
                isActive && isDisabled && "gap-1.5 bg-muted px-2 text-muted-foreground opacity-50",
                !isActive && "w-6",
                clickable ? "cursor-pointer" : "cursor-default",
              )}
            >
              <span
                className={cn(
                  "flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-semibold transition-colors",
                  isComplete && !isDisabled && "bg-primary-foreground/20 text-primary-foreground",
                  isActive && !isDisabled && "bg-primary-foreground/20 text-primary-foreground",
                  (!isComplete && !isActive && !isDisabled) && "bg-muted text-muted-foreground",
                  isDisabled && "bg-muted text-muted-foreground opacity-50",
                )}
              >
                {isComplete && !isDisabled ? <Check className="h-3 w-3" /> : idx + 1}
              </span>
              {isActive && (
                <span className="max-w-36 truncate text-[10px] font-medium leading-none">{step.label}</span>
              )}
            </button>
            {idx < steps.length - 1 && (
              <div
                className={cn(
                  "mx-1.5 h-px w-3 shrink-0 transition-colors sm:w-4",
                  isComplete ? "bg-primary" : "bg-border",
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
};

export default WizardStepper;
