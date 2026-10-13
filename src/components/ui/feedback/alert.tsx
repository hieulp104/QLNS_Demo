import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const alertVariants = cva(
  "rounded-control border px-3.5 py-3 text-sm leading-relaxed shadow-sm",
  {
  variants: {
    variant: {
      success: "border-success/20 bg-surface-success text-foreground",
      warning: "border-warning/20 bg-surface-warning text-foreground",
      danger: "border-danger/20 bg-surface-danger text-foreground",
      info: "border-info/20 bg-surface-info text-foreground",
      neutral: "border-line bg-surface-subtle text-muted",
    },
  },
  defaultVariants: { variant: "neutral" },
  },
);

export type AlertProps = React.HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof alertVariants>;

export function Alert({ className, variant, ...props }: AlertProps) {
  return (
    <div
      role={variant === "danger" ? "alert" : undefined}
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  );
}
