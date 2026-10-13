import type { ReactNode } from "react";

export function DescriptionRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex items-center gap-4 border-b border-line py-3 last:border-0 sm:gap-5">
      <dt className="w-32 shrink-0 text-sm font-medium text-note sm:w-40">
        {label}
      </dt>
      <dd className="min-w-0 flex-1 text-sm font-semibold leading-relaxed text-foreground">
        {value || "—"}
      </dd>
    </div>
  );
}
