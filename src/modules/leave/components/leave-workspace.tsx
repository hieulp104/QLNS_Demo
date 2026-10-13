import { redirect } from "next/navigation";
import { getCurrentUser } from "@/modules/auth/auth.service";
import { can } from "@/common/permissions/permissions";
import { PageHeader } from "@/components/patterns/page-header";
import {
  listLeaves,
  pendingCount,
} from "@/modules/leave/leave.service";
import { leaveFilterSchema } from "@/modules/leave/leave.schema";
import { LeaveBoard } from "@/modules/leave/components/leave-board";

export type LeaveWorkspaceProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const first = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v;

/**
 * Trang /nghi-phep — KHÔNG gác quyền riêng: ai đăng nhập cũng nộp và xem được
 * đơn của chính mình. Người có `leave.approve` thấy thêm đơn trong phạm vi của
 * mình (toàn công ty hoặc phòng mình) — việc lọc nằm ở service.
 */
export async function LeaveWorkspace({ searchParams }: LeaveWorkspaceProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const sp = await searchParams;
  const parsed = leaveFilterSchema.safeParse({
    status: first(sp.status),
    mine: first(sp.mine),
    year: first(sp.year),
    page: first(sp.page) ?? 1,
  });
  const filter = parsed.success ? parsed.data : { page: 1 as const };

  const [data, pending] = await Promise.all([
    listLeaves(user, filter),
    pendingCount(user),
  ]);

  // Duyệt được đơn nào là kiểm lại ở server; đây chỉ để quyết định hiện nút.
  const canApproveAny =
    can(user, "leave.approve") ||
    (user.departmentId
      ? can(user, "leave.approve", { departmentId: user.departmentId })
      : false);

  return (
    <>
      <PageHeader title="Nghỉ phép" />
      <LeaveBoard
        rows={data.rows.map((r) => ({
          id: r.id,
          type: r.type,
          fromDate: r.fromDate,
          toDate: r.toDate,
          halfDay: r.halfDay,
          dayCount: Number(r.dayCount),
          reason: r.reason,
          status: r.status,
          decisionNote: r.decisionNote,
          decidedAt: r.decidedAt,
          createdAt: r.createdAt,
          userId: r.user.id,
          userName: r.user.fullName,
          departmentName: r.user.department?.name ?? null,
          approverName: r.approver?.fullName ?? null,
          /** Tự duyệt đơn của mình chỉ chấp nhận với người có phạm vi toàn công ty. */
          canDecide:
            r.status === "PENDING" &&
            can(user, "leave.approve", { departmentId: r.user.departmentId }) &&
            (r.user.id !== user.id || can(user, "leave.approve")),
          canCancel: r.status === "PENDING" && r.user.id === user.id,
        }))}
        page={data.page}
        pageCount={data.pageCount}
        total={data.total}
        pendingCount={pending}
        canApproveAny={canApproveAny}
        currentUserId={user.id}
      />
    </>
  );
}
