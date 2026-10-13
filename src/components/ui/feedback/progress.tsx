import { cn } from "@/lib/utils";

export function Progress({
  value,
  className,
  ...props
}: Omit<React.HTMLAttributes<HTMLDivElement>, "children"> & {
  value: number;
}) {
  const normalized = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={normalized}
      className={cn(
        "h-2 overflow-hidden rounded-full border border-line bg-surface-subtle",
        className,
      )}
      {...props}
    >
      <div
        className="h-full rounded-full bg-primary transition-[width] duration-200"
        style={{ width: `${normalized}%` }}
      />
    </div>
  );
}
