import Link, { type LinkProps } from "next/link";

import { cn } from "@/lib/utils";

export function ProgressLink({
  value,
  className,
  ...props
}: LinkProps &
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps> & {
    value: number;
  }) {
  const normalized = Math.max(0, Math.min(100, value));
  return (
    <span
      className={cn(
        "relative h-4 flex-1 overflow-hidden rounded-r border border-line bg-surface-subtle",
        className,
      )}
    >
      {normalized > 0 && (
        <Link
          className="absolute inset-y-0 left-0 rounded-r bg-primary transition-colors hover:bg-primary-hover"
          style={{ width: `${normalized}%` }}
          {...props}
        />
      )}
    </span>
  );
}
