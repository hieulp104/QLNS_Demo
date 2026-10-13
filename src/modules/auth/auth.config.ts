import type { NextAuthConfig } from "next-auth";

/**
 * Cấu hình dùng chung cho CẢ middleware (edge runtime) và server.
 * ⚠ KHÔNG import Prisma / bcrypt vào file này — middleware chạy ở edge runtime,
 * không dùng được native module. Phần đó nằm ở src/lib/auth.ts.
 */
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60, // 8 tiếng — hết ca làm thì phải đăng nhập lại
  },
  trustHost: true,
  providers: [], // nạp ở src/lib/auth.ts
  callbacks: {
    /** Chặn truy cập ở tầng middleware. Kiểm tra quyền chi tiết nằm trong từng action/page. */
    authorized({ auth, request }) {
      const isLoggedIn = Boolean(auth?.user);
      const { pathname } = request.nextUrl;

      const isPublic =
        pathname === "/login" ||
        pathname.startsWith("/api/auth") ||
        pathname.startsWith("/_next") ||
        pathname === "/favicon.ico";

      if (isPublic) return true;
      return isLoggedIn;
    },
  },
} satisfies NextAuthConfig;
