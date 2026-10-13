"use client";

import { Alert, Button, FormCard, Input, Select, Textarea, Label } from "@/components/ui";

import { useActionState, useState } from "react";
import { ArrowRight, LoaderCircle, TriangleAlert } from "lucide-react";
import {
  changeStageAction,
  type ActionState,
} from "@/modules/projects/projects.actions";
import { STAGE_LABEL, STAGE_ORDER } from "@/common/enums";
import type { ProjectStage } from "@/generated/prisma/enums";

const initialState: ActionState = { error: null };

/**
 * PJ-09 / PJ-12 — chuyển hoặc lùi giai đoạn kèm ghi chú.
 * Chọn giai đoạn bất kỳ (trước hoặc sau) — cho lùi nhưng cảnh báo để không nhầm.
 */
export function ChangeStageForm({
  projectId,
  currentStage,
}: {
  projectId: string;
  currentStage: ProjectStage;
}) {
  const [state, formAction, pending] = useActionState(
    changeStageAction,
    initialState,
  );
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<ProjectStage>(currentStage);

  // Đóng form khi chuyển thành công — chỉnh state ngay lúc render (pattern React
  // khuyến nghị cho "phản ứng theo kết quả"), tránh setState trong useEffect.
  const [ackedOk, setAckedOk] = useState(false);
  if (state.ok && !ackedOk) {
    setAckedOk(true);
    setOpen(false);
  }
  if (!state.ok && ackedOk) setAckedOk(false);

  const currentIdx = STAGE_ORDER.indexOf(currentStage);
  const selectedIdx = STAGE_ORDER.indexOf(selected);
  const isBackward = selectedIdx < currentIdx;
  const isSame = selectedIdx === currentIdx;

  if (!open) {
    return (
      <Button
        type="button"
        onClick={() => setOpen(true)}
        className="px-4 py-2"
      >
        <ArrowRight className="size-4" />
        Chuyển giai đoạn
      </Button>
    );
  }

  return (
    <FormCard
      action={formAction}
      className="space-y-3 p-5"
    >
      <Input type="hidden" name="id" value={projectId} />
      <h3 className="text-h3 font-semibold text-foreground">Chuyển giai đoạn</h3>

      {state.error && (
        <Alert variant="danger" className="flex items-start gap-2">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>{state.error}</span>
        </Alert>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="toStage" className="block text-sm font-medium text-foreground">
          Giai đoạn mới
        </Label>
        <Select
          id="toStage"
          name="toStage"
          value={selected}
          onChange={(e) => setSelected(e.target.value as ProjectStage)}
          className="px-3.5 py-2.5"
        >
          {STAGE_ORDER.map((s, i) => (
            <option key={s} value={s}>
              {i + 1}. {STAGE_LABEL[s]}
              {s === currentStage ? " (hiện tại)" : ""}
            </option>
          ))}
        </Select>
      </div>

      {isBackward && (
        <Alert variant="warning" className="text-xs">
          Bạn đang <strong>lùi</strong> giai đoạn. Thao tác vẫn được ghi vào lịch
          sử, không xóa các mốc cũ.
        </Alert>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="note" className="block text-sm font-medium text-foreground">
          Ghi chú
        </Label>
        <Textarea
          id="note"
          name="note"
          rows={2}
          maxLength={500}
          placeholder="Lý do chuyển giai đoạn (không bắt buộc)"
          className="px-3.5 py-2.5"
        />
      </div>

      <div className="flex gap-2.5">
        <Button
          type="submit"
          disabled={pending || isSame}
          className="px-4 py-2 disabled:cursor-not-allowed"
        >
          {pending && <LoaderCircle className="size-4 animate-spin" />}
          Xác nhận chuyển
        </Button>
        <Button
          type="button"
          onClick={() => setOpen(false)}
          variant="outline" className="px-4 py-2"
        >
          Hủy
        </Button>
      </div>
    </FormCard>
  );
}
