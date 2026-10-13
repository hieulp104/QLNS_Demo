"use server";

/**
 * Server Action của module Bảo hành.
 * Mỗi action theo đúng 4 bước bắt buộc: session → quyền → validate Zod → ghi + AuditLog.
 *
 * Quyền dùng chung một mã: maintenance.manage. Với scope ASSIGNED, ngữ cảnh là
 * thành viên dự án CỘNG người đang được giao việc (xem maintenanceContext) —
 * người được cử đi bảo hành phải tự ghi được kết quả.
 */

import { revalidatePath } from "next/cache";
import { requireUser } from "@/modules/auth/auth.service";
import { can } from "@/common/permissions/permissions";
import {
  assignTask,
  createCheck,
  createRequest,
  maintenanceContext,
  reopenTask,
  resolveTask,
  setMilestoneMonths,
  softDeleteTask,
  taskContext,
  updateTask,
} from "@/modules/maintenance/maintenance.service";
import {
  assignTaskSchema,
  createCheckSchema,
  createRequestSchema,
  milestoneSettingSchema,
  resolveTaskSchema,
  updateTaskSchema,
} from "@/modules/maintenance/maintenance.schema";

export type ActionState = { error: string | null; ok?: boolean };

const DENIED =
  "Bạn không có quyền xử lý việc bảo hành của dự án này. Cần là thành viên dự án hoặc người được giao.";

function firstIssue(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? "Dữ liệu nhập vào không hợp lệ.";
}

/** Làm mới các trang có hiển thị việc bảo hành sau mỗi thay đổi. */
function revalidateAll(projectId: string) {
  revalidatePath("/dashboard");
  revalidatePath("/maintenance");
  revalidatePath(`/projects/${projectId}`);
}

// ═══════════════════ TẠO ═══════════════════

/** Khách gọi báo hỏng → người trực ghi nhận đề nghị bảo hành. */
export async function createRequestAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const projectId = String(formData.get("projectId") ?? "");
  if (!projectId) return { error: "Thiếu dự án." };

  const ctx = await maintenanceContext(projectId);
  if (!can(user, "maintenance.manage", ctx)) return { error: DENIED };

  const parsed = createRequestSchema.safeParse({
    projectId,
    title: formData.get("title") ?? "",
    description: formData.get("description") ?? "",
    reporterNote: formData.get("reporterNote") ?? "",
    reportedAt: formData.get("reportedAt") ?? "",
    dueDate: formData.get("dueDate") ?? "",
    priority: formData.get("priority") ?? "NORMAL",
    assigneeId: formData.get("assigneeId") ?? "",
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  await createRequest(user, parsed.data);
  revalidateAll(projectId);
  return { error: null, ok: true };
}

/** Thêm một mốc kiểm tra ngoài lịch tự sinh. */
export async function createCheckAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const projectId = String(formData.get("projectId") ?? "");
  if (!projectId) return { error: "Thiếu dự án." };

  const ctx = await maintenanceContext(projectId);
  if (!can(user, "maintenance.manage", ctx)) return { error: DENIED };

  const parsed = createCheckSchema.safeParse({
    projectId,
    title: formData.get("title") ?? "",
    description: formData.get("description") ?? "",
    dueDate: formData.get("dueDate") ?? "",
    assigneeId: formData.get("assigneeId") ?? "",
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  await createCheck(user, parsed.data);
  revalidateAll(projectId);
  return { error: null, ok: true };
}

// ═══════════════════ SỬA / GIAO / ĐÓNG ═══════════════════

export async function updateTaskAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");

  const found = await taskContext(id);
  if (!found) return { error: "Không tìm thấy việc bảo hành." };
  if (!can(user, "maintenance.manage", found.ctx)) return { error: DENIED };

  const parsed = updateTaskSchema.safeParse({
    id,
    title: formData.get("title") ?? "",
    description: formData.get("description") ?? "",
    dueDate: formData.get("dueDate") ?? "",
    priority: formData.get("priority") ?? "NORMAL",
    assigneeId: formData.get("assigneeId") ?? "",
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  await updateTask(user, found.task, parsed.data);
  revalidateAll(found.task.projectId);
  return { error: null, ok: true };
}

/** Giao việc cho người đi kiểm tra / sửa chữa (bỏ trống = gỡ người phụ trách). */
export async function assignTaskAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");

  const found = await taskContext(id);
  if (!found) return { error: "Không tìm thấy việc bảo hành." };
  if (!can(user, "maintenance.manage", found.ctx)) return { error: DENIED };

  const parsed = assignTaskSchema.safeParse({
    id,
    assigneeId: formData.get("assigneeId") ?? "",
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  await assignTask(user, found.task, parsed.data.assigneeId ?? null);
  revalidateAll(found.task.projectId);
  return { error: null, ok: true };
}

/** Đánh dấu đã xử lý xong hoặc bỏ qua. */
export async function resolveTaskAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");

  const found = await taskContext(id);
  if (!found) return { error: "Không tìm thấy việc bảo hành." };
  if (!can(user, "maintenance.manage", found.ctx)) return { error: DENIED };

  const parsed = resolveTaskSchema.safeParse({
    id,
    status: formData.get("status") ?? "DONE",
    resultNote: formData.get("resultNote") ?? "",
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  await resolveTask(user, found.task, parsed.data);
  revalidateAll(found.task.projectId);
  return { error: null, ok: true };
}

/** Mở lại việc đã đóng nhầm. */
export async function reopenTaskAction(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();

  const found = await taskContext(id);
  if (!found) return { ok: false, error: "Không tìm thấy việc bảo hành." };
  if (!can(user, "maintenance.manage", found.ctx)) {
    return { ok: false, error: DENIED };
  }

  await reopenTask(user, found.task);
  revalidateAll(found.task.projectId);
  return { ok: true };
}

/** Xóa mềm một việc bảo hành. */
export async function deleteTaskAction(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();

  const found = await taskContext(id);
  if (!found) return { ok: false, error: "Không tìm thấy việc bảo hành." };
  if (!can(user, "maintenance.manage", found.ctx)) {
    return { ok: false, error: DENIED };
  }

  await softDeleteTask(user, found.task);
  revalidateAll(found.task.projectId);
  return { ok: true };
}

// ═══════════════════ CẤU HÌNH MỐC ═══════════════════

/**
 * Đổi danh sách mốc kiểm tra định kỳ (mặc định 3 · 6 · 12 tháng).
 * Chỉ đổi mốc cho các dự án bàn giao TỪ ĐÂY VỀ SAU và cho lần đồng bộ tiếp
 * theo; lịch đã sinh trước đó giữ nguyên để không xóa mất lịch sử.
 */
export async function updateMilestoneSettingAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  if (!can(user, "setting.manage")) {
    return { error: "Bạn không có quyền sửa cấu hình hệ thống." };
  }

  const parsed = milestoneSettingSchema.safeParse({
    months: formData.get("months") ?? "",
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  await setMilestoneMonths(user, parsed.data.months);
  revalidatePath("/maintenance");
  return { error: null, ok: true };
}
