import type { ButtonHTMLAttributes } from "react";
import Link, { type LinkProps } from "next/link";

import { cn } from "@/lib/utils";

const tabClass =
  "rounded-t-control border-b-2 px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/35 focus-visible:ring-inset";

function tabState(active: boolean) {
  return active
    ? "border-brand-600 bg-brand-50/70 text-brand-800"
    : "border-transparent text-muted hover:bg-surface-subtle hover:text-foreground";
}

export function Tabs({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("overflow-x-auto border-b border-line", className)}
      {...props}
    />
  );
}

export function TabsList({
  className,
  ...props
}: React.HTMLAttributes<HTMLElement>) {
  return <nav className={cn("flex min-w-max gap-1", className)} {...props} />;
}

export function TabLink({
  active,
  className,
  ...props
}: LinkProps &
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps> & {
    active: boolean;
  }) {
  return <Link className={cn(tabClass, tabState(active), className)} {...props} />;
}

export function TabButton({
  active,
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active: boolean }) {
  return (
    <button
      type={type}
      className={cn(tabClass, tabState(active), className)}
      {...props}
    />
  );
}
