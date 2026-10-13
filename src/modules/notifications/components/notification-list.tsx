"use client";

import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BellOff, CheckCheck, LoaderCircle } from "lucide-react";
import { Badge, Button, Card, Pagination, TabButton, Tabs, TabsList } from "@/components/ui";
import { cn, formatRelativeTime } from "@/lib/utils";
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/modules/notifications/notifications.actions";
import type { BellItem } from "@/modules/notifications/components/notification-bell";

/**
 * Danh sách thông báo đầy đủ ở trang /thong-bao.
 * Bấm vào một dòng thì đánh dấu đã đọc rồi mới điều hướng — nếu điều hướng
 * trước, việc đánh dấu bị hủy giữa chừng và thông báo cứ ở mãi trạng thái chưa đọc.
 */
export function NotificationList({
  items,
  page,
  pageCount,
  unreadOnly,
  unreadCount,
}: {
  items: BellItem[];
  page: number;
  pageCount: number;
  unreadOnly: boolean;
  unreadCount: number;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  function go(next: URLSearchParams) {
    const qs = next.toString();
    router.push(qs ? `/thong-bao?${qs}` : "/thong-bao");
  }

  function setFilter(only: boolean) {
    const next = new URLSearchParams(params);
    if (only) next.set("chua-doc", "1");
    else next.delete("chua-doc");
    next.delete("page");
    go(next);
  }

  function goToPage(p: number) {
    const next = new URLSearchParams(params);
    if (p <= 1) next.delete("page");
    else next.set("page", String(p));
    go(next);
  }

  function openItem(item: BellItem) {
    startTransition(async () => {
      if (!item.readAt) await markNotificationReadAction(item.id);
      if (item.href) router.push(item.href);
      router.refresh();
    });
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs>
          <TabsList>
            <TabButton active={!unreadOnly} onClick={() => setFilter(false)}>
              Tất cả
            </TabButton>
            <TabButton active={unreadOnly} onClick={() => setFilter(true)}>
              Chưa đọc
              {unreadCount > 0 && (
                <Badge variant="danger" className="ml-2">
                  {unreadCount}
                </Badge>
              )}
            </TabButton>
          </TabsList>
        </Tabs>

        {unreadCount > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="px-2.5 py-1.5"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await markAllNotificationsReadAction();
                router.refresh();
              })
            }
          >
            {pending ? (
              <LoaderCircle className="size-3.5 animate-spin" />
            ) : (
              <CheckCheck className="size-3.5" />
            )}
            Đánh dấu tất cả đã đọc
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <Card
          variant="filled"
          className="flex flex-col items-center gap-2 p-10 text-sm text-muted"
        >
          <BellOff className="size-6" />
          {unreadOnly
            ? "Bạn đã đọc hết thông báo."
            : "Chưa có thông báo nào."}
        </Card>
      ) : (
        <Card variant="list" className="overflow-hidden">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => openItem(item)}
              className={cn(
                "block w-full px-5 py-4 text-left transition-colors hover:bg-surface-subtle",
                !item.readAt && "bg-surface-info/40",
              )}
            >
              <span className="flex items-start gap-3">
                {!item.readAt ? (
                  <span
                    aria-hidden
                    className="mt-2 size-2 shrink-0 rounded-full bg-danger"
                  />
                ) : (
                  <span aria-hidden className="mt-2 size-2 shrink-0" />
                )}
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block text-sm text-foreground",
                      !item.readAt && "font-medium",
                    )}
                  >
                    {item.title}
                  </span>
                  {item.body && (
                    <span className="mt-1 block text-sm text-muted">
                      {item.body}
                    </span>
                  )}
                  <span className="mt-1.5 block text-xs text-muted">
                    {item.actor ? `${item.actor.fullName} · ` : ""}
                    {formatRelativeTime(item.createdAt)}
                  </span>
                </span>
              </span>
            </button>
          ))}
        </Card>
      )}

      {pageCount > 1 && (
        <div className="mt-5 flex justify-end">
          <Pagination
            page={page}
            pageCount={pageCount}
            onPageChange={goToPage}
            ariaLabel="Phân trang thông báo"
          />
        </div>
      )}
    </>
  );
}
