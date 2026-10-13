import type { InputHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export function Checkbox({
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  return (
    <input
      type="checkbox"
      className={cn(
        "size-4 rounded border-line bg-surface text-primary accent-primary transition hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:text-disabled disabled:opacity-55",
        className,
      )}
      {...props}
    />
  );
}
