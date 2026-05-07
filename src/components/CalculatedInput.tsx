import { Input } from "@/components/ui/input";

interface CalculatedInputProps {
  value: string | number;
  label?: string;
}

const CalculatedInput = ({ value, label }: CalculatedInputProps) => (
  <Input
    readOnly
    value={value}
    aria-label={label}
    className="calculated-field cursor-default"
    tabIndex={-1}
  />
);

export default CalculatedInput;
