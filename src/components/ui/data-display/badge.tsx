import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium leading-none",
  {
    variants: {
      variant: {
        success: "border-success/20 bg-surface-success text-foreground",
        warning: "border-warning/20 bg-surface-warning text-foreground",
        danger: "border-danger/20 bg-surface-danger text-foreground",
        income: "border-money-income/20 bg-surface-income text-money-income",
        pending: "border-money-pending/20 bg-surface-pending text-money-pending",
        expense: "border-money-expense/20 bg-surface-expense text-money-expense",
        info: "border-info/20 bg-surface-info text-foreground",
      },
    },
    defaultVariants: { variant: "info" },
  },
);

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeVariants>;

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
