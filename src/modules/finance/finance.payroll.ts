/**
 * ═══════════════════════════════════════════════════════════════
 * Đồng bộ Bảng lương → Tài chính
 * ═══════════════════════════════════════════════════════════════
 * Cùng cách làm với vật tư: Bảng lương là nguồn chân lý, giao dịch bên Tài
 * chính do hệ thống sinh (`source = PAYROLL_SYNC`) và chỉ đọc. Ba loại dòng:
 *
 *   · Mỗi phiếu ứng lương  → "Chi lương", ngày = NGÀY ỨNG, đúng hình thức trả.
 *   · Kỳ lương ĐÃ CHỐT     → "Chi lương" = tổng chi thực tế, ngày cuối tháng.
 *                            (chi thực tế bỏ trống = thực nhận)
 *                          → "BHXH"      = tổng trừ BHXH,  ngày cuối tháng.
 *
 * Thực nhận ĐÃ TRỪ tạm ứng, nên tạm ứng + thực nhận + BHXH là toàn bộ chi phí
 * lương của tháng, không đồng nào bị đếm hai lần. Đổi lại, số "đã ứng" trên
 * dòng lương phải khớp sổ ứng lúc chốt — xem `advanceMismatches()`.
 *
 * ⚠ Không bao giờ ghi TÊN NGƯỜI vào giao dịch. Quyền xem Tài chính
 * (`finance.view`) khác quyền xem lương (`payroll.view`); ghi tên vào đây là
 * ai xem được Tài chính cũng suy ra được lương / tạm ứng của từng người.
 *
 * Mọi hàm nhận `tx` để cùng commit hoặc cùng rollback với nghiệp vụ lương.
 */

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/shared/prisma/prisma.service";
import { writeAuditLog } from "@/shared/audit/audit.service";
import { ADVANCE_METHOD_LABEL } from "@/common/enums";
import { nextTransactionCode } from "@/modules/finance/finance.service";
import { formatVnd } from "@/lib/utils";

const PAYROLL_SYNC = {
  source: "PAYROLL_SYNC" as const,
  direction: "EXPENSE" as const,
  status: "COMPLETED" as const,
  projectId: null,
  contractId: null,
};

const auditSelect = {
  id: true,
  code: true,
  type: true,
  status: true,
  source: true,
  amount: true,
  txnDate: true,
  paymentMethod: true,
  note: true,
  payrollPeriodId: true,
  salaryAdvanceId: true,
  deletedAt: true,
} as const;

/** Ngày cuối tháng, 00:00 UTC — cùng quy ước với cột `@db.Date` và báo cáo theo tháng. */
function lastDayOfMonth(year: number, month: number): Date {
  return new Date(Date.UTC(year, month, 0));
}

/** "22/08/2026" — ngày `@db.Date` lưu 00:00 UTC nên đọc thẳng phần UTC. */
function dayLabel(date: Date): string {
  const d = String(date.getUTCDate()).padStart(2, "0");
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${d}/${m}/${date.getUTCFullYear()}`;
}

type SyncData = {
  type: "SALARY_COST" | "INSURANCE_COST";
  amount: Prisma.Decimal;
  txnDate: Date;
  paymentMethod: string | null;
  note: string;
};

export type PayrollSyncAction = {
  action: "CREATE" | "UPDATE" | "RESTORE" | "SOFT_DELETE" | "UNCHANGED";
  type: "SALARY_COST" | "INSURANCE_COST";
  id: string;
};

/** So từng trường để không ghi AuditLog cho lần đồng bộ chẳng đổi gì. */
function sameAsWanted(
  row: { amount: Prisma.Decimal; txnDate: Date; paymentMethod: string | null; note: string | null },
  data: SyncData,
): boolean {
  return (
    row.amount.equals(data.amount) &&
    row.txnDate.getTime() === data.txnDate.getTime() &&
    row.paymentMethod === data.paymentMethod &&
    row.note === data.note
  );
}

/**
 * Đưa đúng MỘT dòng về trạng thái `data`: sửa dòng đang hoạt động, hoặc khôi
 * phục dòng đã xóa mềm (giữ nguyên mã GD cũ), hoặc tạo mới.
 */
async function upsertOne(
  tx: Prisma.TransactionClient,
  actorId: string | null,
  link: { payrollPeriodId: string } | { salaryAdvanceId: string },
  data: SyncData,
): Promise<PayrollSyncAction> {
  const where: Prisma.TransactionWhereInput =
    "payrollPeriodId" in link
      ? { payrollPeriodId: link.payrollPeriodId, type: data.type }
      : { salaryAdvanceId: link.salaryAdvanceId };

  const active = await tx.transaction.findFirst({
    where: { ...where, deletedAt: null },
    select: auditSelect,
  });
  if (active) {
    if (sameAsWanted(active, data)) {
      return { action: "UNCHANGED", type: data.type, id: active.id };
    }
    const after = await tx.transaction.update({
      where: { id: active.id },
      data,
      select: auditSelect,
    });
    await writeAuditLog(tx, {
      actorId,
      action: "PAYROLL_FINANCE_SYNC_UPDATE",
      entity: "Transaction",
      entityId: active.id,
      before: active,
      after,
    });
    return { action: "UPDATE", type: data.type, id: active.id };
  }

  const revivable = await tx.transaction.findFirst({
    where: { ...where, deletedAt: { not: null } },
    orderBy: { deletedAt: "desc" },
    select: auditSelect,
  });
  if (revivable) {
    const after = await tx.transaction.update({
      where: { id: revivable.id },
      data: { ...data, deletedAt: null },
      select: auditSelect,
    });
    await writeAuditLog(tx, {
      actorId,
      action: "PAYROLL_FINANCE_SYNC_RESTORE",
      entity: "Transaction",
      entityId: revivable.id,
      before: revivable,
      after,
    });
    return { action: "RESTORE", type: data.type, id: revivable.id };
  }

  const created = await tx.transaction.create({
    data: {
      code: await nextTransactionCode(tx),
      ...PAYROLL_SYNC,
      ...link,
      ...data,
      createdById: actorId,
    },
    select: auditSelect,
  });
  await writeAuditLog(tx, {
    actorId,
    action: "PAYROLL_FINANCE_SYNC_CREATE",
    entity: "Transaction",
    entityId: created.id,
    after: created,
  });
  return { action: "CREATE", type: data.type, id: created.id };
}

async function softDeleteMany(
  tx: Prisma.TransactionClient,
  actorId: string | null,
  where: Prisma.TransactionWhereInput,
): Promise<PayrollSyncAction[]> {
  const rows = await tx.transaction.findMany({
    where: { ...where, deletedAt: null },
    select: auditSelect,
  });
  const done: PayrollSyncAction[] = [];
  for (const row of rows) {
    const after = await tx.transaction.update({
      where: { id: row.id },
      data: { deletedAt: new Date() },
      select: auditSelect,
    });
    await writeAuditLog(tx, {
      actorId,
      action: "PAYROLL_FINANCE_SYNC_DELETE",
      entity: "Transaction",
      entityId: row.id,
      before: row,
      after,
    });
    done.push({
      action: "SOFT_DELETE",
      type: row.type as PayrollSyncAction["type"],
      id: row.id,
    });
  }
  return done;
}

/**
 * Kỳ lương → hai dòng "Chi lương" + "BHXH".
 * Kỳ đã chốt: có đúng hai dòng (dòng nào tổng = 0 thì không sinh).
 * Kỳ đang làm (mở lại kỳ): không có dòng nào — số còn đang sửa thì chưa phải chi phí.
 */
export async function syncPayrollPeriodTransactions(
  tx: Prisma.TransactionClient,
  periodId: string,
  actorId: string | null,
): Promise<PayrollSyncAction[]> {
  const period = await tx.payrollPeriod.findUniqueOrThrow({
    where: { id: periodId },
    select: { year: true, month: true, status: true },
  });

  const wanted: SyncData[] = [];
  if (period.status === "LOCKED") {
    const [sums, paidRows] = await Promise.all([
      tx.payrollLine.aggregate({
        where: { periodId },
        _sum: { insuranceDeduction: true, employerInsurance: true },
        _count: { _all: true },
      }),
      // Ghi đúng số tiền CHI RA THẬT: ô "Chi thực tế" kế toán làm tròn lần cuối,
      // bỏ trống thì bằng thực nhận. Ghi theo thực nhận là lệch quỹ vài chục
      // nghìn mỗi người (bảng chi tháng 2/2026: 84.445.000 vs 84.570.000).
      tx.payrollLine.findMany({
        where: { periodId },
        select: { netSalary: true, actualPaid: true },
      }),
    ]);
    const label = `tháng ${period.month}/${period.year}`;
    const people = sums._count._all;
    const txnDate = lastDayOfMonth(period.year, period.month);
    const net = paidRows.reduce(
      (s, r) => s.add(r.actualPaid ?? r.netSalary),
      new Prisma.Decimal(0),
    );
    // Chi phí bảo hiểm của công ty = phần trừ vào lương nhân viên + phần công ty
    // đóng thêm. Cộng chung một dòng, không đếm trùng: `netSalary` đã trừ phần
    // của nhân viên rồi, còn phần công ty đóng chưa nằm trong bất kỳ dòng nào.
    const employeePart = new Prisma.Decimal(sums._sum.insuranceDeduction ?? 0);
    const employerPart = new Prisma.Decimal(sums._sum.employerInsurance ?? 0);
    const insurance = employeePart.add(employerPart);

    if (net.gt(0)) {
      wanted.push({
        type: "SALARY_COST",
        amount: net,
        txnDate,
        paymentMethod: null,
        note: `Chi lương thực tế ${label} · ${people} người · đã trừ tạm ứng (tạm ứng ghi riêng theo ngày ứng)`,
      });
    }
    if (insurance.gt(0)) {
      wanted.push({
        type: "INSURANCE_COST",
        amount: insurance,
        txnDate,
        paymentMethod: null,
        note:
          `Bảo hiểm ${label} · trừ lương nhân viên ${formatVnd(employeePart.toString())}` +
          ` · công ty đóng ${formatVnd(employerPart.toString())}`,
      });
    }
  }

  const keep = new Set(wanted.map((w) => w.type));
  // Xóa mềm TRƯỚC khi tạo/khôi phục, để không đụng partial unique index.
  const done = await softDeleteMany(tx, actorId, {
    payrollPeriodId: periodId,
    ...(keep.size ? { type: { notIn: [...keep] } } : {}),
  });
  for (const data of wanted) {
    done.push(await upsertOne(tx, actorId, { payrollPeriodId: periodId }, data));
  }
  return done;
}

/** Phiếu ứng lương → một dòng "Chi lương" đúng ngày ứng; phiếu đã xóa → gỡ dòng. */
export async function syncAdvanceTransaction(
  tx: Prisma.TransactionClient,
  advanceId: string,
  actorId: string | null,
): Promise<PayrollSyncAction[]> {
  const advance = await tx.salaryAdvance.findUniqueOrThrow({
    where: { id: advanceId },
    select: { advanceDate: true, amount: true, method: true, deletedAt: true },
  });

  if (advance.deletedAt || new Prisma.Decimal(advance.amount).lte(0)) {
    return softDeleteMany(tx, actorId, { salaryAdvanceId: advanceId });
  }

  return [
    await upsertOne(
      tx,
      actorId,
      { salaryAdvanceId: advanceId },
      {
        type: "SALARY_COST",
        amount: new Prisma.Decimal(advance.amount),
        txnDate: advance.advanceDate,
        paymentMethod: ADVANCE_METHOD_LABEL[advance.method],
        note: `Tạm ứng lương ngày ${dayLabel(advance.advanceDate)}`,
      },
    ),
  ];
}

export type AdvanceMismatch = {
  userId: string;
  fullName: string;
  onLine: number;
  inLedger: number;
};

/**
 * Người có số "đã ứng" trên dòng lương lệch với sổ ứng lương của tháng.
 *
 * Số trên dòng lương là bản chụp lúc bấm "Tính lại". Ghi thêm / xóa phiếu ứng
 * sau đó mà chốt luôn thì Tài chính bị lệch: phiếu ứng mới đã thành một dòng
 * chi riêng, trong khi thực nhận vẫn chưa trừ nó → khoản đó bị đếm hai lần.
 * Chốt kỳ phải chặn khi danh sách này khác rỗng.
 */
export async function advanceMismatches(
  db: Prisma.TransactionClient | typeof prisma,
  periodId: string,
): Promise<AdvanceMismatch[]> {
  const period = await db.payrollPeriod.findUniqueOrThrow({
    where: { id: periodId },
    select: { year: true, month: true },
  });
  const [lines, ledger] = await Promise.all([
    db.payrollLine.findMany({
      where: { periodId },
      select: { userId: true, advanceAmount: true, user: { select: { fullName: true } } },
    }),
    db.salaryAdvance.groupBy({
      by: ["userId"],
      where: {
        deletedAt: null,
        advanceDate: {
          gte: new Date(Date.UTC(period.year, period.month - 1, 1)),
          lt: new Date(Date.UTC(period.year, period.month, 1)),
        },
      },
      _sum: { amount: true },
    }),
  ]);

  const ledgerByUser = new Map(ledger.map((r) => [r.userId, Number(r._sum.amount ?? 0)]));
  const lineByUser = new Map(lines.map((l) => [l.userId, l]));
  const userIds = new Set([...ledgerByUser.keys(), ...lineByUser.keys()]);

  const mismatches: AdvanceMismatch[] = [];
  for (const userId of userIds) {
    const line = lineByUser.get(userId);
    const onLine = Number(line?.advanceAmount ?? 0);
    const inLedger = ledgerByUser.get(userId) ?? 0;
    if (onLine !== inLedger) {
      mismatches.push({ userId, fullName: line?.user.fullName ?? "", onLine, inLedger });
    }
  }

  // Người ứng mà không có dòng lương (vd. vào làm sau lần tính lại) — lấy tên.
  const missing = mismatches.filter((m) => !m.fullName).map((m) => m.userId);
  if (missing.length) {
    const users = await db.user.findMany({
      where: { id: { in: missing } },
      select: { id: true, fullName: true },
    });
    const names = new Map(users.map((u) => [u.id, u.fullName]));
    for (const m of mismatches) m.fullName ||= names.get(m.userId) ?? "";
  }
  return mismatches;
}
