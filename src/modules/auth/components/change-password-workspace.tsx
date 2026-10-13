import { Alert, Button, Card, IconTile, TextLink } from "@/components/ui";
import { redirect } from "next/navigation";
import { ArrowLeft, KeyRound, ShieldAlert } from "lucide-react";

import { getCurrentUser } from "@/modules/auth/auth.service";
import { logoutAction } from "@/modules/auth/auth.actions";
import { ChangePasswordForm } from "@/modules/auth/components/change-password-form";

/**
 * Trang đổi mật khẩu (AU-06) — cố tình đặt NGOÀI nhóm route `(main)`.
 *
 * Nhờ vậy layout `(main)` được phép chuyển hướng vô điều kiện khi
 * `mustChangePassword = true` (AU-07) mà không tự đá chính nó thành vòng lặp.
 */
export async function ChangePasswordWorkspace() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const forced = user.mustChangePassword;

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center gap-3">
          <IconTile tone="success" size="xl">
            <KeyRound className="size-5" />
          </IconTile>
          <div>
            <h1 className="text-h1 font-bold tracking-tight text-foreground">
              Đổi mật khẩu
            </h1>
            <p className="text-sm text-muted">{user.email ?? user.phone}</p>
          </div>
        </div>

        {forced && (
          <Alert variant="warning" className="mb-6 flex items-start gap-2.5">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" />
            <span>
              Đây là lần đăng nhập đầu tiên của bạn. Vui lòng đổi mật khẩu được
              cấp sang mật khẩu của riêng bạn trước khi sử dụng hệ thống.
            </span>
          </Alert>
        )}

        <Card className="p-6">
          <ChangePasswordForm />
        </Card>

        <div className="mt-6 text-center text-sm">
          {forced ? (
            // Đang bị ép đổi thì không có đường vào hệ thống — chỉ còn lối thoát ra.
            <form action={logoutAction}>
              <Button
                type="submit"
                variant="link"
              >
                Đăng xuất
              </Button>
            </form>
          ) : (
            <TextLink
              href="/dashboard"
              className="inline-flex items-center gap-1.5"
            >
              <ArrowLeft className="size-4" />
              Quay lại hệ thống
            </TextLink>
          )}
        </div>
      </div>
    </main>
  );
}
