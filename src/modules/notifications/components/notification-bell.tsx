"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, LoaderCircle } from "lucide-react";
import { Badge, Button, Card } from "@/components/ui";
import { cn, formatRelativeTime } from "@/lib/utils";
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/modules/notifications/notifications.actions";

export type BellItem = {
  id: string;
  title: string;
  body: string | null;
  href: string | null;
  readAt: Date | null;
  createdAt: Date;
  actor: { id: string; fullName: string } | null;
};

/** Nhịp tự làm mới khi tab đang mở — đủ nhanh để không bỏ lỡ, đủ chậm để không tốn. */
const REFRESH_MS = 60_000;

/**
 * Chuông thông báo trên header.
 *
 * Dữ liệu do server truyền xuống (layout đã nạp sẵn), client chỉ lo mở/đóng và
 * gọi router.refresh() theo nhịp — không dựng thêm API riêng, đúng quy ước
 * "Route Handler chỉ dùng cho xuất Excel / presigned URL / health check".
 */
export function NotificationBell({
  count,
  items,
}: {
  count: number;
  items: BellItem[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Làm mới định kỳ, chỉ khi tab đang hiển thị — tab nền không cần tốn truy vấn.
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [router]);

  // Bấm ra ngoài hoặc nhấn Esc thì đóng bảng.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function openItem(item: BellItem) {
    setOpen(false);
    startTransition(async () => {
      if (!item.readAt) await markNotificationReadAction(item.id);
      router.push(item.href ?? "/thong-bao");
      router.refresh();
    });
  }

  function markAll() {
    startTransition(async () => {
      await markAllNotificationsReadAction();
      router.refresh();
    });
  }

  return (
    <div ref={wrapperRef} className="relative">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={
          count > 0 ? `Thông báo (${count} chưa đọc)` : "Thông báo"
        }
        aria-expanded={open}
        title="Thông báo"
        onClick={() => setOpen((v) => !v)}
        className="relative size-9 text-header-foreground hover:bg-surface-raised"
      >
        <Bell className="size-[18px]" />
        {count > 0 && (
          <span className="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold leading-4 text-on-primary">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </Button>

      {open && (
        <Card
          className="absolute right-0 top-11 z-50 w-[min(22rem,calc(100vw-2rem))] overflow-hidden p-0"
          role="dialog"
          aria-label="Danh sách thông báo"
        >
          <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
            <span className="text-sm font-semibold text-foreground">
              Thông báo
              {count > 0 && (
                <Badge variant="danger" className="ml-2">
                  {count} chưa đọc
                </Badge>
              )}
            </span>
            {count > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="px-2 py-1 text-xs"
                disabled={pending}
                onClick={markAll}
              >
                {pending ? (
                  <LoaderCircle className="size-3.5 animate-spin" />
                ) : (
                  <CheckCheck className="size-3.5" />
                )}
                Đọc hết
              </Button>
            )}
          </div>

          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted">
              Chưa có thông báo nào.
            </p>
          ) : (
            <ul className="max-h-[60vh] divide-y divide-line overflow-y-auto">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => openItem(item)}
                    className={cn(
                      "block w-full px-4 py-3 text-left transition-colors hover:bg-surface-subtle",
                      !item.readAt && "bg-surface-info/40",
                    )}
                  >
                    <span className="flex items-start gap-2">
                      {!item.readAt && (
                        <span
                          aria-hidden
                          className="mt-1.5 size-2 shrink-0 rounded-full bg-danger"
                        />
                      )}
                      <span className="min-w-0">
                        <span
                          className={cn(
                            "block text-sm text-foreground",
                            !item.readAt && "font-medium",
                          )}
                        >
                          {item.title}
                        </span>
                        {item.body && (
                          <span className="mt-0.5 block truncate text-xs text-muted">
                            {item.body}
                          </span>
                        )}
                        <span className="mt-1 block text-xs text-muted">
                          {item.actor ? `${item.actor.fullName} · ` : ""}
                          {formatRelativeTime(item.createdAt)}
                        </span>
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="border-t border-line px-4 py-2.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full justify-center px-2 py-1.5 text-xs"
              onClick={() => {
                setOpen(false);
                router.push("/thong-bao");
              }}
            >
              Xem tất cả thông báo
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
