import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/modules/auth/auth.service";
import { can, hasPermission } from "@/common/permissions/permissions";
import { PageHeader } from "@/components/patterns/page-header";
import { Card, BackLink } from "@/components/ui";
import { EmployeeForm } from "@/modules/hr/components/employee-form";
import {
  getEmployee,
  listDepartments,
  listRoles,
} from "@/modules/hr/hr.service";

export type EditEmployeeWorkspaceProps = {
  params: Promise<{ id: string }>;
};

/** HR-04 — sửa hồ sơ. Trưởng phòng chỉ sửa được người phòng mình (scope DEPARTMENT). */
export async function EditEmployeeWorkspace({
  params,
}: EditEmployeeWorkspaceProps) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const employee = await getEmployee(id);
  if (!employee) notFound();

  const canUpdate = can(user, "user.update", {
    departmentId: employee.departmentId,
    ownerId: employee.id,
  });
  if (!canUpdate) redirect("/khong-co-quyen");

  // Hồ sơ người đã nghỉ chỉ để tra cứu — tầng action cũng chặn lần nữa.
  if (employee.deletedAt) redirect(`/hr/${employee.id}`);

  // Đổi vai trò / phòng ban là thao tác phân quyền, tách khỏi quyền sửa hồ sơ.
  const canManageRoles = hasPermission(user, "role.manage");

  const [departments, roles] = await Promise.all([
    listDepartments(),
    listRoles(),
  ]);

  return (
    <>
      <BackLink
        href={`/hr/${employee.id}`}
      >
        <ArrowLeft className="size-4" />
        Hồ sơ {employee.fullName}
      </BackLink>

      <PageHeader title="Sửa hồ sơ" />

      <Card className="max-w-3xl p-6">
        <EmployeeForm
          mode="edit"
          canManageRoles={canManageRoles}
          departments={departments}
          roles={roles}
          employee={{
            id: employee.id,
            fullName: employee.fullName,
            email: employee.email,
            phone: employee.phone,
            position: employee.position,
            joinedAt: employee.joinedAt,
            departmentCode: employee.department?.code ?? null,
            roleCodes: employee.roles.map((r) => r.role.code),
          }}
        />
      </Card>
    </>
  );
}
