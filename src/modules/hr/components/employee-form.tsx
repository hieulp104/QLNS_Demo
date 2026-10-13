"use client";

import { Alert, Button, ButtonLink, Card, Checkbox, ChoiceLabel, FormField, Input, Select } from "@/components/ui";

import { useActionState } from "react";
import { LoaderCircle, TriangleAlert } from "lucide-react";
import {
  createEmployeeAction,
  updateEmployeeAction,
  type EmployeeFormState,
} from "@/modules/hr/hr.actions";
import { TempPasswordPanel } from "@/modules/hr/components/temp-password-panel";

const initialState: EmployeeFormState = { error: null };

type Option = { code: string; name: string };

type Props = {
  mode: "create" | "edit";
  /** Có được đổi vai trò & phòng ban không — chỉ người có `role.manage`. */
  canManageRoles: boolean;
  /** Có được đặt lương không — chỉ người có `payroll.manage`. */
  departments: Option[];
  roles: Option[];
  /** Giá trị ban đầu khi sửa. */
  employee?: {
    id: string;
    fullName: string;
    email: string | null;
    phone: string | null;
    position: string | null;
    joinedAt: Date | null;
    departmentCode: string | null;
    roleCodes: string[];
  };
};

/** Date → "YYYY-MM-DD" cho input type=date. */
function toDateInput(value: Date | null | undefined): string {
  return value ? value.toISOString().slice(0, 10) : "";
}

export function EmployeeForm({
  mode,
  canManageRoles,
  departments,
  roles,
  employee,
}: Props) {
  const [state, formAction, pending] = useActionState(
    mode === "create" ? createEmployeeAction : updateEmployeeAction,
    initialState,
  );

  // Tạo xong thì thay form bằng mật khẩu tạm — người dùng chỉ đọc được đúng một lần.
  if (state.tempPassword && mode === "create") {
    return (
      <TempPasswordPanel
        title={`Đã tạo tài khoản cho ${state.createdName}`}
        employeeCode={state.employeeCode}
        loginName={state.loginName}
        password={state.tempPassword}
        backHref="/hr"
      />
    );
  }

  // Sau khi server action chạy, React tự reset các ô uncontrolled về defaultValue.
  // Nên khi validate hỏng, ta ưu tiên giá trị vừa nhập (state.values) server echo
  // về — reset sẽ khôi phục đúng cái người dùng đã gõ, không bắt điền lại từ đầu.
  const v = state.values;
  const initialRoles = v?.roleCodes ?? employee?.roleCodes ?? [];

  return (
    <form action={formAction} className="space-y-5">
      {mode === "edit" && employee && (
        <Input type="hidden" name="id" value={employee.id} />
      )}

      {state.error && (
        <Alert
          variant="danger"
          className="flex items-start gap-2.5 px-3.5 py-3"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>{state.error}</span>
        </Alert>
      )}

      {/* Cảnh báo trùng tên — KHÔNG chặn cứng vì công ty thật có người trùng tên.
          Nhưng người đã nghỉ việc không hiện ở danh sách nhân sự, nên không có
          chỗ này thì người tạo tưởng chưa có và tạo lại thành hồ sơ thứ hai —
          đúng cái đã xảy ra trên dữ liệu thật, làm lịch sử một người bị chẻ đôi. */}
      {state.duplicateNames && state.duplicateNames.length > 0 && (
        <Alert variant="warning" className="space-y-2 px-3.5 py-3">
          <div className="flex items-start gap-2.5">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <span className="text-sm">
              Đã có{" "}
              <strong>
                {state.duplicateNames.length} hồ sơ cùng tên &quot;
                {state.duplicateNames[0].fullName}&quot;
              </strong>{" "}
              trong hệ thống:
            </span>
          </div>
          <ul className="ml-7 list-disc space-y-1 text-sm">
            {state.duplicateNames.map((m) => (
              <li key={m.employeeCode}>
                <strong>{m.employeeCode}</strong>
                {m.position ? ` — ${m.position}` : ""}
                {m.departmentName ? ` (${m.departmentName})` : ""}
                {m.resigned && (
                  <span className="font-semibold"> — đã nghỉ việc</span>
                )}
              </li>
            ))}
          </ul>
          <p className="ml-7 text-xs">
            Nếu đây chính là người đó thì đừng tạo mới — mở hồ sơ cũ ra dùng tiếp,
            để công và lương các tháng trước không bị chẻ làm đôi.
          </p>
          <label className="ml-7 flex items-center gap-2 text-sm font-medium">
            <Checkbox name="allowDuplicateName" />
            Đây là người khác, vẫn tạo hồ sơ mới
          </label>
        </Alert>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="Họ và tên" htmlFor="fullName">
          <Input
            id="fullName"
            name="fullName"
            required
            maxLength={100}
            defaultValue={v?.fullName ?? employee?.fullName}
          />
        </FormField>

        <FormField
          label="Email"
          htmlFor="email"
          hint={mode === "edit" ? "Không đổi được sau khi tạo." : undefined}
        >
          <Input
            id="email"
            name="email"
            type="email"
            maxLength={150}
            defaultValue={v?.email ?? employee?.email ?? ""}
            // Email là danh tính đăng nhập và khóa duy nhất — đổi email là đổi
            // tài khoản, làm đứt liên hệ với nhật ký cũ.
            disabled={mode === "edit"}
          />
        </FormField>

        <FormField label="Số điện thoại" htmlFor="phone">
          <Input
            id="phone"
            name="phone"
            inputMode="tel"
            placeholder="0912345678"
            defaultValue={v?.phone ?? employee?.phone ?? ""}
          />
        </FormField>

        <FormField label="Chức vụ" htmlFor="position">
          <Input
            id="position"
            name="position"
            maxLength={100}
            placeholder="VD: Nhân viên kinh doanh"
            defaultValue={v?.position ?? employee?.position ?? ""}
          />
        </FormField>

        <FormField label="Ngày vào làm" htmlFor="joinedAt">
          <Input
            id="joinedAt"
            name="joinedAt"
            type="date"
            defaultValue={v?.joinedAt ?? toDateInput(employee?.joinedAt)}
          />
        </FormField>

        {/* Lương KHÔNG còn nằm ở form này. Lương cơ bản, mức đóng BHXH và hình
            thức trả lương đổi theo tháng, nên chuyển sang khối "Lịch sử lương"
            ở trang hồ sơ — xem `SalaryRecordsCard`. Giữ ô ở đây là quay lại đúng
            cái lỗi cũ: một giá trị duy nhất, tính lại tháng cũ ra lương mới. */}

        {canManageRoles && (
          <FormField
            label="Phòng ban"
            htmlFor="departmentCode"
            hint="Để trống nếu thuộc Ban giám đốc."
          >
            <Select
              id="departmentCode"
              name="departmentCode"
              // key đổi theo giá trị echo → select remount đúng option sau lỗi.
              // Uncontrolled select không tự cập nhật defaultValue như text input,
              // native reset sẽ đưa nó về option gốc nếu không remount.
              key={`dept-${v?.departmentCode ?? employee?.departmentCode ?? ""}`}
              defaultValue={v?.departmentCode ?? employee?.departmentCode ?? ""}
            >
              <option value="">— Ban giám đốc —</option>
              {departments.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.name}
                </option>
              ))}
            </Select>
          </FormField>
        )}
      </div>

      {canManageRoles && (
        <FormField
          label="Vai trò"
          hint="Chọn được nhiều vai trò khi nhân sự kiêm nhiệm. Quyền hiệu lực là phạm vi rộng nhất trong các vai trò đã chọn."
        >
          <Card className="grid gap-2 p-3 sm:grid-cols-2">
            {roles.map((r) => (
              <ChoiceLabel
                key={r.code}
              >
                <Checkbox
                  name="roleCodes"
                  value={r.code}
                  // key theo trạng thái tick để checkbox remount đúng sau lỗi —
                  // cùng lý do với select ở trên (uncontrolled + native reset).
                  key={`${r.code}-${initialRoles.includes(r.code)}`}
                  defaultChecked={initialRoles.includes(r.code)}
                />
                <span className="text-foreground">{r.name}</span>
              </ChoiceLabel>
            ))}
          </Card>
        </FormField>
      )}

      {mode === "create" && (
        <Alert variant="neutral" className="text-xs leading-relaxed">
          Mã nhân viên do hệ thống tự sinh. Mật khẩu tạm sẽ hiện ra sau khi lưu —
          nhân viên bắt buộc đổi mật khẩu ở lần đăng nhập đầu tiên.
        </Alert>
      )}

      <div className="flex gap-2.5">
        <Button
          type="submit"
          disabled={pending}
          size="lg" className="px-4 py-2.5 disabled:cursor-not-allowed"
        >
          {pending && <LoaderCircle className="size-4 animate-spin" />}
          {pending
            ? "Đang lưu..."
            : mode === "create"
              ? "Thêm nhân viên"
              : "Lưu thay đổi"}
        </Button>
        <ButtonLink
          href={mode === "edit" && employee ? `/hr/${employee.id}` : "/hr"}
          variant="outline"
        >
          Hủy
        </ButtonLink>
      </div>
    </form>
  );
}
