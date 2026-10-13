import type { Metadata } from "next";
import {
  NotificationsWorkspace,
  type NotificationsWorkspaceProps,
} from "@/modules/notifications/components/notifications-workspace";

export const metadata: Metadata = { title: "Thông báo" };

export default function NotificationsPage(props: NotificationsWorkspaceProps) {
  return <NotificationsWorkspace {...props} />;
}
