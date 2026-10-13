"use server";

import { AuthError } from "next-auth";
import {
  changeOwnPassword,
  requireUser,
  signIn,
  signOut,
} from "@/modules/auth/auth.service";
import { changePasswordSchema, loginSchema } from "@/modules/auth/auth.schema";

export type LoginState = {
  error: string | null;
  /** Giữ lại email/SĐT đã nhập để không bắt người dùng gõ lại khi sai mật khẩu. */
  login?: string;
};

/**
 * Chuẩn hóa callbackUrl do proxy.ts gắn vào thành đường dẫn nội bộ.
 * proxy gắn URL tuyệt đối; chỉ nhận lại phần path để tránh open redirect
 * (kẻ xấu gửi link /login?callbackUrl=https://site-gia-mao...).
 */
function safeCallbackPath(raw: string | null | undefined): string {
  const fallback = "/dashboard";
  if (!raw) return fallback;

  let path: string;
  try {
    // URL tuyệt đối → lấy path; đường dẫn tương đối → giữ nguyên.
    path = raw.startsWith("/") ? raw : new URL(raw).pathname + new URL(raw).search;
  } catch {
    return fallback;
  }

  // "//host" bị trình duyệt hiểu là protocol-relative URL → vẫn là ra ngoài.
  if (!path.startsWith("/") || path.startsWith("//")) return fallback;
  // Quay lại chính trang đăng nhập thì vô nghĩa.
  if (path === "/login" || path.startsWith("/login?")) return fallback;

  return path;
}

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const login = String(formData.get("login") ?? "");
  const password = String(formData.get("password") ?? "");
  const callbackUrl = safeCallbackPath(
    formData.get("callbackUrl") as string | null,
  );

  const parsed = loginSchema.safeParse({ login, password });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
      login,
    };
  }

  try {
    await signIn("credentials", {
      // Gửi chuỗi gốc — authorize() tự validate lại bằng cùng schema.
      login,
      password: parsed.data.password,
      redirectTo: callbackUrl,
    });
  } catch (error) {
    // signIn ném redirect khi thành công — phải để nó đi tiếp, không bắt.
    if (error instanceof AuthError) {
      // Không phân biệt "sai tên đăng nhập" và "sai mật khẩu" để tránh dò tài khoản.
      return {
        error:
          "Tên đăng nhập hoặc mật khẩu không đúng, hoặc tài khoản đã bị khóa.",
        login,
      };
    }
    throw error;
  }

  return { error: null };
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}

export type ChangePasswordState = { error: string | null };

/**
 * AU-06 / AU-07 — người dùng tự đổi mật khẩu của mình.
 *
 * Đổi xong thì đăng xuất luôn, buộc đăng nhập lại bằng mật khẩu mới:
 * vừa đúng thông lệ bảo mật, vừa tránh việc token cũ còn giữ
 * `mustChangePassword = true` cho tới lượt nạp lại quyền kế tiếp.
 */
export async function changePasswordAction(
  _prev: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const user = await requireUser();

  const parsed = changePasswordSchema.safeParse({
    currentPassword: String(formData.get("currentPassword") ?? ""),
    newPassword: String(formData.get("newPassword") ?? ""),
    confirmPassword: String(formData.get("confirmPassword") ?? ""),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }

  const result = await changeOwnPassword(
    user.id,
    parsed.data.currentPassword,
    parsed.data.newPassword,
  );

  if (!result.ok) {
    return {
      error:
        result.reason === "WRONG_CURRENT"
          ? "Mật khẩu hiện tại không đúng."
          : "Mật khẩu mới phải khác mật khẩu hiện tại.",
    };
  }

  // signOut ném redirect — không bọc try/catch để nó đi tiếp.
  await signOut({ redirectTo: "/login?doi-mat-khau=thanh-cong" });
  return { error: null };
}
