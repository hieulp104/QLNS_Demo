import { BackLink } from "@/components/ui";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requirePagePermission } from "@/common/guards/page.guard";
import { can, hasPermission } from "@/common/permissions/permissions";
import { PageHeader } from "@/components/patterns/page-header";
import { EmployeeTable } from "@/modules/hr/components/employee-table";
import { listResignedEmployees } from "@/modules/hr/hr.service";

/**
 * HR-06 — danh sách riêng cho nhân viên đã nghỉ.
 * Vẫn lọc theo scope `user.view` như màn chính, nên trưởng phòng chỉ thấy
 * người đã nghỉ của phòng mình.
 */
export async function ResignedEmployeesWorkspace() {
  const user = await requirePagePermission("user.view");

  // Nhân viên thường (scope SELF) không có việc gì ở màn này.
  if (!hasPermission(user, "user.deactivate")) redirect("/khong-co-quyen");

  const employees = await listResignedEmployees(user);

  return (
    <>
      <BackLink
        href="/hr"
      >
        <ArrowLeft className="size-4" />
        Danh sách nhân sự
      </BackLink>

      <PageHeader title="Nhân viên đã nghỉ" />

      <EmployeeTable
        employees={employees}
        variant="resigned"
        canPurge={can(user, "user.deactivate")}
        emptyMessage="Chưa có nhân viên nào nghỉ việc."
      />
    </>
  );
}
