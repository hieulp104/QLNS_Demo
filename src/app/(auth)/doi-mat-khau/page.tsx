import type { Metadata } from "next";
import { ChangePasswordWorkspace } from "@/modules/auth/components/change-password-workspace";

export const metadata: Metadata = { title: "Đổi mật khẩu" };

export default function ChangePasswordPage() {
  return <ChangePasswordWorkspace />;
}
