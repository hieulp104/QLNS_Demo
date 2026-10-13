"use server";

/**
 * Server Action của module Nghỉ phép.
 *
 * Nộp đơn KHÔNG cần mã quyền: ai đăng nhập cũng xin nghỉ được, và chỉ xin cho
 * chính mình (userId lấy từ session, không nhận từ client).
 * Duyệt / từ chối cần `leave.approve`, kiểm theo phòng của người nộp đơn.
 */

import { revalidatePath } from "next/cache";
import { requireUser } from "@/modules/auth/auth.service";
import { can } from "@/common/permissions/permissions";
import { AttendanceLockedError } from "@/modules/attendance/attendance.lock";
import {
  cancelLeave,
  createLeave,
  decideLeave,
  getLeave,
} from "@/modules/leave/leave.service";
import {
  createLeaveSchema,
  decideLeaveSchema,
} from "@/modules/leave/leave.schema";

export type ActionState = { error: string | null; ok?: boolean };

function firstIssue(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? "Dữ liệu nhập vào không hợp lệ.";
}

export async function createLeaveAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();

  const parsed = createLeaveSchema.safeParse({
    type: formData.get("type") ?? "",
    fromDate: formData.get("fromDate") ?? "",
    toDate: formData.get("toDate") ?? "",
    halfDay: formData.get("halfDay") === "on",
    reason: formData.get("reason") ?? "",
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  await createLeave(user, parsed.data);
  revalidatePath("/nghi-phep");
  return { error: null, ok: true };
}

export async function decideLeaveAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");

  const request = await getLeave(id);
  if (!request) return { error: "Không tìm thấy đơn nghỉ phép." };

  // Scope DEPARTMENT: chỉ duyệt được đơn của người trong phòng mình.
  if (!can(user, "leave.approve", { departmentId: request.user.departmentId })) {
    return { error: "Bạn không có quyền duyệt đơn của nhân viên này." };
  }
  if (request.status !== "PENDING") {
    return { error: "Đơn này đã được xử lý rồi." };
  }
  if (request.user.id === user.id && !can(user, "leave.approve")) {
    return { error: "Bạn không thể tự duyệt đơn của chính mình." };
  }

  const parsed = decideLeaveSchema.safeParse({
    id,
    status: formData.get("status") ?? "",
    decisionNote: formData.get("decisionNote") ?? "",
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  try {
    await decideLeave(user, request, parsed.data);
  } catch (error) {
    // Đơn rơi vào tháng bảng công đã chốt — báo cho người duyệt, không ghi gì.
    if (error instanceof AttendanceLockedError) return { error: error.message };
    throw error;
  }
  revalidatePath("/nghi-phep");
  revalidatePath("/cham-cong");
  return { error: null, ok: true };
}

/** Người nộp tự hủy đơn khi chưa ai duyệt. */
export async function cancelLeaveAction(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();

  const request = await getLeave(id);
  if (!request) return { ok: false, error: "Không tìm thấy đơn nghỉ phép." };
  if (request.user.id !== user.id) {
    return { ok: false, error: "Chỉ người nộp đơn mới hủy được đơn của mình." };
  }
  if (request.status !== "PENDING") {
    return { ok: false, error: "Đơn đã được xử lý, không hủy được nữa." };
  }

  await cancelLeave(user, request);
  revalidatePath("/nghi-phep");
  return { ok: true };
}
