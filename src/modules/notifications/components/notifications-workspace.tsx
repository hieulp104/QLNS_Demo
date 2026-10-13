import { redirect } from "next/navigation";
import { getCurrentUser } from "@/modules/auth/auth.service";
import { PageHeader } from "@/components/patterns/page-header";
import {
  listNotifications,
  unreadCount,
} from "@/modules/notifications/notifications.service";
import { NotificationList } from "@/modules/notifications/components/notification-list";

export type NotificationsWorkspaceProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const first = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v;

/**
 * Trang /thong-bao — không có mã quyền riêng: ai đăng nhập cũng xem được, và
 * chỉ xem được thông báo của chính mình (service lọc theo recipientId).
 */
export async function NotificationsWorkspace({
  searchParams,
}: NotificationsWorkspaceProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const sp = await searchParams;
  const unreadOnly = first(sp["chua-doc"]) === "1";
  const page = Number(first(sp.page) ?? 1);

  const [data, unread] = await Promise.all([
    listNotifications(user.id, {
      page: Number.isInteger(page) && page > 0 ? page : 1,
      unreadOnly,
    }),
    unreadCount(user.id),
  ]);

  return (
    <>
      <PageHeader title="Thông báo" />
      <NotificationList
        items={data.rows}
        page={data.page}
        pageCount={data.pageCount}
        unreadOnly={unreadOnly}
        unreadCount={unread}
      />
    </>
  );
}
