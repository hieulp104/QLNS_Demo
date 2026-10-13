import type { ButtonHTMLAttributes } from "react";
import Link, { type LinkProps } from "next/link";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-control border border-transparent font-medium shadow-none transition-[background-color,border-color,color,box-shadow,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:translate-y-px disabled:pointer-events-none disabled:translate-y-0 disabled:opacity-55 disabled:shadow-none",
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-on-primary shadow-sm hover:bg-primary-hover hover:shadow-md active:bg-primary-active",
        secondary:
          "border-button-secondary-border bg-button-secondary text-button-secondary-text shadow-sm hover:border-button-secondary-hover-border hover:bg-button-secondary-hover active:bg-button-secondary-active",
        outline:
          "border-line bg-surface-raised text-foreground shadow-sm hover:border-line-strong hover:bg-surface-subtle",
        danger:
          "bg-danger text-on-primary shadow-sm hover:bg-danger/90 hover:shadow-md",
        dangerOutline:
          "border-danger/30 bg-surface text-danger hover:bg-surface-danger",
        dangerGhost: "text-foreground hover:bg-surface-danger hover:text-danger",
        plain: "text-foreground hover:bg-surface-subtle",
        ghost: "text-foreground hover:bg-surface-subtle hover:text-link",
        subtle:
          "border-button-secondary-border bg-button-secondary text-button-secondary-text hover:border-button-secondary-hover-border hover:bg-button-secondary-hover active:bg-button-secondary-active",
        link: "text-link underline-offset-4 hover:text-link/80 hover:underline",
        overlay: "bg-overlay text-on-primary hover:bg-overlay/85",
      },
      size: {
        xs: "min-h-7 px-2.5 py-1 text-base",
        sm: "min-h-8 px-3 py-1.5 text-base",
        md: "min-h-10 px-4 py-2 text-base",
        lg: "min-h-11 px-5 py-2.5 text-base",
        xl: "min-h-12 px-6 py-3 text-base",
        icon: "size-9 p-0",
        "icon-sm": "size-8 p-0",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

export function Button({
  className,
  variant,
  size,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

type ButtonLinkProps = LinkProps &
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps> &
  VariantProps<typeof buttonVariants>;

export function ButtonLink({
  className,
  variant,
  size,
  ...props
}: ButtonLinkProps) {
  return (
    <Link
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export type ButtonAnchorProps = React.AnchorHTMLAttributes<HTMLAnchorElement> &
  VariantProps<typeof buttonVariants>;

export function ButtonAnchor({
  className,
  variant,
  size,
  ...props
}: ButtonAnchorProps) {
  return (
    <a
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
