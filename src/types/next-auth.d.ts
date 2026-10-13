import type { SessionUser } from "@/common/permissions/permissions";

declare module "next-auth" {
  interface Session {
    user: SessionUser & {
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    sessionUser?: SessionUser;
    /** Mốc thời gian (ms) lần cuối nạp lại quyền từ DB — xem SESSION_REVALIDATE_MS. */
    refreshedAt?: number;
  }
}

export {};
