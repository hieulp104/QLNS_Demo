/**
 * Ghi nhật ký hệ thống (AuditLog).
 *
 * Gọi BÊN TRONG `prisma.$transaction` cùng lệnh ghi dữ liệu — nếu nghiệp vụ rollback
 * thì log cũng rollback, tránh nhật ký ghi việc chưa từng xảy ra.
 *
 * @example
 *   await prisma.$transaction(async (tx) => {
 *     const updated = await tx.user.update({ ... });
 *     await writeAuditLog(tx, {
 *       actorId: user.id, action: "USER_UPDATE", entity: "User",
 *       entityId: updated.id, before, after: updated,
 *     });
 *     return updated;
 *   });
 */

import { headers } from "next/headers";
import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/shared/prisma/prisma.service";

/**
 * Client thường hoặc client trong transaction — cả hai đều ghi được.
 * Chỉ cần đúng phần `auditLog`, nên lấy `Pick` thay vì union hai kiểu client.
 */
type AuditClient = Pick<PrismaClient, "auditLog">;

export type AuditInput = {
  /** Người thực hiện. Null khi là tác vụ hệ thống (seed, cron). */
  actorId: string | null;
  /** Mã hành động, SCREAMING_SNAKE: USER_CREATE, USER_DEACTIVATE... */
  action: string;
  /** Tên model bị tác động: "User", "Project", "Transaction"... */
  entity: string;
  entityId?: string | null;
  /** Trạng thái trước/sau. Đã lọc bỏ trường nhạy cảm trước khi truyền vào. */
  before?: unknown;
  after?: unknown;
};

/** Trường không bao giờ được đưa vào nhật ký. */
const REDACTED_FIELDS = new Set(["passwordHash", "password", "tempPassword"]);

/**
 * Loại bỏ trường nhạy cảm và chuyển Date/Decimal về dạng JSON lưu được.
 * AuditLog là bảng ai có `audit.view` cũng đọc được — hash mật khẩu lọt vào đây
 * là rò rỉ, kể cả khi đã băm.
 */
function toJson(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(toJson);

  if (typeof value === "object") {
    // Decimal của Prisma và các object có toJSON tự lo phần serialize.
    if ("toJSON" in value && typeof value.toJSON === "function") {
      return (value as { toJSON: () => unknown }).toJSON();
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (REDACTED_FIELDS.has(k)) continue;
      out[k] = toJson(v);
    }
    return out;
  }

  return value;
}

/**
 * Lấy IP và user-agent của request hiện tại.
 * Nằm ngoài phạm vi request (script, seed) thì trả rỗng chứ không ném lỗi.
 */
async function requestMeta(): Promise<{
  ipAddress: string | null;
  userAgent: string | null;
}> {
  try {
    const h = await headers();
    // Sau reverse proxy, IP thật nằm ở phần tử đầu của x-forwarded-for.
    const forwarded = h.get("x-forwarded-for");
    const ipAddress =
      forwarded?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
    return { ipAddress, userAgent: h.get("user-agent") };
  } catch {
    return { ipAddress: null, userAgent: null };
  }
}

export async function writeAuditLog(
  client: AuditClient,
  input: AuditInput,
): Promise<void> {
  const { ipAddress, userAgent } = await requestMeta();

  await client.auditLog.create({
    data: {
      actorId: input.actorId,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      before: toJson(input.before) as never,
      after: toJson(input.after) as never,
      ipAddress,
      userAgent,
    },
  });
}

/** Ghi log ngoài transaction — dùng khi chỉ có mỗi việc ghi log. */
export async function audit(input: AuditInput): Promise<void> {
  await writeAuditLog(prisma, input);
}
