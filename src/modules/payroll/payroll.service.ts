/**
 * ═══════════════════════════════════════════════════════════════
 * Bảng lương tháng
 * ═══════════════════════════════════════════════════════════════
 * Dựng lại đúng bảng lương Excel của công ty, kể cả thứ tự cột:
 *   lương cơ bản · công HC · tăng ca + chủ nhật · [công chuyển từ kỳ trước] ·
 *   tổng công · lương thực tế · lương làm tròn · ứng lương · trừ lương (lấy
 *   ván/vật tư · BHXH) · tổng lương · thưởng (doanh số · trách nhiệm · chuyên
 *   cần · đúng giờ) · thưởng khác · trừ khác · lương thực nhận · chi thực tế
 *
 * Kỳ lương thường trùng tháng dương lịch; có NGÀY CHỐT CÔNG thì đuôi tháng
 * chuyển sang kỳ sau — xem `workRangeOf()`.
 *
 * Số liệu được CHỐT vào PayrollLine chứ không tính lại lúc đọc: bảng lương đã
 * trả phải giữ nguyên kể cả khi sau này có người sửa bảng chấm công tháng đó.
 * Muốn cập nhật thì bấm "Tính lại" — và chỉ khi kỳ còn ở trạng thái Đang làm.
 *
 * Liên thông Tài chính (`finance.payroll.ts`): phiếu ứng lương và kỳ đã chốt
 * tự sinh giao dịch chi, ghi trong CÙNG transaction DB với nghiệp vụ lương.
 * Hệ quả: tháng đã chốt thì không ghi / xóa phiếu ứng được nữa, và chốt kỳ bị
 * chặn khi số "đã ứng" trên bảng lương lệch sổ ứng lương.
 *
 * ⚠ Toàn bộ module này là DỮ LIỆU TIỀN. Cổng vào là quyền `payroll.view`:
 * phạm vi ALL (Giám đốc, Kế toán) xem cả bảng, phạm vi SELF chỉ xem đúng dòng
 * của mình. Việc lọc nằm ở truy vấn, không phải ở giao diện.
 */

import { prisma } from "@/shared/prisma/prisma.service";
import { writeAuditLog } from "@/shared/audit/audit.service";
import {
  advanceMismatches,
  syncAdvanceTransaction,
  syncPayrollPeriodTransactions,
} from "@/modules/finance/finance.payroll";
import { rosterAt } from "@/modules/payroll/payroll.roster";
import { formatVnd } from "@/lib/utils";
import { can, type SessionUser } from "@/common/permissions/permissions";
import {
  daysInMonth,
  monthEnd,
  monthStart,
  summaryInRange,
} from "@/modules/attendance/attendance.service";
import {
  actualPaidOf,
  getPayrollSettings,
  grossSalaryOf,
  employerInsuranceOf,
  insuranceOf,
  netSalaryOf,
  totalBonusOf,
  totalSalaryOf,
  type PayrollAmounts,
} from "@/modules/payroll/payroll.config";
import type {
  CreateAdvanceInput,
  SalaryRecordInput,
  UpdateLineInput,
} from "@/modules/payroll/payroll.schema";

const num = (v: unknown): number => Number(v ?? 0);

/**
 * Giao dịch Tài chính sinh mã GD-{năm}-{stt} theo số lớn nhất hiện có, nên hai
 * người thao tác cùng lúc có thể đụng mã (P2002). Hiếm, nên không khóa bảng —
 * chạy lại cả transaction là đủ, vì mọi bước bên trong đều idempotent.
 */
async function withCodeRetry<T>(run: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code !== "P2002" || attempt >= 3) throw error;
    }
  }
}

/** Tháng của một ngày `@db.Date` (lưu 00:00 UTC). */
function monthOf(date: Date): { year: number; month: number } {
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

/**
 * Tháng đã chốt lương thì sổ ứng tháng đó cũng khóa: thêm / xóa phiếu ứng lúc
 * này sẽ làm Tài chính lệch với bảng lương đã chốt.
 */
async function assertMonthOpen(date: Date): Promise<void> {
  const { year, month } = monthOf(date);
  const period = await prisma.payrollPeriod.findUnique({
    where: { year_month: { year, month } },
    select: { status: true },
  });
  if (period?.status === "LOCKED") {
    throw new Error(
      `Bảng lương tháng ${month}/${year} đã chốt nên sổ ứng tháng này đã khóa. Mở lại kỳ lương trước khi sửa.`,
    );
  }
}

// ═══════════════════ KỲ LƯƠNG ═══════════════════

export function listPeriods(take = 24) {
  return prisma.payrollPeriod.findMany({
    orderBy: [{ year: "desc" }, { month: "desc" }],
    take,
    select: { id: true, year: true, month: true, status: true, lockedAt: true },
  });
}

export function findPeriod(year: number, month: number) {
  return prisma.payrollPeriod.findUnique({
    where: { year_month: { year, month } },
    select: {
      id: true,
      year: true,
      month: true,
      status: true,
      cutoffDay: true,
      lockedAt: true,
      lockedBy: { select: { fullName: true } },
    },
  });
}

export type PeriodInfo = NonNullable<Awaited<ReturnType<typeof findPeriod>>>;

// ═══════════════════ KỲ CÔNG ═══════════════════

function previousMonth(year: number, month: number) {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

function nextMonth(year: number, month: number) {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

/**
 * Khoảng ngày công mà một kỳ lương lấy từ bảng chấm công.
 *
 * Mặc định trùng tháng dương lịch. Có ngày chốt công thì lệch đi:
 *   · kỳ tháng N chốt đến ngày D → kỳ N lấy công 1..D
 *   · kỳ tháng N+1 lấy thêm D+1..cuối tháng N, tính theo mức lương tháng N+1
 * Đúng cách công ty làm dịp Tết 2026: lương tháng 2 trả trước Tết theo mức cũ,
 * ba ngày 26–28/2 làm cùng lương tháng 3 theo mức mới.
 */
export type WorkRange = {
  /** Ngày đầu tiên kỳ này lấy công (gồm cả đuôi tháng trước nếu có). */
  from: Date;
  /** Cận trên, KHÔNG gồm. */
  to: Date;
  /** Ngày đầu phần công chuyển từ tháng trước sang; null = không có. */
  carryFrom: Date | null;
  /** Ngày chốt công của chính kỳ này; null = tính hết tháng. */
  cutoffDay: number | null;
};

export async function workRangeOf(year: number, month: number): Promise<WorkRange> {
  const prev = previousMonth(year, month);
  const [own, before] = await Promise.all([
    prisma.payrollPeriod.findUnique({
      where: { year_month: { year, month } },
      select: { cutoffDay: true },
    }),
    prisma.payrollPeriod.findUnique({
      where: { year_month: prev },
      select: { cutoffDay: true },
    }),
  ]);

  const start = monthStart(year, month);
  const cutoffDay = own?.cutoffDay ?? null;
  const to = cutoffDay
    ? new Date(Date.UTC(year, month - 1, cutoffDay + 1))
    : monthEnd(year, month);
  const carryFrom =
    before?.cutoffDay && before.cutoffDay < daysInMonth(prev.year, prev.month)
      ? new Date(Date.UTC(prev.year, prev.month - 1, before.cutoffDay + 1))
      : null;

  return { from: carryFrom ?? start, to, carryFrom, cutoffDay };
}

const lineSelect = {
  id: true,
  userId: true,
  isFixedSalary: true,
  baseSalary: true,
  workDays: true,
  sundayDays: true,
  overtimeDays: true,
  carriedDays: true,
  totalDays: true,
  grossSalary: true,
  roundedSalary: true,
  advanceAmount: true,
  materialDeduction: true,
  deductionNote: true,
  insuranceBase: true,
  insuranceDeduction: true,
  employerInsurance: true,
  bonusSales: true,
  bonusResponsibility: true,
  bonusAttendance: true,
  bonusPunctuality: true,
  bonusOther: true,
  otherDeduction: true,
  totalSalary: true,
  netSalary: true,
  actualPaid: true,
  note: true,
  user: {
    select: {
      id: true,
      fullName: true,
      position: true,
      department: { select: { code: true, name: true } },
    },
  },
} as const;

export type PayrollLineView = {
  id: string;
  userId: string;
  fullName: string;
  position: string | null;
  departmentName: string | null;
  isFixedSalary: boolean;
  baseSalary: number;
  workDays: number;
  sundayDays: number;
  overtimeDays: number;
  /** Công chuyển từ đuôi tháng trước (sau ngày chốt công của kỳ trước). */
  carriedDays: number;
  totalDays: number;
  grossSalary: number;
  roundedSalary: number;
  advanceAmount: number;
  materialDeduction: number;
  /** Lý do trừ lương. */
  deductionNote: string | null;
  /** Mức đóng BHXH áp dụng cho tháng này. Null = tháng đó không đóng bảo hiểm. */
  insuranceBase: number | null;
  insuranceDeduction: number;
  /** Bảo hiểm phần công ty đóng — chi phí công ty, KHÔNG trừ vào lương. */
  employerInsurance: number;
  bonusSales: number;
  bonusResponsibility: number;
  bonusAttendance: number;
  bonusPunctuality: number;
  bonusOther: number;
  otherDeduction: number;
  totalBonus: number;
  totalSalary: number;
  netSalary: number;
  /** Kế toán gõ ở ô "Chi thực tế". Null = để trống, bằng thực nhận. */
  actualPaid: number | null;
  /** Số tiền thật sự chi ra — số mà Tài chính ghi nhận. */
  paid: number;
  note: string | null;
};

type RawLine = Awaited<
  ReturnType<typeof prisma.payrollLine.findFirstOrThrow<{ select: typeof lineSelect }>>
>;

function toView(l: RawLine): PayrollLineView {
  const amounts: PayrollAmounts = {
    roundedSalary: num(l.roundedSalary),
    advanceAmount: num(l.advanceAmount),
    materialDeduction: num(l.materialDeduction),
    insuranceDeduction: num(l.insuranceDeduction),
    bonusSales: num(l.bonusSales),
    bonusResponsibility: num(l.bonusResponsibility),
    bonusAttendance: num(l.bonusAttendance),
    bonusPunctuality: num(l.bonusPunctuality),
    bonusOther: num(l.bonusOther),
    otherDeduction: num(l.otherDeduction),
  };
  const actualPaid = l.actualPaid === null ? null : num(l.actualPaid);
  return {
    id: l.id,
    userId: l.userId,
    fullName: l.user.fullName,
    position: l.user.position,
    departmentName: l.user.department?.name ?? null,
    isFixedSalary: l.isFixedSalary,
    baseSalary: num(l.baseSalary),
    workDays: num(l.workDays),
    sundayDays: num(l.sundayDays),
    overtimeDays: num(l.overtimeDays),
    carriedDays: num(l.carriedDays),
    totalDays: num(l.totalDays),
    grossSalary: num(l.grossSalary),
    ...amounts,
    insuranceBase: l.insuranceBase === null ? null : num(l.insuranceBase),
    employerInsurance: num(l.employerInsurance),
    totalBonus: totalBonusOf(amounts),
    totalSalary: num(l.totalSalary),
    netSalary: num(l.netSalary),
    deductionNote: l.deductionNote,
    actualPaid,
    paid: actualPaidOf(actualPaid, num(l.netSalary)),
    note: l.note,
  };
}

/**
 * Các dòng lương của một kỳ, đã lọc theo phạm vi người xem.
 * `payroll.view` phạm vi SELF chỉ nhận về đúng dòng của mình — lọc ngay trong
 * câu truy vấn để dữ liệu lương người khác không bao giờ rời khỏi server.
 */
export async function periodLines(
  user: SessionUser,
  periodId: string,
): Promise<PayrollLineView[]> {
  const seeAll = can(user, "payroll.view");
  if (!seeAll && !can(user, "payroll.view", { ownerId: user.id })) return [];

  const rows = await prisma.payrollLine.findMany({
    where: { periodId, ...(seeAll ? {} : { userId: user.id }) },
    select: lineSelect,
    orderBy: [{ user: { department: { code: "asc" } } }, { user: { fullName: "asc" } }],
  });
  return rows.map(toView);
}

export type PayrollTotals = {
  baseSalary: number;
  workDays: number;
  bonusDays: number;
  carriedDays: number;
  totalDays: number;
  grossSalary: number;
  roundedSalary: number;
  advanceAmount: number;
  materialDeduction: number;
  insuranceDeduction: number;
  employerInsurance: number;
  totalSalary: number;
  totalBonus: number;
  bonusOther: number;
  otherDeduction: number;
  netSalary: number;
  paid: number;
};

/** Dòng CỘNG cuối bảng. */
export function sumLines(lines: PayrollLineView[]): PayrollTotals {
  return lines.reduce<PayrollTotals>(
    (a, l) => ({
      baseSalary: a.baseSalary + l.baseSalary,
      workDays: a.workDays + l.workDays,
      bonusDays: a.bonusDays + l.sundayDays + l.overtimeDays,
      carriedDays: a.carriedDays + l.carriedDays,
      totalDays: a.totalDays + l.totalDays,
      grossSalary: a.grossSalary + l.grossSalary,
      roundedSalary: a.roundedSalary + l.roundedSalary,
      advanceAmount: a.advanceAmount + l.advanceAmount,
      materialDeduction: a.materialDeduction + l.materialDeduction,
      insuranceDeduction: a.insuranceDeduction + l.insuranceDeduction,
      employerInsurance: a.employerInsurance + l.employerInsurance,
      totalSalary: a.totalSalary + l.totalSalary,
      totalBonus: a.totalBonus + l.totalBonus,
      bonusOther: a.bonusOther + l.bonusOther,
      otherDeduction: a.otherDeduction + l.otherDeduction,
      netSalary: a.netSalary + l.netSalary,
      paid: a.paid + l.paid,
    }),
    {
      baseSalary: 0,
      workDays: 0,
      bonusDays: 0,
      carriedDays: 0,
      totalDays: 0,
      grossSalary: 0,
      roundedSalary: 0,
      advanceAmount: 0,
      materialDeduction: 0,
      insuranceDeduction: 0,
      employerInsurance: 0,
      totalSalary: 0,
      totalBonus: 0,
      bonusOther: 0,
      otherDeduction: 0,
      netSalary: 0,
      paid: 0,
    },
  );
}

// ═══════════════════ TÍNH LẠI ═══════════════════

/** Tổng tiền đã ứng trong tháng, gom theo người. */
export async function advanceTotals(
  year: number,
  month: number,
): Promise<Map<string, number>> {
  const rows = await prisma.salaryAdvance.groupBy({
    by: ["userId"],
    where: {
      deletedAt: null,
      advanceDate: { gte: monthStart(year, month), lt: monthEnd(year, month) },
    },
    _sum: { amount: true },
  });
  return new Map(rows.map((r) => [r.userId, num(r._sum.amount)]));
}

/**
 * Tạo kỳ lương nếu chưa có rồi nạp lại số liệu từ bảng chấm công.
 *
 * Giữ nguyên các ô kế toán đã gõ tay (trừ lương vật tư, các khoản thưởng, ghi
 * chú). Riêng "lương làm tròn" chỉ được ghi đè khi nó vẫn đang bằng lương thực
 * tế cũ — tức là chưa ai sửa; đã sửa rồi thì tính lại KHÔNG được xóa con số đó.
 */
export type SalaryAtMonth = {
  baseSalary: number;
  insuranceBase: number | null;
  isFixedSalary: boolean;
};

/**
 * Mốc lương đang hiệu lực cho một tháng, theo từng người.
 *
 * Quy tắc: lấy mốc có `effectiveFrom` MỚI NHẤT trong số các mốc không muộn hơn
 * tháng đang tính. Mốc áp dụng vô thời hạn về sau cho tới khi gặp mốc kế tiếp,
 * nên khai "từ 01/2026 lương 7tr" rồi "từ 05/2026 lương 8tr" là tháng 6, 7, 8…
 * tự thừa kế mốc tháng 5, không phải khai lại.
 *
 * Người KHÔNG có mốc nào ≤ tháng đó thì không có trong Map — gọi là "chưa khai
 * lương". Khách đã chốt: không tự lấy mốc đầu áp ngược lên, mà để trống rồi báo
 * cho kế toán khai bổ sung, vì tự đoán số tiền là trả nhầm lương.
 */
export async function salaryMapAt(
  userIds: string[],
  year: number,
  month: number,
): Promise<Map<string, SalaryAtMonth>> {
  const map = new Map<string, SalaryAtMonth>();
  if (userIds.length === 0) return map;

  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const rows = await prisma.salaryRecord.findMany({
    where: { userId: { in: userIds }, effectiveFrom: { lte: monthStart } },
    // Mốc gần nhất đứng trước, nên bản ghi ĐẦU TIÊN của mỗi người là mốc cần lấy.
    orderBy: [{ userId: "asc" }, { effectiveFrom: "desc" }],
    select: {
      userId: true,
      baseSalary: true,
      insuranceBase: true,
      isFixedSalary: true,
    },
  });
  for (const r of rows) {
    if (map.has(r.userId)) continue;
    map.set(r.userId, {
      baseSalary: num(r.baseSalary),
      insuranceBase: r.insuranceBase === null ? null : num(r.insuranceBase),
      isFixedSalary: r.isFixedSalary,
    });
  }
  return map;
}

/**
 * Những người CÓ công hoặc CÓ tạm ứng trong tháng nhưng chưa khai mốc lương nào
 * áp dụng cho tháng đó.
 *
 * Khách đã chốt: không tự lấy mốc đầu áp ngược lên, mà để trống rồi báo cho kế
 * toán khai bổ sung. Nhưng im lặng bỏ qua thì tháng sau mới phát hiện thiếu, nên
 * bảng lương phải réo tên lên ngay — đó là việc của hàm này.
 */
export async function missingSalaryNames(
  year: number,
  month: number,
): Promise<string[]> {
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd = new Date(Date.UTC(year, month, 1));
  // Công thì theo kỳ công (có thể lệch tháng khi có ngày chốt), ứng thì theo tháng.
  const range = await workRangeOf(year, month);

  const [attended, advanced] = await Promise.all([
    prisma.attendanceDay.findMany({
      where: { workDate: { gte: range.from, lt: range.to } },
      select: { userId: true },
      distinct: ["userId"],
    }),
    prisma.salaryAdvance.findMany({
      where: {
        deletedAt: null,
        advanceDate: { gte: monthStart, lt: monthEnd },
      },
      select: { userId: true },
      distinct: ["userId"],
    }),
  ]);

  // Người đã tắt "Bảng lương" (tài khoản kỹ thuật…) thì không réo — trừ khi họ
  // có tạm ứng, vì khi đó recalcPeriod vẫn giữ dòng của họ.
  const roster = await rosterAt(year, month);
  const advancedIds = new Set(advanced.map((r) => r.userId));
  const ids = [...new Set([...attended, ...advanced].map((r) => r.userId))].filter(
    (id) => !roster.noPayroll.has(id) || advancedIds.has(id),
  );
  if (ids.length === 0) return [];

  const salaries = await salaryMapAt(ids, year, month);
  const missing = ids.filter((id) => !salaries.has(id));
  if (missing.length === 0) return [];

  const users = await prisma.user.findMany({
    where: { id: { in: missing }, userType: "HUMAN" },
    select: { fullName: true },
    orderBy: { fullName: "asc" },
  });
  return users.map((u) => u.fullName);
}

export async function recalcPeriod(
  user: SessionUser,
  year: number,
  month: number,
): Promise<{ periodId: string; lines: number; missingSalary: string[] }> {
  const settings = await getPayrollSettings();

  const period = await prisma.payrollPeriod.upsert({
    where: { year_month: { year, month } },
    update: {},
    create: { year, month, createdById: user.id },
    select: { id: true, status: true },
  });
  if (period.status === "LOCKED") {
    throw new Error("Kỳ lương đã chốt, không tính lại được.");
  }

  // Kỳ công có thể bắt đầu từ đuôi tháng trước (kỳ trước có ngày chốt công).
  const range = await workRangeOf(year, month);
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  // Mốc đầu kỳ công, để biết ai còn đang làm trong kỳ đó.
  const rangeStart = range.from;

  const existingLines = await prisma.payrollLine.findMany({
    where: { periodId: period.id },
    select: { userId: true },
  });
  const existingUserIds = existingLines.map((l) => l.userId);

  const [employees, advances, existing, roster] = await Promise.all([
    prisma.user.findMany({
      // Người đã nghỉ việc vẫn phải được tính cho những tháng họ CÒN LÀM.
      // Trước đây lọc cứng `deletedAt: null` nên vừa đánh dấu nghỉ việc là họ
      // biến mất khỏi mọi tháng chưa từng tính lại — kế toán phải tạo lại hồ sơ
      // mới để làm lương, đẻ ra hồ sơ trùng.
      where: {
        userType: "HUMAN",
        OR: [
          { deletedAt: null, isActive: true },
          { deletedAt: { gte: rangeStart } },
          ...(existingUserIds.length ? [{ id: { in: existingUserIds } }] : []),
        ],
      },
      select: { id: true, fullName: true },
    }),
    advanceTotals(year, month),
    prisma.payrollLine.findMany({
      where: { periodId: period.id },
      select: {
        id: true,
        userId: true,
        grossSalary: true,
        roundedSalary: true,
        materialDeduction: true,
        deductionNote: true,
        bonusSales: true,
        bonusResponsibility: true,
        bonusAttendance: true,
        bonusPunctuality: true,
        bonusOther: true,
        otherDeduction: true,
        actualPaid: true,
        note: true,
      },
    }),
    rosterAt(year, month),
  ]);
  const oldByUser = new Map(existing.map((l) => [l.userId, l]));
  const salaries = await salaryMapAt(
    employees.map((e) => e.id),
    year,
    month,
  );
  /** Người có công hoặc có tiền dính dáng mà chưa khai mốc lương cho tháng này. */
  const missingSalary: string[] = [];

  for (const emp of employees) {
    const own = await summaryInRange(emp.id, monthStart, range.to);
    const carried = range.carryFrom
      ? (await summaryInRange(emp.id, range.carryFrom, monthStart)).totalDays
      : 0;
    // Công chuyển sang đã gồm chủ nhật × hệ số và tăng ca, nên cộng thẳng.
    const summary = {
      ...own,
      carriedDays: carried,
      totalDays: Math.round((own.totalDays + carried) * 100) / 100,
    };
    const old = oldByUser.get(emp.id);
    const salary = salaryAtMonth(salaries, emp.id);
    const advanceAmount = advances.get(emp.id) ?? 0;

    // Đã tắt "Bảng lương" ở Tùy chỉnh danh sách → không có dòng, kể cả dòng cũ.
    // Ngoại lệ duy nhất: còn tạm ứng trong tháng — tiền đã chi ra thật, bỏ dòng
    // là mất dấu khoản phải trừ (lúc tắt đã chặn, đây là phòng khi ứng sau đó).
    if (roster.noPayroll.has(emp.id) && advanceAmount === 0) {
      if (old) await prisma.payrollLine.delete({ where: { id: old.id } });
      continue;
    }

    // Dòng "rỗng" = không công, không tiền, không khoản trừ, không ghi chú.
    // Rỗng thì KHÔNG có gì của người dùng để mất, nên xóa được an toàn.
    const oldIsBlank =
      summary.totalDays === 0 &&
      advanceAmount === 0 &&
      num(old?.roundedSalary) === 0 &&
      num(old?.materialDeduction) === 0 &&
      num(old?.bonusSales) +
        num(old?.bonusResponsibility) +
        num(old?.bonusAttendance) +
        num(old?.bonusPunctuality) +
        num(old?.bonusOther) ===
        0 &&
      num(old?.otherDeduction) === 0 &&
      (old?.actualPaid ?? null) === null &&
      !old?.deductionNote &&
      !old?.note;

    // Chưa khai mốc lương cho tháng này thì KHÔNG đoán số — không tạo dòng mới.
    //
    // ⚠ Hai quy tắc dễ đá nhau ở đây, phải phân định đúng:
    //  · Dòng CÓ số người ta gõ tay (lương làm tròn, thưởng, lấy ván, ghi chú) thì
    //    GIỮ NGUYÊN. Thiếu mốc lương là lý do dừng tính, không phải lý do hủy công
    //    sức nhập liệu. Số cũ đứng im kèm cảnh báo vẫn hơn số biến mất.
    //  · Dòng RỖNG thì xóa, vì không có gì để mất. Thiếu chỗ này là tài khoản kỹ
    //    thuật / người chưa khai lương nằm lì trong bảng lương vĩnh viễn, bấm Tính
    //    lại bao nhiêu lần cũng không đi.
    if (!salary) {
      if (old && oldIsBlank) {
        await prisma.payrollLine.delete({ where: { id: old.id } });
      } else if (summary.totalDays > 0 || advanceAmount > 0 || old) {
        missingSalary.push(emp.fullName);
      }
      continue;
    }

    const baseSalary = salary.baseSalary;

    // Lương khoán: trả cố định theo tháng, đủ công hay thiếu công vẫn từng ấy
    // tiền (Giám đốc, KT thuế…). Vẫn chấm công bình thường, chỉ là số công không
    // tham gia vào tiền. Trước đây để 0 rồi bắt kế toán gõ tay lại mỗi tháng.
    const grossSalary = salary.isFixedSalary
      ? baseSalary
      : grossSalaryOf(baseSalary, summary.totalDays, settings);

    const keepRounded =
      old && num(old.roundedSalary) !== num(old.grossSalary)
        ? num(old.roundedSalary)
        : grossSalary;

    const amounts: PayrollAmounts = {
      roundedSalary: keepRounded,
      advanceAmount,
      materialDeduction: num(old?.materialDeduction),
      insuranceDeduction: insuranceOf(salary.insuranceBase, settings),
      bonusSales: num(old?.bonusSales),
      bonusResponsibility: num(old?.bonusResponsibility),
      bonusAttendance: num(old?.bonusAttendance),
      bonusPunctuality: num(old?.bonusPunctuality),
      bonusOther: num(old?.bonusOther),
      otherDeduction: num(old?.otherDeduction),
    };

    // Dòng hoàn toàn trống thì không đưa vào bảng lương tháng đó cho đỡ rối:
    // không công, không tiền, không khoản trừ nào. Tài khoản kỹ thuật / người
    // chưa vào làm rơi vào đây.
    // ⚠ Chỉ ẩn khi TRỐNG HẲN, không ẩn theo mỗi điều kiện "0 công": người nghỉ
    // cả tháng nhưng còn nợ tạm ứng hoặc còn bị trừ BHXH vẫn phải hiện, nếu
    // không kế toán mất dấu khoản phải thu hồi.
    const totalBonus = totalBonusOf(amounts);
    const isBlankLine =
      oldIsBlank &&
      amounts.roundedSalary === 0 &&
      amounts.insuranceDeduction === 0 &&
      totalBonus === 0;
    if (isBlankLine) {
      if (old) {
        await prisma.payrollLine.delete({ where: { id: old.id } });
      }
      continue;
    }

    const data = {
      isFixedSalary: salary.isFixedSalary,
      baseSalary,
      insuranceBase: salary.insuranceBase,
      workDays: summary.workDays,
      sundayDays: summary.sundayDays,
      overtimeDays: summary.overtimeDays,
      carriedDays: summary.carriedDays,
      totalDays: summary.totalDays,
      grossSalary,
      ...amounts,
      // Ô gõ tay — tính lại không được xóa số kế toán đã điền.
      actualPaid: old?.actualPaid ?? null,
      deductionNote: old?.deductionNote ?? null,
      // Không nằm trong `amounts` vì không tham gia công thức tổng lương /
      // thực nhận của người lao động — đây là chi phí riêng của công ty.
      employerInsurance: employerInsuranceOf(salary.insuranceBase, settings),
      totalSalary: totalSalaryOf(amounts),
      netSalary: netSalaryOf(amounts),
      note: old?.note ?? null,
    };

    await prisma.payrollLine.upsert({
      where: { periodId_userId: { periodId: period.id, userId: emp.id } },
      create: { periodId: period.id, userId: emp.id, ...data },
      update: data,
    });
  }

  // Người đã nghỉ việc giữa chừng: dòng cũ vẫn ở lại để không mất lịch sử,
  // nhưng không sinh dòng mới cho họ ở lần tính lại sau.
  await writeAuditLog(prisma, {
    actorId: user.id,
    action: "PAYROLL_RECALC",
    entity: "PayrollPeriod",
    entityId: period.id,
    after: { year, month, lines: employees.length },
  });

  return { periodId: period.id, lines: employees.length, missingSalary };
}

/** Lấy mốc của một người trong Map, viết tách ra cho dễ đọc ở vòng lặp chính. */
function salaryAtMonth(
  map: Map<string, SalaryAtMonth>,
  userId: string,
): SalaryAtMonth | null {
  return map.get(userId) ?? null;
}

/** Sửa các ô gõ tay của một dòng lương. */
export async function updateLine(
  user: SessionUser,
  input: UpdateLineInput,
): Promise<void> {
  const before = await prisma.payrollLine.findUnique({
    where: { id: input.id },
    select: {
      id: true,
      periodId: true,
      advanceAmount: true,
      insuranceDeduction: true,
      roundedSalary: true,
      period: { select: { status: true } },
    },
  });
  if (!before) throw new Error("Không tìm thấy dòng lương.");
  if (before.period.status === "LOCKED") {
    throw new Error("Kỳ lương đã chốt, không sửa được.");
  }

  const amounts: PayrollAmounts = {
    roundedSalary: input.roundedSalary,
    advanceAmount: num(before.advanceAmount),
    materialDeduction: input.materialDeduction,
    insuranceDeduction: num(before.insuranceDeduction),
    bonusSales: input.bonusSales,
    bonusResponsibility: input.bonusResponsibility,
    bonusAttendance: input.bonusAttendance,
    bonusPunctuality: input.bonusPunctuality,
    bonusOther: input.bonusOther,
    otherDeduction: input.otherDeduction,
  };

  await prisma.$transaction(async (tx) => {
    await tx.payrollLine.update({
      where: { id: input.id },
      data: {
        ...amounts,
        totalSalary: totalSalaryOf(amounts),
        netSalary: netSalaryOf(amounts),
        actualPaid: input.actualPaid,
        deductionNote: input.deductionNote,
        note: input.note,
      },
    });
    await writeAuditLog(tx, {
      actorId: user.id,
      action: "PAYROLL_LINE_UPDATE",
      entity: "PayrollLine",
      entityId: input.id,
      before: { roundedSalary: num(before.roundedSalary) },
      after: { ...amounts, actualPaid: input.actualPaid, deductionNote: input.deductionNote },
    });
  });
}

/**
 * Đặt / bỏ ngày chốt công của một kỳ, rồi tính lại kỳ này và kỳ tháng sau.
 *
 * Ngày chốt quyết định công đuôi tháng thuộc kỳ nào, nên đổi nó là đổi số của
 * HAI kỳ. Vì vậy cả hai phải còn đang làm: kỳ tháng sau đã chốt mà vẫn cho đổi
 * thì ba ngày cuối tháng hoặc bị trả hai lần, hoặc không ai trả.
 */
export async function setPeriodCutoff(
  user: SessionUser,
  year: number,
  month: number,
  cutoffDay: number | null,
): Promise<void> {
  const last = daysInMonth(year, month);
  if (cutoffDay !== null && (cutoffDay < 1 || cutoffDay >= last)) {
    throw new Error(`Ngày chốt công phải từ 1 đến ${last - 1}.`);
  }
  const next = nextMonth(year, month);

  const changed = await prisma.$transaction(async (tx) => {
    const period = await tx.payrollPeriod.upsert({
      where: { year_month: { year, month } },
      update: {},
      create: { year, month, createdById: user.id },
      select: { id: true, status: true, cutoffDay: true },
    });
    if (period.status === "LOCKED") {
      throw new Error(`Kỳ lương tháng ${month}/${year} đã chốt. Mở lại kỳ trước khi đổi ngày chốt công.`);
    }
    const following = await tx.payrollPeriod.findUnique({
      where: { year_month: next },
      select: { status: true },
    });
    if (following?.status === "LOCKED") {
      throw new Error(
        `Kỳ lương tháng ${next.month}/${next.year} đã chốt — đổi ngày chốt công lúc này sẽ làm lệch số đã trả. Mở lại kỳ tháng ${next.month} trước.`,
      );
    }
    if (period.cutoffDay === cutoffDay) return false;

    await tx.payrollPeriod.update({
      where: { id: period.id },
      data: { cutoffDay },
    });
    await writeAuditLog(tx, {
      actorId: user.id,
      action: "PAYROLL_CUTOFF_UPDATE",
      entity: "PayrollPeriod",
      entityId: period.id,
      before: { cutoffDay: period.cutoffDay },
      after: { cutoffDay },
    });
    return true;
  });
  if (!changed) return;

  // Tính lại ngay để kế toán thấy số mới, khỏi phải nhớ bấm hai lần ở hai tháng.
  // Kỳ tháng sau chỉ tính lại khi đã có — chưa lập thì để kế toán tự tạo.
  await recalcPeriod(user, year, month);
  const nextExists = await prisma.payrollPeriod.findUnique({
    where: { year_month: next },
    select: { id: true },
  });
  if (nextExists) await recalcPeriod(user, next.year, next.month);
}

/**
 * Chốt / mở lại kỳ lương.
 *
 * Chốt: số liệu đóng băng và sinh "Chi lương" + "BHXH" bên Tài chính.
 * Mở lại: gỡ hai dòng đó (xóa mềm) — chốt lại sẽ khôi phục đúng mã GD cũ.
 * Tạm ứng KHÔNG bị gỡ khi mở lại kỳ: tiền ứng đã thực sự ra khỏi quỹ.
 */
export async function setPeriodStatus(
  user: SessionUser,
  periodId: string,
  status: "DRAFT" | "LOCKED",
): Promise<void> {
  await withCodeRetry(() =>
    prisma.$transaction(async (tx) => {
      const before = await tx.payrollPeriod.findUnique({
        where: { id: periodId },
        select: { status: true, _count: { select: { lines: true } } },
      });
      if (!before) throw new Error("Không tìm thấy kỳ lương.");
      if (before.status === status) return;

      if (status === "LOCKED") {
        if (before._count.lines === 0) {
          throw new Error("Kỳ lương chưa có dòng nào. Bấm \"Tính lại từ bảng chấm công\" trước khi chốt.");
        }
        const mismatches = await advanceMismatches(tx, periodId);
        if (mismatches.length) {
          const detail = mismatches
            .map((m) => `${m.fullName}: bảng lương ${formatVnd(m.onLine)}, sổ ứng ${formatVnd(m.inLedger)}`)
            .join("; ");
          throw new Error(
            `Sổ ứng lương đã thay đổi sau lần tính lại gần nhất (${detail}). Bấm "Tính lại từ bảng chấm công" rồi chốt.`,
          );
        }
      }

      await tx.payrollPeriod.update({
        where: { id: periodId },
        data: {
          status,
          lockedAt: status === "LOCKED" ? new Date() : null,
          lockedById: status === "LOCKED" ? user.id : null,
        },
      });
      await writeAuditLog(tx, {
        actorId: user.id,
        action: status === "LOCKED" ? "PAYROLL_LOCK" : "PAYROLL_UNLOCK",
        entity: "PayrollPeriod",
        entityId: periodId,
        before: { status: before.status },
        after: { status },
      });
      await syncPayrollPeriodTransactions(tx, periodId, user.id);
    }),
  );
}

/** Mã GD bên Tài chính của một kỳ lương đã chốt — hiện trên màn bảng lương. */
export function periodFinanceCodes(periodId: string) {
  return prisma.transaction.findMany({
    where: { payrollPeriodId: periodId, deletedAt: null },
    orderBy: { type: "asc" },
    select: { code: true, type: true },
  });
}

// ═══════════════════ ỨNG LƯƠNG ═══════════════════

const advanceSelect = {
  id: true,
  advanceDate: true,
  amount: true,
  method: true,
  note: true,
  user: { select: { id: true, fullName: true } },
  createdBy: { select: { fullName: true } },
} as const;

/** Sổ ứng lương của một tháng. */
export function listAdvances(year: number, month: number) {
  return prisma.salaryAdvance.findMany({
    where: {
      deletedAt: null,
      advanceDate: { gte: monthStart(year, month), lt: monthEnd(year, month) },
    },
    select: advanceSelect,
    orderBy: { advanceDate: "asc" },
  });
}

// ═══════════════════ MỐC LƯƠNG ═══════════════════

/**
 * Thêm hoặc sửa mốc lương của một người.
 *
 * Mỗi người mỗi tháng tối đa một mốc (`@@unique([userId, effectiveFrom])`), nên
 * khai lại cùng tháng là GHI ĐÈ mốc cũ chứ không sinh thêm dòng — kế toán sửa
 * nhầm thì chỉ cần khai lại, không phải đi xóa.
 *
 * ⚠ Sửa mốc quá khứ ảnh hưởng mọi tháng CHƯA CHỐT trong khoảng mốc đó phủ, lần
 * Tính lại kế tiếp sẽ ra số mới. Tháng đã chốt giữ nguyên vì `PayrollLine` đã
 * đóng băng số liệu.
 */
export async function upsertSalaryRecord(
  user: SessionUser,
  input: SalaryRecordInput,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const before = await tx.salaryRecord.findUnique({
      where: {
        userId_effectiveFrom: {
          userId: input.userId,
          effectiveFrom: input.effectiveFrom,
        },
      },
      select: {
        baseSalary: true,
        insuranceBase: true,
        isFixedSalary: true,
        note: true,
      },
    });

    const data = {
      baseSalary: input.baseSalary,
      insuranceBase: input.insuranceBase,
      isFixedSalary: input.isFixedSalary,
      note: input.note,
    };
    const row = await tx.salaryRecord.upsert({
      where: {
        userId_effectiveFrom: {
          userId: input.userId,
          effectiveFrom: input.effectiveFrom,
        },
      },
      create: { userId: input.userId, effectiveFrom: input.effectiveFrom, ...data },
      update: data,
      select: { id: true },
    });

    await writeAuditLog(tx, {
      actorId: user.id,
      action: before ? "SALARY_RECORD_UPDATE" : "SALARY_RECORD_CREATE",
      entity: "SalaryRecord",
      entityId: row.id,
      before,
      after: { ...data, effectiveFrom: input.effectiveFrom },
    });
  });
}

/** Xóa một mốc lương. Tháng đã chốt không bị ảnh hưởng — số đã đóng băng. */
export async function deleteSalaryRecord(
  user: SessionUser,
  id: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const before = await tx.salaryRecord.findUnique({
      where: { id },
      select: {
        userId: true,
        effectiveFrom: true,
        baseSalary: true,
        insuranceBase: true,
        isFixedSalary: true,
      },
    });
    if (!before) throw new Error("Không tìm thấy mốc lương.");

    await tx.salaryRecord.delete({ where: { id } });
    await writeAuditLog(tx, {
      actorId: user.id,
      action: "SALARY_RECORD_DELETE",
      entity: "SalaryRecord",
      entityId: id,
      before,
    });
  });
}

export async function createAdvance(
  user: SessionUser,
  input: CreateAdvanceInput,
): Promise<void> {
  await assertMonthOpen(input.advanceDate);

  await withCodeRetry(() =>
    prisma.$transaction(async (tx) => {
      const created = await tx.salaryAdvance.create({
        data: {
          userId: input.userId,
          advanceDate: input.advanceDate,
          amount: input.amount,
          method: input.method,
          note: input.note,
          createdById: user.id,
        },
        select: { id: true },
      });
      await writeAuditLog(tx, {
        actorId: user.id,
        action: "ADVANCE_CREATE",
        entity: "SalaryAdvance",
        entityId: created.id,
        after: {
          userId: input.userId,
          amount: input.amount,
          method: input.method,
          advanceDate: input.advanceDate,
        },
      });
      await syncAdvanceTransaction(tx, created.id, user.id);
    }),
  );
}

export async function deleteAdvance(
  user: SessionUser,
  id: string,
): Promise<void> {
  const before = await prisma.salaryAdvance.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, userId: true, amount: true, advanceDate: true },
  });
  if (!before) throw new Error("Không tìm thấy phiếu ứng lương.");
  await assertMonthOpen(before.advanceDate);

  await prisma.$transaction(async (tx) => {
    await tx.salaryAdvance.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await writeAuditLog(tx, {
      actorId: user.id,
      action: "ADVANCE_DELETE",
      entity: "SalaryAdvance",
      entityId: id,
      before,
    });
    await syncAdvanceTransaction(tx, id, user.id);
  });
}
