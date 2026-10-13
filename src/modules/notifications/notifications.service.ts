/**
 * ═══════════════════════════════════════════════════════════════
 * Thông báo trong hệ thống — tầng ghi & đọc
 * ═══════════════════════════════════════════════════════════════
 * Mỗi người nhận là một dòng riêng (trạng thái đã đọc là của từng người).
 *
 * HAI QUY TẮC BẮT BUỘC khi thêm loại thông báo mới:
 *
 *  1. Danh sách người nhận phải được lọc theo QUYỀN trước khi ghi. Thông báo
 *     là một kênh dữ liệu như mọi kênh khác — gửi cho người không có quyền xem
 *     việc đó là rò rỉ, dù trang tương ứng có chặn.
 *  2. TUYỆT ĐỐI không đưa số tiền vào title/body. Bảng này gửi tới mọi vai trò,
 *     kể cả Thiết kế / Thi công vốn bị ẩn toàn bộ số tiền. Cần nói về tiền thì
 *     dẫn link sang trang có kiểm quyền, để trang đó quyết định hiển thị.
 */

import type { PrismaClient } from "@/generated/prisma/client";
import type {
  NotificationType,
  PermissionScope,
} from "@/generated/prisma/enums";
import { prisma } from "@/shared/prisma/prisma.service";
import type { PermissionCode } from "@/common/permissions/permissions";

/** Client thường hoặc client trong transaction. */
type NotifyClient = Pick<
  PrismaClient,
  "notification" | "user" | "projectMember"
>;

export type NotifyInput = {
  recipientIds: string[];
  type: NotificationType;
  title: string;
  body?: string | null;
  /** Bấm vào mở trang nào. Trang đó tự kiểm quyền lần nữa. */
  href?: string | null;
  entity?: string | null;
  entityId?: string | null;
  /** Người gây ra sự kiện — không tự gửi thông báo cho chính mình. */
  actorId?: string | null;
};

/**
 * Ghi thông báo cho một danh sách người nhận.
 * Trả về số dòng thực sự ghi được (sau khi lọc trùng, lọc chính actor và lọc
 * người đã nghỉ việc). Gọi BÊN TRONG transaction của nghiệp vụ để thông báo
 * rollback cùng — tránh báo một việc chưa từng xảy ra.
 */
export async function notify(
  client: NotifyClient,
  input: NotifyInput,
): Promise<number> {
  const ids = [...new Set(input.recipientIds.filter(Boolean))].filter(
    (id) => id !== input.actorId,
  );
  if (ids.length === 0) return 0;

  // Người đã nghỉ việc / bị khóa không nhận thông báo nữa.
  const active = await client.user.findMany({
    where: { id: { in: ids }, userType: "HUMAN", deletedAt: null, isActive: true },
    select: { id: true },
  });
  if (active.length === 0) return 0;

  const created = await client.notification.createMany({
    data: active.map((u) => ({
      recipientId: u.id,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      href: input.href ?? null,
      entity: input.entity ?? null,
      entityId: input.entityId ?? null,
      actorId: input.actorId ?? null,
    })),
  });
  return created.count;
}

/**
 * Như notify nhưng bỏ qua người đã nhận đúng thông báo đó gần đây.
 * Dùng cho script nhắc việc chạy hằng ngày: không có nó thì mỗi sáng người
 * dùng lại nhận một bản sao của cùng một lời nhắc.
 */
export async function notifyOnce(
  client: NotifyClient,
  input: NotifyInput,
  opts: { withinDays?: number } = {},
): Promise<number> {
  const withinDays = opts.withinDays ?? 7;
  const since = new Date(Date.now() - withinDays * 24 * 60 * 60 * 1000);

  const already = await client.notification.findMany({
    where: {
      recipientId: { in: input.recipientIds },
      type: input.type,
      entityId: input.entityId ?? null,
      createdAt: { gte: since },
    },
    select: { recipientId: true },
  });
  const skip = new Set(already.map((n) => n.recipientId));

  return notify(client, {
    ...input,
    recipientIds: input.recipientIds.filter((id) => !skip.has(id)),
  });
}

// ═══════════════════ CHỌN NGƯỜI NHẬN ═══════════════════

/** Thành viên của một dự án. */
export async function projectRecipients(
  client: NotifyClient,
  projectId: string,
): Promise<string[]> {
  const members = await client.projectMember.findMany({
    where: { projectId },
    select: { userId: true },
  });
  return [...new Set(members.map((m) => m.userId))];
}

/**
 * Người đang có một quyền (theo bảng role_permissions — nguồn chân lý lúc chạy).
 * Truyền `scope` để chỉ lấy người có quyền ở phạm vi đó, vd chỉ người quản
 * bảo hành toàn công ty (ALL) chứ không phải người chỉ quản dự án mình.
 */
export async function usersWithPermission(
  client: NotifyClient,
  permission: PermissionCode,
  opts: { scope?: PermissionScope } = {},
): Promise<string[]> {
  const users = await client.user.findMany({
    where: {
      userType: "HUMAN",
      deletedAt: null,
      isActive: true,
      roles: {
        some: {
          role: {
            permissions: {
              some: {
                permission: { is: { code: permission } },
                ...(opts.scope ? { scope: opts.scope } : {}),
              },
            },
          },
        },
      },
    },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

// ═══════════════════ ĐỌC ═══════════════════

export const PAGE_SIZE = 30;

/** Số thông báo chưa đọc — hiện trên chuông ở header. */
export function unreadCount(userId: string): Promise<number> {
  return prisma.notification.count({
    where: { recipientId: userId, readAt: null },
  });
}

const notificationSelect = {
  id: true,
  type: true,
  title: true,
  body: true,
  href: true,
  readAt: true,
  createdAt: true,
  actor: { select: { id: true, fullName: true } },
} as const;

export type NotificationItem = Awaited<
  ReturnType<typeof listRecent>
>[number];

/** Vài thông báo mới nhất — cho danh sách xổ xuống từ chuông. */
export function listRecent(userId: string, take = 8) {
  return prisma.notification.findMany({
    where: { recipientId: userId },
    select: notificationSelect,
    orderBy: { createdAt: "desc" },
    take,
  });
}

/** Danh sách đầy đủ có phân trang cho trang /thong-bao. */
export async function listNotifications(
  userId: string,
  opts: { page?: number; unreadOnly?: boolean } = {},
) {
  const page = Math.max(1, opts.page ?? 1);
  const where = {
    recipientId: userId,
    ...(opts.unreadOnly ? { readAt: null } : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.notification.count({ where }),
    prisma.notification.findMany({
      where,
      select: notificationSelect,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  return {
    total,
    rows,
    page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

// ═══════════════════ ĐÁNH DẤU ĐÃ ĐỌC ═══════════════════

/**
 * Đánh dấu một thông báo đã đọc.
 * Điều kiện `recipientId` là chốt chặn quyền: không ai đụng được thông báo của
 * người khác dù đoán đúng id.
 */
export async function markRead(userId: string, id: string): Promise<void> {
  await prisma.notification.updateMany({
    where: { id, recipientId: userId, readAt: null },
    data: { readAt: new Date() },
  });
}

export async function markAllRead(userId: string): Promise<number> {
  const r = await prisma.notification.updateMany({
    where: { recipientId: userId, readAt: null },
    data: { readAt: new Date() },
  });
  return r.count;
}
