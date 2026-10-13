"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/modules/auth/auth.service";
import { can } from "@/common/permissions/permissions";
import { ok, fail, type ActionResult } from "@/common/filters/error";
import { saveRoleGrants } from "@/modules/system/system.service";
import { saveRoleGrantsSchema } from "@/modules/system/system.schema";

/**
 * SY-03 — lưu bộ quyền một vai trò. Gọi trực tiếp từ client component
 * (không qua form) nên nhận input JSON và trả ActionResult chuẩn.
 */
export async function saveRoleGrantsAction(
  input: unknown,
): Promise<ActionResult<{ saved: true }>> {
  // 1. Session
  const user = await requireUser();

  // 2. Quyền — chỉ người có role.manage (mặc định: Director).
  if (!can(user, "role.manage")) {
    return fail("PERMISSION_DENIED", "Chỉ Giám đốc mới được sửa phân quyền.");
  }

  // 3. Validate
  const parsed = saveRoleGrantsSchema.safeParse(input);
  if (!parsed.success) {
    return fail(
      "VALIDATION_ERROR",
      parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ.",
    );
  }

  // 4. Ghi (kèm AuditLog trong transaction ở service)
  const result = await saveRoleGrants(
    user,
    parsed.data.roleId,
    parsed.data.grants,
  );
  if (!result.ok) {
    const message =
      result.reason === "DIRECTOR_LOCKED"
        ? "Vai trò Giám đốc luôn toàn quyền — không sửa được để tránh tự khóa hệ thống."
        : result.reason === "AI_MANAGE_REQUIRED"
          ? "Bạn không có quyền quản lý tài khoản NA AI."
        : result.reason === "BAD_PERMISSION"
          ? "Có mã quyền không tồn tại trong danh mục."
          : "Không tìm thấy vai trò.";
    return fail(
      result.reason === "DIRECTOR_LOCKED" || result.reason === "AI_MANAGE_REQUIRED" ? "PERMISSION_DENIED" : "VALIDATION_ERROR",
      message,
    );
  }

  revalidatePath("/permissions");
  return ok({ saved: true });
}
