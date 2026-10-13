/**
 * Tầng truy vấn & nghiệp vụ module Khách hàng.
 * Kiểm tra quyền nằm ở actions/guards, không ở đây.
 *
 * Quyền khách hàng chỉ có một scope duy nhất là ALL (Director/Kế toán/Kinh doanh
 * CRUD toàn bộ; Thiết kế/Thi công chỉ xem) — nên service không cần lọc theo scope.
 */

import { prisma } from "@/shared/prisma/prisma.service";
import { writeAuditLog } from "@/shared/audit/audit.service";
import type { CustomerFilter, CreateCustomerInput, UpdateCustomerInput } from "@/modules/customers/customers.schema";

const customerSelect = {
  id: true,
  code: true,
  name: true,
  phone: true,
  email: true,
  address: true,
  source: true,
  sourceDetail: true,
  note: true,
  createdAt: true,
  _count: { select: { projects: { where: { deletedAt: null } } } },
} as const;

export type CustomerListItem = Awaited<ReturnType<typeof listCustomers>>[number];

/** Danh sách khách hàng đang hoạt động, lọc theo từ khóa + nguồn. */
export async function listCustomers(filter: CustomerFilter = {}) {
  const q = filter.q?.trim();
  return prisma.customer.findMany({
    where: {
      deletedAt: null,
      ...(filter.source ? { source: filter.source } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { phone: { contains: q } },
              { code: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    select: customerSelect,
  });
}

/** Danh sách rút gọn cho ô chọn khách khi tạo dự án (PJ-02). */
export function listCustomerOptions() {
  return prisma.customer.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, code: true, name: true },
  });
}

/** Chi tiết một khách + lịch sử dự án của họ (1 khách có nhiều dự án). */
export async function getCustomer(id: string) {
  return prisma.customer.findFirst({
    where: { id, deletedAt: null },
    select: {
      ...customerSelect,
      createdBy: { select: { fullName: true } },
      projects: {
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          code: true,
          name: true,
          type: true,
          currentStage: true,
          status: true,
          createdAt: true,
        },
      },
    },
  });
}

/** Số thứ tự kế tiếp cho mã khách dạng KH-2026-001, đếm theo năm hiện tại. */
async function nextCustomerCode(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `KH-${year}-`;
  const last = await prisma.customer.findFirst({
    where: { code: { startsWith: prefix } },
    orderBy: { code: "desc" },
    select: { code: true },
  });
  const lastNumber = last ? Number(last.code.slice(prefix.length)) : 0;
  return `${prefix}${String(lastNumber + 1).padStart(3, "0")}`;
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string })?.code === "P2002";
}

/**
 * Tạo khách hàng. Mã sinh theo số lớn nhất trong năm nên hai người tạo cùng lúc
 * có thể trùng mã — bắt P2002 rồi thử lại với số kế tiếp (giống PJ-03 / HR-02).
 */
export async function createCustomer(
  actorId: string,
  input: CreateCustomerInput,
): Promise<{ id: string; code: string }> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = await nextCustomerCode();
    try {
      return await prisma.$transaction(async (tx) => {
        const customer = await tx.customer.create({
          data: {
            code,
            name: input.name,
            phone: input.phone ?? null,
            email: input.email ?? null,
            address: input.address ?? null,
            source: input.source,
            sourceDetail: input.sourceDetail ?? null,
            note: input.note ?? null,
            createdById: actorId,
          },
          select: { id: true, code: true },
        });

        await writeAuditLog(tx, {
          actorId,
          action: "CUSTOMER_CREATE",
          entity: "Customer",
          entityId: customer.id,
          after: {
            code: customer.code,
            name: input.name,
            source: input.source,
            sourceDetail: input.sourceDetail,
          },
        });

        return customer;
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // Trùng mã KH → vòng lặp sinh số kế tiếp rồi thử lại.
    }
  }
  throw new Error("Không sinh được mã khách hàng sau nhiều lần thử");
}

export async function updateCustomer(
  actorId: string,
  input: UpdateCustomerInput,
): Promise<{ ok: true } | { ok: false; reason: "NOT_FOUND" }> {
  const before = await prisma.customer.findFirst({
    where: { id: input.id, deletedAt: null },
    select: customerSelect,
  });
  if (!before) return { ok: false, reason: "NOT_FOUND" };

  await prisma.$transaction(async (tx) => {
    const after = await tx.customer.update({
      where: { id: input.id },
      data: {
        name: input.name,
        phone: input.phone ?? null,
        email: input.email ?? null,
        address: input.address ?? null,
        source: input.source,
        sourceDetail: input.sourceDetail ?? null,
        note: input.note ?? null,
      },
      select: customerSelect,
    });
    await writeAuditLog(tx, {
      actorId,
      action: "CUSTOMER_UPDATE",
      entity: "Customer",
      entityId: input.id,
      before,
      after,
    });
  });

  return { ok: true };
}

/**
 * Xóa mềm khách hàng. Chặn nếu còn dự án đang hoạt động — xóa khách mà dự án
 * vẫn trỏ vào sẽ làm mồ côi dữ liệu dự án.
 */
export async function deleteCustomer(
  actorId: string,
  id: string,
): Promise<{ ok: true } | { ok: false; reason: "NOT_FOUND" | "HAS_PROJECTS" }> {
  const customer = await prisma.customer.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      code: true,
      name: true,
      _count: { select: { projects: { where: { deletedAt: null } } } },
    },
  });
  if (!customer) return { ok: false, reason: "NOT_FOUND" };
  if (customer._count.projects > 0) return { ok: false, reason: "HAS_PROJECTS" };

  await prisma.$transaction(async (tx) => {
    await tx.customer.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await writeAuditLog(tx, {
      actorId,
      action: "CUSTOMER_DELETE",
      entity: "Customer",
      entityId: id,
      before: { code: customer.code, name: customer.name },
    });
  });

  return { ok: true };
}
