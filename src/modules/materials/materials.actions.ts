"use server";

import { revalidatePath } from "next/cache";
import { FileKind } from "@/generated/prisma/enums";
import { fail, ok, type ActionResult } from "@/common/filters/error";
import { can, canSeeMoney } from "@/common/permissions/permissions";
import { requireUser } from "@/modules/auth/auth.service";
import { memberIdsOf } from "@/modules/projects/projects.service";
import {
  idSchema,
  materialInputForUser,
  materialInputSchema,
  updateMaterialSchema,
} from "./materials.schema";
import {
  createMaterial,
  createMaterials,
  deleteMaterial,
  getMaterialOwner,
  updateMaterial,
} from "./materials.service";
import {
  MATERIAL_IMPORT_MAX_BYTES,
  MATERIAL_IMPORT_MAX_LABEL,
  parseMaterialWorkbook,
} from "./materials.excel";
import {
  createUploadTicket,
  registerFileAsset,
  softDeleteFile,
} from "@/shared/minio/file.service";
import { prisma } from "@/shared/prisma/prisma.service";

function validationMessage(error: { issues: { message: string }[] }) {
  return error.issues[0]?.message ?? "Dữ liệu nhập vào không hợp lệ.";
}

function refreshMaterials(projectId?: string) {
  revalidatePath("/materials");
  revalidatePath("/finance");
  revalidatePath("/reports");
  revalidatePath("/dashboard");
  if (projectId) revalidatePath(`/projects/${projectId}`);
}

async function materialAccess(projectId: string) {
  const user = await requireUser();
  const memberIds = await memberIdsOf(projectId);
  return { user, allowed: can(user, "material.manage", { memberIds }) };
}

export async function createMaterialAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const projectId =
    typeof input === "object" && input !== null && "projectId" in input
      ? String(input.projectId)
      : "";
  const memberIds = await memberIdsOf(projectId);
  if (!can(user, "material.manage", { memberIds })) return fail("PERMISSION_DENIED");
  const keepMoney = canSeeMoney(user);
  const parsed = materialInputSchema.safeParse(materialInputForUser(input, keepMoney));
  if (!parsed.success) return fail("VALIDATION_ERROR", validationMessage(parsed.error));
  const result = await createMaterial(user, parsed.data, keepMoney);
  if (!result.ok) {
    return fail(
      "NOT_FOUND",
      "Không tìm thấy dự án.",
    );
  }
  refreshMaterials(parsed.data.projectId);
  return ok({ id: result.id });
}

export async function importMaterialsAction(
  formData: FormData,
): Promise<ActionResult<{ count: number }>> {
  const user = await requireUser();
  const projectId = String(formData.get("projectId") ?? "").trim();
  const memberIds = await memberIdsOf(projectId);
  if (!can(user, "material.manage", { memberIds })) return fail("PERMISSION_DENIED");
  const projectParsed = materialInputSchema.shape.projectId.safeParse(projectId);
  if (!projectParsed.success) {
    return fail("VALIDATION_ERROR", validationMessage(projectParsed.error));
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return fail("VALIDATION_ERROR", "Vui lòng chọn file Excel .xlsx.");
  }
  if (!file.name.toLocaleLowerCase("vi").endsWith(".xlsx")) {
    return fail("VALIDATION_ERROR", "Chỉ hỗ trợ file Excel định dạng .xlsx.");
  }
  if (file.size > MATERIAL_IMPORT_MAX_BYTES) {
    return fail(
      "VALIDATION_ERROR",
      `File Excel vượt quá dung lượng ${MATERIAL_IMPORT_MAX_LABEL}.`,
    );
  }

  const keepMoney = canSeeMoney(user);
  const parsed = await parseMaterialWorkbook(
    Buffer.from(await file.arrayBuffer()),
    projectParsed.data,
    keepMoney,
  );
  if (!parsed.ok) {
    return fail("VALIDATION_ERROR", parsed.errors.join("\n"));
  }
  const result = await createMaterials(user, parsed.data, keepMoney);
  if (!result.ok) return fail("NOT_FOUND", "Không tìm thấy dự án.");
  refreshMaterials(projectParsed.data);
  return ok({ count: result.count });
}

export async function updateMaterialAction(input: unknown): Promise<ActionResult<null>> {
  const user = await requireUser();
  const rawId =
    typeof input === "object" && input !== null && "id" in input ? String(input.id) : "";
  const owner = await getMaterialOwner(rawId);
  if (!owner) return fail("NOT_FOUND", "Không tìm thấy vật tư.");
  const memberIds = await memberIdsOf(owner.projectId);
  if (!can(user, "material.manage", { memberIds })) return fail("PERMISSION_DENIED");
  const keepMoney = canSeeMoney(user);
  const parsed = updateMaterialSchema.safeParse(materialInputForUser(input, keepMoney));
  if (!parsed.success) return fail("VALIDATION_ERROR", validationMessage(parsed.error));
  const result = await updateMaterial(user, parsed.data, keepMoney);
  if (!result.ok) {
    return fail(
      "NOT_FOUND",
      "Không tìm thấy vật tư.",
    );
  }
  refreshMaterials(owner.projectId);
  return ok(null);
}

export async function deleteMaterialAction(input: unknown): Promise<ActionResult<null>> {
  const user = await requireUser();
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION_ERROR", validationMessage(parsed.error));
  const owner = await getMaterialOwner(parsed.data.id);
  if (!owner) return fail("NOT_FOUND", "Không tìm thấy vật tư.");
  const memberIds = await memberIdsOf(owner.projectId);
  if (!can(user, "material.manage", { memberIds })) return fail("PERMISSION_DENIED");
  const result = await deleteMaterial(user, parsed.data.id);
  if (!result.ok) {
    return result.reason === "HAS_FILES"
      ? fail("CONFLICT", "Vật tư đang có file đính kèm. Hãy xóa các file trước.")
      : fail("NOT_FOUND", "Không tìm thấy vật tư.");
  }
  refreshMaterials(owner.projectId);
  return ok(null);
}

const MATERIAL_FILE_KINDS: FileKind[] = ["MATERIAL_DOC", "RENDER_IMAGE", "SITE_PHOTO", "OTHER"];

function materialKind(value: unknown): FileKind | null {
  const kind = String(value ?? "") as FileKind;
  return MATERIAL_FILE_KINDS.includes(kind) ? kind : null;
}

export async function requestMaterialUploadTicketAction(input: {
  materialId: string;
  fileName: string;
  mimeType?: string;
  kind: string;
}): Promise<ActionResult<{ uploadUrl: string; objectKey: string; maxSizeBytes: number }>> {
  const owner = await getMaterialOwner(input.materialId);
  if (!owner) return fail("NOT_FOUND", "Không tìm thấy vật tư.");
  const { allowed } = await materialAccess(owner.projectId);
  if (!allowed) return fail("PERMISSION_DENIED");
  const kind = materialKind(input.kind);
  if (!kind) return fail("VALIDATION_ERROR", "Loại file không hợp lệ.");
  const fileName = input.fileName.trim().slice(0, 200);
  if (!fileName) return fail("VALIDATION_ERROR", "Thiếu tên file.");
  const result = await createUploadTicket({
    prefix: `materials/${input.materialId}`,
    fileName,
    mimeType: input.mimeType,
    kind,
  });
  if (!result.ok) return fail("VALIDATION_ERROR", "Định dạng file không hợp lệ.");
  return ok(result);
}

export async function registerMaterialFileAction(input: {
  materialId: string;
  objectKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  kind: string;
}): Promise<ActionResult<{ id: string }>> {
  const owner = await getMaterialOwner(input.materialId);
  if (!owner) return fail("NOT_FOUND", "Không tìm thấy vật tư.");
  const { user, allowed } = await materialAccess(owner.projectId);
  if (!allowed) return fail("PERMISSION_DENIED");
  const kind = materialKind(input.kind);
  if (!kind) return fail("VALIDATION_ERROR", "Loại file không hợp lệ.");
  if (!input.objectKey.startsWith(`materials/${input.materialId}/`)) {
    return fail("VALIDATION_ERROR", "File không thuộc vật tư này.");
  }
  const result = await prisma.$transaction((tx) =>
    registerFileAsset(tx, {
      materialId: input.materialId,
      objectKey: input.objectKey,
      fileName: input.fileName.slice(0, 200),
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      kind,
      uploadedById: user.id,
    }),
  );
  if (!result.ok) return fail("VALIDATION_ERROR", "File chưa tải lên hoàn tất hoặc sai định dạng.");
  refreshMaterials(owner.projectId);
  return ok({ id: result.id });
}

export async function deleteMaterialFileAction(input: unknown): Promise<ActionResult<null>> {
  const user = await requireUser();
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION_ERROR", validationMessage(parsed.error));
  const file = await prisma.fileAsset.findFirst({
    where: { id: parsed.data.id, deletedAt: null, materialId: { not: null } },
    select: { id: true, materialId: true },
  });
  if (!file?.materialId) return fail("NOT_FOUND", "Không tìm thấy file.");
  const owner = await getMaterialOwner(file.materialId);
  if (!owner) return fail("NOT_FOUND", "Không tìm thấy vật tư.");
  const memberIds = await memberIdsOf(owner.projectId);
  if (!can(user, "material.manage", { memberIds })) return fail("PERMISSION_DENIED");
  await softDeleteFile(file.id);
  refreshMaterials(owner.projectId);
  return ok(null);
}
