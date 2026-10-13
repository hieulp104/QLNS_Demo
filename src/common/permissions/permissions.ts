/**
 * ═══════════════════════════════════════════════════════════════
 * NA — Tầng phân quyền tập trung
 * ═══════════════════════════════════════════════════════════════
 * QUY TẮC BẮT BUỘC: mọi kiểm tra quyền đi qua hàm `can()` trong file này.
 * TUYỆT ĐỐI không viết `if (user.role === "DIRECTOR")` rải rác trong code.
 *
 * Mô hình: RBAC + phạm vi (scope)
 *   - Permission: mã quyền cố định, khai báo tại PERMISSIONS bên dưới
 *   - Role: bản ghi trong DB, Director sửa được qua UI
 *   - RolePermission: nối role ↔ permission, KÈM scope
 *
 * scope quyết định "được làm trên phạm vi dữ liệu nào":
 *   ALL        — toàn hệ thống
 *   DEPARTMENT — chỉ dữ liệu thuộc phòng của mình
 *   ASSIGNED   — chỉ dự án mà mình được add làm thành viên
 *   SELF       — chỉ bản ghi của chính mình
 *
 * 1 user có thể mang nhiều role (kiêm nhiệm) → lấy scope RỘNG NHẤT.
 */

import type { PermissionScope } from "@/generated/prisma/enums";

// ═══════════════════ DANH MỤC QUYỀN ═══════════════════

export const PERMISSIONS = [
  // --- Tài khoản & Nhân sự ---
  { code: "user.create", module: "hr", name: "Tạo tài khoản nhân viên" },
  { code: "user.view", module: "hr", name: "Xem hồ sơ nhân viên" },
  { code: "user.update", module: "hr", name: "Sửa hồ sơ nhân viên" },
  { code: "user.deactivate", module: "hr", name: "Cho nghỉ việc (soft delete)" },
  { code: "user.resetPassword", module: "hr", name: "Đặt lại mật khẩu cho người khác" },
  { code: "role.manage", module: "hr", name: "Quản lý vai trò & phân quyền" },

  // --- Khách hàng ---
  { code: "customer.view", module: "customer", name: "Xem khách hàng" },
  { code: "customer.create", module: "customer", name: "Thêm khách hàng" },
  { code: "customer.update", module: "customer", name: "Sửa khách hàng" },
  { code: "customer.delete", module: "customer", name: "Xóa khách hàng" },

  // --- Dự án ---
  { code: "project.view", module: "project", name: "Xem dự án & tiến độ" },
  { code: "project.create", module: "project", name: "Tạo dự án" },
  { code: "project.update", module: "project", name: "Sửa thông tin dự án" },
  { code: "project.delete", module: "project", name: "Xóa dự án" },
  { code: "project.stage.change", module: "project", name: "Chuyển giai đoạn" },
  { code: "project.member.manage", module: "project", name: "Quản lý thành viên dự án" },
  { code: "project.comment", module: "project", name: "Đăng ảnh & bình luận" },
  { code: "project.file.upload", module: "project", name: "Upload file dự án" },

  // --- Hợp đồng ---
  { code: "contract.view", module: "contract", name: "Xem hợp đồng" },
  { code: "contract.manage", module: "contract", name: "Thêm/sửa/xóa hợp đồng" },

  // --- Vật tư ---
  { code: "material.view", module: "material", name: "Xem vật tư" },
  { code: "material.manage", module: "material", name: "Thêm/sửa/xóa vật tư" },

  // --- Tài chính ---
  { code: "finance.view", module: "finance", name: "Xem module Tài chính" },
  { code: "finance.manage", module: "finance", name: "Nhập/sửa/xóa giao dịch" },

  // --- Báo cáo ---
  { code: "report.operational", module: "report", name: "Xem báo cáo vận hành" },
  { code: "report.financial", module: "report", name: "Xem báo cáo tài chính" },

  // --- NA AI ---
  { code: "ai.chat.use", module: "ai", name: "Sử dụng NA AI" },
  { code: "ai.manage", module: "ai", name: "Quản lý tài khoản NA AI" },

  // --- Bảo hành / chăm sóc sau bàn giao ---
  {
    code: "maintenance.view",
    module: "maintenance",
    name: "Xem lịch bảo trì & đề nghị bảo hành",
  },
  {
    code: "maintenance.manage",
    module: "maintenance",
    name: "Ghi nhận, giao việc và xử lý bảo hành",
  },

  // --- Chấm công · Nghỉ phép · Lương ---
  { code: "attendance.view", module: "hr", name: "Xem bảng chấm công" },
  { code: "attendance.manage", module: "hr", name: "Chấm công & sửa bảng công" },
  { code: "leave.approve", module: "hr", name: "Duyệt đơn nghỉ phép" },
  { code: "payroll.view", module: "hr", name: "Xem bảng lương / phiếu lương" },
  { code: "payroll.manage", module: "hr", name: "Lập bảng lương & ứng lương" },

  // --- Hệ thống ---
  { code: "audit.view", module: "system", name: "Xem nhật ký hệ thống" },
  { code: "setting.manage", module: "system", name: "Cấu hình hệ thống" },
] as const;

export type PermissionCode = (typeof PERMISSIONS)[number]["code"];

// ═══════════════════ VAI TRÒ HỆ THỐNG ═══════════════════

export const HUMAN_ROLE_CODES = [
  "DIRECTOR",
  "HEAD_SALES",
  "HEAD_ACCOUNT",
  "HEAD_DESIGN",
  "HEAD_CONSTRUCT",
  "STAFF_SALES",
  "STAFF_ACCOUNT",
  "STAFF_DESIGN",
  "STAFF_CONSTRUCT",
] as const;

export const ROLE_CODES = [
  ...HUMAN_ROLE_CODES,
  "AI_AGENT",
] as const;

export type RoleCode = (typeof ROLE_CODES)[number];

export const ROLE_LABEL: Record<RoleCode, string> = {
  DIRECTOR: "Giám đốc",
  HEAD_SALES: "Trưởng phòng Kinh doanh",
  HEAD_ACCOUNT: "Trưởng phòng Kế toán",
  HEAD_DESIGN: "Trưởng phòng Thiết kế",
  HEAD_CONSTRUCT: "Trưởng phòng Thi công",
  STAFF_SALES: "Nhân viên Kinh doanh",
  STAFF_ACCOUNT: "Nhân viên Kế toán",
  STAFF_DESIGN: "Nhân viên Thiết kế",
  STAFF_CONSTRUCT: "Nhân viên Thi công",
  AI_AGENT: "NA AI",
};

type RoleGrants = Partial<Record<PermissionCode, PermissionScope>>;

/**
 * Bộ quyền MẶC ĐỊNH khi seed. Sau khi seed, Director sửa trực tiếp trong DB qua UI —
 * file này chỉ là điểm khởi đầu, KHÔNG phải nguồn chân lý lúc chạy.
 * Nguồn chân lý lúc chạy là bảng role_permissions.
 *
 * Đối chiếu ma trận mục 3.3–3.5 của Dev Brief v1.0.
 */
export const DEFAULT_ROLE_GRANTS: Record<RoleCode, RoleGrants> = {
  // Giám đốc — toàn quyền, không bị chặn bởi bất kỳ rule nào.
  DIRECTOR: Object.fromEntries(
    PERMISSIONS.map((p) => [p.code, "ALL" as PermissionScope]),
  ) as RoleGrants,

  // Trưởng phòng Kế toán — phạm vi gần bằng Director, TRỪ phân quyền.
  // Có user.create để tự thêm anh em thợ vào chấm công, nhưng không có
  // role.manage nên chỉ gán được vai trò nằm trong quyền của mình.
  HEAD_ACCOUNT: {
    "user.view": "ALL",
    "user.create": "ALL",
    "customer.view": "ALL",
    "customer.create": "ALL",
    "customer.update": "ALL",
    "customer.delete": "ALL",
    "project.view": "ALL",
    "project.create": "ALL",
    "project.update": "ALL",
    "project.stage.change": "ALL",
    "project.member.manage": "ALL",
    "project.comment": "ALL",
    "project.file.upload": "ALL",
    "contract.view": "ALL",
    "contract.manage": "ALL",
    "material.view": "ALL",
    "material.manage": "ALL",
    "finance.view": "ALL",
    "finance.manage": "ALL",
    "report.operational": "ALL",
    "maintenance.view": "ALL",
    "maintenance.manage": "ALL",
    "attendance.view": "ALL",
    "attendance.manage": "ALL",
    "leave.approve": "ALL",
    "payroll.view": "ALL",
    "payroll.manage": "ALL",
    "report.financial": "ALL",
    "audit.view": "ALL",
  },

  // Nhân viên Kế toán — như trưởng phòng nhưng không xem audit log.
  // Khách đã chốt: kế toán xem được hồ sơ TOÀN công ty (cần cho việc chấm công/lương ở GĐ2).
  STAFF_ACCOUNT: {
    "user.view": "ALL",
    "customer.view": "ALL",
    "customer.create": "ALL",
    "customer.update": "ALL",
    "project.view": "ALL",
    "project.create": "ALL",
    "project.update": "ASSIGNED",
    "project.stage.change": "ASSIGNED",
    "project.comment": "ALL",
    "project.file.upload": "ASSIGNED",
    "contract.view": "ALL",
    "contract.manage": "ALL",
    "material.view": "ALL",
    "material.manage": "ALL",
    "finance.view": "ALL",
    "finance.manage": "ALL",
    "report.operational": "ALL",
    "maintenance.view": "ALL",
    "maintenance.manage": "ALL",
    "attendance.view": "ALL",
    "attendance.manage": "ALL",
    "payroll.view": "ALL",
    "payroll.manage": "ALL",
    "report.financial": "ALL",
  },

  // Trưởng phòng Kinh doanh — quản nhân viên phòng mình, tạo dự án, KHÔNG xem tài chính.
  HEAD_SALES: {
    "user.view": "DEPARTMENT",
    "user.update": "DEPARTMENT",
    "user.deactivate": "DEPARTMENT",
    "customer.view": "ALL",
    "customer.create": "ALL",
    "customer.update": "ALL",
    "customer.delete": "ALL",
    "project.view": "ALL",
    "project.create": "ALL",
    "project.update": "ALL",
    "project.stage.change": "ALL",
    "project.member.manage": "ALL",
    "project.comment": "ALL",
    "project.file.upload": "ALL",
    "contract.view": "ASSIGNED",
    "contract.manage": "ASSIGNED",
    "material.view": "ALL",
    "material.manage": "ASSIGNED",
    "maintenance.view": "ALL",
    "maintenance.manage": "ALL",
    "attendance.view": "DEPARTMENT",
    "leave.approve": "DEPARTMENT",
    "payroll.view": "SELF",
    "report.operational": "ALL",
  },

  STAFF_SALES: {
    "user.view": "SELF",
    "customer.view": "ALL",
    "customer.create": "ALL",
    "customer.update": "ALL",
    "project.view": "ALL",
    "project.create": "ALL",
    "project.update": "ASSIGNED",
    "project.stage.change": "ASSIGNED",
    "project.member.manage": "ASSIGNED",
    "project.comment": "ALL",
    "project.file.upload": "ASSIGNED",
    "contract.view": "ASSIGNED",
    "contract.manage": "ASSIGNED",
    "material.view": "ALL",
    "material.manage": "ASSIGNED",
    "maintenance.view": "ALL",
    "maintenance.manage": "ALL",
    "attendance.view": "SELF",
    "payroll.view": "SELF",
    "report.operational": "ALL",
  },

  // Trưởng phòng Thiết kế — KHÔNG tạo dự án, KHÔNG thấy tiền.
  HEAD_DESIGN: {
    "user.view": "DEPARTMENT",
    "user.update": "DEPARTMENT",
    "user.deactivate": "DEPARTMENT",
    "customer.view": "ALL",
    "project.view": "ALL",
    "project.update": "ASSIGNED",
    "project.stage.change": "ASSIGNED",
    "project.comment": "ALL",
    "project.file.upload": "ASSIGNED",
    "material.view": "ALL",
    "material.manage": "ASSIGNED",
    "maintenance.view": "ALL",
    "maintenance.manage": "ASSIGNED",
    "attendance.view": "DEPARTMENT",
    "leave.approve": "DEPARTMENT",
    "payroll.view": "SELF",
    "report.operational": "ALL",
  },

  STAFF_DESIGN: {
    "user.view": "SELF",
    "customer.view": "ALL",
    "project.view": "ALL",
    "project.update": "ASSIGNED",
    "project.stage.change": "ASSIGNED",
    "project.comment": "ALL",
    "project.file.upload": "ASSIGNED",
    "material.view": "ALL",
    "material.manage": "ASSIGNED",
    "maintenance.view": "ALL",
    "maintenance.manage": "ASSIGNED",
    "attendance.view": "SELF",
    "payroll.view": "SELF",
    "report.operational": "ALL",
  },

  HEAD_CONSTRUCT: {
    "user.view": "DEPARTMENT",
    "user.update": "DEPARTMENT",
    "user.deactivate": "DEPARTMENT",
    "customer.view": "ALL",
    "project.view": "ALL",
    "project.update": "ASSIGNED",
    "project.stage.change": "ASSIGNED",
    "project.comment": "ALL",
    "project.file.upload": "ASSIGNED",
    "material.view": "ALL",
    "material.manage": "ASSIGNED",
    "maintenance.view": "ALL",
    "maintenance.manage": "ASSIGNED",
    "attendance.view": "DEPARTMENT",
    "leave.approve": "DEPARTMENT",
    "payroll.view": "SELF",
    "report.operational": "ALL",
  },

  STAFF_CONSTRUCT: {
    "user.view": "SELF",
    "customer.view": "ALL",
    "project.view": "ALL",
    "project.update": "ASSIGNED",
    "project.stage.change": "ASSIGNED",
    "project.comment": "ALL",
    "project.file.upload": "ASSIGNED",
    "material.view": "ALL",
    "material.manage": "ASSIGNED",
    "maintenance.view": "ALL",
    "maintenance.manage": "ASSIGNED",
    "attendance.view": "SELF",
    "payroll.view": "SELF",
    "report.operational": "ALL",
  },

  // Tài khoản dịch vụ chỉ có quyền đọc tối thiểu cho bốn công cụ V1.
  // Director có thể chỉnh bộ quyền này tại màn Phân quyền sau khi bootstrap.
  AI_AGENT: {
    "project.view": "ALL",
    "contract.view": "ALL",
    "finance.view": "ALL",
    "report.financial": "ALL",
  },
};

// ═══════════════════ KIỂM TRA QUYỀN ═══════════════════

/** Người dùng đã đăng nhập, kèm bảng quyền đã nạp sẵn từ DB. */
export type SessionUser = {
  id: string;
  /** Email hoặc SĐT có thể trống — nhưng không bao giờ cả hai (CHECK trong DB). */
  email: string | null;
  phone?: string | null;
  fullName: string;
  userType: "HUMAN" | "AI_AGENT";
  departmentId: string | null;
  departmentCode: string | null;
  roleCodes: string[];
  /** code quyền → scope rộng nhất mà user có */
  permissions: Record<string, PermissionScope>;
  /** Tài khoản mới do Director cấp — bị ép đổi mật khẩu trước khi dùng hệ thống. */
  mustChangePassword: boolean;
};

/** Ngữ cảnh của bản ghi đang thao tác — cần cho scope khác ALL. */
export type AccessContext = {
  /** Phòng ban sở hữu bản ghi (dùng cho scope DEPARTMENT) */
  departmentId?: string | null;
  /** User sở hữu bản ghi (dùng cho scope SELF) */
  ownerId?: string | null;
  /** Danh sách userId là thành viên dự án (dùng cho scope ASSIGNED) */
  memberIds?: string[];
};

const SCOPE_RANK: Record<PermissionScope, number> = {
  SELF: 1,
  ASSIGNED: 2,
  DEPARTMENT: 3,
  ALL: 4,
};

/** Khi user mang nhiều role, quyền hiệu lực là scope rộng nhất. */
export function widestScope(
  a: PermissionScope | undefined,
  b: PermissionScope | undefined,
): PermissionScope | undefined {
  if (!a) return b;
  if (!b) return a;
  return SCOPE_RANK[a] >= SCOPE_RANK[b] ? a : b;
}

/**
 * User có đủ mọi quyền trong `grants`, mỗi quyền với phạm vi bằng hoặc rộng hơn không.
 *
 * Dùng khi người KHÔNG có `role.manage` tạo tài khoản mới (kế toán thêm thợ):
 * người tạo biết mật khẩu tạm, nên gán cho tài khoản mới một vai trò rộng hơn
 * mình cũng chẳng khác gì tự nâng quyền cho mình. Chỉ cho gán vai trò nằm trọn
 * trong quyền của chính người tạo.
 */
export function coversGrants(
  user: Pick<SessionUser, "permissions">,
  grants: { code: string; scope: PermissionScope }[],
): boolean {
  return grants.every(({ code, scope }) => {
    const own = user.permissions[code];
    return own !== undefined && SCOPE_RANK[own] >= SCOPE_RANK[scope];
  });
}

/**
 * Câu hỏi duy nhất mà toàn hệ thống dùng để kiểm tra quyền.
 *
 * @example
 *   if (!can(user, "project.create")) return fail("PERMISSION_DENIED");
 *   if (!can(user, "project.update", { memberIds })) return fail("PERMISSION_DENIED");
 */
export function can(
  user: SessionUser | null | undefined,
  permission: PermissionCode,
  ctx: AccessContext = {},
): boolean {
  if (!user) return false;

  const scope = user.permissions[permission];
  if (!scope) return false;

  switch (scope) {
    case "ALL":
      return true;

    case "DEPARTMENT":
      // Không xác định được phòng của bản ghi → từ chối cho an toàn.
      if (!user.departmentId || !ctx.departmentId) return false;
      return user.departmentId === ctx.departmentId;

    case "ASSIGNED":
      if (!ctx.memberIds) return false;
      return ctx.memberIds.includes(user.id);

    case "SELF":
      if (!ctx.ownerId) return false;
      return ctx.ownerId === user.id;

    default:
      return false;
  }
}

/** Có quyền ở bất kỳ phạm vi nào không — dùng để quyết định hiện/ẩn menu. */
export function hasPermission(
  user: SessionUser | null | undefined,
  permission: PermissionCode,
): boolean {
  return Boolean(user?.permissions[permission]);
}

/**
 * Người dùng có được nhìn thấy số tiền không.
 * Phòng Thiết kế / Thi công KHÔNG có `finance.view` → mọi trường tiền phải bị
 * loại bỏ Ở TẦNG SERVER trước khi trả về client, không chỉ ẩn trên UI.
 */
export function canSeeMoney(user: SessionUser | null | undefined): boolean {
  return hasPermission(user, "finance.view");
}
