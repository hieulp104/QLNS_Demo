import NextAuth from "next-auth";
import { authConfig } from "@/modules/auth/auth.config";

/**
 * Từ Next.js 16, "middleware" đổi tên thành "proxy" (chức năng giữ nguyên).
 *
 * Ở đây chỉ kiểm tra "đã đăng nhập hay chưa" — một lớp chặn lạc quan.
 * Kiểm tra quyền chi tiết (can()) nằm ở từng page/server action, vì proxy chạy
 * ở edge runtime nên không truy vấn được database.
 */
export default NextAuth(authConfig).auth;

export const config = {
  // api/mcp tự xác thực bằng bearer token (client MCP không có cookie phiên).
  matcher: ["/((?!api/auth|api/mcp|_next/static|_next/image|favicon.ico|.*\\.png$).*)"],
};
