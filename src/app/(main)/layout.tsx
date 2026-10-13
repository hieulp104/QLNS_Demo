import { redirect } from "next/navigation";
import { getCurrentUser } from "@/modules/auth/auth.service";
import { AppShell } from "@/components/layout";
import { ROLE_LABEL, type RoleCode } from "@/common/permissions/permissions";
import { prisma } from "@/shared/prisma/prisma.service";
import { presignedDownloadUrl } from "@/lib/minio";
import { NotificationBellSlot } from "@/modules/notifications/components/notification-bell-slot";

/**
 * HR-08 — avatar cho góc phải header. `avatarUrl` lưu objectKey nên phải ký URL
 * mỗi lần render (URL sống 15 phút); đọc thẳng DB thay vì nhét vào JWT để đổi
 * ảnh là thấy ngay, không chờ chu kỳ nạp lại session.
 */
async function currentAvatarSrc(userId: string): Promise<string | null> {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { avatarUrl: true },
  });
  if (!row?.avatarUrl) return null;
  return presignedDownloadUrl(row.avatarUrl).catch(() => null);
}

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // AU-07 — tài khoản mới cấp chưa đổi mật khẩu thì không vào được trang nào
  // trong hệ thống. Trang /doi-mat-khau nằm ngoài nhóm route này nên không lặp.
  if (user.mustChangePassword) redirect("/doi-mat-khau");

  const roleLabel =
    user.roleCodes
      .map((c) => ROLE_LABEL[c as RoleCode] ?? c)
      .join(" · ") || "Nhân viên";

  return (
    <AppShell
      allowedPermissions={Object.keys(user.permissions)}
      fullName={user.fullName}
      email={user.email ?? user.phone ?? ""}
      roleLabel={roleLabel}
      avatarSrc={await currentAvatarSrc(user.id)}
      notificationSlot={<NotificationBellSlot userId={user.id} />}
    >
      {children}
    </AppShell>
  );
}
