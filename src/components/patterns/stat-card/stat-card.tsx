import type { ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { Card } from "@/components/ui/surfaces";
import { cn } from "@/lib/utils";

const iconVariants = cva(
  "flex size-11 shrink-0 items-center justify-center rounded-control border shadow-sm",
  {
    variants: {
      tone: {
        primary: "border-primary/20 bg-primary/10 text-primary",
        danger: "border-danger/20 bg-surface-danger text-danger",
        income: "border-money-income/20 bg-surface-income text-money-income",
        incomeMuted: "border-money-income-muted/20 bg-surface-pending text-money-income-muted",
        pending: "border-money-pending/20 bg-surface-pending text-money-pending",
        expense: "border-money-expense/20 bg-surface-expense text-money-expense",
        warning: "border-warning/20 bg-surface-warning text-warning",
        info: "border-info/20 bg-surface-info text-info",
        neutral: "border-line bg-surface-subtle text-muted",
      },
    },
    defaultVariants: { tone: "primary" },
  },
);

export function StatCard({
  label,
  value,
  icon,
  detail,
  tone,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  icon?: ReactNode;
  detail?: ReactNode;
  tone?: VariantProps<typeof iconVariants>["tone"];
  className?: string;
}) {
  return (
    <Card className={cn("p-5", className)}>
      <div className="flex min-w-0 items-center gap-3">
        {icon && <span className={iconVariants({ tone })}>{icon}</span>}
        <p className="min-w-0 truncate text-xs font-medium tracking-wide text-muted">
          {label}
        </p>
      </div>
      <div className="min-w-0">
        <p
          className={cn(
            "mt-3 whitespace-nowrap text-display font-bold tracking-tight tabular-nums",
            tone === "danger" && "text-danger",
            tone === "income" && "text-money-income",
            tone === "incomeMuted" && "text-money-income-muted",
            tone === "pending" && "text-money-pending",
            tone === "expense" && "text-money-expense",
            tone === "primary" && "text-primary",
            tone !== "danger" &&
              tone !== "income" &&
              tone !== "incomeMuted" &&
              tone !== "pending" &&
              tone !== "expense" &&
              tone !== "primary" &&
              "text-foreground",
          )}
        >
          {value}
        </p>
        {detail && <div className="mt-1.5 text-xs text-muted">{detail}</div>}
      </div>
    </Card>
  );
}
