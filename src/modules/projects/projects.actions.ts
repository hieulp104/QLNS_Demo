"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/modules/auth/auth.service";
import { can, canSeeMoney } from "@/common/permissions/permissions";
import {
  addComment,
  addMember,
  changeStage,
  completeProject,
  createProject,
  memberIdsOf,
  removeMember,
  softDeleteProject,
  updateProject,
} from "@/modules/projects/projects.service";
import {
  createUploadTicket,
  registerFileAsset,
  restoreFile,
  softDeleteFile,
} from "@/shared/minio/file.service";
import { writeAuditLog } from "@/shared/audit/audit.service";
import { prisma } from "@/shared/prisma/prisma.service";
import { ok, fail, type ActionResult } from "@/common/filters/error";
import { FileKind } from "@/generated/prisma/enums";
import {
  addCommentSchema,
  addMemberSchema,
  changeStageSchema,
  createProjectSchema,
  removeMemberSchema,
  updateProjectSchema,
} from "@/modules/projects/projects.schema";

export type ProjectFormState = { error: string | null };
export type ActionState = { error: string | null; ok?: boolean };

function firstIssue(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? "Dữ liệu nhập vào không hợp lệ.";
}

// ═══════════════════ PJ-02 · TẠO DỰ ÁN ═══════════════════

export async function createProjectAction(
  _prev: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  const user = await requireUser();
  if (!can(user, "project.create")) {
    return { error: "Bạn không có quyền tạo dự án." };
  }

  const parsed = createProjectSchema.safeParse({
    name: formData.get("name") ?? "",
    customerId: formData.get("customerId") ?? "",
    type: formData.get("type") ?? "",
    propertyType: formData.get("propertyType") ?? "",
    // Người không xem được tiền thì không cho gửi giá trị lên.
    estimatedValue: canSeeMoney(user)
      ? (formData.get("estimatedValue") ?? "")
      : "",
    address: formData.get("address") ?? "",
    description: formData.get("description") ?? "",
    expectedEndDate: formData.get("expectedEndDate") ?? "",
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const project = await createProject(user, parsed.data);

  revalidatePath("/projects");
  redirect(`/projects/${project.id}`);
}

// ═══════════════════ PJ-05 · SỬA DỰ ÁN ═══════════════════

export async function updateProjectAction(
  _prev: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");

  // Scope ASSIGNED: chỉ Director (ALL) hoặc thành viên dự án mới sửa được.
  const memberIds = await memberIdsOf(id);
  if (!can(user, "project.update", { memberIds })) {
    return { error: "Bạn không có quyền sửa dự án này. Cần là thành viên dự án." };
  }

  const keepMoney = canSeeMoney(user);
  const parsed = updateProjectSchema.safeParse({
    id,
    name: formData.get("name") ?? "",
    propertyType: formData.get("propertyType") ?? "",
    estimatedValue: keepMoney ? (formData.get("estimatedValue") ?? "") : "",
    address: formData.get("address") ?? "",
    description: formData.get("description") ?? "",
    status: formData.get("status") ?? "",
    startDate: formData.get("startDate") ?? "",
    expectedEndDate: formData.get("expectedEndDate") ?? "",
    actualEndDate: formData.get("actualEndDate") ?? "",
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const result = await updateProject(user, parsed.data, keepMoney);
  if (!result.ok) return { error: "Không tìm thấy dự án." };

  revalidatePath("/projects");
  revalidatePath(`/projects/${id}`);
  redirect(`/projects/${id}`);
}

// ═══════════════════ PJ-06 · XÓA DỰ ÁN ═══════════════════

export async function deleteProjectAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");

  // Xóa dự án chỉ Director — quyền project.delete chỉ Director có.
  if (!can(user, "project.delete")) {
    return { error: "Chỉ Giám đốc mới được xóa dự án." };
  }

  const result = await softDeleteProject(user, id);
  if (!result.ok) return { error: "Không tìm thấy dự án." };

  revalidatePath("/projects");
  redirect("/projects");
}

// ═══════════════════ PJ-09/12 · CHUYỂN GIAI ĐOẠN ═══════════════════

export async function changeStageAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");

  const memberIds = await memberIdsOf(id);
  if (!can(user, "project.stage.change", { memberIds })) {
    return {
      error: "Bạn không có quyền chuyển giai đoạn. Cần là thành viên dự án.",
    };
  }

  const parsed = changeStageSchema.safeParse({
    id,
    toStage: formData.get("toStage") ?? "",
    note: formData.get("note") ?? "",
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const result = await changeStage(user, parsed.data);
  if (!result.ok) {
    return {
      error:
        result.reason === "SAME_STAGE"
          ? "Dự án đã ở giai đoạn này."
          : "Không tìm thấy dự án.",
    };
  }

  revalidatePath(`/projects/${id}`);
  return { error: null, ok: true };
}

/** Kết thúc dự án (ở giai đoạn bảo hành) → trạng thái "Hoàn thành". */
export async function completeProjectAction(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  const memberIds = await memberIdsOf(id);
  if (!can(user, "project.update", { memberIds })) {
    return {
      ok: false,
      error: "Bạn không có quyền kết thúc dự án. Cần là thành viên dự án.",
    };
  }

  const result = await completeProject(user, id);
  if (!result.ok) return { ok: false, error: "Không tìm thấy dự án." };

  revalidatePath("/projects");
  revalidatePath(`/projects/${id}`);
  return { ok: true };
}

// ═══════════════════ PJ-13/14 · THÀNH VIÊN ═══════════════════

export async function addMemberAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  if (!can(user, "project.member.manage")) {
    return { error: "Bạn không có quyền quản lý thành viên dự án." };
  }

  const parsed = addMemberSchema.safeParse({
    projectId: formData.get("projectId") ?? "",
    userId: formData.get("userId") ?? "",
    area: formData.get("area") ?? "",
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const result = await addMember(user, parsed.data);
  if (!result.ok) {
    return { error: "Nhân viên này đã ở trong mảng đó của dự án." };
  }

  revalidatePath(`/projects/${parsed.data.projectId}`);
  return { error: null, ok: true };
}

export async function removeMemberAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  if (!can(user, "project.member.manage")) {
    return { error: "Bạn không có quyền quản lý thành viên dự án." };
  }

  const parsed = removeMemberSchema.safeParse({
    projectId: formData.get("projectId") ?? "",
    memberId: formData.get("memberId") ?? "",
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const result = await removeMember(
    user,
    parsed.data.projectId,
    parsed.data.memberId,
  );
  if (!result.ok) return { error: "Không tìm thấy thành viên." };

  revalidatePath(`/projects/${parsed.data.projectId}`);
  return { error: null, ok: true };
}

// ═══════════════════ PJ-16 · BÌNH LUẬN ═══════════════════

export async function addCommentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  // Mọi nhân viên đều có project.comment (kể cả Thiết kế / Thi công).
  if (!can(user, "project.comment")) {
    return { error: "Bạn không có quyền bình luận." };
  }

  const parsed = addCommentSchema.safeParse({
    projectId: formData.get("projectId") ?? "",
    content: formData.get("content") ?? "",
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const result = await addComment(user, parsed.data.projectId, parsed.data.content);
  if (!result.ok) return { error: "Không tìm thấy dự án." };

  revalidatePath(`/projects/${parsed.data.projectId}`);
  return { error: null, ok: true };
}

// ═══════════════════ PJ-17/18 · FILE & ẢNH ═══════════════════

/** Chỉ nhận đúng các FileKind hợp lệ cho dự án. */
function parseFileKind(raw: unknown): FileKind | null {
  const value = String(raw ?? "");
  return (Object.values(FileKind) as string[]).includes(value)
    ? (value as FileKind)
    : null;
}

/**
 * Pha 1 — client xin URL upload. Kiểm quyền project.file.upload (ASSIGNED) rồi
 * cấp presigned PUT URL. Trả về objectKey để client gửi lại ở pha 2.
 */
export async function requestUploadTicketAction(input: {
  projectId: string;
  fileName: string;
  kind: string;
}): Promise<
  ActionResult<{ uploadUrl: string; objectKey: string; maxSizeBytes: number }>
> {
  const user = await requireUser();

  const memberIds = await memberIdsOf(input.projectId);
  if (!can(user, "project.file.upload", { memberIds })) {
    return fail("PERMISSION_DENIED", "Bạn cần là thành viên dự án để upload file.");
  }

  const kind = parseFileKind(input.kind);
  if (!kind) return fail("VALIDATION_ERROR", "Loại file không hợp lệ.");

  const fileName = input.fileName.trim().slice(0, 200);
  if (!fileName) return fail("VALIDATION_ERROR", "Thiếu tên file.");

  const ticket = await createUploadTicket({
    prefix: `projects/${input.projectId}`,
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

/**
 * Pha 3 — client báo đã PUT xong, server ghi FileAsset (sau khi xác minh object
 * có thật trên MinIO).
 */
export async function registerProjectFileAction(input: {
  projectId: string;
  objectKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  kind: string;
  caption?: string;
}): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();

  const memberIds = await memberIdsOf(input.projectId);
  if (!can(user, "project.file.upload", { memberIds })) {
    return fail("PERMISSION_DENIED", "Bạn cần là thành viên dự án để upload file.");
  }

  const kind = parseFileKind(input.kind);
  if (!kind) return fail("VALIDATION_ERROR", "Loại file không hợp lệ.");

  // objectKey phải nằm trong đúng thư mục của dự án — chặn ghi đè file dự án khác.
  if (!input.objectKey.startsWith(`projects/${input.projectId}/`)) {
    return fail("VALIDATION_ERROR", "Object key không thuộc dự án này.");
  }

  const result = await prisma.$transaction((tx) =>
    registerFileAsset(tx, {
      projectId: input.projectId,
      objectKey: input.objectKey,
      fileName: input.fileName.slice(0, 200),
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      kind,
      caption: input.caption?.slice(0, 500) ?? null,
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

  revalidatePath(`/projects/${input.projectId}`);
  return ok({ id: result.id });
}

/** Xóa mềm file dự án. Cần quyền upload (ASSIGNED) trên dự án chứa file. */
export async function deleteProjectFileAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const fileId = String(formData.get("fileId") ?? "");

  const file = await prisma.fileAsset.findFirst({
    where: { id: fileId, deletedAt: null },
    select: { id: true, projectId: true },
  });
  if (!file?.projectId) return { error: "Không tìm thấy file." };

  const memberIds = await memberIdsOf(file.projectId);
  if (!can(user, "project.file.upload", { memberIds })) {
    return { error: "Bạn không có quyền xóa file của dự án này." };
  }

  await softDeleteFile(fileId);
  revalidatePath(`/projects/${file.projectId}`);
  return { error: null, ok: true };
}

/**
 * Khôi phục file khỏi thùng rác. Cùng quyền với xóa (`project.file.upload` scope
 * ASSIGNED) — đã chốt: ai upload/xóa được thì tự sửa sai của mình được, không
 * phải đi nhờ Giám đốc.
 */
export async function restoreProjectFileAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const fileId = String(formData.get("fileId") ?? "");

  const file = await prisma.fileAsset.findFirst({
    where: { id: fileId, deletedAt: { not: null } },
    select: { id: true, projectId: true, fileName: true },
  });
  if (!file?.projectId) return { error: "Không tìm thấy file trong thùng rác." };

  const memberIds = await memberIdsOf(file.projectId);
  if (!can(user, "project.file.upload", { memberIds })) {
    return { error: "Bạn không có quyền khôi phục file của dự án này." };
  }

  const restored = await restoreFile(fileId);
  if (!restored) {
    return { error: "File đã bị dọn khỏi hệ thống, không khôi phục được." };
  }

  // Khôi phục là thao tác đáng lần vết — ai lấy lại file gì, lúc nào.
  await prisma.$transaction((tx) =>
    writeAuditLog(tx, {
      actorId: user.id,
      action: "FILE_RESTORE",
      entity: "FileAsset",
      entityId: fileId,
      after: { fileName: file.fileName, projectId: file.projectId },
    }),
  );

  revalidatePath(`/projects/${file.projectId}`);
  return { error: null, ok: true };
}
