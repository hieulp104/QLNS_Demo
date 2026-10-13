import {
  listRecent,
  unreadCount,
} from "@/modules/notifications/notifications.service";
import { NotificationBell } from "@/modules/notifications/components/notification-bell";

/**
 * Bọc server cho chuông thông báo: nạp số chưa đọc + vài tin mới nhất rồi giao
 * cho client. Layout render lại mỗi lần điều hướng nên số liệu luôn tươi;
 * chuông tự gọi router.refresh() theo nhịp cho trường hợp đứng yên một chỗ.
 */
export async function NotificationBellSlot({ userId }: { userId: string }) {
  const [count, items] = await Promise.all([
    unreadCount(userId),
    listRecent(userId),
  ]);
  return <NotificationBell count={count} items={items} />;
}
