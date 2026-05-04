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
}

const WizardStepper = ({ steps, currentIndex, onStepClick }: WizardStepperProps) => {
  return (
    <ol className="flex items-center w-full overflow-x-auto py-2">
      {steps.map((step, idx) => {
        const isComplete = idx < currentIndex;
        const isActive = idx === currentIndex;
        const clickable = onStepClick && idx <= currentIndex;
        return (
          <li key={step.id} className="flex items-center flex-1 min-w-fit">
            <button
              type="button"
              disabled={!clickable}
              onClick={() => clickable && onStepClick?.(idx)}
              className={cn(
                "flex items-center gap-2 group",
                clickable ? "cursor-pointer" : "cursor-default",
              )}
            >
              <span
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold flex-shrink-0 transition-colors",
                  isComplete && "bg-primary border-primary text-primary-foreground",
                  isActive && "bg-primary/10 border-primary text-primary",
                  !isComplete && !isActive && "bg-card border-border text-muted-foreground",
                )}
              >
                {isComplete ? <Check className="h-4 w-4" /> : idx + 1}
              </span>
              <span
                className={cn(
                  "text-sm font-medium whitespace-nowrap hidden sm:inline",
                  isActive ? "text-foreground" : isComplete ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {step.label}
              </span>
            </button>
            {idx < steps.length - 1 && (
              <div
                className={cn(
                  "flex-1 h-px mx-3 min-w-[24px] transition-colors",
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
