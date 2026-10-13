import { redirect } from "next/navigation";
import { getCurrentUser } from "@/modules/auth/auth.service";
import {
  hasPermission,
  type PermissionCode,
  type SessionUser,
} from "@/common/permissions/permissions";

/**
 * Chặn truy cập trang ở TẦNG SERVER.
 * Ẩn menu trên UI chỉ là phụ — mọi trang có quyền hạn chế đều phải gọi hàm này.
 *
 * @example
 *   const user = await requirePagePermission("finance.view");
 */
export async function requirePagePermission(
  permission: PermissionCode,
): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  if (!hasPermission(user, permission)) {
    redirect("/khong-co-quyen");
  }

  return user;
}
