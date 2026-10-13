import { Card, StepConnector, StepLabel, StepMarker } from "@/components/ui";
import { Check } from "lucide-react";
import { STAGE_LABEL, STAGE_ORDER } from "@/common/enums";
import type { ProjectStage } from "@/generated/prisma/enums";

/** PJ-08 — thanh tiến độ 9 giai đoạn, responsive (ngang trên desktop, dọc mobile). */
export function StageProgress({ currentStage }: { currentStage: ProjectStage }) {
  const currentIdx = STAGE_ORDER.indexOf(currentStage);

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-baseline justify-between">
        <h3 className="text-h3 font-semibold text-foreground">Tiến độ dự án</h3>
        <span className="text-xs text-muted">
          Giai đoạn {currentIdx + 1}/9
        </span>
      </div>

      <ol className="flex flex-col gap-0 sm:flex-row sm:gap-1">
        {STAGE_ORDER.map((stage, idx) => {
          const done = idx < currentIdx;
          const active = idx === currentIdx;
          return (
            <li
              key={stage}
              className="flex flex-1 items-start gap-3 sm:flex-col sm:items-stretch sm:gap-2"
            >
              {/* Thanh nối + chấm tròn */}
              <div className="flex flex-col items-center sm:w-full sm:flex-row">
                <StepMarker
                  status={done ? "complete" : active ? "current" : "upcoming"}
                >
                  {done ? <Check className="size-4" /> : idx + 1}
                </StepMarker>
                <StepConnector
                  complete={done}
                  hidden={idx === STAGE_ORDER.length - 1}
                  className="hidden h-0.5 flex-1 sm:block"
                />
                {/* thanh dọc cho mobile */}
                <StepConnector
                  complete={done}
                  hidden={idx === STAGE_ORDER.length - 1}
                  className="my-1 w-0.5 flex-1 sm:hidden"
                />
              </div>
              <StepLabel
                active={active}
                muted={!active && !done}
                className="pb-4 sm:pb-0 sm:pr-2"
              >
                {STAGE_LABEL[stage]}
              </StepLabel>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
