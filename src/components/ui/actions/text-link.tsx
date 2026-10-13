import Link, { type LinkProps } from "next/link";

import { cn } from "@/lib/utils";

const textLinkClass =
  "rounded-sm font-medium text-foreground underline-offset-2 transition-colors duration-150 visited:text-foreground hover:text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 aria-disabled:pointer-events-none aria-disabled:text-disabled";

export type TextLinkProps = LinkProps &
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps>;

export function TextLink({ className, ...props }: TextLinkProps) {
  return <Link className={cn(className, textLinkClass)} {...props} />;
}

export function BackLink({ className, ...props }: TextLinkProps) {
  return (
    <Link
      className={cn(
        className,
        "mb-4 inline-flex items-center gap-1.5 text-sm",
        textLinkClass,
      )}
      {...props}
    />
  );
}

export function PlainLink({ className, ...props }: TextLinkProps) {
  return <Link className={cn(className, textLinkClass)} {...props} />;
}

export function TextAnchor({
  className,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a className={cn(className, textLinkClass)} {...props} />;
}
