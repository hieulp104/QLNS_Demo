/**
 * Tầng truy vấn & nghiệp vụ module Tài chính (FN-01 → FN-07).
 *
 * Giao dịch là nguồn chân lý cho Báo cáo, Dashboard và số đã thanh toán của
 * Hợp đồng. Vì vậy mọi mutation đều soft delete và ghi AuditLog trong cùng
 * transaction DB.
 */

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/shared/prisma/prisma.service";
import { writeAuditLog } from "@/shared/audit/audit.service";
import { withDownloadUrls } from "@/shared/minio/file.service";
import type { SessionUser } from "@/common/permissions/permissions";
import type {
  CreateTransactionInput,
  TransactionFilter,
  UpdateTransactionInput,
} from "@/modules/finance/finance.schema";
import { materialTotalSql } from "@/modules/materials/materials.amount";
import { isAutoManaged } from "@/modules/finance/finance.schema";

const PAGE_SIZE = 30;

export const MATERIAL_SYNC_IDENTITY = {
  source: "MATERIAL_SYNC" as const,
  direction: "EXPENSE" as const,
  type: "MATERIAL_COST" as const,
  status: "COMPLETED" as const,
};

const MATERIAL_SYNC_NOTE = "Tự động đồng bộ chi phí vật tư";

export const CONTRACT_DEPOSIT_IDENTITY = {
  direction: "INCOME" as const,
  type: "CONTRACT_DEPOSIT" as const,
};

const transactionSelect = {
  id: true,
  code: true,
  projectId: true,
  contractId: true,
  direction: true,
  type: true,
  status: true,
  source: true,
  amount: true,
  txnDate: true,
  paymentMethod: true,
  note: true,
  createdAt: true,
  updatedAt: true,
  project: { select: { id: true, code: true, name: true } },
  contract: { select: { id: true, code: true, type: true } },
  createdBy: { select: { fullName: true } },
  // Giao dịch từ bảng lương: đủ để dẫn link về đúng tháng, không kèm tên người.
  payrollPeriod: { select: { year: true, month: true } },
  salaryAdvance: { select: { advanceDate: true } },
  expenseCategory: { select: { id: true, name: true } },
  files: {
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" as const },
    select: {
      id: true,
      fileName: true,
      objectKey: true,
      mimeType: true,
      sizeBytes: true,
      kind: true,
      createdAt: true,
      uploadedBy: { select: { fullName: true } },
    },
  },
} as const;

function nextUtcDay(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

function buildWhere(filter: TransactionFilter): Prisma.TransactionWhereInput {
  const q = filter.q?.trim();
  const txnDate =
    filter.from || filter.to
      ? {
          ...(filter.from
            ? { gte: new Date(`${filter.from}T00:00:00.000Z`) }
            : {}),
          ...(filter.to ? { lt: nextUtcDay(filter.to) } : {}),
        }
      : undefined;

  return {
    deletedAt: null,
    ...(filter.projectRelation === "UNASSIGNED"
      ? { projectId: null }
      : filter.projectId
        ? { projectId: filter.projectId }
        : {}),
    ...(filter.contractRelation === "UNASSIGNED"
      ? { contractId: null }
      : filter.contractId
        ? { contractId: filter.contractId }
        : {}),
    ...(filter.direction ? { direction: filter.direction } : {}),
    ...(filter.type ? { type: filter.type } : {}),
    ...(filter.expenseCategoryId
      ? { expenseCategoryId: filter.expenseCategoryId }
      : {}),
    ...(filter.status ? { status: filter.status } : {}),
    ...(txnDate ? { txnDate } : {}),
    ...(q
      ? {
          OR: [
            { code: { contains: q, mode: "insensitive" } },
            { note: { contains: q, mode: "insensitive" } },
            { paymentMethod: { contains: q, mode: "insensitive" } },
            {
              project: {
                is: { code: { contains: q, mode: "insensitive" } },
              },
            },
            {
              project: {
                is: { name: { contains: q, mode: "insensitive" } },
              },
            },
            {
              contract: {
                is: { code: { contains: q, mode: "insensitive" } },
              },
            },
            {
              expenseCategory: {
                is: { name: { contains: q, mode: "insensitive" } },
              },
            },
          ],
        }
      : {}),
  };
}

function asBigInt(value: unknown): bigint {
  return BigInt(String(value ?? 0));
}

/** Source of truth dùng chung cho mọi màn hiển thị số đã thanh toán hợp đồng. */
export async function paidAmountsByContract(contractIds: string[]) {
  const paidByContract = new Map<string, string>();
  if (contractIds.length === 0) return paidByContract;

  const sums = await prisma.transaction.groupBy({
    by: ["contractId"],
    where: {
      contractId: { in: contractIds },
      status: "COMPLETED",
      direction: "INCOME",
      deletedAt: null,
    },
    _sum: { amount: true },
  });
  for (const sum of sums) {
    if (sum.contractId) {
      paidByContract.set(sum.contractId, String(sum._sum.amount ?? 0));
    }
  }
  return paidByContract;
}

export type FinanceSummary = {
  incomeCompleted: string;
  expenseCompleted: string;
  netCompleted: string;
  incomePending: string;
  expensePending: string;
};

type SummaryRow = {
  direction: "INCOME" | "EXPENSE";
  status: "PENDING" | "COMPLETED";
  _sum: { amount: unknown };
};

function summarize(rows: SummaryRow[]): FinanceSummary {
  let incomeCompleted = BigInt(0);
  let expenseCompleted = BigInt(0);
  let incomePending = BigInt(0);
  let expensePending = BigInt(0);

  for (const row of rows) {
    const amount = asBigInt(row._sum.amount);
    if (row.direction === "INCOME" && row.status === "COMPLETED") {
      incomeCompleted += amount;
    } else if (row.direction === "EXPENSE" && row.status === "COMPLETED") {
      expenseCompleted += amount;
    } else if (row.direction === "INCOME") {
      incomePending += amount;
    } else {
      expensePending += amount;
    }
  }

  return {
    incomeCompleted: String(incomeCompleted),
    expenseCompleted: String(expenseCompleted),
    netCompleted: String(incomeCompleted - expenseCompleted),
    incomePending: String(incomePending),
    expensePending: String(expensePending),
  };
}

async function serializeTransactions(
  rows: Prisma.TransactionGetPayload<{ select: typeof transactionSelect }>[],
) {
  return Promise.all(
    rows.map(async (row) => {
      return {
        ...row,
        amount: String(row.amount),
        files: await withDownloadUrls(
          row.files.map((file) => ({
            ...file,
            sizeBytes: String(file.sizeBytes),
          })),
        ),
      };
    }),
  );
}

/**
 * FN-01 — danh sách có lọc + phân trang ở DB. Tổng quan dùng groupBy trên toàn
 * bộ tập đã lọc, không cộng từ riêng trang hiện tại nên số liệu luôn chính xác.
 */
export async function listTransactions(filter: TransactionFilter) {
  const where = buildWhere(filter);
  const page = Math.max(1, filter.page);
  const [total, rows, grouped] = await Promise.all([
    prisma.transaction.count({ where }),
    prisma.transaction.findMany({
      where,
      orderBy: [{ txnDate: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: transactionSelect,
    }),
    prisma.transaction.groupBy({
      by: ["direction", "status"],
      where,
      _sum: { amount: true },
    }),
  ]);

  const items = await serializeTransactions(rows);

  return {
    items,
    total,
    page,
    pageSize: PAGE_SIZE,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    summary: summarize(grouped),
  };
}

export type FinanceTransactionItem = Awaited<
  ReturnType<typeof listTransactions>
>["items"][number];

/**
 * Ledger gọn trong Project detail: chỉ giao dịch của đúng Project và không gắn
 * Contract. Query trực tiếp tại DB, không lấy toàn bộ Finance rồi lọc client-side.
 */
export async function transactionsWithoutContractByProject(projectId: string) {
  const rows = await prisma.transaction.findMany({
    where: {
      projectId,
      contractId: null,
      deletedAt: null,
      project: { is: { deletedAt: null } },
    },
    orderBy: [{ txnDate: "desc" }, { createdAt: "desc" }],
    select: transactionSelect,
  });
  return serializeTransactions(rows);
}

/**
 * Giao dịch của nhiều hợp đồng, nạp trong một truy vấn và nhóm lại cho UI dự án.
 * Chỉ lấy relation contractId chính xác; giao dịch cấp dự án/công ty không lọt vào.
 */
export async function transactionsByContract(contractIds: string[]) {
  const byContract = new Map<string, FinanceTransactionItem[]>();
  if (contractIds.length === 0) return byContract;

  const rows = await prisma.transaction.findMany({
    where: {
      contractId: { in: contractIds },
      deletedAt: null,
    },
    orderBy: [{ txnDate: "desc" }, { createdAt: "desc" }],
    select: transactionSelect,
  });
  const transactions = await serializeTransactions(rows);

  for (const transaction of transactions) {
    if (!transaction.contractId) continue;
    const items = byContract.get(transaction.contractId) ?? [];
    items.push(transaction);
    byContract.set(transaction.contractId, items);
  }

  return byContract;
}

/**
 * Góc nhìn tổng hợp theo Project. Project được count/phân trang trực tiếp ở DB;
 * Contract và Transaction của riêng trang hiện tại được nạp theo lô để tránh N+1.
 */
export async function listProjectFinance(filter: TransactionFilter) {
  const q = filter.q?.trim();
  const transactionFiltersActive = Boolean(
    filter.contractId ||
      filter.contractRelation ||
      filter.direction ||
      filter.type ||
      filter.expenseCategoryId ||
      filter.status ||
      filter.from ||
      filter.to,
  );
  const transactionFilterWhere = buildWhere({
    ...filter,
    q: undefined,
    projectId: undefined,
    projectRelation: undefined,
  });
  const searchTransactionWhere = buildWhere({
    ...filter,
    projectId: undefined,
    projectRelation: undefined,
  });
  const projectWhere: Prisma.ProjectWhereInput = {
    deletedAt: null,
    ...(filter.projectRelation === "UNASSIGNED"
      ? { id: { in: [] } }
      : filter.projectId
        ? { id: filter.projectId }
        : {}),
    ...(transactionFiltersActive
      ? { transactions: { some: transactionFilterWhere } }
      : {}),
    ...(q
      ? {
          OR: [
            { code: { contains: q, mode: "insensitive" } },
            { name: { contains: q, mode: "insensitive" } },
            {
              contracts: {
                some: {
                  deletedAt: null,
                  code: { contains: q, mode: "insensitive" },
                },
              },
            },
            { transactions: { some: searchTransactionWhere } },
          ],
        }
      : {}),
  };
  const page = Math.max(1, filter.page);
  const [total, projectRows] = await Promise.all([
    prisma.project.count({ where: projectWhere }),
    prisma.project.findMany({
      where: projectWhere,
      orderBy: [{ code: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: { id: true, code: true, name: true },
    }),
  ]);

  const projectIds = projectRows.map((project) => project.id);
  const transactionWhere: Prisma.TransactionWhereInput = {
    AND: [
      buildWhere({
        ...filter,
        projectId: undefined,
        projectRelation: undefined,
      }),
      { projectId: { in: projectIds } },
    ],
  };
  const allProjectTransactionWhere: Prisma.TransactionWhereInput = {
    AND: [
      buildWhere({
        ...filter,
        projectId: undefined,
        projectRelation: undefined,
      }),
      { project: { is: projectWhere } },
    ],
  };
  const [contractRows, transactionRows, pageGrouped, grouped] =
    await Promise.all([
      prisma.contract.findMany({
        where: {
          deletedAt: null,
          projectId: { in: projectIds },
          ...(filter.contractId ? { id: filter.contractId } : {}),
        },
        orderBy: [{ signedDate: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          code: true,
          projectId: true,
          value: true,
          signedDate: true,
          status: true,
        },
      }),
      prisma.transaction.findMany({
        where: transactionWhere,
        orderBy: [{ txnDate: "desc" }, { createdAt: "desc" }],
        select: transactionSelect,
      }),
      prisma.transaction.groupBy({
        by: ["projectId", "direction", "status"],
        where: transactionWhere,
        _sum: { amount: true },
      }),
      prisma.transaction.groupBy({
        by: ["direction", "status"],
        where: allProjectTransactionWhere,
        _sum: { amount: true },
      }),
    ]);

  const contractIds = contractRows.map((contract) => contract.id);
  const [transactions, paidByContract] = await Promise.all([
    serializeTransactions(transactionRows),
    paidAmountsByContract(contractIds),
  ]);
  const transactionsByProject = new Map<string, FinanceTransactionItem[]>();
  const transactionsByContract = new Map<string, FinanceTransactionItem[]>();
  for (const transaction of transactions) {
    if (transaction.projectId) {
      const rows = transactionsByProject.get(transaction.projectId) ?? [];
      rows.push(transaction);
      transactionsByProject.set(transaction.projectId, rows);
    }
    if (transaction.contractId) {
      const rows = transactionsByContract.get(transaction.contractId) ?? [];
      rows.push(transaction);
      transactionsByContract.set(transaction.contractId, rows);
    }
  }

  const contractsByProject = new Map<string, typeof contractRows>();
  for (const contract of contractRows) {
    const rows = contractsByProject.get(contract.projectId) ?? [];
    rows.push(contract);
    contractsByProject.set(contract.projectId, rows);
  }
  const summaryByProject = new Map<string, SummaryRow[]>();
  for (const row of pageGrouped) {
    if (!row.projectId) continue;
    const rows = summaryByProject.get(row.projectId) ?? [];
    rows.push(row);
    summaryByProject.set(row.projectId, rows);
  }

  const projects = projectRows.map((project) => {
    const projectContracts = contractsByProject.get(project.id) ?? [];
    const projectTransactions = transactionsByProject.get(project.id) ?? [];
    const contractValue = projectContracts.reduce(
      (totalValue, contract) => totalValue + asBigInt(contract.value),
      BigInt(0),
    );
    return {
      ...project,
      contractValue: String(contractValue),
      summary: summarize(summaryByProject.get(project.id) ?? []),
      contracts: projectContracts.map((contract) => ({
        ...contract,
        value: String(contract.value),
        paidAmount: paidByContract.get(contract.id) ?? "0",
        transactions: transactionsByContract.get(contract.id) ?? [],
      })),
      projectTransactions: projectTransactions.filter(
        (transaction) => transaction.contractId === null,
      ),
    };
  });

  return {
    projects,
    total,
    page,
    pageSize: PAGE_SIZE,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    summary: summarize(grouped),
  };
}

/** Dự án và hợp đồng rút gọn cho bộ lọc/form, nạp song song tại page. */
export async function listFinanceOptions() {
  const [projects, contracts, expenseCategories] = await Promise.all([
    prisma.project.findMany({
      where: { deletedAt: null },
      orderBy: { code: "desc" },
      select: { id: true, code: true, name: true },
    }),
    prisma.contract.findMany({
      where: {
        deletedAt: null,
        project: { is: { deletedAt: null } },
      },
      orderBy: { code: "desc" },
      select: { id: true, code: true, projectId: true, type: true },
    }),
    // Cả danh mục đã ngưng: form sửa giao dịch cũ vẫn phải hiện đúng tên.
    prisma.expenseCategory.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, isActive: true, defaultAmount: true },
    }),
  ]);

  return {
    projects,
    contracts,
    // Decimal không qua được ranh giới server → client, đổi sang number.
    expenseCategories: expenseCategories.map((c) => ({
      ...c,
      defaultAmount: c.defaultAmount == null ? null : Number(c.defaultAmount),
    })),
  };
}

/**
 * Danh mục phải tồn tại và đang dùng. Ngoại lệ: giao dịch cũ giữ nguyên danh
 * mục đã ngưng thì vẫn lưu được — ngưng danh mục không được khóa việc sửa số tiền.
 */
async function validateExpenseCategory(
  expenseCategoryId: string | undefined,
  keepCategoryId?: string | null,
): Promise<boolean> {
  if (!expenseCategoryId) return true;
  const category = await prisma.expenseCategory.findUnique({
    where: { id: expenseCategoryId },
    select: { isActive: true },
  });
  if (!category) return false;
  return category.isActive || expenseCategoryId === keepCategoryId;
}

/** Dùng trong actions/file: bản ghi đang hoạt động, không trả số tiền. */
export function getTransactionOwner(id: string) {
  return prisma.transaction.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, code: true, projectId: true, source: true },
  });
}

export type ReferenceError =
  | "PROJECT_NOT_FOUND"
  | "CONTRACT_NOT_FOUND"
  | "CONTRACT_PROJECT_MISMATCH"
  | "CATEGORY_NOT_FOUND";

type ReferenceResult =
  | {
      ok: true;
      projectId: string | null;
    }
  | {
      ok: false;
      reason: ReferenceError;
    };

/**
 * Ba trạng thái hợp lệ: cấp công ty, cấp dự án, cấp hợp đồng. Khi có hợp đồng,
 * projectId được resolve từ chính hợp đồng; projectId khác giá trị đó bị chặn.
 */
async function validateReferences(
  projectId?: string,
  contractId?: string,
): Promise<ReferenceResult> {
  if (contractId) {
    const contract = await prisma.contract.findFirst({
      where: {
        id: contractId,
        deletedAt: null,
        project: { is: { deletedAt: null } },
      },
      select: { projectId: true },
    });
    if (!contract) return { ok: false, reason: "CONTRACT_NOT_FOUND" };
    if (projectId && projectId !== contract.projectId) {
      return { ok: false, reason: "CONTRACT_PROJECT_MISMATCH" };
    }
    return {
      ok: true,
      projectId: contract.projectId,
    };
  }

  if (!projectId) {
    return { ok: true, projectId: null };
  }
  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: { id: true },
  });
  return project
    ? { ok: true, projectId: project.id }
    : { ok: false, reason: "PROJECT_NOT_FOUND" };
}

/** FN-07 — mã kế tiếp dạng GD-{năm}-{stt 4 số}; unique index + retry chống race. */
export async function nextTransactionCode(
  db: Pick<Prisma.TransactionClient, "transaction"> = prisma,
): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `GD-${year}-`;
  const last = await db.transaction.findFirst({
    where: { code: { startsWith: prefix } },
    orderBy: { code: "desc" },
    select: { code: true },
  });
  const lastNumber = last ? Number(last.code.slice(prefix.length)) : 0;
  return `${prefix}${String(lastNumber + 1).padStart(4, "0")}`;
}

/** Tháng nghiệp vụ theo giờ VN của một cột timestamp. Cột lưu UTC nên phải đổi
 * múi giờ trước khi cắt tháng, không thì bản ghi 0–7h sáng giờ VN rơi sang tháng trước. */
function vnMonthKeySql(column: Prisma.Sql) {
  return Prisma.sql`to_char(${column} AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM')`;
}

/** "2025-12" → "tháng 12/2025" */
function monthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-");
  return `tháng ${Number(month)}/${year}`;
}

function materialSyncNote(monthKey: string) {
  return `${MATERIAL_SYNC_NOTE} ${monthLabel(monthKey)}`;
}

type MaterialMonthBucket = {
  monthKey: string;
  amount: Prisma.Decimal;
  latestMaterialDate: Date;
};

type SyncRowMonth = { id: string; monthKey: string };

const materialSyncAuditSelect = {
  id: true,
  code: true,
  projectId: true,
  contractId: true,
  direction: true,
  type: true,
  status: true,
  source: true,
  amount: true,
  txnDate: true,
  deletedAt: true,
} as const;

export type MaterialSyncAction = {
  action: "CREATE" | "UPDATE" | "RESTORE" | "SOFT_DELETE";
  monthKey: string;
  id: string;
};

/**
 * Material là source of truth. Hàm này bắt buộc nhận TransactionClient để
 * Material mutation và Finance aggregate cùng commit hoặc cùng rollback.
 *
 * ⚠ Mỗi dự án có một giao dịch MATERIAL_SYNC cho MỖI THÁNG có vật tư, KHÔNG
 * phải một giao dịch cho cả dự án. Một giao dịch chỉ đeo được một ngày, nên
 * gộp cả dự án lại là dồn tiền của mọi tháng vào tháng của dòng vật tư mới
 * nhất. Lỗi này từng làm 85 triệu chi phí năm 2025 bị tính vào báo cáo 2026.
 */
export async function syncMaterialExpenseTransaction(
  tx: Prisma.TransactionClient,
  projectId: string,
  actorId: string | null,
): Promise<MaterialSyncAction[]> {
  const buckets = await tx.$queryRaw<MaterialMonthBucket[]>(Prisma.sql`
    SELECT
      ${vnMonthKeySql(Prisma.sql`"material_date"`)} AS "monthKey",
      ROUND(COALESCE(SUM(${materialTotalSql()}), 0), 0) AS "amount",
      MAX("material_date") AS "latestMaterialDate"
    FROM "materials"
    WHERE "project_id" = ${projectId}
    GROUP BY 1
  `);

  /** Tháng tổng tiền bằng 0 coi như không có, để không đẻ ra giao dịch rỗng. */
  const wanted = new Map<string, { amount: Prisma.Decimal; txnDate: Date }>();
  for (const bucket of buckets) {
    const amount = new Prisma.Decimal(bucket.amount);
    if (amount.gt(0)) {
      wanted.set(bucket.monthKey, { amount, txnDate: bucket.latestMaterialDate });
    }
  }

  const activeRows = await tx.$queryRaw<SyncRowMonth[]>(Prisma.sql`
    SELECT "id", ${vnMonthKeySql(Prisma.sql`"txn_date"`)} AS "monthKey"
    FROM "transactions"
    WHERE "project_id" = ${projectId}
      AND "source" = 'MATERIAL_SYNC'
      AND "deleted_at" IS NULL
  `);
  const active = new Map<string, string>();
  for (const row of activeRows) {
    if (active.has(row.monthKey)) {
      throw new Error(
        `Project ${projectId} có nhiều giao dịch MATERIAL_SYNC đang hoạt động cho ${monthLabel(row.monthKey)}`,
      );
    }
    active.set(row.monthKey, row.id);
  }

  const done: MaterialSyncAction[] = [];

  /**
   * 1. Tháng không còn vật tư → xóa mềm. Phải chạy TRƯỚC bước 2 để không đụng
   * partial unique index khi một tháng vừa bị dọn.
   */
  for (const [monthKey, id] of active) {
    if (wanted.has(monthKey)) continue;
    const before = await tx.transaction.findUniqueOrThrow({
      where: { id },
      select: materialSyncAuditSelect,
    });
    const after = await tx.transaction.update({
      where: { id },
      data: { deletedAt: new Date() },
      select: materialSyncAuditSelect,
    });
    await writeAuditLog(tx, {
      actorId,
      action: "MATERIAL_FINANCE_SYNC_DELETE",
      entity: "Transaction",
      entityId: id,
      before,
      after,
    });
    done.push({ action: "SOFT_DELETE", monthKey, id });
  }

  // 2. Mỗi tháng có vật tư → đúng một giao dịch: cập nhật, khôi phục, hoặc tạo mới.
  for (const [monthKey, bucket] of wanted) {
    const invariantData = {
      projectId,
      contractId: null,
      ...MATERIAL_SYNC_IDENTITY,
      amount: bucket.amount,
      txnDate: bucket.txnDate,
      paymentMethod: null,
      note: materialSyncNote(monthKey),
    };

    const activeId = active.get(monthKey);
    if (activeId) {
      const before = await tx.transaction.findUniqueOrThrow({
        where: { id: activeId },
        select: materialSyncAuditSelect,
      });
      const after = await tx.transaction.update({
        where: { id: activeId },
        data: invariantData,
        select: materialSyncAuditSelect,
      });
      await writeAuditLog(tx, {
        actorId,
        action: "MATERIAL_FINANCE_SYNC_UPDATE",
        entity: "Transaction",
        entityId: activeId,
        before,
        after,
      });
      done.push({ action: "UPDATE", monthKey, id: activeId });
      continue;
    }

    /** Dùng lại giao dịch đã xóa mềm của ĐÚNG tháng đó, để giữ nguyên mã GD. */
    const [revivable] = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT "id" FROM "transactions"
      WHERE "project_id" = ${projectId}
        AND "source" = 'MATERIAL_SYNC'
        AND "deleted_at" IS NOT NULL
        AND ${vnMonthKeySql(Prisma.sql`"txn_date"`)} = ${monthKey}
      ORDER BY "deleted_at" DESC
      LIMIT 1
    `);

    if (revivable) {
      const before = await tx.transaction.findUniqueOrThrow({
        where: { id: revivable.id },
        select: materialSyncAuditSelect,
      });
      const after = await tx.transaction.update({
        where: { id: revivable.id },
        data: { ...invariantData, deletedAt: null },
        select: materialSyncAuditSelect,
      });
      await writeAuditLog(tx, {
        actorId,
        action: "MATERIAL_FINANCE_SYNC_RESTORE",
        entity: "Transaction",
        entityId: revivable.id,
        before,
        after,
      });
      done.push({ action: "RESTORE", monthKey, id: revivable.id });
      continue;
    }

    const created = await tx.transaction.create({
      data: {
        code: await nextTransactionCode(tx),
        ...invariantData,
        createdById: actorId,
      },
      select: materialSyncAuditSelect,
    });
    await writeAuditLog(tx, {
      actorId,
      action: "MATERIAL_FINANCE_SYNC_CREATE",
      entity: "Transaction",
      entityId: created.id,
      after: created,
    });
    done.push({ action: "CREATE", monthKey, id: created.id });
  }

  return done;
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string })?.code === "P2002";
}

export async function createTransaction(
  user: SessionUser,
  input: CreateTransactionInput,
): Promise<
  | { ok: true; id: string; code: string; projectId: string | null }
  | { ok: false; reason: ReferenceError }
> {
  const [references, categoryOk] = await Promise.all([
    validateReferences(input.projectId, input.contractId),
    validateExpenseCategory(input.expenseCategoryId),
  ]);
  if (!references.ok) return references;
  if (!categoryOk) return { ok: false, reason: "CATEGORY_NOT_FOUND" };

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = await nextTransactionCode();
    try {
      const created = await prisma.$transaction(async (tx) => {
        const transaction = await tx.transaction.create({
          data: {
            code,
            projectId: references.projectId,
            contractId: input.contractId ?? null,
            direction: input.direction,
            type: input.type,
            status: input.status,
            source: "MANUAL",
            amount: input.amount,
            txnDate: input.txnDate,
            paymentMethod: input.paymentMethod ?? null,
            note: input.note ?? null,
            expenseCategoryId: input.expenseCategoryId ?? null,
            createdById: user.id,
          },
          select: {
            id: true,
            code: true,
            projectId: true,
            contractId: true,
            direction: true,
            type: true,
            status: true,
            amount: true,
            txnDate: true,
            paymentMethod: true,
            note: true,
            expenseCategoryId: true,
          },
        });

        await writeAuditLog(tx, {
          actorId: user.id,
          action: "TXN_CREATE",
          entity: "Transaction",
          entityId: transaction.id,
          after: transaction,
        });

        // Khách chốt 10/10/2026: ghi Chi khác với số khác số mặc định của danh
        // mục thì số mặc định đổi theo — form đã báo trước cho người nhập. Danh
        // mục không đặt số mặc định (khoản không cố định) thì giữ nguyên trống.
        if (input.type === "OPERATING_COST" && input.expenseCategoryId) {
          const category = await tx.expenseCategory.findUnique({
            where: { id: input.expenseCategoryId },
            select: { id: true, name: true, defaultAmount: true },
          });
          const amount = Number(input.amount);
          if (category?.defaultAmount != null && Number(category.defaultAmount) !== amount) {
            await tx.expenseCategory.update({
              where: { id: category.id },
              data: { defaultAmount: amount },
            });
            await writeAuditLog(tx, {
              actorId: user.id,
              action: "EXPENSE_CATEGORY_UPDATE",
              entity: "ExpenseCategory",
              entityId: category.id,
              before: { defaultAmount: Number(category.defaultAmount) },
              after: { defaultAmount: amount, fromTransaction: transaction.code },
            });
          }
        }

        return transaction;
      });
      return {
        ok: true,
        id: created.id,
        code: created.code,
        projectId: created.projectId,
      };
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
  }

  throw new Error("Không sinh được mã giao dịch sau nhiều lần thử");
}

export async function updateTransaction(
  user: SessionUser,
  input: UpdateTransactionInput,
): Promise<
  | { ok: true; projectId: string | null }
  | { ok: false; reason: "NOT_FOUND" | "AUTO_MANAGED" | ReferenceError }
> {
  const [before, references] = await Promise.all([
    prisma.transaction.findFirst({
      where: { id: input.id, deletedAt: null },
      select: {
        id: true,
        code: true,
        projectId: true,
        contractId: true,
        direction: true,
        type: true,
        status: true,
        source: true,
        amount: true,
        txnDate: true,
        paymentMethod: true,
        note: true,
        expenseCategoryId: true,
      },
    }),
    validateReferences(input.projectId, input.contractId),
  ]);

  if (!before) return { ok: false, reason: "NOT_FOUND" };
  if (isAutoManaged(before.source)) {
    return { ok: false, reason: "AUTO_MANAGED" as const };
  }
  if (!references.ok) return references;
  if (!(await validateExpenseCategory(input.expenseCategoryId, before.expenseCategoryId))) {
    return { ok: false, reason: "CATEGORY_NOT_FOUND" };
  }

  await prisma.$transaction(async (tx) => {
    const after = await tx.transaction.update({
      where: { id: input.id },
      data: {
        projectId: references.projectId,
        contractId: input.contractId ?? null,
        direction: input.direction,
        type: input.type,
        status: input.status,
        amount: input.amount,
        txnDate: input.txnDate,
        paymentMethod: input.paymentMethod ?? null,
        note: input.note ?? null,
        expenseCategoryId: input.expenseCategoryId ?? null,
      },
      select: {
        id: true,
        code: true,
        projectId: true,
        contractId: true,
        direction: true,
        type: true,
        status: true,
        amount: true,
        txnDate: true,
        paymentMethod: true,
        note: true,
        expenseCategoryId: true,
      },
    });

    await writeAuditLog(tx, {
      actorId: user.id,
      action: "TXN_UPDATE",
      entity: "Transaction",
      entityId: input.id,
      before,
      after,
    });
  });

  return { ok: true, projectId: references.projectId };
}

/** FN-03 — soft delete để báo cáo cũ không mất dấu và audit vẫn đối chiếu được. */
export async function softDeleteTransaction(
  user: SessionUser,
  id: string,
): Promise<
  | { ok: true; projectId: string | null }
  | { ok: false; reason: "NOT_FOUND" | "AUTO_MANAGED" }
> {
  const before = await prisma.transaction.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      code: true,
      projectId: true,
      contractId: true,
      direction: true,
      type: true,
      status: true,
      source: true,
      amount: true,
      txnDate: true,
      paymentMethod: true,
      note: true,
      expenseCategoryId: true,
    },
  });
  if (!before) return { ok: false, reason: "NOT_FOUND" };
  if (isAutoManaged(before.source)) {
    return { ok: false, reason: "AUTO_MANAGED" as const };
  }

  await prisma.$transaction(async (tx) => {
    await tx.transaction.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await writeAuditLog(tx, {
      actorId: user.id,
      action: "TXN_DELETE",
      entity: "Transaction",
      entityId: id,
      before,
    });
  });

  return { ok: true, projectId: before.projectId };
}
