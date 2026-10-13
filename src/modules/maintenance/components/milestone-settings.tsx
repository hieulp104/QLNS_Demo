"use client";

import { useActionState, useState } from "react";
import { CheckCheck, LoaderCircle, Settings2, TriangleAlert } from "lucide-react";
import { Alert, Button, Card, FormCard, FormField, Input } from "@/components/ui";
import {
  updateMilestoneSettingAction,
  type ActionState,
} from "@/modules/maintenance/maintenance.actions";

const initialState: ActionState = { error: null };

/**
 * SY — cấu hình các mốc kiểm tra định kỳ (mặc định 3 · 6 · 12 tháng).
 * Chỉ hiện với người có quyền setting.manage; server vẫn kiểm lại quyền.
 */
export function MilestoneSettings({ months }: { months: number[] }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    updateMilestoneSettingAction,
    initialState,
  );

  if (!open) {
    return (
      <Card variant="filled" className="flex flex-wrap items-center gap-3 p-4">
        <Settings2 className="size-4 text-muted" />
        <span className="text-sm text-foreground">
          Mốc kiểm tra định kỳ hiện tại:{" "}
          <strong>{months.join(" · ")} tháng</strong> sau ngày bàn giao
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="ml-auto px-2.5 py-1.5"
          onClick={() => setOpen(true)}
        >
          Đổi mốc
        </Button>
      </Card>
    );
  }

  return (
    <FormCard action={formAction} variant="filled" className="space-y-3 p-4">
      <FormField
        label="Các mốc kiểm tra (tháng), cách nhau bằng dấu phẩy"
        htmlFor="months"
        hint="Chỉ áp dụng cho lịch sinh từ lúc lưu về sau. Lịch đã tạo trước đó giữ nguyên để không mất lịch sử."
      >
        <Input
          id="months"
          name="months"
          defaultValue={months.join(", ")}
          placeholder="3, 6, 12"
        />
      </FormField>

      {state.error && (
        <Alert variant="danger" className="flex items-start gap-2 text-xs">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
          <span>{state.error}</span>
        </Alert>
      )}
      {state.ok && !state.error && (
        <Alert variant="success" className="flex items-center gap-2 text-xs">
          <CheckCheck className="size-3.5" />
          Đã lưu mốc kiểm tra.
        </Alert>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending} className="px-4 py-2">
          {pending && <LoaderCircle className="size-4 animate-spin" />}
          Lưu
        </Button>
        <Button
          type="button"
          variant="outline"
          className="px-4 py-2"
          onClick={() => setOpen(false)}
        >
          Đóng
        </Button>
      </div>
    </FormCard>
  );
}
