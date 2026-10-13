import { ArrowLeft } from "lucide-react";
import { requirePagePermission } from "@/common/guards/page.guard";
import { PageHeader } from "@/components/patterns/page-header";
import { Card, BackLink } from "@/components/ui";
import { EmployeeForm } from "@/modules/hr/components/employee-form";
import { listAssignableRoles, listDepartments } from "@/modules/hr/hr.service";

/**
 * HR-02 — Giám đốc, hoặc kế toán khi được bật `user.create`.
 * Người không có `role.manage` chỉ thấy các vai trò nằm trọn trong quyền của
 * mình; action kiểm tra lại đúng điều kiện đó.
 */
export async function CreateEmployeeWorkspace() {
  const user = await requirePagePermission("user.create");

  const [departments, roles] = await Promise.all([
    listDepartments(),
    listAssignableRoles(user),
  ]);

  return (
    <>
      <BackLink
        href="/hr"
      >
        <ArrowLeft className="size-4" />
        Danh sách nhân sự
      </BackLink>

      <PageHeader title="Thêm nhân viên" />

      <Card className="max-w-3xl p-6">
        <EmployeeForm
          mode="create"
          canManageRoles
          departments={departments}
          roles={roles}
        />
      </Card>
    </>
  );
}
