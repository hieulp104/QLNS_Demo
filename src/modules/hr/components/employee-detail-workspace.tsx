import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { getCurrentUser } from "@/modules/auth/auth.service";
import { can, hasPermission } from "@/common/permissions/permissions";
import { DEPARTMENT_LABEL } from "@/common/enums";
import { PageHeader } from "@/components/patterns/page-header";
import { Alert, ButtonLink, Card, DescriptionRow, BackLink } from "@/components/ui";
import { EmployeeDangerZone } from "@/modules/hr/components/employee-danger-zone";
import { AvatarUploader } from "@/modules/hr/components/avatar-uploader";
import { getEmployee, listSalaryRecords } from "@/modules/hr/hr.service";
import { SalaryRecordsCard } from "@/modules/payroll/components/salary-records-card";
import { formatDate, formatDateTime } from "@/lib/utils";

export type EmployeeDetailWorkspaceProps = {
  params: Promise<{ id: string }>;
};

/** HR-03 — chi tiết hồ sơ. Xem được cả người đã nghỉ (phục vụ HR-06). */
export async function EmployeeDetailWorkspace({
  params,
}: EmployeeDetailWorkspaceProps) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const employee = await getEmployee(id);
  if (!employee) notFound();

  // Quyền xem xét trên CHÍNH bản ghi này, không phải chỉ "có quyền user.view".
  // Nhân viên scope SELF mở /hr/<id người khác> sẽ dừng ở đây.
  const ctx = {
    departmentId: employee.departmentId,
    ownerId: employee.id,
  };
  if (!can(user, "user.view", ctx)) redirect("/khong-co-quyen");

  const isResigned = Boolean(employee.deletedAt);
  // Lương là dữ liệu tiền: chỉ Giám đốc / Kế toán (payroll.manage) thấy khối này.
  // Trưởng phòng sửa được hồ sơ nhân viên phòng mình nhưng KHÔNG thấy lương.
  const canSeeSalary = hasPermission(user, "payroll.manage");
  const salaryRecords = canSeeSalary ? await listSalaryRecords(employee.id) : [];
  const canEdit = !isResigned && can(user, "user.update", ctx);
  const canDeactivate =
    !isResigned &&
    employee.id !== user.id &&
    can(user, "user.deactivate", { departmentId: employee.departmentId });
  const canResetPassword =
    !isResigned &&
    employee.id !== user.id &&
    hasPermission(user, "user.resetPassword");

  return (
    <>
      <BackLink
        href={isResigned ? "/hr/da-nghi" : "/hr"}
      >
        <ArrowLeft className="size-4" />
        {isResigned ? "Nhân viên đã nghỉ" : "Danh sách nhân sự"}
      </BackLink>

      <PageHeader
        title={employee.fullName}
        actions={
          canEdit ? (
            <ButtonLink
              href={`/hr/${employee.id}/sua`}
            >
              <Pencil className="size-4" />
              Sửa hồ sơ
            </ButtonLink>
          ) : null
        }
      />

      {isResigned && (
        <Alert variant="warning" className="mb-6 px-5 py-4">
          <p className="text-sm font-medium text-foreground">
            Đã nghỉ việc ngày {formatDate(employee.deletedAt)}
          </p>
          <p className="mt-0.5 text-sm text-muted">
            Lý do: {employee.deletedReason ?? "Không ghi"}
          </p>
        </Alert>
      )}

      <Card className="mb-8 max-w-3xl p-6">
        <div className="mb-5 flex items-center gap-4">
          {/* HR-08 — avatar: chính chủ hoặc người sửa được hồ sơ thì đổi được ảnh */}
          <AvatarUploader
            userId={employee.id}
            fullName={employee.fullName}
            avatarSrc={employee.avatarSrc}
            canChange={!isResigned && (employee.id === user.id || canEdit)}
          />
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">
              {employee.fullName}
            </p>
            <p className="truncate text-sm text-muted">{employee.email ?? employee.phone}</p>
          </div>
        </div>

        <dl>
          <DescriptionRow label="Mã nhân viên" value={employee.employeeCode} />
          <DescriptionRow label="Email" value={employee.email} />
          <DescriptionRow label="Số điện thoại" value={employee.phone} />
          <DescriptionRow
            label="Phòng ban"
            value={
              employee.department
                ? DEPARTMENT_LABEL[employee.department.code]
                : "Ban giám đốc"
            }
          />
          <DescriptionRow label="Chức vụ" value={employee.position} />
          <DescriptionRow label="Ngày vào làm" value={formatDate(employee.joinedAt)} />
          <DescriptionRow
            label="Vai trò"
            value={employee.roles.map((r) => r.role.name).join(", ")}
          />
          <DescriptionRow
            label="Trạng thái"
            value={
              isResigned
                ? "Đã nghỉ việc"
                : employee.mustChangePassword
                  ? "Đang hoạt động — chưa đổi mật khẩu lần đầu"
                  : "Đang hoạt động"
            }
          />
          <DescriptionRow
            label="Đăng nhập gần nhất"
            value={
              employee.lastLoginAt
                ? formatDateTime(employee.lastLoginAt)
                : "Chưa đăng nhập lần nào"
            }
          />
        </dl>
      </Card>

      {canSeeSalary && (
        <SalaryRecordsCard
          userId={employee.id}
          employeeName={employee.fullName}
          canManage={!isResigned}
          records={salaryRecords.map((r) => ({
            id: r.id,
            effectiveFrom: r.effectiveFrom.toISOString().slice(0, 10),
            baseSalary: r.baseSalary === null ? null : Number(r.baseSalary),
            insuranceBase:
              r.insuranceBase === null ? null : Number(r.insuranceBase),
            isFixedSalary: r.isFixedSalary,
            note: r.note,
          }))}
        />
      )}

      <EmployeeDangerZone
        employeeId={employee.id}
        employeeName={employee.fullName}
        canResetPassword={canResetPassword}
        canDeactivate={canDeactivate}
      />
    </>
  );
}
