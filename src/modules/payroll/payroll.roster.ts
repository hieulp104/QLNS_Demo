/**
 * ═══════════════════════════════════════════════════════════════
 * Danh sách chấm công / bảng lương theo tháng — ai được ẩn khỏi đâu
 * ═══════════════════════════════════════════════════════════════
 * Không phải ai có tài khoản cũng cần chấm công hay tính lương: tài khoản kỹ
 * thuật (IT quản lý web) không cần cả hai, người lương khoán (Giám đốc, KT
 * thuế) không cần chấm công nhưng VẪN phải có trong bảng lương. Nên đây là hai
 * công tắc riêng chứ không gộp một cờ "không phải nhân viên".
 *
 * Lưu ở `system_settings`, mỗi tháng một khóa `roster.YYYY-MM`. Tháng chưa có
 * khóa riêng thì thừa kế khóa gần nhất trước đó — bật/tắt một lần là áp dụng
 * cho các tháng sau, không phải làm lại mỗi tháng. Tháng cũ giữ nguyên khóa của
 * nó nên bảng tháng trước không bị đổi theo.
 *
 * ⚠ File này KHÔNG import `payroll.service` / `attendance.service`: cả hai đều
 * import ngược lại file này, vòng import sẽ làm một bên nhận `undefined`.
 */

import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/shared/prisma/prisma.service";

type SettingClient = Pick<PrismaClient, "systemSetting">;

const KEY_PREFIX = "roster.";

export type RosterKind = "attendance" | "payroll";

/** Những người bị ẩn trong một tháng. */
export type Roster = {
  noAttendance: Set<string>;
  noPayroll: Set<string>;
};

type RosterJson = { noAttendance?: unknown; noPayroll?: unknown };

export function rosterKey(year: number, month: number): string {
  return `${KEY_PREFIX}${year}-${String(month).padStart(2, "0")}`;
}

function ids(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function parse(value: unknown): Roster {
  const raw = (value ?? {}) as RosterJson;
  return {
    noAttendance: new Set(ids(raw.noAttendance)),
    noPayroll: new Set(ids(raw.noPayroll)),
  };
}

function serialize(r: Roster) {
  return { noAttendance: [...r.noAttendance], noPayroll: [...r.noPayroll] };
}

/** Danh sách ẩn của tháng — tháng chưa có khóa riêng thì lấy khóa gần nhất trước đó. */
export async function rosterAt(
  year: number,
  month: number,
  client: SettingClient = prisma,
): Promise<Roster> {
  const row = await client.systemSetting.findFirst({
    where: { key: { startsWith: KEY_PREFIX, lte: rosterKey(year, month) } },
    orderBy: { key: "desc" },
    select: { value: true },
  });
  return parse(row?.value);
}

/**
 * Bật/tắt một người ở một danh sách, từ tháng này trở đi.
 * Ghi khóa của tháng này (thừa kế xong mới sửa) VÀ sửa luôn các khóa của tháng
 * sau đã có sẵn — không thì tháng sau đang có khóa riêng sẽ chặn mất thay đổi,
 * người dùng tắt ở tháng 10 mà sang tháng 11 vẫn thấy.
 */
export async function setRosterFlag(
  client: SettingClient,
  input: { userId: string; year: number; month: number; kind: RosterKind; included: boolean },
): Promise<void> {
  const key = rosterKey(input.year, input.month);
  const field = input.kind === "attendance" ? "noAttendance" : "noPayroll";

  const apply = (r: Roster) => {
    if (input.included) r[field].delete(input.userId);
    else r[field].add(input.userId);
    return r;
  };

  const current = apply(await rosterAt(input.year, input.month, client));
  await client.systemSetting.upsert({
    where: { key },
    create: { key, value: serialize(current) },
    update: { value: serialize(current) },
  });

  const later = await client.systemSetting.findMany({
    where: { key: { startsWith: KEY_PREFIX, gt: key } },
    select: { key: true, value: true },
  });
  for (const row of later) {
    await client.systemSetting.update({
      where: { key: row.key },
      data: { value: serialize(apply(parse(row.value))) },
    });
  }
}
