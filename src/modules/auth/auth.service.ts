import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { authConfig } from "@/modules/auth/auth.config";
import { prisma } from "@/shared/prisma/prisma.service";
import { widestScope, type SessionUser } from "@/common/permissions/permissions";
import type { PermissionScope } from "@/generated/prisma/enums";

import { loginSchema } from "@/modules/auth/auth.schema";

export function isInteractiveAccount(user: {
  userType: "HUMAN" | "AI_AGENT";
  isActive: boolean;
  deletedAt: Date | null;
}): boolean {
  return user.userType === "HUMAN" && user.isActive && !user.deletedAt;
}

/**
 * Nạp toàn bộ quyền hiệu lực của user từ DB.
 * User nhiều role → gộp lại, mỗi quyền lấy scope RỘNG NHẤT.
 * Đây là nguồn chân lý lúc chạy — không phải DEFAULT_ROLE_GRANTS.
 */
export async function loadSessionUser(userId: string): Promise<SessionUser | null> {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null, isActive: true },
    include: {
      department: { select: { id: true, code: true } },
      roles: {
        include: {
          role: {
            include: {
              permissions: { include: { permission: true } },
            },
          },
        },
      },
    },
  });

  if (!user) return null;

  const permissions: Record<string, PermissionScope> = {};
  for (const { role } of user.roles) {
    for (const rp of role.permissions) {
      const merged = widestScope(permissions[rp.permission.code], rp.scope);
      if (merged) permissions[rp.permission.code] = merged;
    }
  }

  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    fullName: user.fullName,
    userType: user.userType,
    departmentId: user.departmentId,
    departmentCode: user.department?.code ?? null,
    roleCodes: user.roles.map((r) => r.role.code),
    permissions,
    mustChangePassword: user.mustChangePassword,
  };
}

/**
 * Bao lâu thì nạp lại quyền từ DB một lần.
 * Token sống 8 tiếng, nhưng nếu chỉ đọc lúc đăng nhập thì tài khoản bị cho nghỉ
 * giữa ca vẫn dùng được hệ thống tới hết ca (AU-05), và Director sửa quyền cũng
 * không có tác dụng ngay. 5 phút là mức đánh đổi giữa độ tươi và số truy vấn.
 */
const SESSION_REVALIDATE_MS = 5 * 60 * 1000;

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        login: { label: "Email hoặc số điện thoại", type: "text" },
        password: { label: "Mật khẩu", type: "password" },
      },
      async authorize(raw) {
        const parsed = loginSchema.safeParse(raw);
        if (!parsed.success) return null;

        const { login, password } = parsed.data;

        // SĐT chỉ duy nhất giữa người CHƯA nghỉ (partial unique index), nên
        // tra theo SĐT phải kèm deletedAt: null — không thì có thể vớ phải
        // hồ sơ cũ của người đã nghỉ từng dùng số này.
        const user = await prisma.user.findFirst({
          where:
            login.kind === "email"
              ? { email: login.value }
              : { phone: login.value, deletedAt: null },
          select: {
            id: true,
            email: true,
            fullName: true,
            passwordHash: true,
            isActive: true,
            deletedAt: true,
            userType: true,
          },
        });

        // Nhân viên đã nghỉ (soft delete) hoặc bị khóa → không cho đăng nhập,
        // nhưng hồ sơ và lịch sử vẫn giữ nguyên trong hệ thống.
        if (!user || !isInteractiveAccount(user)) return null;

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;

        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });

        return { id: user.id, email: user.email ?? undefined, name: user.fullName };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,

    async jwt({ token, user, trigger }) {
      const isStale =
        typeof token.refreshedAt !== "number" ||
        Date.now() - token.refreshedAt > SESSION_REVALIDATE_MS;

      // Lúc đăng nhập, khi client gọi update(), hoặc khi bản chụp quyền đã cũ.
      if (user?.id || trigger === "update" || isStale) {
        const id = user?.id ?? (token.sub as string | undefined);
        if (id) {
          const sessionUser = await loadSessionUser(id);
          if (sessionUser) {
            token.sub = sessionUser.id;
            token.sessionUser = sessionUser;
          } else {
            // Tài khoản vừa bị khóa/xóa mềm → vô hiệu hóa token.
            token.sessionUser = undefined;
          }
          token.refreshedAt = Date.now();
        }
      }
      return token;
    },

    async session({ session, token }) {
      const sessionUser = token.sessionUser as SessionUser | undefined;

      // Token còn hạn nhưng tài khoản đã bị khóa/cho nghỉ → coi như chưa đăng nhập.
      // Xóa cả `id` để getCurrentUser() trả null thay vì trả user rỗng quyền.
      if (!sessionUser) {
        session.user = { ...session.user, id: "" } as typeof session.user;
        return session;
      }

      session.user = {
        ...session.user,
        ...sessionUser,
      } as typeof session.user;
      return session;
    },
  },
});

/**
 * Lấy user hiện tại kèm bảng quyền. Dùng ở Server Component và Server Action.
 * Trả về null nếu chưa đăng nhập.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await auth();
  const user = session?.user as unknown as SessionUser | undefined;
  return user?.id ? user : null;
}

/** Bắt buộc phải đăng nhập — ném lỗi nếu không, dùng trong server action. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  return user;
}

/**
 * Đổi mật khẩu của chính mình. Phải nhập đúng mật khẩu cũ để xác nhận —
 * chống trường hợp ai đó ngồi vào máy đang mở sẵn session.
 *
 * Đổi xong thì `mustChangePassword` về false, mở khóa hệ thống cho tài khoản mới.
 */
export async function changeOwnPassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<{ ok: true } | { ok: false; reason: "WRONG_CURRENT" | "SAME_AS_OLD" }> {
  const user = await prisma.user.findFirst({
    where: { id: userId, userType: "HUMAN", deletedAt: null, isActive: true },
    select: { id: true, passwordHash: true },
  });

  if (!user) return { ok: false, reason: "WRONG_CURRENT" };

  const matched = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!matched) return { ok: false, reason: "WRONG_CURRENT" };

  // Đổi sang đúng mật khẩu cũ thì coi như không đổi — chặn để AU-07 có ý nghĩa.
  if (await bcrypt.compare(newPassword, user.passwordHash)) {
    return { ok: false, reason: "SAME_AS_OLD" };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await bcrypt.hash(newPassword, 10),
      mustChangePassword: false,
    },
  });

  return { ok: true };
}
