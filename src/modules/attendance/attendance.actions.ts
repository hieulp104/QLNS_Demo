"use server";

/**
 * Server Action của module Chấm công.
 * 4 bước bắt buộc: session → quyền → validate Zod → ghi + AuditLog.
 *
 * Quyền `attendance.manage` có scope: ALL (kế toán, giám đốc) · DEPARTMENT
 * (trưởng phòng) · SELF. Mỗi thao tác đều kiểm trên CHÍNH người bị chấm công,
 * nên trưởng phòng không chấm hộ được người phòng khác.
 */

import { revalidatePath } from "next/cache";
import { requireUser } from "@/modules/auth/auth.service";
import { prisma } from "@/shared/prisma/prisma.service";
import { writeAuditLog } from "@/shared/audit/audit.service";
import { can } from "@/common/permissions/permissions";
import { setRosterFlag } from "@/modules/payroll/payroll.roster";
import {
  AttendanceLockedError,
  setMonthLock,
} from "@/modules/attendance/attendance.lock";
import {
  bulkSetMarks,
  canMarkFor,
  fillWorkdays,
  setMark,
  visibleEmployees,
  workedOn,
  type FilledCell,
} from "@/modules/attendance/attendance.service";
import {
  bulkSetMarksSchema,
  fillMonthSchema,
  monthSchema,
  setMarkSchema,
  setRosterSchema,
} from "@/modules/attendance/attendance.schema";

export type ActionState = { error: string | null; ok?: boolean };

function firstIssue(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? "Dữ liệu nhập vào không hợp lệ.";
}

/** Phòng ban của người bị chấm công — cần cho scope DEPARTMENT. */
async function targetOf(userId: string) {
  return prisma.user.findFirst({
    where: { id: userId, userType: "HUMAN" },
    select: { id: true, departmentId: true, fullName: true, deletedAt: true },
  });
}

/** Chấm / sửa / xóa một ô trong bảng công. */
export async function setMarkAction(input: {
  userId: string;
  workDate: string;
  mark: string;
  overtimeHours?: number | string;
  note?: string;
}): Promise<ActionState> {
  const user = await requireUser();

  const parsed = setMarkSchema.safeParse({
    userId: input.userId,
    workDate: input.workDate,
    mark: input.mark,
    overtimeHours: input.overtimeHours ?? 0,
    note: input.note ?? "",
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const target = await targetOf(parsed.data.userId);
  if (!target) return { error: "Không tìm thấy nhân viên." };
  if (!canMarkFor(user, target)) {
    return { error: `Bạn không có quyền chấm công cho ${target.fullName}.` };
  }
  if (!workedOn(target.deletedAt, parsed.data.workDate)) {
    return { error: `${target.fullName} đã nghỉ việc từ trước ngày này.` };
  }

  try {
    await setMark(user, parsed.data);
  } catch (error) {
    if (error instanceof AttendanceLockedError) return { error: error.message };
    throw error;
  }
  revalidatePath("/cham-cong");
  return { error: null, ok: true };
}

/**
 * Điền đủ công (X) cho mọi ngày thường còn trống trong tháng.
 * Chỉ điền cho những người mà người bấm thực sự quản được — lọc ở server chứ
 * không tin danh sách client gửi lên.
 */
export async function fillMonthAction(input: {
  year: number;
  month: number;
  userIds?: string[];
}): Promise<
  { ok: true; filled: FilledCell[] } | { ok: false; error: string }
> {
  const user = await requireUser();

  const parsed = fillMonthSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const employees = await visibleEmployees(
    user,
    parsed.data.year,
    parsed.data.month,
  );
  const wanted = parsed.data.userIds;
  const allowed = employees
    .filter((e) => (wanted ? wanted.includes(e.id) : true))
    .filter((e) => canMarkFor(user, { id: e.id, departmentId: e.departmentId }))
    .map((e) => e.id);

  if (allowed.length === 0) {
    return { ok: false, error: "Bạn không có quyền chấm công cho ai trong danh sách." };
  }

  let filled: FilledCell[];
  try {
    filled = await fillWorkdays(
      user,
      parsed.data.year,
      parsed.data.month,
      allowed,
      new Map(employees.map((e) => [e.id, e.deletedAt])),
    );
  } catch (error) {
    if (error instanceof AttendanceLockedError) return { ok: false, error: error.message };
    throw error;
  }
  revalidatePath("/cham-cong");
  return { ok: true, filled };
}

/**
 * Ghi nhiều ô một lượt — kéo tô nhiều ngày, xóa cả dòng, hoặc hoàn tác lần
 * điền vừa rồi.
 *
 * Quyền được kiểm cho TỪNG người có mặt trong danh sách, trước khi ghi. Ô nào
 * thuộc người mình không quản thì bị loại bỏ chứ không làm hỏng cả lượt ghi —
 * nhưng nếu không còn ô nào hợp lệ thì báo lỗi để người dùng biết mình vừa
 * thao tác vào vùng không có quyền.
 */
export async function bulkSetMarksAction(input: {
  changes: {
    userId: string;
    workDate: string;
    mark: string;
    overtimeHours?: number;
  }[];
}): Promise<{ ok: true; written: number } | { ok: false; error: string }> {
  const user = await requireUser();

  const parsed = bulkSetMarksSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const userIds = [...new Set(parsed.data.changes.map((c) => c.userId))];
  const targets = await prisma.user.findMany({
    where: { id: { in: userIds }, userType: "HUMAN" },
    select: { id: true, departmentId: true, deletedAt: true },
  });
  const allowed = new Map(
    targets.filter((t) => canMarkFor(user, t)).map((t) => [t.id, t.deletedAt]),
  );

  // Ô từ ngày nghỉ việc trở đi bị loại như ô của người không có quyền.
  const changes = parsed.data.changes.filter(
    (c) => allowed.has(c.userId) && workedOn(allowed.get(c.userId) ?? null, c.workDate),
  );
  if (changes.length === 0) {
    return { ok: false, error: "Bạn không có quyền chấm công cho những người này." };
  }

  let written: number;
  try {
    written = await bulkSetMarks(user, changes);
  } catch (error) {
    if (error instanceof AttendanceLockedError) return { ok: false, error: error.message };
    throw error;
  }
  revalidatePath("/cham-cong");
  return { ok: true, written };
}

/**
 * "Tùy chỉnh danh sách" — ẩn/hiện một người khỏi bảng chấm công hoặc bảng
 * lương, áp dụng từ tháng đang xem trở đi.
 *
 * Quyền: công tắc Chấm công cần `attendance.manage` phạm vi toàn công ty; công
 * tắc Bảng lương cần `payroll.manage` — bỏ một người khỏi bảng lương là quyết
 * định về tiền, trưởng phòng chấm công phòng mình không được tự làm.
 */
export async function setRosterAction(input: {
  userId: string;
  year: number;
  month: number;
  kind: "attendance" | "payroll";
  included: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();

  const allowed =
    input.kind === "attendance"
      ? can(user, "attendance.manage")
      : can(user, "payroll.manage");
  if (!allowed) return { ok: false, error: "Bạn không có quyền chỉnh danh sách này." };

  const parsed = setRosterSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const { userId, year, month, kind, included } = parsed.data;

  const target = await prisma.user.findFirst({
    where: { id: userId, userType: "HUMAN" },
    select: { id: true, fullName: true },
  });
  if (!target) return { ok: false, error: "Không tìm thấy nhân viên." };

  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));

  let periodId: string | null = null;
  if (kind === "payroll") {
    const period = await prisma.payrollPeriod.findUnique({
      where: { year_month: { year, month } },
      select: { id: true, status: true },
    });
    if (period?.status === "LOCKED") {
      return {
        ok: false,
        error: `Bảng lương tháng ${month}/${year} đã chốt — mở lại kỳ rồi mới chỉnh được.`,
      };
    }
    // Đã ứng tiền trong tháng mà bỏ khỏi bảng lương thì khoản ứng không được
    // trừ vào đâu cả — kế toán mất dấu tiền phải thu hồi.
    if (!included) {
      const advance = await prisma.salaryAdvance.count({
        where: { userId, deletedAt: null, advanceDate: { gte: start, lt: end } },
      });
      if (advance > 0) {
        return {
          ok: false,
          error: `${target.fullName} có phiếu tạm ứng tháng ${month}/${year} nên phải giữ trong bảng lương.`,
        };
      }
    }
    periodId = period?.id ?? null;
  }

  await prisma.$transaction(async (tx) => {
    await setRosterFlag(tx, parsed.data);
    // Tắt Bảng lương thì gỡ luôn dòng lương tháng này cho bảng khớp ngay, khỏi
    // phải nhớ bấm Tính lại. Bật lại thì cần Tính lại mới có số.
    if (kind === "payroll" && !included && periodId) {
      await tx.payrollLine.deleteMany({ where: { periodId, userId } });
    }
    await writeAuditLog(tx, {
      actorId: user.id,
      action: included ? "ROSTER_INCLUDE" : "ROSTER_EXCLUDE",
      entity: "User",
      entityId: userId,
      after: { kind, from: `${year}-${String(month).padStart(2, "0")}` },
    });
  });

  revalidatePath("/cham-cong");
  revalidatePath("/bang-luong");
  return { ok: true };
}

/**
 * Chốt / mở lại bảng công một tháng. Cần `attendance.manage` phạm vi toàn công
 * ty (kế toán, Giám đốc) — trưởng phòng chỉ chấm phòng mình nên không chốt được
 * bảng của cả công ty.
 */
export async function setMonthLockAction(input: {
  year: number;
  month: number;
  locked: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  if (!can(user, "attendance.manage")) {
    return { ok: false, error: "Bạn không có quyền chốt bảng công." };
  }
  const parsed = monthSchema.safeParse(input);
  if (!parsed.success || typeof input.locked !== "boolean") {
    return { ok: false, error: "Tháng không hợp lệ." };
  }
  const { year, month } = parsed.data;

  await prisma.$transaction(async (tx) => {
    await setMonthLock(tx, {
      year,
      month,
      locked: input.locked,
      byId: user.id,
      byName: user.fullName,
    });
    await writeAuditLog(tx, {
      actorId: user.id,
      action: input.locked ? "ATTENDANCE_LOCK" : "ATTENDANCE_UNLOCK",
      entity: "AttendanceDay",
      entityId: `${year}-${String(month).padStart(2, "0")}`,
    });
  });

  revalidatePath("/cham-cong");
  return { ok: true };
}
