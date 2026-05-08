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
        "rounded-2xl bg-card border border-border p-6 sm:p-8 shadow-sm",
        className,
      )}
    >
      {(title || description) && (
        <div className="mb-6 space-y-2">
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
