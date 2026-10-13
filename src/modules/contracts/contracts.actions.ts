"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/modules/auth/auth.service";
import { can, canSeeMoney } from "@/common/permissions/permissions";
import { ok, fail, type ActionResult } from "@/common/filters/error";
import { memberIdsOf } from "@/modules/projects/projects.service";
import {
  createContract,
  getContract,
  softDeleteContract,
  updateContract,
} from "@/modules/contracts/contracts.service";
import {
  createContractSchema,
  updateContractSchema,
} from "@/modules/contracts/contracts.schema";
import {
  createUploadTicket,
  registerFileAsset,
  softDeleteFile,
} from "@/shared/minio/file.service";
import { prisma } from "@/shared/prisma/prisma.service";
import { FileKind } from "@/generated/prisma/enums";

export type ContractActionState = { error: string | null; ok?: boolean };

function firstIssue(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? "Dữ liệu nhập vào không hợp lệ.";
}

/**
 * Quyền hợp đồng theo ma trận 3.5: Director/Kế toán scope ALL, Kinh doanh
 * ASSIGNED (phải là thành viên dự án), Thiết kế/Thi công không có.
 * ctx là danh sách thành viên của dự án chứa hợp đồng.
 */
async function canManageOn(projectId: string, userPromise = requireUser()) {
  const user = await userPromise;
  const memberIds = await memberIdsOf(projectId);
  return { user, allowed: can(user, "contract.manage", { memberIds }) };
}

// ═══════════════════ CT-02 · THÊM ═══════════════════

export async function createContractAction(
  _prev: ContractActionState,
  formData: FormData,
): Promise<ContractActionState> {
  const projectId = String(formData.get("projectId") ?? "");
  const { user, allowed } = await canManageOn(projectId);
  if (!allowed) {
    return { error: "Bạn không có quyền thêm hợp đồng cho dự án này." };
  }

  const keepMoney = canSeeMoney(user);
  const parsed = createContractSchema.safeParse({
    projectId,
    type: formData.get("type") ?? "",
    value: keepMoney ? (formData.get("value") ?? "") : "",
    depositAmount: keepMoney ? (formData.get("depositAmount") ?? "") : "",
    depositStatus: keepMoney
      ? (formData.get("depositStatus") ?? "COMPLETED")
      : "COMPLETED",
    depositPaidDate: keepMoney ? (formData.get("depositPaidDate") ?? "") : "",
    signedDate: formData.get("signedDate") ?? "",
    note: formData.get("note") ?? "",
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const result = await createContract(user, parsed.data, keepMoney);
  if (!result.ok) return { error: "Không tìm thấy dự án." };

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/finance");
  revalidatePath("/reports");
  revalidatePath("/dashboard");
  return { error: null, ok: true };
}

// ═══════════════════ CT-03 · SỬA ═══════════════════

export async function updateContractAction(
  _prev: ContractActionState,
  formData: FormData,
): Promise<ContractActionState> {
  const id = String(formData.get("id") ?? "");

  const contract = await getContract(id);
  if (!contract) return { error: "Không tìm thấy hợp đồng." };

  const { user, allowed } = await canManageOn(contract.projectId);
  if (!allowed) return { error: "Bạn không có quyền sửa hợp đồng này." };

  const keepMoney = canSeeMoney(user);
  const parsed = updateContractSchema.safeParse({
    id,
    type: formData.get("type") ?? "",
    status: formData.get("status") ?? "",
    value: keepMoney ? (formData.get("value") ?? "") : "",
    signedDate: formData.get("signedDate") ?? "",
    note: formData.get("note") ?? "",
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const result = await updateContract(user, parsed.data, keepMoney);
  if (!result.ok) return { error: "Không tìm thấy hợp đồng." };

  revalidatePath(`/projects/${contract.projectId}`);
  return { error: null, ok: true };
}

// ═══════════════════ CT-03 · XÓA (soft) ═══════════════════

export async function deleteContractAction(
  _prev: ContractActionState,
  formData: FormData,
): Promise<ContractActionState> {
  const id = String(formData.get("id") ?? "");

  const contract = await getContract(id);
  if (!contract) return { error: "Không tìm thấy hợp đồng." };

  const { user, allowed } = await canManageOn(contract.projectId);
  if (!allowed) return { error: "Bạn không có quyền xóa hợp đồng này." };

  const result = await softDeleteContract(user, id);
  if (!result.ok) {
    return {
      error:
        result.reason === "HAS_TRANSACTIONS"
          ? "Không xóa được: hợp đồng còn giao dịch thu/chi gắn vào."
          : "Không tìm thấy hợp đồng.",
    };
  }

  revalidatePath(`/projects/${contract.projectId}`);
  return { error: null, ok: true };
}

// ═══════════════════ CT-06 · FILE ĐÍNH KÈM ═══════════════════

/** Loại file hợp lệ cho hợp đồng: bản ký · báo giá · BOQ (+ khác). */
const CONTRACT_KINDS: string[] = ["CONTRACT_DOC", "QUOTATION", "BOQ", "OTHER"];

function parseContractKind(raw: unknown): FileKind | null {
  const value = String(raw ?? "");
  return CONTRACT_KINDS.includes(value) ? (value as FileKind) : null;
}

/** Pha 1 — cấp vé upload cho file hợp đồng. */
export async function requestContractUploadTicketAction(input: {
  contractId: string;
  fileName: string;
  kind: string;
}): Promise<
  ActionResult<{ uploadUrl: string; objectKey: string; maxSizeBytes: number }>
> {
  const contract = await getContract(input.contractId);
  if (!contract) return fail("NOT_FOUND", "Không tìm thấy hợp đồng.");

  const { allowed } = await canManageOn(contract.projectId);
  if (!allowed) {
    return fail("PERMISSION_DENIED", "Bạn không có quyền upload file hợp đồng này.");
  }

  const kind = parseContractKind(input.kind);
  if (!kind) return fail("VALIDATION_ERROR", "Loại file không hợp lệ.");

  const fileName = input.fileName.trim().slice(0, 200);
  if (!fileName) return fail("VALIDATION_ERROR", "Thiếu tên file.");

  const ticket = await createUploadTicket({
    prefix: `contracts/${input.contractId}`,
    fileName,
    kind,
  });
  if (!ticket.ok) {
    return fail(
      "VALIDATION_ERROR",
      ticket.reason === "BAD_EXTENSION"
        ? "Định dạng file không hợp lệ với loại đã chọn."
        : "Kiểu MIME của file không hợp lệ.",
    );
  }
  const { uploadUrl, objectKey, maxSizeBytes } = ticket;
  return ok({ uploadUrl, objectKey, maxSizeBytes });
}

/** Pha 3 — ghi FileAsset sau khi client PUT xong. */
export async function registerContractFileAction(input: {
  contractId: string;
  objectKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  kind: string;
}): Promise<ActionResult<{ id: string }>> {
  const contract = await getContract(input.contractId);
  if (!contract) return fail("NOT_FOUND", "Không tìm thấy hợp đồng.");

  const { user, allowed } = await canManageOn(contract.projectId);
  if (!allowed) {
    return fail("PERMISSION_DENIED", "Bạn không có quyền upload file hợp đồng này.");
  }

  const kind = parseContractKind(input.kind);
  if (!kind) return fail("VALIDATION_ERROR", "Loại file không hợp lệ.");

  // objectKey phải thuộc đúng thư mục hợp đồng này.
  if (!input.objectKey.startsWith(`contracts/${input.contractId}/`)) {
    return fail("VALIDATION_ERROR", "Object key không thuộc hợp đồng này.");
  }

  const result = await prisma.$transaction((tx) =>
    registerFileAsset(tx, {
      contractId: input.contractId,
      objectKey: input.objectKey,
      fileName: input.fileName.slice(0, 200),
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      kind,
      uploadedById: user.id,
    }),
  );
  if (!result.ok) {
    return fail(
      "VALIDATION_ERROR",
      result.reason === "NOT_UPLOADED"
        ? "File chưa được tải lên hoàn tất."
        : "Định dạng file không hợp lệ với loại đã chọn.",
    );
  }

  revalidatePath(`/projects/${contract.projectId}`);
  return ok({ id: result.id });
}

/** Xóa mềm file hợp đồng. */
export async function deleteContractFileAction(
  _prev: ContractActionState,
  formData: FormData,
): Promise<ContractActionState> {
  const fileId = String(formData.get("fileId") ?? "");

  const file = await prisma.fileAsset.findFirst({
    where: { id: fileId, deletedAt: null },
    select: { id: true, contractId: true },
  });
  if (!file?.contractId) return { error: "Không tìm thấy file." };

  const contract = await getContract(file.contractId);
  if (!contract) return { error: "Không tìm thấy hợp đồng." };

  const { allowed } = await canManageOn(contract.projectId);
  if (!allowed) return { error: "Bạn không có quyền xóa file hợp đồng này." };

  await softDeleteFile(fileId);
  revalidatePath(`/projects/${contract.projectId}`);
  return { error: null, ok: true };
}
