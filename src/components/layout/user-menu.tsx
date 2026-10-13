"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, KeyRound, LogOut } from "lucide-react";
import { logoutAction } from "@/modules/auth/auth.actions";
import { initials } from "@/lib/utils";

type Props = {
  fullName: string;
  email: string;
  roleLabel: string;
  /** Presigned URL ảnh đại diện (HR-08) — null thì hiện chữ cái viết tắt. */
  avatarSrc?: string | null;
};

export function UserMenu({ fullName, email, roleLabel, avatarSrc }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="group flex items-center gap-2.5 rounded-control border border-transparent px-2 py-1.5 transition-colors hover:bg-surface-subtle aria-expanded:border-line aria-expanded:bg-surface-subtle"
      >
        {avatarSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarSrc}
            alt=""
            className="size-9 rounded-full border border-line object-cover shadow-sm"
          />
        ) : (
          <span className="flex size-9 items-center justify-center rounded-full border border-line bg-surface-subtle text-xs font-semibold text-foreground shadow-sm">
            {initials(fullName)}
          </span>
        )}
        <span className="hidden text-left leading-tight sm:block">
          <span className="block text-sm font-medium text-foreground">
            {fullName}
          </span>
          <span className="block text-xs text-muted">{roleLabel}</span>
        </span>
        <ChevronDown className="size-4 text-muted transition-transform group-aria-expanded:rotate-180" />
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 cursor-default"
          />
          <div
            role="menu"
            className="absolute right-0 z-20 mt-2 w-60 overflow-hidden rounded-card border border-line bg-surface-raised shadow-popover"
          >
            <div className="border-b border-line px-4 py-3">
              <p className="text-sm font-medium text-foreground">{fullName}</p>
              <p className="mt-0.5 truncate text-xs text-muted">{email}</p>
            </div>
            <Link
              href="/doi-mat-khau"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2.5 border-b border-line px-4 py-3 text-sm text-foreground transition-colors hover:bg-surface-subtle"
            >
              <KeyRound className="size-4 text-muted" />
              Đổi mật khẩu
            </Link>
            <form action={logoutAction}>
              <button
                type="submit"
                role="menuitem"
                className="flex w-full items-center gap-2.5 px-4 py-3 text-sm text-foreground transition-colors hover:bg-surface-subtle"
              >
                <LogOut className="size-4 text-muted" />
                Đăng xuất
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
