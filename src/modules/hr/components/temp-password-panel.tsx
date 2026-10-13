"use client";

import { Alert, Button, ButtonLink, Card, IconTile, InlineCode } from "@/components/ui";

import { useState } from "react";
import { Check, Copy, KeyRound, TriangleAlert } from "lucide-react";

type Props = {
  title: string;
  employeeCode?: string;
  /** Email hoặc SĐT dùng để đăng nhập. */
  loginName?: string;
  password: string;
  backHref?: string;
};

/**
 * Hiện mật khẩu tạm sau khi tạo tài khoản (HR-02) hoặc đặt lại mật khẩu (HR-07).
 *
 * Mật khẩu chỉ tồn tại trong lần trả về này — server lưu bản băm, không lưu bản rõ,
 * nên rời trang là không xem lại được. Muốn có mật khẩu khác thì đặt lại lần nữa.
 */
export function TempPasswordPanel({
  title,
  employeeCode,
  loginName,
  password,
  backHref,
}: Props) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Trình duyệt chặn clipboard (không phải HTTPS) — người dùng chép tay được.
    }
  }

  return (
    <Card variant="highlight" className="p-5">
      <div className="flex items-start gap-3">
        <IconTile tone="primary" shape="circle">
          <KeyRound className="size-4" />
        </IconTile>
        <div className="min-w-0 flex-1">
          <h2 className="text-h2 font-bold text-foreground">{title}</h2>
          {employeeCode && (
            <p className="mt-0.5 text-sm text-muted">
              Mã nhân viên: <strong className="text-foreground">{employeeCode}</strong>
            </p>
          )}
          {loginName && (
            <p className="mt-0.5 text-sm text-muted">
              Tên đăng nhập: <strong className="text-foreground">{loginName}</strong>
            </p>
          )}

          <p className="mt-4 text-sm font-medium text-foreground">Mật khẩu tạm</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <InlineCode>
              {password}
            </InlineCode>
            <Button
              type="button"
              onClick={copy}
              variant="outline" className="px-3 py-2"
            >
              {copied ? (
                <Check className="size-4" />
              ) : (
                <Copy className="size-4" />
              )}
              {copied ? "Đã chép" : "Chép"}
            </Button>
          </div>

          <Alert variant="warning" className="mt-4 flex items-start gap-2">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <span>
              Ghi lại hoặc gửi cho nhân viên ngay. Rời khỏi trang này sẽ không xem
              lại được mật khẩu. Nhân viên bắt buộc đổi mật khẩu ở lần đăng nhập
              đầu tiên.
            </span>
          </Alert>

          {backHref && (
            <ButtonLink
              href={backHref}
              className="mt-5"
            >
              Về danh sách nhân sự
            </ButtonLink>
          )}
        </div>
      </div>
    </Card>
  );
}
