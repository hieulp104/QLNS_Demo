import { cn } from "@/lib/utils";

export function TableContainer({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  variant?: "default" | "bare";
}) {
  return (
    <div
      className={cn(
        "overflow-x-auto",
        variant === "default" &&
          "rounded-card border border-line bg-surface shadow-card",
        className,
      )}
      {...props}
    />
  );
}

export function Table({
  className,
  ...props
}: React.TableHTMLAttributes<HTMLTableElement>) {
  return <table className={cn("w-full text-sm leading-relaxed", className)} {...props} />;
}

export function TableHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn(
        "border-b border-line bg-surface-subtle/80 text-left text-muted",
        className,
      )}
      {...props}
    />
  );
}

export function TableBody({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("divide-y divide-line", className)} {...props} />;
}

export function TableRow({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLTableRowElement> & {
  variant?: "default" | "summary";
}) {
  return (
    <tr
      className={cn(
        "transition-colors hover:bg-surface-subtle/60",
        variant === "summary" && "bg-surface-subtle/80",
        className,
      )}
      {...props}
    />
  );
}

export function TableHead({
  className,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn("px-4 py-3 text-xs font-semibold tracking-wide", className)}
      {...props}
    />
  );
}

export function TableCell({
  className,
  tone = "default",
  emphasis,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement> & {
    tone?: "default" | "secondary" | "muted" | "note" | "success" | "danger" | "income" | "incomeMuted" | "pending" | "expense";
  emphasis?: boolean;
}) {
  return (
    <td
      className={cn(
        "px-4 py-3.5",
        tone === "default" && "text-foreground",
        tone === "secondary" && "text-text-secondary",
        tone === "muted" && "text-note",
        tone === "note" && "text-note",
        tone === "success" && "text-success",
        tone === "danger" && "text-danger",
        tone === "income" && "text-money-income",
        tone === "incomeMuted" && "text-money-income-muted",
        tone === "pending" && "text-money-pending",
        tone === "expense" && "text-money-expense",
        emphasis && "font-semibold",
        className,
      )}
      {...props}
    />
  );
}
