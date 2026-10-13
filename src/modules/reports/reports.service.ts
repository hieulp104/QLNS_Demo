/**
 * Tầng tổng hợp số liệu module Báo cáo (RP-01 → RP-05, RP-07).
 *
 * Nguyên tắc: web TỰ TÍNH từ bảng Transaction — kế toán chỉ nhập giao dịch,
 * không nhập số báo cáo. PENDING (đã ghi nhận) và COMPLETED (đã thực thu/chi)
 * luôn được tách riêng (RP-05).
 *
 * Không kiểm quyền ở đây — trang /reports và route xuất Excel gác bằng
 * `report.financial` (RP-08). Ai vào được tới đây là đã được xem tiền.
 */

import { prisma } from "@/shared/prisma/prisma.service";
import type { TxnType } from "@/generated/prisma/enums";

/** Decimal (VND ≤ 15 chữ số) → number an toàn trong Number.MAX_SAFE_INTEGER. */
const toNumber = (v: unknown): number => Number(v ?? 0);

export type MonthlyRow = {
  /** 1–12 */
  month: number;
  thuCompleted: number;
  thuPending: number;
  chiCompleted: number;
  chiPending: number;
  /** Chênh lệch tiền thực: thuCompleted − chiCompleted */
  net: number;
};

export type ReportTotals = {
  thuCompleted: number;
  thuPending: number;
  chiCompleted: number;
  chiPending: number;
  net: number;
};

function emptyTotals(): ReportTotals {
  return { thuCompleted: 0, thuPending: 0, chiCompleted: 0, chiPending: 0, net: 0 };
}

type TxnSlice = {
  amount: unknown;
  direction: "INCOME" | "EXPENSE";
  status: "PENDING" | "COMPLETED";
};

function accumulate(target: ReportTotals, t: TxnSlice) {
  const amount = toNumber(t.amount);
  if (t.direction === "INCOME") {
    if (t.status === "COMPLETED") target.thuCompleted += amount;
    else target.thuPending += amount;
  } else {
    if (t.status === "COMPLETED") target.chiCompleted += amount;
    else target.chiPending += amount;
  }
}

/** Các năm có giao dịch — cho ô chọn năm. Luôn kèm năm hiện tại. */
export async function availableYears(): Promise<number[]> {
  const rows = await prisma.transaction.findMany({
    where: { deletedAt: null },
    select: { txnDate: true },
  });
  const years = new Set<number>(rows.map((r) => r.txnDate.getUTCFullYear()));
  years.add(new Date().getFullYear());
  return [...years].sort((a, b) => b - a);
}

/**
 * RP-01 — báo cáo theo tháng của một năm: 12 dòng thu/chi/chênh lệch,
 * tách PENDING / COMPLETED. Số lượng giao dịch của công ty 13 người đủ nhỏ
 * để gom trong JS — khỏi cần SQL date_trunc, chạy được trên mọi DB.
 */
export async function monthlyReport(year: number) {
  const txns = await prisma.transaction.findMany({
    where: {
      deletedAt: null,
      txnDate: {
        gte: new Date(Date.UTC(year, 0, 1)),
        lt: new Date(Date.UTC(year + 1, 0, 1)),
      },
    },
    select: { amount: true, direction: true, status: true, txnDate: true },
  });

  const months: MonthlyRow[] = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    thuCompleted: 0,
    thuPending: 0,
    chiCompleted: 0,
    chiPending: 0,
    net: 0,
  }));
  const totals = emptyTotals();

  for (const t of txns) {
    const row = months[t.txnDate.getUTCMonth()];
    accumulate(row as unknown as ReportTotals, t);
    accumulate(totals, t);
  }
  for (const row of months) row.net = row.thuCompleted - row.chiCompleted;
  totals.net = totals.thuCompleted - totals.chiCompleted;

  return { year, months, totals };
}

export type ExpenseTypeRow = {
  type: TxnType;
  /** Chi thực (COMPLETED) từng tháng, index 0 = tháng 1. */
  months: number[];
  completed: number;
  pending: number;
  /** % trên tổng chi thực cả năm (0–100, làm tròn 1 chữ số). */
  share: number;
};

/** Một danh mục bên trong dòng "Chi khác" (thuê xưởng, điện xưởng…). */
export type ExpenseCategoryRow = Omit<ExpenseTypeRow, "type"> & {
  categoryId: string;
  name: string;
  isActive: boolean;
};

function addAmount(
  row: { months: number[]; completed: number; pending: number },
  t: { amount: unknown; status: string; txnDate: Date },
) {
  const amount = toNumber(t.amount);
  if (t.status === "COMPLETED") {
    row.completed += amount;
    row.months[t.txnDate.getUTCMonth()] += amount;
  } else {
    row.pending += amount;
  }
}

/**
 * Cơ cấu chi phí của một năm theo loại chi (vật tư, lương, BHXH, gia công…).
 *
 * Báo cáo tháng chỉ có TỔNG chi, nên chi phí lương đổ vào Tài chính rồi vẫn
 * không nhìn ra được. Bảng này trả lời "tháng 8 lương hết bao nhiêu, chiếm mấy
 * phần chi phí". Cùng cách cắt tháng với `monthlyReport` (ngày giao dịch).
 *
 * Dòng "Chi khác" còn tách tiếp theo từng danh mục kế toán tự đặt (`categories`)
 * — mỗi khoản phụ chi đứng riêng một dòng, không nhảy số sang vật tư hay lương.
 * Tổng các danh mục luôn bằng đúng dòng "Chi khác" (CHECK ở DB bắt buộc mọi
 * giao dịch Chi khác có danh mục).
 */
export async function expenseBreakdown(year: number) {
  const txns = await prisma.transaction.findMany({
    where: {
      deletedAt: null,
      direction: "EXPENSE",
      txnDate: {
        gte: new Date(Date.UTC(year, 0, 1)),
        lt: new Date(Date.UTC(year + 1, 0, 1)),
      },
    },
    select: {
      amount: true,
      type: true,
      status: true,
      txnDate: true,
      expenseCategory: {
        select: { id: true, name: true, sortOrder: true, isActive: true },
      },
    },
  });

  const byType = new Map<TxnType, ExpenseTypeRow>();
  const byCategory = new Map<string, ExpenseCategoryRow>();
  const sortOrderOf = new Map<string, number>();
  for (const t of txns) {
    let row = byType.get(t.type);
    if (!row) {
      row = { type: t.type, months: Array(12).fill(0), completed: 0, pending: 0, share: 0 };
      byType.set(t.type, row);
    }
    addAmount(row, t);

    if (t.expenseCategory) {
      const category = t.expenseCategory;
      let categoryRow = byCategory.get(category.id);
      if (!categoryRow) {
        categoryRow = {
          categoryId: category.id,
          name: category.name,
          isActive: category.isActive,
          months: Array(12).fill(0),
          completed: 0,
          pending: 0,
          share: 0,
        };
        byCategory.set(category.id, categoryRow);
        sortOrderOf.set(category.id, category.sortOrder);
      }
      addAmount(categoryRow, t);
    }
  }

  const rows = [...byType.values()];
  const totalCompleted = rows.reduce((sum, r) => sum + r.completed, 0);
  const shareOf = (completed: number) =>
    totalCompleted > 0 ? Math.round((completed / totalCompleted) * 1000) / 10 : 0;
  for (const r of rows) r.share = shareOf(r.completed);
  rows.sort((a, b) => b.completed - a.completed || b.pending - a.pending);

  // Danh mục giữ đúng thứ tự kế toán sắp — dễ dò theo sổ quỹ hơn là xếp theo tiền.
  const categories: ExpenseCategoryRow[] = [...byCategory.values()]
    .sort(
      (a, b) =>
        (sortOrderOf.get(a.categoryId) ?? 0) - (sortOrderOf.get(b.categoryId) ?? 0) ||
        a.name.localeCompare(b.name, "vi"),
    )
    .map((row) => ({ ...row, share: shareOf(row.completed) }));

  return {
    rows,
    categories,
    totalCompleted,
    totalPending: rows.reduce((sum, r) => sum + r.pending, 0),
  };
}

export type YearlyRow = ReportTotals & { year: number };

/** RP-02 — báo cáo theo năm: mỗi năm một dòng, đủ mọi năm có giao dịch. */
export async function yearlyReport(): Promise<YearlyRow[]> {
  const txns = await prisma.transaction.findMany({
    where: { deletedAt: null },
    select: { amount: true, direction: true, status: true, txnDate: true },
  });

  const byYear = new Map<number, YearlyRow>();
  for (const t of txns) {
    const year = t.txnDate.getUTCFullYear();
    let row = byYear.get(year);
    if (!row) {
      row = { year, ...emptyTotals() };
      byYear.set(year, row);
    }
    accumulate(row, t);
  }
  for (const row of byYear.values()) {
    row.net = row.thuCompleted - row.chiCompleted;
  }
  return [...byYear.values()].sort((a, b) => b.year - a.year);
}

export type ProjectReportRow = ReportTotals & {
  id: string;
  code: string;
  name: string;
  customerName: string;
  status: string;
  /** Tổng giá trị các hợp đồng chưa xóa của dự án. */
  contractValue: number;
  /** % đã thực thu so với giá trị hợp đồng (0 khi chưa có hợp đồng). */
  collectedPercent: number;
};

/**
 * RP-03 — báo cáo theo từng dự án: so thu/chi với tổng giá trị hợp đồng.
 * Ba truy vấn gộp (dự án · giao dịch groupBy · hợp đồng groupBy) — không N+1.
 */
export async function projectReport(): Promise<ProjectReportRow[]> {
  const [projects, txnSums, contractSums] = await Promise.all([
    prisma.project.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
        customer: { select: { name: true } },
      },
    }),
    prisma.transaction.groupBy({
      by: ["projectId", "direction", "status"],
      where: { deletedAt: null, projectId: { not: null } },
      _sum: { amount: true },
    }),
    prisma.contract.groupBy({
      by: ["projectId"],
      where: { deletedAt: null },
      _sum: { value: true },
    }),
  ]);

  const contractByProject = new Map(
    contractSums.map((c) => [c.projectId, toNumber(c._sum.value)]),
  );

  const rows = new Map<string, ProjectReportRow>(
    projects.map((p) => [
      p.id,
      {
        id: p.id,
        code: p.code,
        name: p.name,
        status: p.status,
        customerName: p.customer.name,
        contractValue: contractByProject.get(p.id) ?? 0,
        collectedPercent: 0,
        ...emptyTotals(),
      },
    ]),
  );

  for (const s of txnSums) {
    const row = s.projectId ? rows.get(s.projectId) : undefined;
    if (!row) continue; // giao dịch của dự án đã xóa mềm
    accumulate(row, {
      amount: s._sum.amount,
      direction: s.direction,
      status: s.status,
    });
  }

  for (const row of rows.values()) {
    row.net = row.thuCompleted - row.chiCompleted;
    row.collectedPercent =
      row.contractValue > 0
        ? Math.round((row.thuCompleted / row.contractValue) * 100)
        : 0;
  }

  return [...rows.values()];
}

// ═══════════════════ DANH SÁCH CHO XUẤT EXCEL (RP-07) ═══════════════════

/** Danh sách dự án đầy đủ cho file Excel. */
export function listProjectsForExport() {
  return prisma.project.findMany({
    where: { deletedAt: null },
    orderBy: { code: "asc" },
    select: {
      code: true,
      name: true,
      type: true,
      propertyType: true,
      currentStage: true,
      status: true,
      estimatedValue: true,
      customer: { select: { name: true } },
      createdAt: true,
    },
  });
}

/** Danh sách khách hàng cho file Excel. */
export function listCustomersForExport() {
  return prisma.customer.findMany({
    where: { deletedAt: null },
    orderBy: { code: "asc" },
    select: {
      code: true,
      name: true,
      phone: true,
      email: true,
      address: true,
      source: true,
      createdAt: true,
      _count: { select: { projects: { where: { deletedAt: null } } } },
    },
  });
}

/** Danh sách giao dịch cho file Excel. */
export function listTransactionsForExport() {
  return prisma.transaction.findMany({
    where: { deletedAt: null },
    orderBy: { txnDate: "desc" },
    select: {
      code: true,
      txnDate: true,
      direction: true,
      type: true,
      status: true,
      amount: true,
      paymentMethod: true,
      note: true,
      project: { select: { code: true, name: true } },
      contract: { select: { code: true } },
      expenseCategory: { select: { name: true } },
      createdBy: { select: { fullName: true } },
    },
  });
}
