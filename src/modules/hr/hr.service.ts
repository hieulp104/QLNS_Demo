/**
 * Tầng truy vấn & nghiệp vụ của module Nhân sự (HR-01 → HR-07).
 * Không kiểm tra quyền ở đây — việc đó thuộc `hr.actions.ts` và `page.guard.ts`.
 * Ngoại lệ: `scopeFilter()` dịch scope thành điều kiện WHERE, vì đó là truy vấn.
 */

import bcrypt from "bcryptjs";
import { prisma } from "@/shared/prisma/prisma.service";
import { writeAuditLog } from "@/shared/audit/audit.service";
import { presignedDownloadUrl } from "@/lib/minio";
import { registerFileAsset } from "@/shared/minio/file.service";
import {
  coversGrants,
  hasPermission,
  type SessionUser,
} from "@/common/permissions/permissions";
import type {
  CreateEmployeeInput,
  UpdateEmployeeInput,
} from "@/modules/hr/hr.schema";

/** Trường an toàn để trả về client — tuyệt đối không kèm `passwordHash`. */
const employeeSelect = {
  id: true,
  employeeCode: true,
  fullName: true,
  email: true,
  phone: true,
  position: true,
  avatarUrl: true,
  isActive: true,
  mustChangePassword: true,
  joinedAt: true,
  lastLoginAt: true,
  deletedAt: true,
  deletedReason: true,
  departmentId: true,
  department: { select: { id: true, code: true, name: true } },
  roles: { select: { role: { select: { code: true, name: true } } } },
} as const;

/**
 * Toàn bộ mốc lương của một hồ sơ, mới nhất trước — TÁCH KHỎI employeeSelect có
 * chủ đích. employeeSelect dùng cho cả danh sách nhân sự mà trưởng phòng xem
 * được; nhét lương vào đó là rò lương của cả phòng ra màn hình danh sách.
 * Chỉ gọi hàm này sau khi đã kiểm `payroll.manage`.
 */
export function listSalaryRecords(userId: string) {
  return prisma.salaryRecord.findMany({
    where: { userId },
    orderBy: { effectiveFrom: "desc" },
    select: {
      id: true,
      effectiveFrom: true,
      baseSalary: true,
      insuranceBase: true,
      isFixedSalary: true,
      note: true,
    },
  });
}

export type EmployeeListItem = Awaited<ReturnType<typeof listEmployees>>[number];
export type EmployeeDetail = NonNullable<Awaited<ReturnType<typeof getEmployee>>>;

/**
 * Dịch scope của quyền `user.view` thành điều kiện lọc.
 * Lọc Ở TẦNG TRUY VẤN chứ không lọc sau khi lấy về — tránh việc dữ liệu ngoài
 * phạm vi từng đi qua bộ nhớ tiến trình rồi mới bị bỏ.
 */
function scopeFilter(user: SessionUser, permission: "user.view") {
  const scope = user.permissions[permission];

  if (scope === "ALL") return {};
  if (scope === "DEPARTMENT") {
    // Trưởng phòng không gắn phòng nào → không thấy ai, an toàn hơn là thấy tất cả.
    return { departmentId: user.departmentId ?? "__none__" };
  }
  return { id: user.id };
}

/**
 * HR-08 — `avatarUrl` trong DB lưu objectKey trên MinIO (không lưu URL vì
 * presigned URL hết hạn sau 15 phút). Hàm này đổi sang URL xem được cho client.
 */
async function withAvatarSrc<T extends { avatarUrl: string | null }>(
  row: T,
): Promise<T & { avatarSrc: string | null }> {
  return {
    ...row,
    avatarSrc: row.avatarUrl
      ? await presignedDownloadUrl(row.avatarUrl).catch(() => null)
      : null,
  };
}

/** HR-01 — danh sách nhân sự đang làm việc, đã lọc theo scope. */
export async function listEmployees(user: SessionUser) {
  const rows = await prisma.user.findMany({
    where: { userType: "HUMAN", deletedAt: null, ...scopeFilter(user, "user.view") },
    orderBy: { employeeCode: "asc" },
    select: employeeSelect,
  });
  return Promise.all(rows.map(withAvatarSrc));
}

/** HR-06 — danh sách nhân viên đã nghỉ, giữ lại để tra cứu hồ sơ cũ. */
export async function listResignedEmployees(user: SessionUser) {
  const hidden = await hiddenResignedIds();
  const rows = await prisma.user.findMany({
    where: {
      userType: "HUMAN",
      deletedAt: { not: null },
      ...(hidden.length ? { id: { notIn: hidden } } : {}),
      ...scopeFilter(user, "user.view"),
    },
    orderBy: { deletedAt: "desc" },
    select: employeeSelect,
  });
  return Promise.all(rows.map(withAvatarSrc));
}

/** Hồ sơ đã nghỉ bị "xóa" nhưng còn dữ liệu → chỉ ẩn khỏi danh sách, lưu ở đây. */
const HIDDEN_RESIGNED_KEY = "hr.hiddenResigned";

async function hiddenResignedIds(
  client: Pick<typeof prisma, "systemSetting"> = prisma,
): Promise<string[]> {
  const row = await client.systemSetting.findUnique({ where: { key: HIDDEN_RESIGNED_KEY } });
  const value = row?.value;
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/**
 * Những dữ liệu nghiệp vụ khiến hồ sơ đã nghỉ KHÔNG được xóa hẳn khỏi DB.
 * Đây là lịch sử của chính người đó (công, lương, ứng, phép, dự án, bình
 * luận) — khách đã chốt "nghỉ việc vẫn lưu dữ liệu cũ", nên xóa hồ sơ không
 * được kéo theo những thứ này. Xóa được chỉ còn tài khoản rác / tạo nhầm.
 */
export async function purgeBlockers(id: string): Promise<string[]> {
  const [attendance, payroll, advances, leaves, projects, comments] = await Promise.all([
    prisma.attendanceDay.count({ where: { userId: id } }),
    prisma.payrollLine.count({ where: { userId: id } }),
    prisma.salaryAdvance.count({ where: { userId: id } }),
    prisma.leaveRequest.count({ where: { userId: id } }),
    prisma.projectMember.count({ where: { userId: id } }),
    prisma.projectComment.count({ where: { authorId: id } }),
  ]);
  const out: string[] = [];
  if (attendance) out.push(`${attendance} ngày chấm công`);
  if (payroll) out.push(`${payroll} dòng bảng lương`);
  if (advances) out.push(`${advances} phiếu tạm ứng`);
  if (leaves) out.push(`${leaves} đơn nghỉ phép`);
  if (projects) out.push(`là thành viên ${projects} dự án`);
  if (comments) out.push(`${comments} bình luận`);
  return out;
}

export type PurgeResult =
  | { ok: true; mode: "deleted" | "hidden" }
  | { ok: false; reason: "NOT_FOUND" };

/**
 * "Xóa" một hồ sơ khỏi danh sách nhân viên đã nghỉ.
 *
 * Người dùng chỉ thấy một hành vi: người đó biến khỏi danh sách, dữ liệu cũ
 * giữ nguyên. Bên dưới có hai nhánh:
 *  · Còn dữ liệu (`purgeBlockers()` khác rỗng — chấm công, lương, ứng…) → chỉ
 *    ẨN khỏi danh sách. Khách chốt nghỉ việc vẫn phải giữ dữ liệu cũ; bảng công
 *    / bảng lương các tháng cũ vẫn hiện người này.
 *  · Không còn gì (tài khoản rác, tạo nhầm) → xóa hẳn khỏi DB. Những chỗ người này chỉ đứng tên "người
 * tạo / người sửa" (giao dịch, dự án, khách hàng, nhật ký…) thì GIỮ bản ghi,
 * chỉ bỏ trống tên người — xóa theo là mất dữ liệu thật của công ty. Tên + mã
 * người bị xóa được ghi lại ở AuditLog `USER_PURGE` để còn truy được.
 */
export async function purgeResignedEmployee(
  actorId: string,
  id: string,
): Promise<PurgeResult> {
  const target = await prisma.user.findFirst({
    where: { id, userType: "HUMAN", deletedAt: { not: null } },
    select: employeeSelect,
  });
  if (!target) return { ok: false, reason: "NOT_FOUND" };

  const hide = async () => {
    await prisma.$transaction(async (tx) => {
      const ids = await hiddenResignedIds(tx);
      if (!ids.includes(id)) ids.push(id);
      await tx.systemSetting.upsert({
        where: { key: HIDDEN_RESIGNED_KEY },
        create: { key: HIDDEN_RESIGNED_KEY, value: ids },
        update: { value: ids },
      });
      await writeAuditLog(tx, {
        actorId,
        action: "USER_PURGE",
        entity: "User",
        entityId: id,
        after: { mode: "hidden" },
      });
    });
    return { ok: true, mode: "hidden" } as const;
  };

  if ((await purgeBlockers(id)).length) return hide();

  try {
    await prisma.$transaction(async (tx) => {
      // Tuần tự, không Promise.all: transaction tương tác của Prisma chạy trên một kết nối.
      await tx.customer.updateMany({ where: { createdById: id }, data: { createdById: null } });
      await tx.project.updateMany({ where: { createdById: id }, data: { createdById: null } });
      await tx.stageLog.updateMany({ where: { changedById: id }, data: { changedById: null } });
      await tx.fileAsset.updateMany({ where: { uploadedById: id }, data: { uploadedById: null } });
      await tx.transaction.updateMany({ where: { createdById: id }, data: { createdById: null } });
      await tx.auditLog.updateMany({ where: { actorId: id }, data: { actorId: null } });
      await tx.attendanceDay.updateMany({ where: { updatedById: id }, data: { updatedById: null } });
      await tx.leaveRequest.updateMany({ where: { approverId: id }, data: { approverId: null } });
      await tx.salaryAdvance.updateMany({ where: { createdById: id }, data: { createdById: null } });
      await tx.payrollPeriod.updateMany({ where: { lockedById: id }, data: { lockedById: null } });
      await tx.notification.updateMany({ where: { actorId: id }, data: { actorId: null } });
      await tx.maintenanceTask.updateMany({ where: { assigneeId: id }, data: { assigneeId: null } });
      await tx.maintenanceTask.updateMany({ where: { handledById: id }, data: { handledById: null } });
      await tx.maintenanceTask.updateMany({ where: { createdById: id }, data: { createdById: null } });
      await tx.department.updateMany({ where: { managerId: id }, data: { managerId: null } });
      // Vai trò, thông báo nhận, mốc lương, hội thoại AI xóa theo (onDelete: Cascade).
      await tx.user.delete({ where: { id } });
      await writeAuditLog(tx, {
        actorId,
        action: "USER_PURGE",
        entity: "User",
        entityId: id,
        before: target,
        after: { mode: "deleted" },
      });
    });
  } catch (error) {
    // Còn khóa ngoại nào chưa liệt kê ở trên → không xóa hẳn, chỉ ẩn.
    if ((error as { code?: string }).code === "P2003") return hide();
    throw error;
  }
  return { ok: true, mode: "deleted" };
}

/**
 * HR-03 — một hồ sơ. Lấy cả người đã nghỉ để màn "nhân viên đã nghỉ" xem được chi tiết.
 * KHÔNG lọc theo scope: người gọi phải tự kiểm tra `can(user, "user.view", ctx)`
 * với `departmentId` lấy từ chính bản ghi này.
 */
export async function getEmployee(id: string) {
  const row = await prisma.user.findFirst({ where: { id, userType: "HUMAN" }, select: employeeSelect });
  return row ? withAvatarSrc(row) : null;
}

/** Danh sách phòng ban cho ô chọn trên form. */
export function listDepartments() {
  return prisma.department.findMany({
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true },
  });
}

/** Danh sách vai trò cho ô chọn trên form. */
export function listRoles() {
  return prisma.role.findMany({
    where: { code: { not: "AI_AGENT" } },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true },
  });
}

/**
 * Vai trò `user` được gán khi TẠO nhân viên mới.
 * Có `role.manage` → mọi vai trò. Không có (kế toán) → chỉ vai trò mà toàn bộ
 * quyền nằm trong quyền của chính họ, đọc từ `role_permissions` lúc chạy chứ
 * không đọc bộ mặc định — Giám đốc sửa quyền ở /permissions là áp dụng ngay.
 */
export async function listAssignableRoles(user: SessionUser) {
  const roles = await prisma.role.findMany({
    where: { code: { not: "AI_AGENT" } },
    orderBy: { code: "asc" },
    select: {
      id: true,
      code: true,
      name: true,
      permissions: { select: { scope: true, permission: { select: { code: true } } } },
    },
  });

  const unrestricted = hasPermission(user, "role.manage");
  return roles
    .filter(
      (r) =>
        unrestricted ||
        coversGrants(
          user,
          r.permissions.map((p) => ({ code: p.permission.code, scope: p.scope })),
        ),
    )
    .map(({ id, code, name }) => ({ id, code, name }));
}

// ═══════════════════ MẬT KHẨU TẠM ═══════════════════

/**
 * Sinh mật khẩu tạm dễ đọc qua điện thoại nhưng vẫn đủ mạnh.
 * Bỏ các ký tự dễ nhầm (0/O, 1/l/I) để người nhận không gõ sai.
 * Dùng crypto chứ không dùng Math.random — mật khẩu đoán được là mật khẩu bỏ đi.
 */
export function generateTempPassword(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const bytes = new Uint32Array(10);
  crypto.getRandomValues(bytes);

  const letters = Array.from({ length: 8 }, (_, i) =>
    alphabet[bytes[i] % alphabet.length],
  ).join("");
  const number = Array.from({ length: 2 }, (_, i) =>
    digits[bytes[8 + i] % digits.length],
  ).join("");

  // Viết hoa chữ đầu để chắc chắn có cả chữ hoa, chữ thường và chữ số.
  return `${letters[0].toUpperCase()}${letters.slice(1)}${number}`;
}

// ═══════════════════ GHI DỮ LIỆU ═══════════════════

/** Số thứ tự kế tiếp cho mã nhân viên dạng TN001. */
async function nextEmployeeCode(): Promise<string> {
  const last = await prisma.user.findFirst({
    where: { employeeCode: { startsWith: "TN" } },
    orderBy: { employeeCode: "desc" },
    select: { employeeCode: true },
  });

  const lastNumber = last ? Number(last.employeeCode.replace(/\D/g, "")) : 0;
  return `TN${String(lastNumber + 1).padStart(3, "0")}`;
}

/** Prisma báo trùng khóa duy nhất. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "P2002"
  );
}

/**
 * Trường nào gây lỗi trùng — để báo đúng chỗ cho người dùng.
 *
 * ⚠ Prisma 7 dùng driver adapter nên hình dạng lỗi KHÁC Prisma 5/6:
 * tên trường nằm ở `meta.driverAdapterError.cause.constraint.fields`,
 * `meta.target` (chỗ cũ) không còn được điền. Vẫn đọc cả hai để phòng khi
 * chạy qua đường không có adapter.
 */
function uniqueTarget(error: unknown): string[] {
  const meta = (error as { meta?: Record<string, unknown> }).meta;
  if (!meta) return [];

  const constraint = (
    meta.driverAdapterError as
      | { cause?: { constraint?: { fields?: unknown; index?: unknown } } }
      | undefined
  )?.cause?.constraint;

  if (Array.isArray(constraint?.fields)) return constraint.fields.map(String);
  // Một số lỗi chỉ trả tên index, ví dụ "users_email_key".
  if (typeof constraint?.index === "string") return [constraint.index];

  const target = meta.target;
  if (Array.isArray(target)) return target.map(String);
  if (typeof target === "string") return [target];
  return [];
}

export type DuplicateNameMatch = {
  employeeCode: string;
  fullName: string;
  position: string | null;
  departmentName: string | null;
  resigned: boolean;
};

export type CreateResult =
  | { ok: true; id: string; employeeCode: string; tempPassword: string }
  | { ok: false; reason: "EMAIL_TAKEN" | "PHONE_TAKEN" | "ROLE_NOT_FOUND" }
  | { ok: false; reason: "NAME_EXISTS"; matches: DuplicateNameMatch[] };

/** Chuẩn hóa tên để so khớp: bỏ khoảng trắng thừa, không phân biệt hoa thường. */
function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase("vi");
}

/**
 * Những hồ sơ đã có cùng tên — KỂ CẢ người đã nghỉ việc.
 *
 * Người đã nghỉ mới là ca nguy hiểm: họ không hiện ở danh sách nhân sự nên người
 * tạo tưởng chưa có, tạo lại thành hồ sơ thứ hai và lịch sử bị chẻ đôi. Đúng cái
 * đã xảy ra với dữ liệu thật.
 */
export async function findSameNameEmployees(
  fullName: string,
): Promise<DuplicateNameMatch[]> {
  const target = normalizeName(fullName);
  if (!target) return [];
  const rows = await prisma.user.findMany({
    where: { userType: "HUMAN" },
    select: {
      employeeCode: true,
      fullName: true,
      position: true,
      deletedAt: true,
      department: { select: { name: true } },
    },
    orderBy: { employeeCode: "asc" },
  });
  return rows
    .filter((r) => normalizeName(r.fullName) === target)
    .map((r) => ({
      employeeCode: r.employeeCode,
      fullName: r.fullName,
      position: r.position,
      departmentName: r.department?.name ?? null,
      resigned: r.deletedAt !== null,
    }));
}

/**
 * HR-02 — tạo tài khoản.
 *
 * Mã nhân viên sinh theo số lớn nhất hiện có, nên hai người bấm "Lưu" cùng lúc
 * có thể nhận cùng một mã. Không khóa bảng cho một thao tác hiếm như thế — thay
 * vào đó bắt lỗi trùng khóa và thử lại với mã kế tiếp.
 */
export async function createEmployee(
  actorId: string,
  input: CreateEmployeeInput,
): Promise<CreateResult> {
  const roles = await prisma.role.findMany({
    where: { code: { in: input.roleCodes, not: "AI_AGENT" } },
    select: { id: true, code: true },
  });
  if (roles.length !== input.roleCodes.length) {
    return { ok: false, reason: "ROLE_NOT_FOUND" };
  }

  // Chặn hồ sơ trùng ngay từ gốc. Không chặn cứng — công ty thật có người trùng
  // tên — nhưng bắt người tạo nhìn thấy và xác nhận một lần.
  if (!input.allowDuplicateName) {
    const matches = await findSameNameEmployees(input.fullName);
    if (matches.length > 0) return { ok: false, reason: "NAME_EXISTS", matches };
  }

  const department = input.departmentCode
    ? await prisma.department.findUnique({
        where: { code: input.departmentCode },
        select: { id: true },
      })
    : null;

  const tempPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 10);

  const MAX_ATTEMPTS = 5;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const employeeCode = await nextEmployeeCode();

    try {
      const created = await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            employeeCode,
            email: input.email ?? null,
            passwordHash,
            fullName: input.fullName,
            phone: input.phone ?? null,
            position: input.position ?? null,
            departmentId: department?.id ?? null,
            joinedAt: input.joinedAt ?? null,
            // Người tạo chỉ biết mật khẩu tạm; nhân viên buộc đổi ở lần đăng nhập đầu.
            mustChangePassword: true,
            roles: { create: roles.map((r) => ({ roleId: r.id })) },
          },
          select: { id: true, employeeCode: true },
        });

        await writeAuditLog(tx, {
          actorId,
          action: "USER_CREATE",
          entity: "User",
          entityId: user.id,
          after: {
            employeeCode: user.employeeCode,
            email: input.email ?? null,
            phone: input.phone ?? null,
            fullName: input.fullName,
            departmentCode: input.departmentCode ?? null,
            roleCodes: input.roleCodes,
          },
        });

        return user;
      });

      return {
        ok: true,
        id: created.id,
        employeeCode: created.employeeCode,
        tempPassword,
      };
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;

      const target = uniqueTarget(error);
      // Trùng email/SĐT là lỗi của người nhập, thử lại bao nhiêu lần cũng vô ích.
      if (target.some((t) => t.includes("email"))) {
        return { ok: false, reason: "EMAIL_TAKEN" };
      }
      if (target.some((t) => t.includes("phone"))) {
        return { ok: false, reason: "PHONE_TAKEN" };
      }
      // Trùng mã nhân viên → vòng lặp sinh mã kế tiếp rồi thử lại.
    }
  }

  throw new Error("Không sinh được mã nhân viên sau nhiều lần thử");
}

/**
 * HR-04 — sửa hồ sơ.
 * `departmentCode` / `roleCodes` chỉ được truyền vào khi người gọi có `role.manage`;
 * tầng action chịu trách nhiệm kiểm tra trước khi gọi hàm này.
 */
export async function updateEmployee(
  actorId: string,
  input: UpdateEmployeeInput,
  options: { canManageRoles: boolean },
): Promise<
  | { ok: true }
  | { ok: false; reason: "NOT_FOUND" | "ROLE_NOT_FOUND" | "PHONE_REQUIRED" | "PHONE_TAKEN" }
> {
  const before = await prisma.user.findFirst({
    where: { id: input.id, userType: "HUMAN", deletedAt: null },
    select: employeeSelect,
  });
  if (!before) return { ok: false, reason: "NOT_FOUND" };

  // Người không có email đăng nhập bằng SĐT — xóa SĐT là khóa luôn tài khoản
  // (và vi phạm CHECK users_email_or_phone_check).
  if (!before.email && !input.phone) return { ok: false, reason: "PHONE_REQUIRED" };

  let roleIds: string[] | null = null;
  if (options.canManageRoles && input.roleCodes) {
    const roles = await prisma.role.findMany({
      where: { code: { in: input.roleCodes, not: "AI_AGENT" } },
      select: { id: true },
    });
    if (roles.length !== input.roleCodes.length) {
      return { ok: false, reason: "ROLE_NOT_FOUND" };
    }
    roleIds = roles.map((r) => r.id);
  }

  let departmentId: string | null | undefined;
  if (options.canManageRoles && input.departmentCode !== undefined) {
    departmentId = input.departmentCode
      ? ((
          await prisma.department.findUnique({
            where: { code: input.departmentCode },
            select: { id: true },
          })
        )?.id ?? null)
      : null;
  }

  try {
    await prisma.$transaction(async (tx) => {
      const after = await tx.user.update({
        where: { id: input.id },
        data: {
          fullName: input.fullName,
          phone: input.phone ?? null,
          position: input.position ?? null,
          joinedAt: input.joinedAt ?? null,
          ...(departmentId !== undefined ? { departmentId } : {}),
        },
        select: employeeSelect,
      });

      if (roleIds) {
        // Thay toàn bộ vai trò: xóa hết rồi thêm lại, gọn hơn là so sánh từng dòng.
        await tx.userRole.deleteMany({ where: { userId: input.id } });
        await tx.userRole.createMany({
          data: roleIds.map((roleId) => ({ userId: input.id, roleId })),
        });
      }

      await writeAuditLog(tx, {
        actorId,
        action: "USER_UPDATE",
        entity: "User",
        entityId: input.id,
        before,
        after: { ...after, roleCodes: input.roleCodes ?? undefined },
      });
    });
  } catch (error) {
    // SĐT là tên đăng nhập nên không được trùng với người khác đang làm.
    if (isUniqueViolation(error) && uniqueTarget(error).some((t) => t.includes("phone"))) {
      return { ok: false, reason: "PHONE_TAKEN" };
    }
    throw error;
  }

  return { ok: true };
}

/**
 * HR-05 — cho nghỉ việc (soft delete).
 * Đánh dấu `deletedAt` + lý do và tắt `isActive` để chặn đăng nhập ngay
 * (`authorize()` trong auth.service kiểm tra cả hai). Hồ sơ, dự án, giao dịch
 * cũ giữ nguyên — không xóa cứng bao giờ.
 */
export async function deactivateEmployee(
  actorId: string,
  id: string,
  reason: string,
  /** Ngày bắt đầu nghỉ (00:00 giờ VN) — quyết định tháng nào còn hiện ở chấm công/lương. */
  resignedAt: Date = new Date(),
): Promise<{ ok: true } | { ok: false; reason: "NOT_FOUND" }> {
  const before = await prisma.user.findFirst({
    where: { id, userType: "HUMAN", deletedAt: null },
    select: employeeSelect,
  });
  if (!before) return { ok: false, reason: "NOT_FOUND" };

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id },
      data: { deletedAt: resignedAt, deletedReason: reason, isActive: false },
    });

    // Người đang là trưởng phòng mà nghỉ thì bỏ khỏi ô quản lý, nếu không
    // phòng đó vẫn hiển thị người đã nghỉ làm quản lý.
    await tx.department.updateMany({
      where: { managerId: id },
      data: { managerId: null },
    });

    await writeAuditLog(tx, {
      actorId,
      action: "USER_DEACTIVATE",
      entity: "User",
      entityId: id,
      before,
      after: { deletedAt: resignedAt, deletedReason: reason },
    });
  });

  return { ok: true };
}

/**
 * HR-07 — đặt lại mật khẩu cho người khác.
 * Trả về mật khẩu tạm để Director đọc cho nhân viên; bật `mustChangePassword`
 * nên Director không giữ được mật khẩu dùng lâu dài của người khác.
 */
export async function resetEmployeePassword(
  actorId: string,
  id: string,
): Promise<{ ok: true; tempPassword: string } | { ok: false; reason: "NOT_FOUND" }> {
  const target = await prisma.user.findFirst({
    where: { id, userType: "HUMAN", deletedAt: null },
    select: { id: true, email: true, employeeCode: true },
  });
  if (!target) return { ok: false, reason: "NOT_FOUND" };

  const tempPassword = generateTempPassword();
  // Băm TRƯỚC khi mở transaction — bcrypt tốn ~100ms, giữ transaction mở suốt
  // thời gian đó là giữ khóa dòng vô ích.
  const passwordHash = await bcrypt.hash(tempPassword, 10);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id },
      data: { passwordHash, mustChangePassword: true },
    });

    await writeAuditLog(tx, {
      actorId,
      action: "USER_RESET_PASSWORD",
      entity: "User",
      entityId: id,
      // Không ghi mật khẩu tạm vào nhật ký.
      after: { employeeCode: target.employeeCode, email: target.email },
    });
  });

  return { ok: true, tempPassword };
}

/**
 * HR-08 — gắn avatar mới sau khi client đã PUT xong lên MinIO (luồng 2 pha).
 * Ghi FileAsset kind AVATAR (xác minh object tồn tại), trỏ `User.avatarUrl`
 * sang objectKey mới, xóa mềm FileAsset của ảnh cũ (object cũ GIỮ trên MinIO
 * theo FS-04).
 */
export async function setAvatar(
  actorId: string,
  targetUserId: string,
  file: { objectKey: string; fileName: string; mimeType: string; sizeBytes: number },
): Promise<
  | { ok: true }
  | { ok: false; reason: "NOT_FOUND" | "NOT_UPLOADED" | "BAD_EXTENSION" | "BAD_MIME" }
> {
  const target = await prisma.user.findFirst({
    where: { id: targetUserId, userType: "HUMAN", deletedAt: null },
    select: { id: true, employeeCode: true, avatarUrl: true },
  });
  if (!target) return { ok: false, reason: "NOT_FOUND" };

  try {
    await prisma.$transaction(async (tx) => {
      const registered = await registerFileAsset(tx, {
        objectKey: file.objectKey,
        fileName: file.fileName,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        kind: "AVATAR",
        uploadedById: actorId,
      });
      // Ném để rollback transaction, bắt lại bên dưới trả reason cho action.
      if (!registered.ok) throw new Error(registered.reason);

      await tx.user.update({
        where: { id: targetUserId },
        data: { avatarUrl: file.objectKey },
      });

      // Ảnh cũ: xóa mềm bản ghi FileAsset (object giữ nguyên trên MinIO).
      if (target.avatarUrl) {
        await tx.fileAsset.updateMany({
          where: { objectKey: target.avatarUrl, deletedAt: null },
          data: { deletedAt: new Date() },
        });
      }

      await writeAuditLog(tx, {
        actorId,
        action: "USER_AVATAR_UPDATE",
        entity: "User",
        entityId: targetUserId,
        before: { avatarUrl: target.avatarUrl },
        after: { avatarUrl: file.objectKey },
      });
    });
    return { ok: true };
  } catch (error) {
    const reason = (error as Error).message;
    if (reason === "NOT_UPLOADED" || reason === "BAD_EXTENSION" || reason === "BAD_MIME") {
      return { ok: false, reason };
    }
    throw error;
  }
}
