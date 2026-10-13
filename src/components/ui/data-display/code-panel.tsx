import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const codePanelVariants = cva(
  "overflow-x-auto rounded-control border p-3 font-mono text-xs leading-relaxed text-foreground",
  {
    variants: {
      tone: {
        neutral: "border-line bg-surface-subtle",
        highlight: "border-line-strong bg-surface-subtle",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export function CodePanel({
  className,
  tone,
  ...props
}: React.HTMLAttributes<HTMLPreElement> &
  VariantProps<typeof codePanelVariants>) {
  return <pre className={cn(codePanelVariants({ tone }), className)} {...props} />;
}

export function InlineCode({
  className,
  ...props
}: React.HTMLAttributes<HTMLElement>) {
  return (
    <code
      className={cn(
        "inline-flex rounded-control border border-line-strong bg-surface-raised px-3.5 py-2 font-mono text-base tracking-wider text-foreground shadow-sm",
        className,
      )}
      {...props}
    />
  );
}

export function DisclosureSummary({
  className,
  ...props
}: React.HTMLAttributes<HTMLElement>) {
  return (
    <summary
      className={cn(
        "cursor-pointer text-xs font-medium text-foreground underline-offset-2 transition-colors duration-150 visited:text-foreground hover:text-link hover:underline",
        className,
      )}
      {...props}
    />
  );
}
