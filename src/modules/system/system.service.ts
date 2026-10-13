/**
 * Tầng nghiệp vụ module Hệ thống (SY-02 màn audit log · SY-03 màn phân quyền).
 */

import { prisma } from "@/shared/prisma/prisma.service";
import { writeAuditLog } from "@/shared/audit/audit.service";
import type { PermissionScope } from "@/generated/prisma/enums";
import { can, type SessionUser } from "@/common/permissions/permissions";

// ═══════════════════ SY-02 · AUDIT LOG ═══════════════════

export type AuditFilter = {
  actorId?: string;
  entity?: string;
  /** Khoảng ngày (theo ngày, đã về đầu/cuối ngày ở tầng schema). */
  from?: Date;
  to?: Date;
};

export const AUDIT_PAGE_SIZE = 30;

/** Danh sách nhật ký, lọc theo người · entity · khoảng ngày, phân trang. */
export async function listAuditLogs(filter: AuditFilter, page: number) {
  const where = {
    ...(filter.actorId ? { actorId: filter.actorId } : {}),
    ...(filter.entity ? { entity: filter.entity } : {}),
    ...(filter.from || filter.to
      ? {
          createdAt: {
            ...(filter.from ? { gte: filter.from } : {}),
            ...(filter.to ? { lte: filter.to } : {}),
          },
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * AUDIT_PAGE_SIZE,
      take: AUDIT_PAGE_SIZE,
      select: {
        id: true,
        action: true,
        entity: true,
        entityId: true,
        before: true,
        after: true,
        ipAddress: true,
        createdAt: true,
        actor: { select: { id: true, fullName: true, employeeCode: true } },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    rows,
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE)),
  };
}

/** Các giá trị cho ô lọc: người từng thao tác + entity từng xuất hiện. */
export async function auditFilterOptions() {
  const [actors, entities] = await Promise.all([
    prisma.user.findMany({
      where: { userType: "HUMAN", auditLogs: { some: {} } },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true },
    }),
    prisma.auditLog.findMany({
      distinct: ["entity"],
      select: { entity: true },
      orderBy: { entity: "asc" },
    }),
  ]);
  return { actors, entities: entities.map((e) => e.entity) };
}

// ═══════════════════ SY-03 · PHÂN QUYỀN ═══════════════════

export type RoleWithGrants = {
  id: string;
  code: string;
  name: string;
  isSystem: boolean;
  userCount: number;
  /** permissionCode → scope đang bật. */
  grants: Record<string, PermissionScope>;
};

/** Toàn bộ vai trò kèm bộ quyền hiện tại trong DB (nguồn chân lý lúc chạy). */
export async function listRolesWithGrants(): Promise<RoleWithGrants[]> {
  const roles = await prisma.role.findMany({
    orderBy: { code: "asc" },
    select: {
      id: true,
      code: true,
      name: true,
      isSystem: true,
      _count: { select: { users: true } },
      permissions: {
        select: { scope: true, permission: { select: { code: true } } },
      },
    },
  });

  return roles.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    isSystem: r.isSystem,
    userCount: r._count.users,
    grants: Object.fromEntries(
      r.permissions.map((p) => [p.permission.code, p.scope]),
    ),
  }));
}

export type SaveGrantsResult =
  | { ok: true }
  | { ok: false; reason: "ROLE_NOT_FOUND" | "DIRECTOR_LOCKED" | "BAD_PERMISSION" | "AI_MANAGE_REQUIRED" };

/**
 * Ghi lại TOÀN BỘ bộ quyền của một vai trò (thay thế, không vá từng dòng).
 *
 * Chốt an toàn: role DIRECTOR bị KHÓA — Giám đốc luôn toàn quyền, không cho ai
 * (kể cả chính Giám đốc) sửa để tránh tự khóa mình khỏi hệ thống.
 * Hiệu lực với người đang đăng nhập: tối đa 5 phút (chu kỳ nạp lại session).
 */
export async function saveRoleGrants(
  actor: SessionUser,
  roleId: string,
  grants: { permissionCode: string; scope: PermissionScope }[],
): Promise<SaveGrantsResult> {
  const role = await prisma.role.findUnique({
    where: { id: roleId },
    select: {
      id: true,
      code: true,
      permissions: {
        select: { scope: true, permission: { select: { code: true } } },
      },
    },
  });
  if (!role) return { ok: false, reason: "ROLE_NOT_FOUND" };
  if (role.code === "DIRECTOR") return { ok: false, reason: "DIRECTOR_LOCKED" };
  if (role.code === "AI_AGENT" && !can(actor, "ai.manage")) {
    return { ok: false, reason: "AI_MANAGE_REQUIRED" };
  }

  // Đối chiếu mã quyền với danh mục trong DB — không nhận mã lạ.
  const permissions = await prisma.permission.findMany({
    select: { id: true, code: true },
  });
  const permIdByCode = new Map(permissions.map((p) => [p.code, p.id]));
  for (const g of grants) {
    if (!permIdByCode.has(g.permissionCode)) {
      return { ok: false, reason: "BAD_PERMISSION" };
    }
  }

  const before = Object.fromEntries(
    role.permissions.map((p) => [p.permission.code, p.scope]),
  );
  const after = Object.fromEntries(
    grants.map((g) => [g.permissionCode, g.scope]),
  );

  await prisma.$transaction(async (tx) => {
    await tx.rolePermission.deleteMany({ where: { roleId } });
    if (grants.length > 0) {
      await tx.rolePermission.createMany({
        data: grants.map((g) => ({
          roleId,
          permissionId: permIdByCode.get(g.permissionCode)!,
          scope: g.scope,
        })),
      });
    }
    await writeAuditLog(tx, {
      actorId: actor.id,
      action: "ROLE_PERMISSIONS_UPDATE",
      entity: "Role",
      entityId: roleId,
      before: { code: role.code, grants: before },
      after: { code: role.code, grants: after },
    });
  });

  return { ok: true };
}
