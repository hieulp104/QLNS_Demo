"use server";

/**
 * Server Action của module Thông báo.
 *
 * Không có mã quyền riêng: mỗi người chỉ đọc và đánh dấu thông báo CỦA CHÍNH
 * MÌNH. Chốt chặn nằm ở điều kiện recipientId trong service, không phải ở UI.
 */

import { revalidatePath } from "next/cache";
import { requireUser } from "@/modules/auth/auth.service";
import {
  markAllRead,
  markRead,
} from "@/modules/notifications/notifications.service";

export async function markNotificationReadAction(
  id: string,
): Promise<{ ok: true }> {
  const user = await requireUser();
  await markRead(user.id, id);
  revalidatePath("/thong-bao");
  return { ok: true };
}

export async function markAllNotificationsReadAction(): Promise<{
  ok: true;
  count: number;
}> {
  const user = await requireUser();
  const count = await markAllRead(user.id);
  revalidatePath("/thong-bao");
  return { ok: true, count };
}
