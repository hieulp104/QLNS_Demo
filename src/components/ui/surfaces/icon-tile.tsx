import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const iconTileVariants = cva(
  "inline-flex shrink-0 items-center justify-center border font-medium shadow-sm",
  {
    variants: {
      tone: {
        primary: "border-primary/20 bg-primary/10 text-primary",
        success: "border-success/20 bg-surface-success text-success",
        warning: "border-warning/20 bg-surface-warning text-warning",
        danger: "border-danger/20 bg-surface-danger text-danger",
        info: "border-info/20 bg-surface-info text-info",
        neutral: "border-line bg-surface-subtle text-muted",
        inverse: "border-on-primary/20 bg-on-primary/10 text-on-primary",
      },
      shape: {
        rounded: "rounded-control",
        circle: "rounded-full",
      },
      size: {
        xs: "size-6 text-xs",
        sm: "size-8 text-xs",
        md: "size-9 text-sm",
        lg: "size-10",
        xl: "size-11",
      },
    },
    defaultVariants: { tone: "neutral", shape: "rounded", size: "md" },
  },
);

export type IconTileProps = React.HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof iconTileVariants>;

export function IconTile({
  className,
  tone,
  shape,
  size,
  ...props
}: IconTileProps) {
  return (
    <span
      className={cn(iconTileVariants({ tone, shape, size }), className)}
      {...props}
    />
  );
}
