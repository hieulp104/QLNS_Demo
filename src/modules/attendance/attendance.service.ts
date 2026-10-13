/**
 * ═══════════════════════════════════════════════════════════════
 * Chấm công — bảng lưới nhân viên × ngày trong tháng
 * ═══════════════════════════════════════════════════════════════
 * Dựng lại đúng file "BẢNG CHẤM CÔNG THÁNG …" công ty đang dùng:
 * mỗi ô là một ký hiệu (X · / · N · L), cột phải là T.CA · CHỦ NHẬT · CÔNG ·
 * TỔNG CÔNG. Công thức nằm ở `payroll.config.ts` để bảng lương dùng chung.
 *
 * ⚠ Ngày công lưu bằng cột `date` (không kèm giờ) nên KHÔNG dính lệch múi giờ
 * như các cột timestamp khác của hệ thống. Mọi phép tính ngày ở đây dùng
 * getUTC* — dùng getDate()/getDay() sẽ sai vào ngày đầu/cuối tháng.
 */

import type { PrismaClient } from "@/generated/prisma/client";
import type { AttendanceMark } from "@/generated/prisma/enums";
import { prisma } from "@/shared/prisma/prisma.service";
import { writeAuditLog } from "@/shared/audit/audit.service";
import { can, type SessionUser } from "@/common/permissions/permissions";
import {
  getPayrollSettings,
  isSunday,
  summarizeDays,
  type DaySummary,
} from "@/modules/payroll/payroll.config";
import { rosterAt } from "@/modules/payroll/payroll.roster";
import { assertDatesOpen } from "@/modules/attendance/attendance.lock";

type AttendanceClient = Pick<PrismaClient, "attendanceDay" | "auditLog" | "systemSetting">;

// ═══════════════════ MỐC THỜI GIAN ═══════════════════

/** Ngày đầu tháng (00:00 UTC). month tính từ 1. */
export function monthStart(year: number, month: number): Date {
  return new Date(Date.UTC(year, month - 1, 1));
}

/** Ngày đầu tháng SAU — dùng làm cận trên `lt`. */
export function monthEnd(year: number, month: number): Date {
  return new Date(Date.UTC(year, month, 1));
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Danh sách ngày trong tháng kèm cờ chủ nhật — dựng khung bảng lưới. */
export function monthDays(year: number, month: number) {
  return Array.from({ length: daysInMonth(year, month) }, (_, i) => {
    const date = new Date(Date.UTC(year, month - 1, i + 1));
    return { day: i + 1, date, sunday: isSunday(date) };
  });
}

// ═══════════════════ PHẠM VI XEM ═══════════════════

const employeeSelect = {
  id: true,
  fullName: true,
  employeeCode: true,
  position: true,
  departmentId: true,
  department: { select: { code: true, name: true } },
  deletedAt: true,
} as const;

/**
 * Người đã nghỉ việc có làm ngày `workDate` không. `resignedAt` là `deletedAt`
 * = 00:00 giờ VN của ngày đầu tiên nghỉ (17:00 UTC hôm trước), còn `workDate`
 * là 00:00 UTC — nên so `<` ra đúng "trước ngày nghỉ".
 */
export function workedOn(resignedAt: Date | null, workDate: Date): boolean {
  return resignedAt === null || workDate < resignedAt;
}

/**
 * Những người mà `user` được xem bảng công.
 * ALL → toàn công ty · DEPARTMENT → phòng mình · SELF → chỉ mình.
 * Không có quyền nào → mảng rỗng (trang gọi sẽ chặn trước, đây là lớp thứ hai).
 */
export async function visibleEmployees(
  user: SessionUser,
  year: number,
  month: number,
) {
  const [list, roster] = await Promise.all([
    scopedEmployees(user, year, month),
    rosterAt(year, month),
  ]);
  // Người được tắt "Chấm công" ở Tùy chỉnh danh sách (tài khoản kỹ thuật, lương
  // khoán…). Công đã chấm của họ vẫn nằm nguyên trong DB, chỉ không hiện ra.
  return list.filter((e) => !roster.noAttendance.has(e.id));
}

/** Người còn làm trong tháng (chưa nghỉ, hoặc nghỉ từ tháng này trở đi). */
function inMonth(year: number, month: number) {
  return {
    userType: "HUMAN" as const,
    OR: [
      { deletedAt: null, isActive: true },
      { deletedAt: { gte: monthStart(year, month) } },
    ],
  };
}

async function scopedEmployees(user: SessionUser, year: number, month: number) {
  // Người đã nghỉ vẫn hiện ở những tháng họ CÒN LÀM — cùng điều kiện với
  // `recalcPeriod` bên bảng lương, để hai bảng không lệch người với nhau.
  // Trước đây lọc cứng `deletedAt: null`: vừa cho nghỉ là mất luôn bảng công
  // các tháng cũ, trong khi bảng lương tháng đó vẫn cần.
  const base = inMonth(year, month);

  if (can(user, "attendance.view")) {
    return prisma.user.findMany({
      where: base,
      select: employeeSelect,
      orderBy: [{ department: { code: "asc" } }, { fullName: "asc" }],
    });
  }
  if (user.departmentId && can(user, "attendance.view", { departmentId: user.departmentId })) {
    return prisma.user.findMany({
      where: { ...base, departmentId: user.departmentId },
      select: employeeSelect,
      orderBy: { fullName: "asc" },
    });
  }
  if (can(user, "attendance.view", { ownerId: user.id })) {
    return prisma.user.findMany({
      where: { ...base, id: user.id },
      select: employeeSelect,
    });
  }
  return [];
}

export type RosterEntry = {
  userId: string;
  fullName: string;
  employeeCode: string;
  position: string | null;
  departmentName: string | null;
  resignedAt: Date | null;
  inAttendance: boolean;
  inPayroll: boolean;
};

/**
 * Toàn bộ người còn làm trong tháng kèm hai công tắc — cho hộp "Tùy chỉnh danh
 * sách". Không lọc theo phạm vi xem: chỉ người quản cả công ty mới mở được hộp này.
 */
export async function rosterEntries(year: number, month: number): Promise<RosterEntry[]> {
  const [list, roster] = await Promise.all([
    prisma.user.findMany({
      where: inMonth(year, month),
      select: employeeSelect,
      orderBy: [{ department: { code: "asc" } }, { fullName: "asc" }],
    }),
    rosterAt(year, month),
  ]);
  return list.map((e) => ({
    userId: e.id,
    fullName: e.fullName,
    employeeCode: e.employeeCode,
    position: e.position,
    departmentName: e.department?.name ?? null,
    resignedAt: e.deletedAt,
    inAttendance: !roster.noAttendance.has(e.id),
    inPayroll: !roster.noPayroll.has(e.id),
  }));
}

/** Có được chấm công cho người này không (scope của attendance.manage). */
export function canMarkFor(
  user: SessionUser,
  target: { id: string; departmentId?: string | null },
): boolean {
  return can(user, "attendance.manage", {
    departmentId: target.departmentId ?? null,
    ownerId: target.id,
  });
}

// ═══════════════════ ĐỌC BẢNG THÁNG ═══════════════════

export type SheetCell = {
  mark: AttendanceMark;
  overtimeHours: number;
  note: string | null;
};

export type SheetRow = {
  userId: string;
  fullName: string;
  employeeCode: string;
  position: string | null;
  departmentId: string | null;
  departmentName: string | null;
  /** Ngày bắt đầu nghỉ việc (null = đang làm) — từ ngày này không chấm được nữa. */
  resignedAt: Date | null;
  /** Ký hiệu theo số ngày: { 1: {...}, 2: {...} } — ngày không có = chưa chấm. */
  cells: Record<number, SheetCell>;
  summary: DaySummary;
};

export type MonthSheet = {
  year: number;
  month: number;
  days: ReturnType<typeof monthDays>;
  rows: SheetRow[];
  /** Tổng cộng cuối bảng, giống dòng CỘNG trong file Excel. */
  totals: DaySummary;
};

/** Toàn bộ bảng chấm công một tháng, đã lọc theo phạm vi người xem. */
export async function monthSheet(
  user: SessionUser,
  year: number,
  month: number,
): Promise<MonthSheet> {
  const [employees, settings] = await Promise.all([
    visibleEmployees(user, year, month),
    getPayrollSettings(),
  ]);
  const days = monthDays(year, month);

  if (employees.length === 0) {
    return {
      year,
      month,
      days,
      rows: [],
      totals: {
        workDays: 0,
        sundayDays: 0,
        overtimeDays: 0,
        overtimeHours: 0,
        totalDays: 0,
      },
    };
  }

  const entries = await prisma.attendanceDay.findMany({
    where: {
      userId: { in: employees.map((e) => e.id) },
      workDate: { gte: monthStart(year, month), lt: monthEnd(year, month) },
    },
    select: {
      userId: true,
      workDate: true,
      mark: true,
      overtimeHours: true,
      note: true,
    },
  });

  const byUser = new Map<string, typeof entries>();
  for (const e of entries) {
    const list = byUser.get(e.userId);
    if (list) list.push(e);
    else byUser.set(e.userId, [e]);
  }

  const rows: SheetRow[] = employees.map((emp) => {
    const mine = byUser.get(emp.id) ?? [];
    const cells: Record<number, SheetCell> = {};
    for (const e of mine) {
      cells[e.workDate.getUTCDate()] = {
        mark: e.mark,
        overtimeHours: Number(e.overtimeHours),
        note: e.note,
      };
    }
    return {
      userId: emp.id,
      fullName: emp.fullName,
      employeeCode: emp.employeeCode,
      position: emp.position,
      departmentId: emp.departmentId,
      departmentName: emp.department?.name ?? null,
      resignedAt: emp.deletedAt,
      cells,
      summary: summarizeDays(
        mine.map((e) => ({
          workDate: e.workDate,
          mark: e.mark,
          overtimeHours: Number(e.overtimeHours),
        })),
        settings,
      ),
    };
  });

  const totals = rows.reduce<DaySummary>(
    (acc, r) => ({
      workDays: acc.workDays + r.summary.workDays,
      sundayDays: acc.sundayDays + r.summary.sundayDays,
      overtimeDays: acc.overtimeDays + r.summary.overtimeDays,
      overtimeHours: acc.overtimeHours + r.summary.overtimeHours,
      totalDays: acc.totalDays + r.summary.totalDays,
    }),
    { workDays: 0, sundayDays: 0, overtimeDays: 0, overtimeHours: 0, totalDays: 0 },
  );

  return { year, month, days, rows, totals };
}

/** Số liệu công của một người trong tháng — bảng lương gọi hàm này. */
export async function summaryOf(
  userId: string,
  year: number,
  month: number,
): Promise<DaySummary> {
  return summaryInRange(userId, monthStart(year, month), monthEnd(year, month));
}

/**
 * Tổng hợp công trong khoảng [from, to) — bảng lương dùng khi kỳ có ngày chốt
 * công, vì khi đó kỳ lương không trùng tháng dương lịch.
 */
export async function summaryInRange(
  userId: string,
  from: Date,
  to: Date,
): Promise<DaySummary> {
  const settings = await getPayrollSettings();
  if (from >= to) return summarizeDays([], settings);
  const entries = await prisma.attendanceDay.findMany({
    where: { userId, workDate: { gte: from, lt: to } },
    select: { workDate: true, mark: true, overtimeHours: true },
  });
  return summarizeDays(
    entries.map((e) => ({
      workDate: e.workDate,
      mark: e.mark,
      overtimeHours: Number(e.overtimeHours),
    })),
    settings,
  );
}

// ═══════════════════ GHI ═══════════════════

export type SetMarkInput = {
  userId: string;
  workDate: Date;
  /** null = xóa ô (trả về trạng thái "chưa chấm"). */
  mark: AttendanceMark | null;
  overtimeHours?: number;
  note?: string | null;
};

/**
 * Chấm / sửa / xóa một ô.
 *
 * Xóa ô KHÁC với chấm N: ô trống nghĩa là chưa ai chấm ngày đó, còn N là đã
 * xác nhận người này nghỉ không lương. Bảng lương chỉ cộng những gì đã chấm.
 */
export async function setMark(
  user: SessionUser,
  input: SetMarkInput,
): Promise<void> {
  const overtimeHours = Math.max(0, Number(input.overtimeHours ?? 0));

  await prisma.$transaction(async (tx) => {
    await assertDatesOpen(tx, [input.workDate]);
    const before = await tx.attendanceDay.findUnique({
      where: { userId_workDate: { userId: input.userId, workDate: input.workDate } },
      select: { mark: true, overtimeHours: true, note: true },
    });

    if (input.mark === null) {
      if (!before) return;
      await tx.attendanceDay.delete({
        where: {
          userId_workDate: { userId: input.userId, workDate: input.workDate },
        },
      });
    } else {
      await tx.attendanceDay.upsert({
        where: {
          userId_workDate: { userId: input.userId, workDate: input.workDate },
        },
        create: {
          userId: input.userId,
          workDate: input.workDate,
          mark: input.mark,
          overtimeHours,
          note: input.note ?? null,
          updatedById: user.id,
        },
        update: {
          mark: input.mark,
          overtimeHours,
          note: input.note ?? null,
          updatedById: user.id,
        },
      });
    }

    await writeAuditLog(tx, {
      actorId: user.id,
      action: input.mark === null ? "ATTENDANCE_CLEAR" : "ATTENDANCE_SET",
      entity: "AttendanceDay",
      entityId: `${input.userId}:${input.workDate.toISOString().slice(0, 10)}`,
      before,
      after:
        input.mark === null
          ? null
          : { mark: input.mark, overtimeHours, note: input.note ?? null },
    });
  });
}

/**
 * Chấm đủ công (X) cho tất cả NGÀY THƯỜNG chưa có ô nào trong tháng.
 *
 * Bỏ qua chủ nhật: trong cách làm của công ty, chủ nhật chỉ được chấm khi
 * người đó thực sự đi làm, nên điền sẵn X vào chủ nhật là tự thổi phồng công.
 * Cũng bỏ qua ô đã chấm — không ghi đè việc người khác đã nhập.
 */
export type FilledCell = { userId: string; workDate: string };

export async function fillWorkdays(
  user: SessionUser,
  year: number,
  month: number,
  userIds: string[],
  /** Ngày nghỉ việc theo người — không điền từ ngày đó trở đi. */
  resignedAt: Map<string, Date | null> = new Map(),
): Promise<FilledCell[]> {
  if (userIds.length === 0) return [];
  await assertDatesOpen(prisma, [monthStart(year, month)]);

  const existing = await prisma.attendanceDay.findMany({
    where: {
      userId: { in: userIds },
      workDate: { gte: monthStart(year, month), lt: monthEnd(year, month) },
    },
    select: { userId: true, workDate: true },
  });
  const taken = new Set(
    existing.map((e) => `${e.userId}:${e.workDate.toISOString().slice(0, 10)}`),
  );

  const data = [] as {
    userId: string;
    workDate: Date;
    mark: AttendanceMark;
    updatedById: string;
  }[];
  for (const d of monthDays(year, month)) {
    if (d.sunday) continue;
    for (const userId of userIds) {
      const key = `${userId}:${d.date.toISOString().slice(0, 10)}`;
      if (taken.has(key)) continue;
      if (!workedOn(resignedAt.get(userId) ?? null, d.date)) continue;
      data.push({ userId, workDate: d.date, mark: "FULL", updatedById: user.id });
    }
  }
  if (data.length === 0) return [];

  await prisma.$transaction(async (tx) => {
    await tx.attendanceDay.createMany({ data });
    await writeAuditLog(tx, {
      actorId: user.id,
      action: "ATTENDANCE_FILL",
      entity: "AttendanceDay",
      entityId: `${year}-${String(month).padStart(2, "0")}`,
      after: { filled: data.length, userIds: userIds.length },
    });
  });
  return data.map((d) => ({
    userId: d.userId,
    workDate: d.workDate.toISOString().slice(0, 10),
  }));
}

/**
 * Ghi nhiều ô một lượt — dùng cho kéo tô nhiều ngày và cho nút Hoàn tác.
 *
 * Gộp vào MỘT transaction và MỘT dòng nhật ký: kéo qua 30 ô mà bắn 30 request
 * thì vừa chậm vừa làm nhật ký ngập những dòng vụn không ai đọc.
 * Người gọi (action) phải kiểm quyền cho từng người TRƯỚC khi vào đây.
 */
export async function bulkSetMarks(
  user: SessionUser,
  changes: {
    userId: string;
    workDate: Date;
    mark: AttendanceMark | null;
    overtimeHours?: number;
  }[],
): Promise<number> {
  if (changes.length === 0) return 0;

  await prisma.$transaction(async (tx) => {
    await assertDatesOpen(tx, changes.map((c) => c.workDate));
    for (const c of changes) {
      const where = {
        userId_workDate: { userId: c.userId, workDate: c.workDate },
      };
      if (c.mark === null) {
        await tx.attendanceDay.deleteMany({
          where: { userId: c.userId, workDate: c.workDate },
        });
        continue;
      }
      const overtimeHours = Math.max(0, Number(c.overtimeHours ?? 0));
      await tx.attendanceDay.upsert({
        where,
        create: {
          userId: c.userId,
          workDate: c.workDate,
          mark: c.mark,
          overtimeHours,
          updatedById: user.id,
        },
        update: { mark: c.mark, overtimeHours, updatedById: user.id },
      });
    }

    await writeAuditLog(tx, {
      actorId: user.id,
      action: "ATTENDANCE_BULK_SET",
      entity: "AttendanceDay",
      entityId: changes[0].workDate.toISOString().slice(0, 7),
      after: {
        cells: changes.length,
        cleared: changes.filter((c) => c.mark === null).length,
        users: [...new Set(changes.map((c) => c.userId))].length,
      },
    });
  });

  return changes.length;
}

/**
 * Ghi ký hiệu do đơn nghỉ phép đã duyệt sinh ra.
 * Gọi BÊN TRONG transaction duyệt đơn để hai việc cùng thành hoặc cùng hỏng.
 * Bỏ qua chủ nhật vì chủ nhật vốn không phải ngày công.
 */
export async function applyLeaveMarks(
  client: AttendanceClient,
  input: {
    userId: string;
    dates: Date[];
    mark: AttendanceMark;
    note: string;
    actorId: string;
  },
): Promise<number> {
  // Đơn phép rơi vào tháng đã chốt thì không được lặng lẽ đổi bảng công —
  // ném lỗi để transaction duyệt đơn rollback, người duyệt thấy lý do.
  await assertDatesOpen(
    client,
    input.dates.filter((d) => !isSunday(d)),
  );
  let count = 0;
  for (const workDate of input.dates) {
    if (isSunday(workDate)) continue;
    await client.attendanceDay.upsert({
      where: { userId_workDate: { userId: input.userId, workDate } },
      create: {
        userId: input.userId,
        workDate,
        mark: input.mark,
        note: input.note,
        updatedById: input.actorId,
      },
      update: {
        mark: input.mark,
        note: input.note,
        updatedById: input.actorId,
      },
    });
    count += 1;
  }
  return count;
}
