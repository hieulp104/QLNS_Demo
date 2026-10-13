import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function FormField({
  label,
  htmlFor,
  required,
  error,
  hint,
  children,
  className,
}: {
  label: ReactNode;
  htmlFor?: string;
  required?: boolean;
  error?: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <label
        htmlFor={htmlFor}
        className="block text-sm font-medium leading-none text-note"
      >
        {label}
        {required && <span className="ml-1 text-danger">*</span>}
      </label>
      {children}
      {error && <p className="text-xs leading-relaxed text-danger">{error}</p>}
      {hint && !error && (
        <p className="text-xs leading-relaxed text-muted">{hint}</p>
      )}
    </div>
  );
}

export function ChoiceLabel({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-2.5 rounded-control px-2.5 py-2 text-sm text-foreground transition-colors hover:bg-surface-subtle",
        className,
      )}
      {...props}
    />
  );
}
