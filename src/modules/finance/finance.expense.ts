/**
 * Danh mục "Chi khác" (ExpenseCategory) + "Chép khoản cố định" từ tháng trước.
 *
 * Chi khác là chi phí chung ngoài vật tư và lương — thuê xưởng, điện xưởng,
 * quỹ VP, xe ô tô, thưởng doanh số… (dựng theo sổ quỹ "Thu chi 2026"). Kế toán
 * tự đặt tên danh mục; mỗi danh mục thành một dòng riêng trong Cơ cấu chi phí.
 *
 * Kiểm quyền nằm ở action (`finance.manage`), file này chỉ lo dữ liệu.
 */

import { prisma } from "@/shared/prisma/prisma.service";
import { writeAuditLog } from "@/shared/audit/audit.service";
import type { SessionUser } from "@/common/permissions/permissions";
import { nextTransactionCode } from "@/modules/finance/finance.service";
import type {
  CreateExpenseCategoryInput,
  UpdateExpenseCategoryInput,
} from "@/modules/finance/finance.schema";

const categorySelect = {
  id: true,
  name: true,
  isRecurring: true,
  defaultAmount: true,
  sortOrder: true,
  isActive: true,
} as const;

/** Danh sách cho màn quản lý — kèm số giao dịch đang hoạt động để biết xóa được không. */
export async function listExpenseCategories() {
  const [rows, usage] = await Promise.all([
    prisma.expenseCategory.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: categorySelect,
    }),
    // Đếm cả giao dịch đã xóa mềm: FK vẫn trỏ tới nên danh mục vẫn không xóa được.
    prisma.transaction.groupBy({
      by: ["expenseCategoryId"],
      where: { expenseCategoryId: { not: null } },
      _count: { _all: true },
    }),
  ]);
  const countById = new Map(
    usage.map((row) => [row.expenseCategoryId, row._count._all]),
  );
  return rows.map((row) => ({
    ...row,
    defaultAmount: row.defaultAmount === null ? null : String(row.defaultAmount),
    transactionCount: countById.get(row.id) ?? 0,
  }));
}

export type ExpenseCategoryItem = Awaited<
  ReturnType<typeof listExpenseCategories>
>[number];

/**
 * Tên không phân biệt hoa thường: "điện xưởng" và "Điện xưởng" là một danh mục.
 * Unique index của DB phân biệt hoa thường nên phải chặn thêm ở đây.
 */
async function nameTaken(name: string, exceptId?: string) {
  const existing = await prisma.expenseCategory.findFirst({
    where: {
      name: { equals: name, mode: "insensitive" },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { id: true },
  });
  return Boolean(existing);
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string })?.code === "P2002";
}

export async function createExpenseCategory(
  user: SessionUser,
  input: CreateExpenseCategoryInput,
): Promise<{ ok: true; id: string } | { ok: false; reason: "NAME_TAKEN" }> {
  if (await nameTaken(input.name)) return { ok: false, reason: "NAME_TAKEN" };
  try {
    const created = await prisma.$transaction(async (tx) => {
      const category = await tx.expenseCategory.create({
        data: {
          name: input.name,
          isRecurring: input.isRecurring,
          defaultAmount: input.defaultAmount ?? null,
          sortOrder: input.sortOrder,
        },
        select: categorySelect,
      });
      await writeAuditLog(tx, {
        actorId: user.id,
        action: "EXPENSE_CATEGORY_CREATE",
        entity: "ExpenseCategory",
        entityId: category.id,
        after: category,
      });
      return category;
    });
    return { ok: true, id: created.id };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, reason: "NAME_TAKEN" };
    throw error;
  }
}

export async function updateExpenseCategory(
  user: SessionUser,
  input: UpdateExpenseCategoryInput,
): Promise<{ ok: true } | { ok: false; reason: "NOT_FOUND" | "NAME_TAKEN" }> {
  const before = await prisma.expenseCategory.findUnique({
    where: { id: input.id },
    select: categorySelect,
  });
  if (!before) return { ok: false, reason: "NOT_FOUND" };
  if (await nameTaken(input.name, input.id)) {
    return { ok: false, reason: "NAME_TAKEN" };
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Đổi tên áp dụng cho cả giao dịch cũ — giao dịch chỉ trỏ id, không chép tên.
      const after = await tx.expenseCategory.update({
        where: { id: input.id },
        data: {
          name: input.name,
          isRecurring: input.isRecurring,
          defaultAmount: input.defaultAmount ?? null,
          sortOrder: input.sortOrder,
          isActive: input.isActive,
        },
        select: categorySelect,
      });
      await writeAuditLog(tx, {
        actorId: user.id,
        action: "EXPENSE_CATEGORY_UPDATE",
        entity: "ExpenseCategory",
        entityId: input.id,
        before,
        after,
      });
    });
    return { ok: true };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, reason: "NAME_TAKEN" };
    throw error;
  }
}

/**
 * Xóa hẳn chỉ khi CHƯA từng có giao dịch nào (kể cả đã xóa mềm) — danh mục tạo
 * nhầm. Đã dùng rồi thì ngưng dùng: báo cáo năm cũ vẫn phải hiện đúng tên.
 */
export async function deleteExpenseCategory(
  user: SessionUser,
  id: string,
): Promise<{ ok: true } | { ok: false; reason: "NOT_FOUND" | "IN_USE" }> {
  const before = await prisma.expenseCategory.findUnique({
    where: { id },
    select: categorySelect,
  });
  if (!before) return { ok: false, reason: "NOT_FOUND" };
  const used = await prisma.transaction.count({ where: { expenseCategoryId: id } });
  if (used > 0) return { ok: false, reason: "IN_USE" };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.expenseCategory.delete({ where: { id } });
      await writeAuditLog(tx, {
        actorId: user.id,
        action: "EXPENSE_CATEGORY_DELETE",
        entity: "ExpenseCategory",
        entityId: id,
        before,
      });
    });
    return { ok: true };
  } catch (error) {
    // Có người vừa ghi giao dịch vào danh mục này giữa lúc đếm và lúc xóa.
    if ((error as { code?: string })?.code === "P2003") {
      return { ok: false, reason: "IN_USE" };
    }
    throw error;
  }
}

/** "2026-10" → mốc đầu tháng & đầu tháng sau, theo UTC (khớp cách lưu ngày nhập tay). */
function monthRange(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return {
    year,
    monthNumber,
    from: new Date(Date.UTC(year, monthNumber - 1, 1)),
    to: new Date(Date.UTC(year, monthNumber, 1)),
  };
}

function previousMonth(month: string) {
  const { year, monthNumber } = monthRange(month);
  const date = new Date(Date.UTC(year, monthNumber - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Ngày D của tháng đích; tháng ngắn hơn thì lùi về ngày cuối (31/01 → 28/02). */
function dayInMonth(year: number, monthNumber: number, day: number) {
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return new Date(Date.UTC(year, monthNumber - 1, Math.min(day, lastDay)));
}

export type RecurringCandidate = {
  /** Khóa ổn định cho UI: mã GD tháng trước, hoặc "default:<id danh mục>". */
  key: string;
  categoryId: string;
  categoryName: string;
  amount: string;
  note: string | null;
  projectId: string | null;
  projectLabel: string | null;
  /** Ngày trong tháng sẽ ghi (giữ đúng ngày của tháng trước). */
  day: number;
  /** Lấy từ giao dịch nào của tháng trước; null = từ số mặc định của danh mục. */
  fromCode: string | null;
  /** Tick sẵn: danh mục cố định và tháng đích chưa có khoản cùng danh mục. */
  suggested: boolean;
  /** Tháng đích đã có giao dịch cùng danh mục — dễ ghi trùng, không tick sẵn. */
  existsInTarget: boolean;
};

/**
 * Danh sách để kế toán TICK chọn khoản cần chép sang tháng `month`:
 *  · mọi giao dịch Chi khác (nhập tay) của tháng trước — giữ số, nội dung, dự án;
 *  · cộng các danh mục cố định có số mặc định mà tháng trước chưa có dòng nào
 *    (tháng đầu dùng tính năng thì chưa có gì để chép).
 * Danh mục đã ngưng dùng bị loại — không ghi được giao dịch mới vào đó.
 */
export async function listRecurringCandidates(month: string): Promise<{
  month: string;
  sourceMonth: string;
  candidates: RecurringCandidate[];
}> {
  const sourceMonth = previousMonth(month);
  const source = monthRange(sourceMonth);
  const target = monthRange(month);

  const [lastMonthRows, targetRows, recurringCategories] = await Promise.all([
    prisma.transaction.findMany({
      where: {
        deletedAt: null,
        source: "MANUAL",
        type: "OPERATING_COST",
        txnDate: { gte: source.from, lt: source.to },
        expenseCategory: { is: { isActive: true } },
      },
      orderBy: [{ txnDate: "asc" }, { code: "asc" }],
      select: {
        code: true,
        amount: true,
        note: true,
        txnDate: true,
        project: { select: { id: true, code: true, name: true, deletedAt: true } },
        expenseCategory: { select: { id: true, name: true, isRecurring: true } },
      },
    }),
    prisma.transaction.findMany({
      where: {
        deletedAt: null,
        type: "OPERATING_COST",
        txnDate: { gte: target.from, lt: target.to },
      },
      select: { expenseCategoryId: true },
    }),
    prisma.expenseCategory.findMany({
      where: { isActive: true, isRecurring: true, defaultAmount: { not: null } },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, defaultAmount: true },
    }),
  ]);

  const inTarget = new Set(targetRows.map((row) => row.expenseCategoryId));
  const candidates: RecurringCandidate[] = [];

  for (const row of lastMonthRows) {
    const category = row.expenseCategory!;
    // Dự án đã xóa thì chép sang thành chi phí chung, không gắn dự án.
    const project = row.project && !row.project.deletedAt ? row.project : null;
    const existsInTarget = inTarget.has(category.id);
    candidates.push({
      key: row.code,
      categoryId: category.id,
      categoryName: category.name,
      amount: String(row.amount),
      note: row.note,
      projectId: project?.id ?? null,
      projectLabel: project ? `${project.code} — ${project.name}` : null,
      day: row.txnDate.getUTCDate(),
      fromCode: row.code,
      suggested: category.isRecurring && !existsInTarget,
      existsInTarget,
    });
  }

  const inSource = new Set(lastMonthRows.map((row) => row.expenseCategory!.id));
  for (const category of recurringCategories) {
    if (inSource.has(category.id)) continue;
    const existsInTarget = inTarget.has(category.id);
    candidates.push({
      key: `default:${category.id}`,
      categoryId: category.id,
      categoryName: category.name,
      amount: String(category.defaultAmount),
      note: null,
      projectId: null,
      projectLabel: null,
      day: 1,
      fromCode: null,
      suggested: !existsInTarget,
      existsInTarget,
    });
  }

  return { month, sourceMonth, candidates };
}

export type CopyRecurringItem = {
  expenseCategoryId: string;
  amount: string;
  note?: string;
  projectId?: string;
  day: number;
};

/**
 * Ghi các khoản kế toán đã tick sang tháng `month`: mỗi khoản một giao dịch Chi
 * khác trạng thái ĐANG CHỜ (tiền chưa chắc đã chi — trả thật thì chuyển Đã hoàn
 * tất). Tất cả trong một transaction: một khoản lỗi thì không khoản nào được ghi.
 */
export async function copyRecurringExpenses(
  user: SessionUser,
  month: string,
  items: CopyRecurringItem[],
): Promise<
  | { ok: true; created: { name: string; code: string }[] }
  | { ok: false; reason: "CATEGORY_NOT_FOUND" | "PROJECT_NOT_FOUND" }
> {
  const { year, monthNumber } = monthRange(month);
  const categoryIds = [...new Set(items.map((item) => item.expenseCategoryId))];
  const projectIds = [...new Set(items.flatMap((item) => (item.projectId ? [item.projectId] : [])))];

  const [categories, projectCount] = await Promise.all([
    prisma.expenseCategory.findMany({
      where: { id: { in: categoryIds }, isActive: true },
      select: { id: true, name: true },
    }),
    prisma.project.count({ where: { id: { in: projectIds }, deletedAt: null } }),
  ]);
  if (categories.length !== categoryIds.length) return { ok: false, reason: "CATEGORY_NOT_FOUND" };
  if (projectCount !== projectIds.length) return { ok: false, reason: "PROJECT_NOT_FOUND" };
  const nameOf = new Map(categories.map((category) => [category.id, category.name]));

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const created = await prisma.$transaction(async (tx) => {
        const done: { name: string; code: string }[] = [];
        for (const item of items) {
          const name = nameOf.get(item.expenseCategoryId)!;
          const transaction = await tx.transaction.create({
            data: {
              code: await nextTransactionCode(tx),
              projectId: item.projectId ?? null,
              direction: "EXPENSE",
              type: "OPERATING_COST",
              status: "PENDING",
              source: "MANUAL",
              amount: item.amount,
              txnDate: dayInMonth(year, monthNumber, item.day),
              note: item.note ?? `${name} tháng ${monthNumber}/${year}`,
              expenseCategoryId: item.expenseCategoryId,
              createdById: user.id,
            },
            select: {
              id: true,
              code: true,
              projectId: true,
              type: true,
              status: true,
              amount: true,
              txnDate: true,
              note: true,
              expenseCategoryId: true,
            },
          });
          await writeAuditLog(tx, {
            actorId: user.id,
            action: "RECURRING_EXPENSE_CREATE",
            entity: "Transaction",
            entityId: transaction.id,
            after: transaction,
          });
          done.push({ name, code: transaction.code });
        }
        return done;
      });
      return { ok: true, created };
    } catch (error) {
      // Trùng mã GD với người khác đang ghi cùng lúc — chạy lại cả lượt.
      if (!isUniqueViolation(error)) throw error;
    }
  }
  throw new Error("Không sinh được mã giao dịch sau nhiều lần thử");
}
