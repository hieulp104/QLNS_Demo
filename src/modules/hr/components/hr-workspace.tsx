import { Plus, UserMinus } from "lucide-react";
import { requirePagePermission } from "@/common/guards/page.guard";
import { hasPermission } from "@/common/permissions/permissions";
import { PageHeader } from "@/components/patterns/page-header";
import { ButtonLink } from "@/components/ui";
import { EmployeeTable } from "@/modules/hr/components/employee-table";
import { listEmployees } from "@/modules/hr/hr.service";

/** HR-01 — danh sách nhân sự, lọc theo scope của quyền `user.view`. */
export async function HrWorkspace() {
  const user = await requirePagePermission("user.view");

  const employees = await listEmployees(user);
  const canCreate = hasPermission(user, "user.create");
  // Ai xem được hồ sơ thì xem được cả người đã nghỉ trong cùng phạm vi đó.
  const canSeeResigned = hasPermission(user, "user.deactivate");

  return (
    <>
      <PageHeader
        title="Nhân sự"
        actions={
          <>
            {canSeeResigned && (
              <ButtonLink
                href="/hr/da-nghi"
                variant="outline"
              >
                <UserMinus className="size-4" />
                Đã nghỉ việc
              </ButtonLink>
            )}
            {canCreate && (
              <ButtonLink
                href="/hr/tao-moi"
              >
                <Plus className="size-4" />
                Thêm nhân viên
              </ButtonLink>
            )}
          </>
        }
      />

      <EmployeeTable
        employees={employees}
        emptyMessage="Chưa có nhân sự nào trong phạm vi bạn quản lý."
      />
    </>
  );
}
