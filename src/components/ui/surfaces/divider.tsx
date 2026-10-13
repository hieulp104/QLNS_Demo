import { cn } from "@/lib/utils";

export function DividerSection({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("border-t border-line", className)} {...props} />;
}

export function DividerList({
  className,
  ...props
}: React.HTMLAttributes<HTMLUListElement>) {
  return (
    <ul
      className={cn("divide-y divide-line border-t border-line", className)}
      {...props}
    />
  );
}

export function DividedList({
  className,
  ...props
}: React.HTMLAttributes<HTMLUListElement>) {
  return <ul className={cn("divide-y divide-line", className)} {...props} />;
}

export function DividedStack({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("divide-y divide-line", className)} {...props} />;
}
