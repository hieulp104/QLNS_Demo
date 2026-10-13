import { Badge, Card, EmptyStatePanel, IconTile, StepConnector } from "@/components/ui";
import { CornerDownLeft, Flag } from "lucide-react";
import { STAGE_LABEL, STAGE_ORDER } from "@/common/enums";
import { formatDateTime } from "@/lib/utils";
import type { ProjectStage } from "@/generated/prisma/enums";

type StageLogItem = {
  id: string;
  fromStage: ProjectStage | null;
  toStage: ProjectStage;
  note: string | null;
  createdAt: Date;
  changedBy: { fullName: string } | null;
};

/** PJ-11 — timeline lịch sử chuyển giai đoạn, mới nhất trên cùng. */
export function StageTimeline({ logs }: { logs: StageLogItem[] }) {
  if (logs.length === 0) {
    return (
      <EmptyStatePanel>
        <p className="text-sm text-muted">Chưa có lịch sử chuyển giai đoạn.</p>
      </EmptyStatePanel>
    );
  }

  return (
    <ol className="space-y-0">
      {logs.map((log, idx) => {
        const fromIdx = log.fromStage ? STAGE_ORDER.indexOf(log.fromStage) : -1;
        const toIdx = STAGE_ORDER.indexOf(log.toStage);
        const backward = fromIdx >= 0 && toIdx < fromIdx;
        const isFirst = log.fromStage === null;

        return (
          <li key={log.id} className="flex gap-3">
            {/* Cột mốc */}
            <div className="flex flex-col items-center">
              <IconTile
                shape="circle"
                size="sm"
                tone={isFirst ? "primary" : backward ? "warning" : "success"}
              >
                {isFirst ? (
                  <Flag className="size-4" />
                ) : backward ? (
                  <CornerDownLeft className="size-4" />
                ) : (
                  <span className="text-xs font-semibold">{toIdx + 1}</span>
                )}
              </IconTile>
              {idx < logs.length - 1 && (
                <StepConnector className="my-1 w-0.5 flex-1" />
              )}
            </div>

            {/* Nội dung */}
            <div className="pb-5">
              <p className="text-sm font-medium text-foreground">
                {isFirst ? (
                  STAGE_LABEL[log.toStage]
                ) : (
                  <>
                    {log.fromStage ? STAGE_LABEL[log.fromStage] : "?"}{" "}
                    <span className="text-muted">→</span>{" "}
                    {STAGE_LABEL[log.toStage]}
                  </>
                )}
                {backward && (
                  <Badge variant="warning" className="ml-2">
                    lùi giai đoạn
                  </Badge>
                )}
              </p>
              <p className="mt-0.5 text-xs text-muted">
                {log.changedBy?.fullName ?? "Hệ thống"} ·{" "}
                {formatDateTime(log.createdAt)}
              </p>
              {log.note && (
                <Card variant="filled" className="mt-1.5 px-3 py-2 text-sm text-foreground">
                  {log.note}
                </Card>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
