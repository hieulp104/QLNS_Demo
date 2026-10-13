import { can, type SessionUser } from "@/common/permissions/permissions";
import { listAssignableUsers } from "@/modules/projects/projects.service";
import {
  getMilestoneMonths,
  listByProject,
} from "@/modules/maintenance/maintenance.service";
import { MaintenanceSection } from "@/modules/maintenance/components/maintenance-section";

/**
 * Bọc server cho tab "Bảo hành" của trang dự án: nạp dữ liệu một lần rồi tính
 * quyền, để trang chi tiết dự án chỉ việc gọi một thẻ.
 */
export async function MaintenanceTab({
  user,
  projectId,
  handoverDate,
  memberIds,
}: {
  user: SessionUser;
  projectId: string;
  handoverDate: Date | null;
  memberIds: string[];
}) {
  const [tasks, milestones, assignableUsers] = await Promise.all([
    listByProject(projectId),
    getMilestoneMonths(),
    listAssignableUsers(),
  ]);

  const canManage = can(user, "maintenance.manage", { memberIds });
  // Không phải thành viên dự án nhưng đang được giao việc thì vẫn xử lý được
  // đúng việc của mình — khớp với maintenanceContext ở tầng server.
  const manageableTaskIds =
    !canManage && can(user, "maintenance.manage", { memberIds: [user.id] })
      ? tasks.filter((t) => t.assigneeId === user.id).map((t) => t.id)
      : [];

  return (
    <MaintenanceSection
      projectId={projectId}
      handoverDate={handoverDate}
      milestones={milestones}
      tasks={tasks}
      assignableUsers={assignableUsers}
      canManage={canManage}
      manageableTaskIds={manageableTaskIds}
    />
  );
}
