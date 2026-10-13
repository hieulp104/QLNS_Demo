/**
 * ═══════════════════════════════════════════════════════════════
 * Nghỉ phép — nộp đơn, duyệt, ghi thẳng vào bảng chấm công
 * ═══════════════════════════════════════════════════════════════
 * Công ty hiện CHƯA áp dụng quỹ phép năm có lương (bảng chấm công chỉ có
 * N = nghỉ không lương và L = nghỉ lễ có lương), nên module này không đếm quỹ
 * phép. Loại ANNUAL đã có sẵn trong enum: khi nào công ty áp dụng thì thêm nó
 * vào LEAVE_TYPES và bổ sung phần trừ quỹ, không phải sửa schema.
 *
 * Điểm mấu chốt: đơn được duyệt sẽ GHI THẲNG ký hiệu vào bảng chấm công trong
 * cùng một transaction. Nếu tách hai việc, sẽ có đơn duyệt rồi mà bảng công vẫn
 * trống — kế toán tính lương xong mới phát hiện thì đã trả lương sai.
 */

import type { AttendanceMark, LeaveStatus, LeaveType } from "@/generated/prisma/enums";
import { prisma } from "@/shared/prisma/prisma.service";
import { writeAuditLog } from "@/shared/audit/audit.service";
import { can, type SessionUser } from "@/common/permissions/permissions";
import { LEAVE_TYPE_LABEL } from "@/common/enums";
import { formatDate } from "@/lib/utils";
import { applyLeaveMarks } from "@/modules/attendance/attendance.service";
import { isSunday } from "@/modules/payroll/payroll.config";
import { notify } from "@/modules/notifications/notifications.service";
import type {
  CreateLeaveInput,
  DecideLeaveInput,
  LeaveFilter,
} from "@/modules/leave/leave.schema";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Ký hiệu ghi vào bảng công ứng với từng loại nghỉ. */
const MARK_OF_TYPE: Record<LeaveType, AttendanceMark> = {
  UNPAID: "ABSENT",
  HOLIDAY: "HOLIDAY",
  ANNUAL: "ANNUAL_LEAVE",
  SICK: "ABSENT",
  OTHER: "ABSENT",
};

/** Mọi ngày trong khoảng, bao gồm cả hai đầu. */
export function datesBetween(from: Date, to: Date): Date[] {
  const out: Date[] = [];
  for (let t = from.getTime(); t <= to.getTime(); t += DAY_MS) {
    out.push(new Date(t));
  }
  return out;
}

/**
 * Số ngày nghỉ có ý nghĩa với bảng công: bỏ chủ nhật ra, vì chủ nhật vốn không
 * tính công nên xin nghỉ chủ nhật không làm mất công nào.
 */
export function workingDayCount(from: Date, to: Date, halfDay: boolean): number {
  if (halfDay) return 0.5;
  return datesBetween(from, to).filter((d) => !isSunday(d)).length;
}

// ═══════════════════ ĐỌC ═══════════════════

const leaveSelect = {
  id: true,
  type: true,
  fromDate: true,
  toDate: true,
  halfDay: true,
  dayCount: true,
  reason: true,
  status: true,
  decidedAt: true,
  decisionNote: true,
  createdAt: true,
  user: {
    select: {
      id: true,
      fullName: true,
      departmentId: true,
      department: { select: { name: true } },
    },
  },
  approver: { select: { id: true, fullName: true } },
} as const;

export type LeaveItem = Awaited<ReturnType<typeof getLeave>>;

export function getLeave(id: string) {
  return prisma.leaveRequest.findFirst({
    where: { id, deletedAt: null },
    select: leaveSelect,
  });
}

/**
 * Điều kiện lọc theo phạm vi người xem:
 * - Ai cũng xem được đơn của chính mình.
 * - `leave.approve` phạm vi ALL xem tất cả, phạm vi DEPARTMENT xem phòng mình.
 */
function scopeWhere(user: SessionUser) {
  if (can(user, "leave.approve")) return {};
  if (user.departmentId && can(user, "leave.approve", { departmentId: user.departmentId })) {
    return {
      OR: [{ userId: user.id }, { user: { is: { departmentId: user.departmentId } } }],
    };
  }
  return { userId: user.id };
}

export const PAGE_SIZE = 30;

export async function listLeaves(user: SessionUser, filter: LeaveFilter) {
  const where = {
    deletedAt: null,
    ...scopeWhere(user),
    ...(filter.mine ? { userId: user.id } : {}),
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.userId ? { userId: filter.userId } : {}),
    ...(filter.year
      ? {
          fromDate: {
            gte: new Date(Date.UTC(filter.year, 0, 1)),
            lt: new Date(Date.UTC(filter.year + 1, 0, 1)),
          },
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.leaveRequest.count({ where }),
    prisma.leaveRequest.findMany({
      where,
      select: leaveSelect,
      // Đơn chờ duyệt lên đầu — đó là thứ người duyệt cần thấy trước.
      orderBy: [{ status: "asc" }, { fromDate: "desc" }],
      skip: (filter.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  return {
    total,
    rows,
    page: filter.page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

/** Số đơn đang chờ duyệt trong phạm vi của người này — cho ô số liệu đầu trang. */
export function pendingCount(user: SessionUser): Promise<number> {
  return prisma.leaveRequest.count({
    where: { deletedAt: null, status: "PENDING", ...scopeWhere(user) },
  });
}

/** Đơn đã duyệt của một người trong năm — dùng khi bật quỹ phép năm sau này. */
export async function approvedDaysInYear(
  userId: string,
  year: number,
  type: LeaveType,
): Promise<number> {
  const rows = await prisma.leaveRequest.aggregate({
    where: {
      userId,
      type,
      status: "APPROVED",
      deletedAt: null,
      fromDate: {
        gte: new Date(Date.UTC(year, 0, 1)),
        lt: new Date(Date.UTC(year + 1, 0, 1)),
      },
    },
    _sum: { dayCount: true },
  });
  return Number(rows._sum.dayCount ?? 0);
}

// ═══════════════════ GHI ═══════════════════

/** Ai được duyệt đơn của người này: người có leave.approve ALL + trưởng phòng của họ. */
async function approversFor(requesterDepartmentId: string | null): Promise<string[]> {
  const [globalApprovers, department] = await Promise.all([
    prisma.user.findMany({
      where: {
        userType: "HUMAN",
        deletedAt: null,
        isActive: true,
        roles: {
          some: {
            role: {
              permissions: {
                some: {
                  permission: { is: { code: "leave.approve" } },
                  scope: "ALL",
                },
              },
            },
          },
        },
      },
      select: { id: true },
    }),
    requesterDepartmentId
      ? prisma.department.findUnique({
          where: { id: requesterDepartmentId },
          select: { managerId: true },
        })
      : Promise.resolve(null),
  ]);

  const ids = globalApprovers.map((u) => u.id);
  if (department?.managerId) ids.push(department.managerId);
  return [...new Set(ids)];
}

export async function createLeave(
  user: SessionUser,
  input: CreateLeaveInput,
): Promise<{ id: string }> {
  const dayCount = workingDayCount(input.fromDate, input.toDate, input.halfDay);

  return prisma.$transaction(async (tx) => {
    const created = await tx.leaveRequest.create({
      data: {
        userId: user.id,
        type: input.type,
        fromDate: input.fromDate,
        toDate: input.toDate,
        halfDay: input.halfDay,
        dayCount,
        reason: input.reason,
      },
      select: { id: true },
    });

    await writeAuditLog(tx, {
      actorId: user.id,
      action: "LEAVE_CREATE",
      entity: "LeaveRequest",
      entityId: created.id,
      after: {
        type: input.type,
        fromDate: input.fromDate,
        toDate: input.toDate,
        dayCount,
      },
    });

    await notify(tx, {
      recipientIds: await approversFor(user.departmentId),
      actorId: user.id,
      type: "LEAVE_REQUEST_PENDING",
      title: `${user.fullName} xin nghỉ ${dayCount} ngày`,
      body: `${LEAVE_TYPE_LABEL[input.type]} · ${formatDate(input.fromDate)} → ${formatDate(input.toDate)}`,
      href: "/nghi-phep",
      entity: "LeaveRequest",
      entityId: created.id,
    });

    return created;
  });
}

/**
 * Duyệt / từ chối. Duyệt thì ghi luôn ký hiệu vào bảng chấm công.
 * Nghỉ nửa ngày ghi ký hiệu "/" (nửa công) bất kể loại nghỉ — đó là cách bảng
 * công của công ty thể hiện nửa ngày.
 */
export async function decideLeave(
  user: SessionUser,
  request: NonNullable<LeaveItem>,
  input: DecideLeaveInput,
): Promise<{ markedDays: number }> {
  const approved = input.status === "APPROVED";
  const mark: AttendanceMark = request.halfDay
    ? "HALF"
    : MARK_OF_TYPE[request.type];

  return prisma.$transaction(async (tx) => {
    await tx.leaveRequest.update({
      where: { id: request.id },
      data: {
        status: input.status,
        approverId: user.id,
        decidedAt: new Date(),
        decisionNote: input.decisionNote,
      },
    });

    let markedDays = 0;
    if (approved) {
      markedDays = await applyLeaveMarks(tx, {
        userId: request.user.id,
        dates: datesBetween(request.fromDate, request.toDate),
        mark,
        note: `Nghỉ phép: ${LEAVE_TYPE_LABEL[request.type]}`,
        actorId: user.id,
      });
    }

    await writeAuditLog(tx, {
      actorId: user.id,
      action: approved ? "LEAVE_APPROVE" : "LEAVE_REJECT",
      entity: "LeaveRequest",
      entityId: request.id,
      before: { status: request.status },
      after: { status: input.status, markedDays, note: input.decisionNote },
    });

    await notify(tx, {
      recipientIds: [request.user.id],
      actorId: user.id,
      type: "LEAVE_REQUEST_RESULT",
      title: approved
        ? "Đơn xin nghỉ của bạn đã được duyệt"
        : "Đơn xin nghỉ của bạn bị từ chối",
      body: `${LEAVE_TYPE_LABEL[request.type]} · ${formatDate(request.fromDate)} → ${formatDate(request.toDate)}${
        input.decisionNote ? ` — ${input.decisionNote}` : ""
      }`,
      href: "/nghi-phep",
      entity: "LeaveRequest",
      entityId: request.id,
    });

    return { markedDays };
  });
}

/** Người nộp tự hủy đơn khi chưa ai duyệt. */
export async function cancelLeave(
  user: SessionUser,
  request: NonNullable<LeaveItem>,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.leaveRequest.update({
      where: { id: request.id },
      data: { status: "CANCELLED" as LeaveStatus },
    });
    await writeAuditLog(tx, {
      actorId: user.id,
      action: "LEAVE_CANCEL",
      entity: "LeaveRequest",
      entityId: request.id,
      before: { status: request.status },
      after: { status: "CANCELLED" },
    });
  });
}
