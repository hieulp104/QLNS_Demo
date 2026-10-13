import type { InputHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export function Switch({
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "role">) {
  return (
    <input
      type="checkbox"
      role="switch"
      className={cn(
        "relative h-5 w-9 shrink-0 cursor-pointer appearance-none rounded-full border border-line-strong bg-surface-subtle shadow-inner outline-none transition-colors before:absolute before:left-0.5 before:top-0.5 before:size-3.5 before:rounded-full before:bg-surface-raised before:shadow-sm before:transition-transform checked:border-primary checked:bg-primary checked:before:translate-x-4 hover:border-line-strong focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:text-disabled disabled:opacity-55",
        className,
      )}
      {...props}
    />
  );
}
