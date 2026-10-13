"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/modules/auth/auth.service";
import { can, hasPermission } from "@/common/permissions/permissions";
import {
  createEmployee,
  deactivateEmployee,
  getEmployee,
  purgeResignedEmployee,
  listAssignableRoles,
  resetEmployeePassword,
  setAvatar,
  updateEmployee,
} from "@/modules/hr/hr.service";
import type { DuplicateNameMatch } from "@/modules/hr/hr.service";
import { createUploadTicket } from "@/shared/minio/file.service";
import { ok, fail, type ActionResult } from "@/common/filters/error";
import type { SessionUser } from "@/common/permissions/permissions";
import {
  createEmployeeSchema,
  deactivateEmployeeSchema,
  resetPasswordSchema,
  updateEmployeeSchema,
} from "@/modules/hr/hr.schema";
import type { DepartmentCode } from "@/generated/prisma/enums";

/** Lấy câu lỗi đầu tiên của Zod để hiện lên form. */
function firstIssue(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? "Dữ liệu nhập vào không hợp lệ.";
}

/** Ô chọn nhiều (vai trò) gửi lên nhiều dòng cùng tên. */
function multi(formData: FormData, name: string): string[] {
  return formData.getAll(name).map(String).filter(Boolean);
}

/** Dữ liệu thô người dùng vừa nhập — trả về khi lỗi để form điền lại, khỏi gõ lại từ đầu. */
export type EmployeeFormValues = {
  fullName: string;
  email: string;
  phone: string;
  position: string;
  joinedAt: string;
  departmentCode: string;
  roleCodes: string[];
  /** Ba trường lương — chỉ người có payroll.manage gửi lên và ghi được. */
  baseSalary: string;
  insuranceBase: string;
  isFixedSalary: string;
};

export type EmployeeFormState = {
  error: string | null;
  /** Giá trị vừa nhập, echo lại khi validate hỏng để không mất công gõ lại. */
  values?: EmployeeFormValues;
  /** Hiện sau khi tạo/reset thành công — Director đọc cho nhân viên rồi đóng lại. */
  tempPassword?: string;
  createdName?: string;
  /** Email hoặc SĐT — người tạo đọc cho nhân viên cùng mật khẩu tạm. */
  loginName?: string;
  employeeCode?: string;
  /**
   * Hồ sơ đã có cùng tên. Form hiện danh sách này kèm ô xác nhận để người tạo tự
   * quyết — có thật người trùng tên, nhưng cũng có thể họ đang tạo lại một người
   * đã nghỉ việc mà không biết.
   */
  duplicateNames?: DuplicateNameMatch[];
};

/** Gom giá trị thô từ form để vừa validate vừa echo lại khi lỗi. */
function readEmployeeForm(formData: FormData): EmployeeFormValues {
  return {
    fullName: String(formData.get("fullName") ?? ""),
    email: String(formData.get("email") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    position: String(formData.get("position") ?? ""),
    joinedAt: String(formData.get("joinedAt") ?? ""),
    departmentCode: String(formData.get("departmentCode") ?? ""),
    roleCodes: multi(formData, "roleCodes"),
    baseSalary: String(formData.get("baseSalary") ?? ""),
    insuranceBase: String(formData.get("insuranceBase") ?? ""),
    isFixedSalary: String(formData.get("isFixedSalary") ?? ""),
  };
}

// ═══════════════════ HR-02 · TẠO TÀI KHOẢN ═══════════════════

export async function createEmployeeAction(
  _prev: EmployeeFormState,
  formData: FormData,
): Promise<EmployeeFormState> {
  const values = readEmployeeForm(formData);

  // 1. Phiên đăng nhập
  const user = await requireUser();

  // 2. Quyền — Giám đốc, và kế toán khi được bật `user.create` (khách cần kế
  // toán tự thêm anh em thợ để chấm công).
  if (!can(user, "user.create")) {
    return { error: "Bạn không có quyền tạo tài khoản.", values };
  }
  // Tạo người mới đồng nghĩa gán vai trò cho họ, và người tạo biết mật khẩu tạm.
  // Không có role.manage thì chỉ được gán vai trò nằm trọn trong quyền của mình
  // — nếu không, kế toán tạo một tài khoản Giám đốc là tự nâng quyền cho mình.
  const assignable = new Set((await listAssignableRoles(user)).map((r) => r.code));
  if (values.roleCodes.some((code) => !assignable.has(code))) {
    return { error: "Bạn không có quyền gán vai trò đã chọn.", values };
  }

  // 3. Validate
  const parsed = createEmployeeSchema.safeParse({
    fullName: values.fullName,
    email: values.email,
    phone: values.phone,
    departmentCode: values.departmentCode || undefined,
    position: values.position,
    joinedAt: values.joinedAt,
    roleCodes: values.roleCodes,
    allowDuplicateName: formData.get("allowDuplicateName") === "on",
  });
  if (!parsed.success) return { error: firstIssue(parsed.error), values };

  // 4. Ghi dữ liệu + AuditLog (trong transaction ở tầng service)
  const result = await createEmployee(user.id, parsed.data);

  if (!result.ok) {
    if (result.reason === "NAME_EXISTS") {
      return {
        error: null,
        values,
        duplicateNames: result.matches,
      };
    }
    return {
      error:
        result.reason === "EMAIL_TAKEN"
          ? "Email này đã được dùng cho một tài khoản khác."
          : result.reason === "PHONE_TAKEN"
            ? "Số điện thoại này đã được dùng cho một nhân viên khác."
            : "Vai trò được chọn không tồn tại.",
      values,
    };
  }

  revalidatePath("/hr");
  return {
    error: null,
    tempPassword: result.tempPassword,
    createdName: parsed.data.fullName,
    loginName: parsed.data.email ?? parsed.data.phone,
    employeeCode: result.employeeCode,
  };
}

// ═══════════════════ HR-04 · SỬA HỒ SƠ ═══════════════════

export async function updateEmployeeAction(
  _prev: EmployeeFormState,
  formData: FormData,
): Promise<EmployeeFormState> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  const values = readEmployeeForm(formData);

  const target = await getEmployee(id);
  if (!target) return { error: "Không tìm thấy hồ sơ nhân viên.", values };

  // Scope DEPARTMENT so phòng của NGƯỜI BỊ SỬA với phòng của người sửa;
  // scope SELF chỉ cho sửa chính mình.
  if (
    !can(user, "user.update", {
      departmentId: target.departmentId,
      ownerId: target.id,
    })
  ) {
    return { error: "Bạn không có quyền sửa hồ sơ này.", values };
  }

  // Đã nghỉ việc thì hồ sơ chỉ để tra cứu, không sửa nữa.
  if (target.deletedAt) {
    return { error: "Không sửa được hồ sơ của nhân viên đã nghỉ việc.", values };
  }

  // Chỉ người có role.manage mới đổi được vai trò và phòng ban. Trưởng phòng
  // có user.update scope DEPARTMENT nhưng KHÔNG có role.manage — nếu bỏ chốt này
  // họ có thể tự nâng quyền cho nhân viên phòng mình lên ngang Giám đốc.
  const canManageRoles = hasPermission(user, "role.manage");
  const parsed = updateEmployeeSchema.safeParse({
    id,
    fullName: values.fullName,
    phone: values.phone,
    position: values.position,
    joinedAt: values.joinedAt,
    // Người không có role.manage: bỏ qua hoàn toàn hai trường này, kể cả khi
    // họ tự chèn vào request.
    departmentCode: canManageRoles
      ? ((values.departmentCode || null) as DepartmentCode | null)
      : undefined,
    roleCodes: canManageRoles ? values.roleCodes : undefined,
  });
  if (!parsed.success) return { error: firstIssue(parsed.error), values };

  const result = await updateEmployee(user.id, parsed.data, { canManageRoles });
  if (!result.ok) {
    return {
      error: {
        NOT_FOUND: "Không tìm thấy hồ sơ nhân viên.",
        ROLE_NOT_FOUND: "Vai trò được chọn không tồn tại.",
        PHONE_REQUIRED:
          "Nhân viên này không có email nên phải có số điện thoại để đăng nhập.",
        PHONE_TAKEN: "Số điện thoại này đã được dùng cho một nhân viên khác.",
      }[result.reason],
      values,
    };
  }

  revalidatePath("/hr");
  revalidatePath(`/hr/${id}`);
  // redirect() ném exception để Next chuyển trang — không bọc trong try/catch.
  redirect(`/hr/${id}`);
}

// ═══════════════════ HR-05 · CHO NGHỈ VIỆC ═══════════════════

export async function deactivateEmployeeAction(
  _prev: EmployeeFormState,
  formData: FormData,
): Promise<EmployeeFormState> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");

  const target = await getEmployee(id);
  if (!target || target.deletedAt) {
    return { error: "Không tìm thấy hồ sơ nhân viên đang làm việc." };
  }

  if (!can(user, "user.deactivate", { departmentId: target.departmentId })) {
    return { error: "Bạn không có quyền cho nhân viên này nghỉ việc." };
  }

  // Tự cho mình nghỉ sẽ tự khóa mình khỏi hệ thống ngay giữa thao tác.
  if (target.id === user.id) {
    return { error: "Bạn không thể tự cho mình nghỉ việc." };
  }

  const parsed = deactivateEmployeeSchema.safeParse({
    id,
    reason: formData.get("reason") ?? "",
    resignDate: formData.get("resignDate") ?? "",
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const result = await deactivateEmployee(
    user.id,
    parsed.data.id,
    parsed.data.reason,
    parsed.data.resignDate,
  );
  if (!result.ok) return { error: "Không tìm thấy hồ sơ nhân viên." };

  revalidatePath("/hr");
  revalidatePath("/hr/da-nghi");
  revalidatePath(`/hr/${id}`);
  return { error: null };
}

// ═══════════════════ HR-07 · ĐẶT LẠI MẬT KHẨU ═══════════════════

export async function resetPasswordAction(
  _prev: EmployeeFormState,
  formData: FormData,
): Promise<EmployeeFormState> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");

  if (!can(user, "user.resetPassword")) {
    return { error: "Bạn không có quyền đặt lại mật khẩu cho người khác." };
  }

  const parsed = resetPasswordSchema.safeParse({ id });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  // Mật khẩu của chính mình đổi qua trang "Đổi mật khẩu" — ở đó phải nhập
  // mật khẩu cũ, chặt hơn đường này.
  if (parsed.data.id === user.id) {
    return { error: "Hãy dùng trang Đổi mật khẩu để đổi mật khẩu của bạn." };
  }

  const result = await resetEmployeePassword(user.id, parsed.data.id);
  if (!result.ok) return { error: "Không tìm thấy hồ sơ nhân viên." };

  revalidatePath(`/hr/${id}`);
  return { error: null, tempPassword: result.tempPassword };
}

// ═══════════════════ HR-08 · AVATAR ═══════════════════

/**
 * Ai được đổi avatar của hồ sơ này: CHÍNH CHỦ (ai cũng tự đổi ảnh mình được,
 * kể cả nhân viên không có user.update) hoặc người sửa được hồ sơ đó.
 */
function canChangeAvatar(
  user: SessionUser,
  target: { id: string; departmentId: string | null },
): boolean {
  if (target.id === user.id) return true;
  return can(user, "user.update", {
    departmentId: target.departmentId,
    ownerId: target.id,
  });
}

/** Pha 1 — cấp vé upload avatar (chỉ nhận ảnh, tối đa 15MB theo nhóm image). */
export async function requestAvatarTicketAction(input: {
  userId: string;
  fileName: string;
  mimeType: string;
}): Promise<
  ActionResult<{ uploadUrl: string; objectKey: string; maxSizeBytes: number }>
> {
  const user = await requireUser();

  const target = await getEmployee(input.userId);
  if (!target || target.deletedAt) return fail("NOT_FOUND", "Không tìm thấy hồ sơ.");
  if (!canChangeAvatar(user, target)) {
    return fail("PERMISSION_DENIED", "Bạn không có quyền đổi ảnh đại diện này.");
  }

  const ticket = await createUploadTicket({
    prefix: `avatars/${input.userId}`,
    fileName: input.fileName.trim().slice(0, 200),
    kind: "AVATAR",
    mimeType: input.mimeType,
  });
  if (!ticket.ok) {
    return fail("VALIDATION_ERROR", "Ảnh đại diện phải là file ảnh (jpg, png, webp...).");
  }
  const { uploadUrl, objectKey, maxSizeBytes } = ticket;
  return ok({ uploadUrl, objectKey, maxSizeBytes });
}

/** Pha 3 — client PUT xong, ghi FileAsset + trỏ avatarUrl (trong transaction). */
export async function saveAvatarAction(input: {
  userId: string;
  objectKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}): Promise<ActionResult<{ saved: true }>> {
  const user = await requireUser();

  const target = await getEmployee(input.userId);
  if (!target || target.deletedAt) return fail("NOT_FOUND", "Không tìm thấy hồ sơ.");
  if (!canChangeAvatar(user, target)) {
    return fail("PERMISSION_DENIED", "Bạn không có quyền đổi ảnh đại diện này.");
  }

  // objectKey phải thuộc đúng thư mục avatar của người này.
  if (!input.objectKey.startsWith(`avatars/${input.userId}/`)) {
    return fail("VALIDATION_ERROR", "Object key không hợp lệ.");
  }

  const result = await setAvatar(user.id, input.userId, {
    objectKey: input.objectKey,
    fileName: input.fileName.slice(0, 200),
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
  });
  if (!result.ok) {
    return fail(
      "VALIDATION_ERROR",
      result.reason === "NOT_UPLOADED"
        ? "Ảnh chưa được tải lên hoàn tất."
        : result.reason === "NOT_FOUND"
          ? "Không tìm thấy hồ sơ."
          : "Ảnh đại diện phải là file ảnh (jpg, png, webp...).",
    );
  }

  revalidatePath("/hr");
  revalidatePath(`/hr/${input.userId}`);
  return ok({ saved: true });
}

/**
 * Xóa hồ sơ khỏi danh sách nhân viên đã nghỉ — dữ liệu cũ (công, lương…) giữ
 * nguyên, xem `purgeResignedEmployee`. Cần quyền cho nghỉ việc phạm vi TOÀN
 * CÔNG TY — mặc định là Giám đốc; trưởng phòng chỉ có phạm vi phòng mình.
 */
export async function purgeEmployeeAction(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  if (!can(user, "user.deactivate")) {
    return { ok: false, error: "Chỉ Giám đốc được xóa hồ sơ nhân viên đã nghỉ." };
  }
  if (typeof id !== "string" || id.length === 0 || id.length > 64) {
    return { ok: false, error: "Hồ sơ không hợp lệ." };
  }

  const result = await purgeResignedEmployee(user.id, id);
  if (!result.ok) return { ok: false, error: "Không tìm thấy hồ sơ đã nghỉ việc này." };

  revalidatePath("/hr");
  revalidatePath("/hr/da-nghi");
  return { ok: true };
}
