import { forwardRef, type InputHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        "min-h-10 min-w-0 w-full rounded-control border border-line bg-surface px-3.5 py-2.5 text-base font-medium text-foreground shadow-sm outline-none transition-[background-color,border-color,box-shadow] placeholder:text-xs placeholder:font-normal placeholder:text-muted hover:border-line-strong focus:border-primary focus:bg-surface focus:ring-2 focus:ring-primary/20 read-only:bg-surface-subtle disabled:cursor-not-allowed disabled:border-line disabled:bg-surface-subtle disabled:text-disabled disabled:shadow-none",
        invalid &&
          "border-danger/30 hover:border-danger/50 focus:border-danger focus:ring-danger/20",
        props.type === "file" &&
          "py-1.5 text-muted file:mr-3 file:rounded-control file:border file:border-button-secondary-border file:bg-button-secondary file:px-3 file:py-1.5 file:text-base file:font-medium file:text-button-secondary-text hover:file:bg-button-secondary-hover",
        className,
      )}
      {...props}
    />
  );
});
