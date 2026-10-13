import type { TextareaHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  invalid?: boolean;
};

export function Textarea({ className, invalid, ...props }: TextareaProps) {
  return (
    <textarea
      aria-invalid={invalid || undefined}
      className={cn(
        "min-h-24 w-full resize-y rounded-control border border-line bg-surface px-3.5 py-2.5 text-base font-medium leading-relaxed text-foreground shadow-sm outline-none transition-[background-color,border-color,box-shadow] placeholder:text-xs placeholder:font-normal placeholder:text-muted hover:border-line-strong focus:border-primary focus:bg-surface focus:ring-2 focus:ring-primary/20 read-only:bg-surface-subtle disabled:cursor-not-allowed disabled:border-line disabled:bg-surface-subtle disabled:text-disabled disabled:shadow-none",
        invalid &&
          "border-danger/30 hover:border-danger/50 focus:border-danger focus:ring-danger/20",
        className,
      )}
      {...props}
    />
  );
}
