import { CalendarClock, CheckCheck, LifeBuoy, ShieldCheck } from "lucide-react";
import { requirePagePermission } from "@/common/guards/page.guard";
import { can } from "@/common/permissions/permissions";
import { PageHeader } from "@/components/patterns/page-header";
import { StatCard } from "@/components/patterns/stat-card";
import { Card } from "@/components/ui";
import { listAssignableUsers } from "@/modules/projects/projects.service";
import { listProjectOptions } from "@/modules/materials/materials.service";
import {
  countByStatus,
  getMilestoneMonths,
  listTasks,
  manageableTaskIds,
  PAGE_SIZE,
} from "@/modules/maintenance/maintenance.service";
import { maintenanceFilterSchema } from "@/modules/maintenance/maintenance.schema";
import { MaintenanceFilters } from "@/modules/maintenance/components/maintenance-filters";
import { MaintenancePagination } from "@/modules/maintenance/components/maintenance-pagination";
import { MaintenanceTaskCard } from "@/modules/maintenance/components/maintenance-task-card";
import { MilestoneSettings } from "@/modules/maintenance/components/milestone-settings";

export type MaintenanceWorkspaceProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const first = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v;

/**
 * Trang /maintenance — nơi xem toàn bộ việc bảo hành của mọi dự án.
 * Từng dự án vẫn có tab "Bảo hành" riêng; trang này để người điều hành nhìn
 * tổng thể và lọc theo người phụ trách.
 */
export async function MaintenanceWorkspace({
  searchParams,
}: MaintenanceWorkspaceProps) {
  const user = await requirePagePermission("maintenance.view");
  const sp = await searchParams;

  const parsed = maintenanceFilterSchema.safeParse({
    kind: first(sp.kind),
    status: first(sp.status),
    projectId: first(sp.projectId),
    assigneeId: first(sp.assigneeId),
    open: first(sp.open),
    q: first(sp.q),
    page: first(sp.page) ?? 1,
  });
  // Query param hỏng thì coi như không lọc, không nên chặn cả trang.
  const filter = parsed.success ? parsed.data : { page: 1 as const };

  const [counts, data, projects, users, milestones] = await Promise.all([
    countByStatus(),
    listTasks(filter),
    listProjectOptions(),
    listAssignableUsers(),
    getMilestoneMonths(),
  ]);
  const manageable = await manageableTaskIds(user, data.rows);

  return (
    <>
      <PageHeader title="Bảo hành & chăm sóc khách hàng" />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Đề nghị của khách chưa xong"
          value={counts.openRequests}
          tone="danger"
          icon={<LifeBuoy className="size-5" />}
        />
        <StatCard
          label="Đề nghị đã xử lý"
          value={counts.doneRequests}
          tone="income"
          icon={<CheckCheck className="size-5" />}
        />
        <StatCard
          label="Lịch kiểm tra chưa làm"
          value={counts.openChecks}
          tone="warning"
          icon={<CalendarClock className="size-5" />}
        />
        <StatCard
          label="Đã kiểm tra định kỳ"
          value={counts.doneChecks}
          tone="info"
          icon={<ShieldCheck className="size-5" />}
        />
      </div>

      {can(user, "setting.manage") && (
        <div className="mt-6">
          <MilestoneSettings months={milestones} />
        </div>
      )}

      <div className="mt-6">
        <MaintenanceFilters
          projects={projects.map((p) => ({
            id: p.id,
            label: `${p.code} · ${p.name}`,
          }))}
          users={users.map((u) => ({ id: u.id, label: u.fullName }))}
        />

        {data.rows.length === 0 ? (
          <Card variant="filled" className="p-6 text-sm text-muted">
            Không có việc bảo hành nào khớp bộ lọc.
          </Card>
        ) : (
          <>
            <div className="space-y-3">
              {data.rows.map((t) => (
                <MaintenanceTaskCard
                  key={t.id}
                  task={{
                    ...t,
                    project: {
                      id: t.project.id,
                      code: t.project.code,
                      name: t.project.name,
                      customerName: t.project.customer.name,
                    },
                  }}
                  canManage={manageable.has(t.id)}
                  assignableUsers={users}
                />
              ))}
            </div>

            <div className="mt-5 flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
              <p className="text-muted">
                Hiển thị {(data.page - 1) * PAGE_SIZE + 1}–
                {Math.min(data.page * PAGE_SIZE, data.total)} trong {data.total}{" "}
                việc
              </p>
              <MaintenancePagination page={data.page} pageCount={data.pageCount} />
            </div>
          </>
        )}
      </div>
    </>
  );
}
