import { requirePagePermission } from "@/common/guards/page.guard";
import { PageHeader } from "@/components/patterns/page-header";
import { PermissionEditor } from "@/modules/system/components/permission-editor";
import { listRolesWithGrants } from "@/modules/system/system.service";

/** SY-03 — Director bật/tắt từng quyền + phạm vi cho từng vai trò. */
export async function PermissionsWorkspace() {
  await requirePagePermission("role.manage");

  const roles = await listRolesWithGrants();

  return (
    <>
      <PageHeader title="Phân quyền" />
      <PermissionEditor roles={roles} />
    </>
  );
}
