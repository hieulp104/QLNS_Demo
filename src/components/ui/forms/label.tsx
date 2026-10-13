import { cn } from "@/lib/utils";

export function Label({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn(
        className,
        "block text-sm font-medium leading-none text-note",
      )}
      {...props}
    />
  );
}
