/**
 * Tầng truy vấn & nghiệp vụ module Hợp đồng (CT-01 → CT-07).
 *
 * Hai quy tắc tiền (CT-04 / CT-05):
 *  - `value` / `depositAmount` / `paidAmount` bị LOẠI BỎ ở tầng server cho người
 *    không có finance.view (Kinh doanh được add vẫn quản được hợp đồng nhưng
 *    không thấy số) — xem `stripContractMoney()`.
 *  - `paidAmount` KHÔNG lưu cứng: tính từ tổng Transaction trạng thái COMPLETED
 *    chiều INCOME của hợp đồng (quyết định schema mục 6 CLAUDE.md).
 */

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/shared/prisma/prisma.service";
import { writeAuditLog } from "@/shared/audit/audit.service";
import { canSeeMoney, type SessionUser } from "@/common/permissions/permissions";
import type {
  CreateContractInput,
  UpdateContractInput,
} from "@/modules/contracts/contracts.schema";
import {
  CONTRACT_DEPOSIT_IDENTITY,
  nextTransactionCode,
  paidAmountsByContract,
  transactionsByContract,
} from "@/modules/finance/finance.service";

const contractSelect = {
  id: true,
  code: true,
  projectId: true,
  type: true,
  status: true,
  value: true,
  depositAmount: true,
  signedDate: true,
  note: true,
  createdAt: true,
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
      caption: true,
      createdAt: true,
      uploadedBy: { select: { fullName: true } },
    },
  },
} as const;

/**
 * Tổng giá trị Contract đang hoạt động theo Project. Theo convention hiện tại,
 * mọi status đều được tính và chỉ Contract đã soft-delete bị loại.
 */
export async function contractValueTotalsByProject(projectIds: string[]) {
  const totals = new Map<string, string>();
  if (projectIds.length === 0) return totals;

  const rows = await prisma.contract.groupBy({
    by: ["projectId"],
    where: { projectId: { in: projectIds }, deletedAt: null },
    _sum: { value: true },
  });
  for (const row of rows) {
    totals.set(row.projectId, String(row._sum.value ?? 0));
  }
  return totals;
}

/** Kiểu một hợp đồng trả về client — suy từ chính hàm listContractsByProject. */
export type ContractItem = Awaited<
  ReturnType<typeof listContractsByProject>
>[number];

/**
 * Loại trường tiền cho người không có finance.view; Decimal → string cho client.
 */
function stripContractMoney<
  T extends { value: unknown; depositAmount: unknown },
>(row: T, paidAmount: string, user: SessionUser) {
  const canSee = canSeeMoney(user);
  return {
    ...row,
    value: canSee && row.value != null ? String(row.value) : null,
    depositAmount:
      canSee && row.depositAmount != null ? String(row.depositAmount) : null,
    /** CT-05 — tổng đã thu (Transaction COMPLETED, chiều INCOME). */
    paidAmount: canSee ? paidAmount : null,
  };
}

/**
 * CT-01 / CT-05 — danh sách hợp đồng của một dự án, kèm số đã thanh toán và
 * giao dịch theo đúng contractId. Cả hai đều nạp theo lô, không N+1.
 */
export async function listContractsByProject(user: SessionUser, projectId: string) {
  const rows = await prisma.contract.findMany({
    where: { projectId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: contractSelect,
  });

  const contractIds = rows.map((row) => row.id);
  const canSee = canSeeMoney(user);
  const [paidByContract, transactions] = canSee
    ? await Promise.all([
        paidAmountsByContract(contractIds),
        transactionsByContract(contractIds),
      ])
    : [new Map<string, string>(), new Map()];

  return rows.map((r) => ({
    ...stripContractMoney(r, paidByContract.get(r.id) ?? "0", user),
    transactions: canSee ? (transactions.get(r.id) ?? []) : [],
    files: r.files.map((f) => ({ ...f, sizeBytes: String(f.sizeBytes) })),
  }));
}

/** Một hợp đồng (không lọc theo scope — người gọi tự kiểm quyền theo dự án). */
export function getContract(id: string) {
  return prisma.contract.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, code: true, projectId: true },
  });
}

/** CT-07 — mã kế tiếp dạng HD-{năm}-{stt}, đếm theo năm hiện tại. */
async function nextContractCode(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `HD-${year}-`;
  const last = await prisma.contract.findFirst({
    where: { code: { startsWith: prefix } },
    orderBy: { code: "desc" },
    select: { code: true },
  });
  const lastNumber = last ? Number(last.code.slice(prefix.length)) : 0;
  return `${prefix}${String(lastNumber + 1).padStart(3, "0")}`;
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string })?.code === "P2002";
}

const depositTransactionSelect = {
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
  deletedAt: true,
} as const;

type DepositSyncInput = Pick<
  CreateContractInput,
  "depositAmount" | "depositStatus" | "depositPaidDate" | "signedDate"
>;

async function createContractDeposit(
  tx: Prisma.TransactionClient,
  user: SessionUser,
  contract: {
    id: string;
    code: string;
    projectId: string;
    createdAt: Date;
  },
  input: DepositSyncInput,
) {
  const amount = input.depositAmount ?? "0";
  const hasDeposit = BigInt(amount) > BigInt(0);
  if (!hasDeposit) return;

  const txnDate =
    input.depositStatus === "COMPLETED"
      ? (input.depositPaidDate ?? input.signedDate)
      : (input.signedDate ?? contract.createdAt);
  if (!txnDate) throw new Error("Thiếu ngày đóng cọc");

  const created = await tx.transaction.create({
    data: {
      code: await nextTransactionCode(tx),
      projectId: contract.projectId,
      contractId: contract.id,
      ...CONTRACT_DEPOSIT_IDENTITY,
      status: input.depositStatus,
      amount,
      txnDate,
      note: `Tiền cọc hợp đồng ${contract.code}`,
      createdById: user.id,
    },
    select: depositTransactionSelect,
  });
  await writeAuditLog(tx, {
    actorId: user.id,
    action: "TXN_CREATE",
    entity: "Transaction",
    entityId: created.id,
    after: created,
  });
}

/**
 * CT-02 — thêm hợp đồng. Mã tự sinh, retry khi trùng (giống PJ-03).
 * `keepMoney=false` (người tạo không thấy tiền) → `value` ghi 0 chờ Kế toán
 * điền — cột NOT NULL theo schema đã duyệt, không nhận tiền từ người không
 * được thấy tiền.
 */
export async function createContract(
  user: SessionUser,
  input: CreateContractInput,
  keepMoney: boolean,
): Promise<
  { ok: true; id: string; code: string } | { ok: false; reason: "PROJECT_NOT_FOUND" }
> {
  const project = await prisma.project.findFirst({
    where: { id: input.projectId, deletedAt: null },
    select: { id: true },
  });
  if (!project) return { ok: false, reason: "PROJECT_NOT_FOUND" };

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = await nextContractCode();
    try {
      const created = await prisma.$transaction(async (tx) => {
        const contract = await tx.contract.create({
          data: {
            code,
            projectId: input.projectId,
            type: input.type,
            value: keepMoney ? (input.value ?? "0") : "0",
            depositAmount: keepMoney ? (input.depositAmount ?? null) : null,
            signedDate: input.signedDate ?? null,
            note: input.note ?? null,
          },
          select: {
            id: true,
            code: true,
            projectId: true,
            createdAt: true,
          },
        });

        if (keepMoney) await createContractDeposit(tx, user, contract, input);

        await writeAuditLog(tx, {
          actorId: user.id,
          action: "CONTRACT_CREATE",
          entity: "Contract",
          entityId: contract.id,
          after: {
            code: contract.code,
            projectId: input.projectId,
            type: input.type,
          },
        });

        return contract;
      });
      return { ok: true, id: created.id, code: created.code };
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // Trùng mã HD → thử số kế tiếp.
    }
  }
  throw new Error("Không sinh được mã hợp đồng sau nhiều lần thử");
}

/** CT-03 — sửa. `keepMoney=false` thì giữ nguyên trường tiền hiện có. */
export async function updateContract(
  user: SessionUser,
  input: UpdateContractInput,
  keepMoney: boolean,
): Promise<{ ok: true } | { ok: false; reason: "NOT_FOUND" }> {
  const before = await prisma.contract.findFirst({
    where: { id: input.id, deletedAt: null },
    select: { id: true, code: true, type: true, status: true, note: true },
  });
  if (!before) return { ok: false, reason: "NOT_FOUND" };

  await prisma.$transaction(async (tx) => {
    await tx.contract.update({
      where: { id: input.id },
      data: {
        type: input.type,
        status: input.status,
        signedDate: input.signedDate ?? null,
        note: input.note ?? null,
        // Tiền cọc chỉ khai báo khi tạo; edit giữ nguyên depositAmount và giao dịch cọc.
        ...(keepMoney ? { value: input.value ?? "0" } : {}),
      },
    });

    await writeAuditLog(tx, {
      actorId: user.id,
      action: "CONTRACT_UPDATE",
      entity: "Contract",
      entityId: input.id,
      before,
      after: { type: input.type, status: input.status },
    });
  });

  return { ok: true };
}

/**
 * CT-03 — xóa mềm. Chặn khi còn giao dịch chưa xóa gắn vào hợp đồng —
 * xóa hợp đồng mà tiền đã thu vẫn trỏ vào sẽ làm lệch báo cáo.
 */
export async function softDeleteContract(
  user: SessionUser,
  id: string,
): Promise<{ ok: true } | { ok: false; reason: "NOT_FOUND" | "HAS_TRANSACTIONS" }> {
  const contract = await prisma.contract.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      code: true,
      _count: { select: { transactions: { where: { deletedAt: null } } } },
    },
  });
  if (!contract) return { ok: false, reason: "NOT_FOUND" };
  if (contract._count.transactions > 0) {
    return { ok: false, reason: "HAS_TRANSACTIONS" };
  }

  await prisma.$transaction(async (tx) => {
    await tx.contract.update({ where: { id }, data: { deletedAt: new Date() } });
    await writeAuditLog(tx, {
      actorId: user.id,
      action: "CONTRACT_DELETE",
      entity: "Contract",
      entityId: id,
      before: { code: contract.code },
    });
  });

  return { ok: true };
}
