/**
 * ═══════════════════════════════════════════════════════════════
 * Chốt bảng công theo tháng
 * ═══════════════════════════════════════════════════════════════
 * Kế toán phản ánh 08/10/2026: đã kiểm từng tháng rồi mà hôm sau vẫn thấy
 * tháng cũ "nhảy công". Bảng lưới ghi ngay khi bấm một ô (không hỏi lại), nên
 * một cú bấm nhầm, hay kéo chuột để cuộn khi đang ở chế độ tô, là đổi số liệu
 * tháng đã kiểm. Chốt tháng = khóa MỌI đường ghi vào bảng công của tháng đó
 * (chấm ô, tô nhiều ô, điền đủ công, duyệt đơn phép) cho tới khi mở lại.
 *
 * Lưu ở `system_settings` một khóa duy nhất, map "YYYY-MM" → ai chốt, lúc nào.
 * Không đổi schema.
 *
 * ⚠ File này KHÔNG import `attendance.service` — service import ngược lại nó.
 */

import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/shared/prisma/prisma.service";

type SettingClient = Pick<PrismaClient, "systemSetting">;

const KEY = "attendance.lockedMonths";

export type MonthLock = { at: string; byId: string; byName: string };

/** Lỗi khi ghi vào tháng đã chốt — action bắt lại để hiện câu thông báo. */
export class AttendanceLockedError extends Error {
  constructor(public readonly label: string) {
    super(`Bảng công tháng ${label} đã chốt.`);
    this.name = "AttendanceLockedError";
  }
}

export function lockKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

async function readLocks(client: SettingClient): Promise<Record<string, MonthLock>> {
  const row = await client.systemSetting.findUnique({ where: { key: KEY } });
  const value = row?.value;
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, MonthLock>)
    : {};
}

/** Tháng này đã chốt chưa — null là đang mở. */
export async function monthLock(
  year: number,
  month: number,
  client: SettingClient = prisma,
): Promise<MonthLock | null> {
  return (await readLocks(client))[lockKey(year, month)] ?? null;
}

/**
 * Chặn ghi nếu bất kỳ ngày nào rơi vào tháng đã chốt. `workDate` là cột `date`
 * (00:00 UTC) nên tháng lấy theo getUTC*.
 */
export async function assertDatesOpen(client: SettingClient, dates: Date[]): Promise<void> {
  if (dates.length === 0) return;
  const locks = await readLocks(client);
  for (const d of dates) {
    const key = lockKey(d.getUTCFullYear(), d.getUTCMonth() + 1);
    if (locks[key]) throw new AttendanceLockedError(`${d.getUTCMonth() + 1}/${d.getUTCFullYear()}`);
  }
}

export async function setMonthLock(
  client: SettingClient,
  input: { year: number; month: number; locked: boolean; byId: string; byName: string },
): Promise<void> {
  const locks = await readLocks(client);
  const key = lockKey(input.year, input.month);
  if (input.locked) {
    locks[key] = { at: new Date().toISOString(), byId: input.byId, byName: input.byName };
  } else {
    delete locks[key];
  }
  await client.systemSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: locks },
    update: { value: locks },
  });
}
