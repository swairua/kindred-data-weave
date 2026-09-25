import React from "react";
import { cn } from "@/lib/utils";

interface FormCardProps {
  children: React.ReactNode;
  title?: string;
  description?: string;
  className?: string;
}

const FormCard: React.FC<FormCardProps> = ({
  children,
  title,
  description,
  className,
}) => {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card p-4 sm:p-5",
        className,
      )}
    >
      {(title || description) && (
        <div className="mb-4 space-y-1">
          {title && <h3 className="text-lg font-semibold text-foreground">{title}</h3>}
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
      )}
      {children}
    </div>
  );
};

export default FormCard;
