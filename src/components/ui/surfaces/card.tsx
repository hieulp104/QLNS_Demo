import { cva, type VariantProps } from "class-variance-authority";
import Link, { type LinkProps } from "next/link";
import { forwardRef } from "react";

import { cn } from "@/lib/utils";

const cardVariants = cva("min-w-0 rounded-card", {
  variants: {
    variant: {
      default: "border border-line bg-surface shadow-card",
      outline: "border border-line bg-transparent",
      filled: "border border-transparent bg-surface-subtle",
      highlight: "border border-primary/20 bg-primary/10 shadow-card",
      list: "divide-y divide-line border border-line bg-surface shadow-card",
      danger: "border border-danger/20 bg-surface-danger shadow-card",
      interactive:
        "border border-line bg-surface shadow-card transition-[background-color,border-color,box-shadow,transform] duration-150 hover:-translate-y-px hover:border-line-strong hover:bg-surface-raised hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
      dangerInteractive:
        "border border-danger/15 bg-surface-danger shadow-sm transition hover:border-danger/30 hover:shadow-card",
      warningInteractive:
        "border border-warning/20 bg-surface-warning shadow-sm transition hover:border-warning/35 hover:shadow-card",
    },
  },
  defaultVariants: { variant: "default" },
});

export type CardProps = React.HTMLAttributes<HTMLElement> &
  VariantProps<typeof cardVariants> & {
    as?: "div" | "section" | "article" | "ul" | "figure";
  };

export function Card({
  as: Component = "div",
  className,
  variant,
  ...props
}: CardProps) {
  return (
    <Component className={cn(cardVariants({ variant }), className)} {...props} />
  );
}

export type FormCardProps = React.FormHTMLAttributes<HTMLFormElement> &
  VariantProps<typeof cardVariants>;

export const FormCard = forwardRef<HTMLFormElement, FormCardProps>(
  function FormCard({ className, variant, ...props }, ref) {
    return (
      <form
        ref={ref}
        className={cn(cardVariants({ variant }), className)}
        {...props}
      />
    );
  },
);

export type CardLinkProps = LinkProps &
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps> &
  VariantProps<typeof cardVariants>;

export function CardLink({
  className,
  variant = "interactive",
  ...props
}: CardLinkProps) {
  return (
    <Link
      className={cn(cardVariants({ variant }), className)}
      {...props}
    />
  );
}

export function CardHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("border-b border-line px-5 py-4 sm:px-6", className)}
      {...props}
    />
  );
}

export function CardContent({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5 sm:p-6", className)} {...props} />;
}

export function CardFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("border-t border-line px-5 py-4 sm:px-6", className)}
      {...props}
    />
  );
}
