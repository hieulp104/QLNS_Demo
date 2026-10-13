import type { SelectHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  invalid?: boolean;
};

export function Select({ className, invalid, ...props }: SelectProps) {
  return (
    <select
      aria-invalid={invalid || undefined}
      className={cn(
        "min-h-10 min-w-40 w-full flex-1 rounded-control border border-line bg-surface px-3.5 py-2.5 text-base font-medium text-foreground shadow-sm outline-none transition-[background-color,border-color,box-shadow] hover:border-line-strong focus:border-primary focus:bg-surface focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:border-line disabled:bg-surface-subtle disabled:text-disabled disabled:shadow-none",
        invalid &&
          "border-danger/30 hover:border-danger/50 focus:border-danger focus:ring-danger/20",
        className,
      )}
      {...props}
    />
  );
}
