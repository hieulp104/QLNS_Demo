"use client";

import { Button, Input, Textarea, Card, Alert, IconTile, Label } from "@/components/ui";

import { useActionState, useState } from "react";
import { KeyRound, LoaderCircle, TriangleAlert, UserMinus } from "lucide-react";
import {
  deactivateEmployeeAction,
  resetPasswordAction,
  type EmployeeFormState,
} from "@/modules/hr/hr.actions";
import { TempPasswordPanel } from "@/modules/hr/components/temp-password-panel";

const initialState: EmployeeFormState = { error: null };

/** Hôm nay theo giờ VN, dạng "YYYY-MM-DD" cho input type=date. */
function todayVn(): string {
  return new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
}

type Props = {
  employeeId: string;
  employeeName: string;
  canResetPassword: boolean;
  canDeactivate: boolean;
};

function ErrorBox({ message }: { message: string }) {
  return (
    <Alert
      variant="danger"
      className="flex items-start gap-2.5 px-3.5 py-3"
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0" />
      <span>{message}</span>
    </Alert>
  );
}

/** HR-07 — đặt lại mật khẩu, chỉ Director thấy. */
function ResetPasswordSection({
  employeeId,
  employeeName,
}: {
  employeeId: string;
  employeeName: string;
}) {
  const [state, formAction, pending] = useActionState(
    resetPasswordAction,
    initialState,
  );

  if (state.tempPassword) {
    return (
      <TempPasswordPanel
        title={`Đã đặt lại mật khẩu cho ${employeeName}`}
        password={state.tempPassword}
      />
    );
  }

  return (
    <Card className="space-y-3 p-5">
      <div className="flex items-start gap-3">
        <IconTile tone="warning" shape="circle">
          <KeyRound className="size-4" />
        </IconTile>
        <div>
          <h3 className="text-h3 font-semibold text-foreground">Đặt lại mật khẩu</h3>
          <p className="mt-0.5 text-sm text-muted">
            Sinh mật khẩu tạm mới. Nhân viên sẽ phải đổi mật khẩu ngay lần đăng
            nhập kế tiếp và mật khẩu cũ mất hiệu lực.
          </p>
        </div>
      </div>

      {state.error && <ErrorBox message={state.error} />}

      <form action={formAction}>
        <Input type="hidden" name="id" value={employeeId} />
        <Button
          type="submit"
          disabled={pending}
          variant="outline" size="lg" className="px-4 py-2.5 disabled:cursor-not-allowed"
        >
          {pending && <LoaderCircle className="size-4 animate-spin" />}
          {pending ? "Đang đặt lại..." : "Đặt lại mật khẩu"}
        </Button>
      </form>
    </Card>
  );
}

/** HR-05 — cho nghỉ việc. Bắt xác nhận thêm một bước vì tác động lớn. */
function DeactivateSection({
  employeeId,
  employeeName,
}: {
  employeeId: string;
  employeeName: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [state, formAction, pending] = useActionState(
    deactivateEmployeeAction,
    initialState,
  );

  return (
    <Card variant="danger" className="space-y-3 p-5">
      <div className="flex items-start gap-3">
        <IconTile tone="danger" shape="circle">
          <UserMinus className="size-4" />
        </IconTile>
        <div>
          <h3 className="text-h3 font-semibold text-foreground">Cho nghỉ việc</h3>
          <p className="mt-0.5 text-sm text-muted">
            Khóa đăng nhập ngay lập tức. Hồ sơ, dự án và lịch sử của{" "}
            {employeeName} vẫn được giữ lại, tra cứu ở mục{" "}
            <strong className="font-medium text-foreground">
              Nhân viên đã nghỉ
            </strong>
            .
          </p>
        </div>
      </div>

      {state.error && <ErrorBox message={state.error} />}

      {!confirming ? (
        <Button
          type="button"
          onClick={() => setConfirming(true)}
          variant="dangerOutline" size="lg" className="px-4 py-2.5"
        >
          Cho nghỉ việc
        </Button>
      ) : (
        <form action={formAction} className="space-y-3">
          <Input type="hidden" name="id" value={employeeId} />
          <div className="space-y-1.5">
            <Label
              htmlFor="resignDate"
              className="block text-sm font-medium text-foreground"
            >
              Nghỉ từ ngày
            </Label>
            <Input
              id="resignDate"
              name="resignDate"
              type="date"
              required
              min="2020-01-01"
              max={todayVn()}
              defaultValue={todayVn()}
              className="px-3.5 py-2.5 sm:max-w-xs"
            />
            <p className="text-xs text-muted">
              Ngày đầu tiên không còn đi làm. Bảng chấm công và bảng lương vẫn
              giữ người này ở những tháng còn làm, ẩn từ tháng sau đó.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label
              htmlFor="reason"
              className="block text-sm font-medium text-foreground"
            >
              Lý do nghỉ việc
            </Label>
            <Textarea
              id="reason"
              name="reason"
              required
              minLength={5}
              maxLength={500}
              rows={3}
              placeholder="VD: Nghỉ theo nguyện vọng cá nhân"
              className="px-3.5 py-2.5"
            />
          </div>
          <div className="flex gap-2.5">
            <Button
              type="submit"
              disabled={pending}
              variant="danger" size="lg" className="px-4 py-2.5 disabled:cursor-not-allowed"
            >
              {pending && <LoaderCircle className="size-4 animate-spin" />}
              {pending ? "Đang xử lý..." : "Xác nhận cho nghỉ"}
            </Button>
            <Button
              type="button"
              onClick={() => setConfirming(false)}
              variant="outline" size="lg" className="px-4 py-2.5"
            >
              Hủy
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}

export function EmployeeDangerZone({
  employeeId,
  employeeName,
  canResetPassword,
  canDeactivate,
}: Props) {
  if (!canResetPassword && !canDeactivate) return null;

  return (
    <section className="space-y-4">
      <h2 className="text-h2 font-bold text-foreground">
        Quản trị tài khoản
      </h2>
      {canResetPassword && (
        <ResetPasswordSection
          employeeId={employeeId}
          employeeName={employeeName}
        />
      )}
      {canDeactivate && (
        <DeactivateSection
          employeeId={employeeId}
          employeeName={employeeName}
        />
      )}
    </section>
  );
}
