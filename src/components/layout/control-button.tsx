import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export function ControlButton({
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-[10px] border border-line bg-transparent p-0 text-foreground transition-[background-color,border-color,color,opacity] duration-150 hover:border-line-strong hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 disabled:cursor-not-allowed disabled:text-disabled",
        className,
      )}
      {...props}
    />
  );
}
