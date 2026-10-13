import { Hammer } from "lucide-react";

type Props = {
  /** Phase trong roadmap sẽ làm module này — xem CLAUDE.md */
  phase: string;
  /** Các việc chính sẽ có trong module */
  items: string[];
};

/**
 * Khung tạm cho các module chưa code. Sẽ bị xóa dần khi từng module hoàn thành.
 */
export function ModulePlaceholder({ phase, items }: Props) {
  return (
    <div className="rounded-xl border border-dashed border-line-strong bg-surface-subtle p-6 lg:p-10">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-lg bg-surface-raised text-muted">
          <Hammer className="size-5" />
        </span>
        <div>
          <p className="font-medium text-foreground">Module đang xây dựng</p>
          <p className="text-sm text-muted">Dự kiến hoàn thành ở {phase}</p>
        </div>
      </div>

      <ul className="mt-6 space-y-2.5">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2.5 text-sm">
            <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-muted" />
            <span className="text-foreground/80">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
