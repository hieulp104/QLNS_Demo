"use client";

import { useTheme } from "@/components/theme";
import { cn } from "@/lib/utils";

export function BrandPanel({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLElement>) {
  const { theme } = useTheme();
  const illustration = theme.assets.illustration;

  return (
    <section
      className={cn("auth-brand-panel text-on-primary", className)}
      data-has-illustration={illustration ? "true" : "false"}
      {...props}
    >
      {illustration && (
        <span
          aria-hidden="true"
          className="auth-brand-illustration"
          style={{ backgroundImage: `url("${illustration}")` }}
        />
      )}
      {children}
    </section>
  );
}
