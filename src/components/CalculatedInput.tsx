import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface CalculatedInputProps {
  value: string | number;
  label?: string;
  className?: string;
}

const CalculatedInput = ({ value, label, className }: CalculatedInputProps) => (
  <Input
    readOnly
    value={value}
    aria-label={label}
    className={cn("calculated-field cursor-default", className)}
    tabIndex={-1}
  />
);

export default CalculatedInput;
