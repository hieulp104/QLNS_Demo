"use server";

import { revalidatePath } from "next/cache";
import { fail, ok, type ActionResult } from "@/common/filters/error";
import { can } from "@/common/permissions/permissions";
import { requireUser } from "@/modules/auth/auth.service";
import {
  createExpenseCategorySchema,
  expenseCategoryIdSchema,
  copyRecurringSchema,
  recurringCandidatesSchema,
  updateExpenseCategorySchema,
  createTransactionSchema,
  registerTransactionFileSchema,
  transactionIdSchema,
  transactionUploadTicketSchema,
  updateTransactionSchema,
  isAutoManaged,
} from "@/modules/finance/finance.schema";
import {
  createTransaction,
  getTransactionOwner,
  softDeleteTransaction,
  updateTransaction,
  type ReferenceError,
} from "@/modules/finance/finance.service";
import {
  createExpenseCategory,
  copyRecurringExpenses,
  listRecurringCandidates,
  deleteExpenseCategory,
  updateExpenseCategory,
} from "@/modules/finance/finance.expense";
import {
  createUploadTicket,
  registerFileAsset,
  softDeleteFile,
} from "@/shared/minio/file.service";
import { prisma } from "@/shared/prisma/prisma.service";

function validationMessage(error: { issues: { message: string }[] }) {
  return error.issues[0]?.message ?? "Dữ liệu nhập vào không hợp lệ.";
}

const AUTO_MANAGED_MESSAGE =
  "Giao dịch này do hệ thống tự động đồng bộ (từ vật tư hoặc bảng lương) nên không sửa hoặc xóa thủ công được. Hãy sửa ở nguồn.";

function refreshFinance(...projectIds: (string | null | undefined)[]) {
  revalidatePath("/finance");
  revalidatePath("/reports");
  revalidatePath("/dashboard");
  const uniqueProjectIds = new Set(
    projectIds.filter((projectId): projectId is string => Boolean(projectId)),
  );
  for (const projectId of uniqueProjectIds) {
    revalidatePath(`/projects/${projectId}`);
  }
}

function referenceError(reason: ReferenceError) {
  if (reason === "CATEGORY_NOT_FOUND") {
    return fail(
      "VALIDATION_ERROR",
      "Danh mục chi không tồn tại hoặc đã ngưng dùng. Hãy chọn danh mục khác.",
    );
  }
  if (reason === "PROJECT_NOT_FOUND") {
    return fail("NOT_FOUND", "Không tìm thấy dự án.");
  }
  return reason === "CONTRACT_PROJECT_MISMATCH"
    ? fail(
        "VALIDATION_ERROR",
        "Hợp đồng không thuộc dự án đã chọn.",
      )
    : fail("NOT_FOUND", "Không tìm thấy hợp đồng.");
}

// ═══════════════════ FN-02 · THÊM ═══════════════════

export async function createTransactionAction(
  input: unknown,
): Promise<ActionResult<{ id: string; code: string }>> {
  // 1. Session
  const user = await requireUser();
  // 2. Quyền
  if (!can(user, "finance.manage")) return fail("PERMISSION_DENIED");
  // 3. Zod
  const parsed = createTransactionSchema.safeParse(input);
  if (!parsed.success) {
    return fail("VALIDATION_ERROR", validationMessage(parsed.error));
  }
  // 4. Ghi dữ liệu + AuditLog trong service
  const result = await createTransaction(user, parsed.data);
  if (!result.ok) return referenceError(result.reason);

  refreshFinance(result.projectId);
  return ok({ id: result.id, code: result.code });
}

// ═══════════════════ FN-03 · SỬA ═══════════════════

export async function updateTransactionAction(
  input: unknown,
): Promise<ActionResult<null>> {
  const user = await requireUser();
  if (!can(user, "finance.manage")) return fail("PERMISSION_DENIED");

  const parsed = updateTransactionSchema.safeParse(input);
  if (!parsed.success) {
    return fail("VALIDATION_ERROR", validationMessage(parsed.error));
  }

  const previous = await getTransactionOwner(parsed.data.id);
  const result = await updateTransaction(user, parsed.data);
  if (!result.ok) {
    if (result.reason === "NOT_FOUND") {
      return fail("NOT_FOUND", "Không tìm thấy giao dịch.");
    }
    if (result.reason === "AUTO_MANAGED") {
      return fail("CONFLICT", AUTO_MANAGED_MESSAGE);
    }
    return referenceError(result.reason);
  }

  refreshFinance(previous?.projectId, result.projectId);
  return ok(null);
}

// ═══════════════════ FN-03 · XÓA MỀM ═══════════════════

export async function deleteTransactionAction(
  input: unknown,
): Promise<ActionResult<null>> {
  const user = await requireUser();
  if (!can(user, "finance.manage")) return fail("PERMISSION_DENIED");

  const parsed = transactionIdSchema.safeParse(input);
  if (!parsed.success) {
    return fail("VALIDATION_ERROR", validationMessage(parsed.error));
  }

  const result = await softDeleteTransaction(user, parsed.data.id);
  if (!result.ok) {
    return result.reason === "AUTO_MANAGED"
      ? fail("CONFLICT", AUTO_MANAGED_MESSAGE)
      : fail("NOT_FOUND", "Không tìm thấy giao dịch.");
  }

  refreshFinance(result.projectId);
  return ok(null);
}

// ═══════════════════ FN-06 · CHỨNG TỪ (MinIO 2 pha) ═══════════════════

export async function requestTransactionUploadTicketAction(
  input: unknown,
): Promise<
  ActionResult<{ uploadUrl: string; objectKey: string; maxSizeBytes: number }>
> {
  const user = await requireUser();
  if (!can(user, "finance.manage")) return fail("PERMISSION_DENIED");

  const parsed = transactionUploadTicketSchema.safeParse(input);
  if (!parsed.success) {
    return fail("VALIDATION_ERROR", validationMessage(parsed.error));
  }

  const transaction = await getTransactionOwner(parsed.data.transactionId);
  if (!transaction) return fail("NOT_FOUND", "Không tìm thấy giao dịch.");
  if (isAutoManaged(transaction.source)) {
    return fail("CONFLICT", AUTO_MANAGED_MESSAGE);
  }

  // Schema chưa có FileKind riêng cho hóa đơn/ủy nhiệm chi; OTHER là nhóm
  // document đã cho phép PDF, Office và ảnh theo quyết định schema hiện tại.
  const ticket = await createUploadTicket({
    prefix: `transactions/${transaction.id}`,
    fileName: parsed.data.fileName,
    mimeType: parsed.data.mimeType,
    kind: "OTHER",
  });
  if (!ticket.ok) {
    return fail(
      "VALIDATION_ERROR",
      ticket.reason === "BAD_EXTENSION"
        ? "Định dạng chứng từ không được hỗ trợ."
        : "Kiểu file chứng từ không hợp lệ.",
    );
  }

  return ok(ticket);
}

export async function registerTransactionFileAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  if (!can(user, "finance.manage")) return fail("PERMISSION_DENIED");

  const parsed = registerTransactionFileSchema.safeParse(input);
  if (!parsed.success) {
    return fail("VALIDATION_ERROR", validationMessage(parsed.error));
  }

  const transaction = await getTransactionOwner(parsed.data.transactionId);
  if (!transaction) return fail("NOT_FOUND", "Không tìm thấy giao dịch.");
  if (isAutoManaged(transaction.source)) {
    return fail("CONFLICT", AUTO_MANAGED_MESSAGE);
  }

  const prefix = `transactions/${transaction.id}/`;
  if (!parsed.data.objectKey.startsWith(prefix)) {
    return fail("VALIDATION_ERROR", "File không thuộc giao dịch này.");
  }

  const result = await prisma.$transaction((tx) =>
    registerFileAsset(tx, {
      transactionId: transaction.id,
      objectKey: parsed.data.objectKey,
      fileName: parsed.data.fileName,
      mimeType: parsed.data.mimeType,
      sizeBytes: parsed.data.sizeBytes,
      kind: "OTHER",
      uploadedById: user.id,
    }),
  );
  if (!result.ok) {
    return fail(
      "VALIDATION_ERROR",
      result.reason === "NOT_UPLOADED"
        ? "File chưa được tải lên hoàn tất."
        : "Định dạng chứng từ không hợp lệ.",
    );
  }

  refreshFinance(transaction.projectId);
  return ok({ id: result.id });
}

export async function deleteTransactionFileAction(
  input: unknown,
): Promise<ActionResult<null>> {
  const user = await requireUser();
  if (!can(user, "finance.manage")) return fail("PERMISSION_DENIED");

  const parsed = transactionIdSchema.safeParse(input);
  if (!parsed.success) {
    return fail("VALIDATION_ERROR", validationMessage(parsed.error));
  }

  const file = await prisma.fileAsset.findFirst({
    where: {
      id: parsed.data.id,
      deletedAt: null,
      transaction: { is: { deletedAt: null } },
    },
    select: {
      id: true,
      transaction: { select: { projectId: true, source: true } },
    },
  });
  if (!file) return fail("NOT_FOUND", "Không tìm thấy chứng từ.");
  if (file.transaction && isAutoManaged(file.transaction.source)) {
    return fail("CONFLICT", AUTO_MANAGED_MESSAGE);
  }

  await softDeleteFile(file.id);
  refreshFinance(file.transaction?.projectId);
  return ok(null);
}

// ═══════════════════ DANH MỤC CHI KHÁC ═══════════════════

const NAME_TAKEN_MESSAGE = "Đã có danh mục trùng tên này.";

export async function createExpenseCategoryAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  if (!can(user, "finance.manage")) return fail("PERMISSION_DENIED");

  const parsed = createExpenseCategorySchema.safeParse(input);
  if (!parsed.success) {
    return fail("VALIDATION_ERROR", validationMessage(parsed.error));
  }

  const result = await createExpenseCategory(user, parsed.data);
  if (!result.ok) return fail("CONFLICT", NAME_TAKEN_MESSAGE);

  refreshFinance();
  return ok({ id: result.id });
}

export async function updateExpenseCategoryAction(
  input: unknown,
): Promise<ActionResult<null>> {
  const user = await requireUser();
  if (!can(user, "finance.manage")) return fail("PERMISSION_DENIED");

  const parsed = updateExpenseCategorySchema.safeParse(input);
  if (!parsed.success) {
    return fail("VALIDATION_ERROR", validationMessage(parsed.error));
  }

  const result = await updateExpenseCategory(user, parsed.data);
  if (!result.ok) {
    return result.reason === "NAME_TAKEN"
      ? fail("CONFLICT", NAME_TAKEN_MESSAGE)
      : fail("NOT_FOUND", "Không tìm thấy danh mục.");
  }

  refreshFinance();
  return ok(null);
}

export async function deleteExpenseCategoryAction(
  input: unknown,
): Promise<ActionResult<null>> {
  const user = await requireUser();
  if (!can(user, "finance.manage")) return fail("PERMISSION_DENIED");

  const parsed = expenseCategoryIdSchema.safeParse(input);
  if (!parsed.success) {
    return fail("VALIDATION_ERROR", validationMessage(parsed.error));
  }

  const result = await deleteExpenseCategory(user, parsed.data.id);
  if (!result.ok) {
    return result.reason === "IN_USE"
      ? fail(
          "CONFLICT",
          "Danh mục đã có giao dịch nên không xóa được — hãy chuyển sang Ngưng dùng để giữ đúng số liệu báo cáo cũ.",
        )
      : fail("NOT_FOUND", "Không tìm thấy danh mục.");
  }

  refreshFinance();
  return ok(null);
}

/** Danh sách khoản chi khác của tháng trước để kế toán tick chọn chép sang. */
export async function listRecurringCandidatesAction(
  input: unknown,
): Promise<ActionResult<Awaited<ReturnType<typeof listRecurringCandidates>>>> {
  const user = await requireUser();
  if (!can(user, "finance.manage")) return fail("PERMISSION_DENIED");

  const parsed = recurringCandidatesSchema.safeParse(input);
  if (!parsed.success) {
    return fail("VALIDATION_ERROR", validationMessage(parsed.error));
  }

  return ok(await listRecurringCandidates(parsed.data.month));
}

/** Ghi các khoản đã tick sang tháng chọn, trạng thái Đang chờ. */
export async function copyRecurringExpensesAction(
  input: unknown,
): Promise<ActionResult<{ created: { name: string; code: string }[] }>> {
  const user = await requireUser();
  if (!can(user, "finance.manage")) return fail("PERMISSION_DENIED");

  const parsed = copyRecurringSchema.safeParse(input);
  if (!parsed.success) {
    return fail("VALIDATION_ERROR", validationMessage(parsed.error));
  }

  const result = await copyRecurringExpenses(user, parsed.data.month, parsed.data.items);
  if (!result.ok) return referenceError(result.reason);

  refreshFinance();
  return ok({ created: result.created });
}
