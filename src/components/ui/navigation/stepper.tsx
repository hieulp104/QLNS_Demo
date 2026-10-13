import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const markerVariants = cva(
  "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
  {
    variants: {
      status: {
        complete: "bg-primary text-on-primary",
        current: "bg-primary text-on-primary ring-4 ring-brand-100",
        upcoming: "bg-wood-100 text-muted",
      },
    },
    defaultVariants: { status: "upcoming" },
  },
);

export function StepMarker({
  className,
  status,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof markerVariants>) {
  return <span className={cn(markerVariants({ status }), className)} {...props} />;
}

export function StepConnector({
  className,
  complete,
  hidden,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  complete?: boolean;
  hidden?: boolean;
}) {
  return (
    <span
      className={cn(
        complete ? "bg-primary" : "bg-line",
        hidden && "opacity-0",
        className,
      )}
      {...props}
    />
  );
}

export function StepLabel({
  className,
  active,
  muted,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement> & {
  active?: boolean;
  muted?: boolean;
}) {
  return (
    <p
      className={cn(
        "text-xs leading-snug",
        active && "font-medium text-foreground",
        !active && !muted && "text-foreground",
        muted && "text-muted",
        className,
      )}
      {...props}
    />
  );
}
