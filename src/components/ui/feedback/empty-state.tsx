import type { ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const emptyStateVariants = cva(
  "flex min-h-44 flex-col items-center justify-center gap-3 px-6 py-12 text-center",
  {
    variants: {
      variant: {
        default:
          "rounded-card border border-dashed border-line bg-surface-subtle",
        plain: "bg-transparent",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export function EmptyStatePanel({
  children,
  className,
  variant,
  illustration = <EmptyStateIllustration />,
  ...props
}: React.HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof emptyStateVariants> & {
    illustration?: ReactNode;
  }) {
  return (
    <div
      data-slot="empty-state"
      className={cn(emptyStateVariants({ variant }), className)}
      {...props}
    >
      {illustration}
      {children}
    </div>
  );
}

function EmptyStateIllustration({ icon }: { icon?: ReactNode }) {
  return (
    <span
      aria-hidden="true"
      data-slot="empty-state-illustration"
      className="relative block h-[76px] w-32 text-muted"
    >
      <span className="absolute inset-x-1 bottom-2 h-px rounded-full bg-line-strong" />

      <span className="absolute bottom-[9px] left-8 h-11 w-14 -rotate-2 rounded-control border border-line-strong bg-surface-raised shadow-sm">
        <span className="absolute left-3 right-3 top-3 h-px bg-line-strong" />
        <span className="absolute left-3 right-5 top-5 h-px bg-line" />
        <span className="absolute left-3 right-4 top-7 h-px bg-line" />
      </span>

      <span className="absolute bottom-[9px] right-5 h-6 w-5 rounded-b-control border border-line bg-surface">
        <span className="absolute -left-1.5 -top-3 h-4 w-2 -rotate-45 rounded-full border border-line-strong bg-surface-subtle" />
        <span className="absolute right-0 -top-4 h-5 w-2 rotate-45 rounded-full border border-line-strong bg-surface-subtle" />
      </span>

      {icon && (
        <span className="absolute left-1 top-1 flex size-9 items-center justify-center rounded-full border border-line bg-surface-raised text-muted shadow-sm [&_svg]:size-[18px]">
          {icon}
        </span>
      )}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  variant,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
} & VariantProps<typeof emptyStateVariants>) {
  return (
    <EmptyStatePanel
      variant={variant}
      className={className}
      illustration={null}
    >
      <EmptyStateIllustration icon={icon} />
      <div>
        <p className="text-sm font-semibold text-text-secondary">{title}</p>
        {description && (
          <p className="mt-1 max-w-md text-sm leading-relaxed text-note">
            {description}
          </p>
        )}
      </div>
      {action}
    </EmptyStatePanel>
  );
}
