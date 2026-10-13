"use server";

/**
 * Server Action của module Bảng lương.
 *
 * Mọi thao tác ghi đều gác `payroll.manage` (Giám đốc + Kế toán). Quyền
 * `payroll.view` chỉ để đọc, và phạm vi SELF chỉ thấy dòng của chính mình —
 * việc lọc nằm trong service, không phải ở giao diện.
 *
 * Phiếu ứng lương và chốt / mở kỳ sinh giao dịch bên Tài chính, nên các action
 * đó làm mới cả trang Tài chính, Báo cáo và Dashboard.
 */

import { revalidatePath } from "next/cache";
import { requireUser } from "@/modules/auth/auth.service";
import { can } from "@/common/permissions/permissions";
import {
  createAdvance,
  deleteAdvance,
  deleteSalaryRecord,
  recalcPeriod,
  setPeriodCutoff,
  setPeriodStatus,
  updateLine,
  upsertSalaryRecord,
} from "@/modules/payroll/payroll.service";
import {
  createAdvanceSchema,
  payrollSettingsSchema,
  periodCutoffSchema,
  periodSchema,
  periodStatusSchema,
  salaryRecordIdSchema,
  salaryRecordSchema,
  updateLineSchema,
} from "@/modules/payroll/payroll.schema";
import {
  PAYROLL_SETTING_KEY,
  getPayrollSettings,
} from "@/modules/payroll/payroll.config";
import { prisma } from "@/shared/prisma/prisma.service";
import { writeAuditLog } from "@/shared/audit/audit.service";

export type ActionState = { error: string | null; ok?: boolean };

const DENIED = "Bạn không có quyền lập bảng lương.";

function firstIssue(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? "Dữ liệu nhập vào không hợp lệ.";
}

function refresh() {
  revalidatePath("/bang-luong");
}

/** Sau thao tác có sinh / gỡ giao dịch chi lương bên Tài chính. */
function refreshWithFinance() {
  refresh();
  revalidatePath("/finance");
  revalidatePath("/reports");
  revalidatePath("/dashboard");
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

const SALARY_DENIED = "Bạn không có quyền đặt lương.";

/**
 * Thêm / sửa mốc lương của một người.
 *
 * Gác `payroll.manage` giống các ô lương cũ trên hồ sơ: trưởng phòng có
 * `user.update` phạm vi DEPARTMENT KHÔNG được tự đặt lương nhân viên phòng mình.
 * Làm mới cả trang hồ sơ lẫn bảng lương vì mốc đổi là số lương tháng đổi theo.
 */
export async function upsertSalaryRecordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  if (!can(user, "payroll.manage")) return { error: SALARY_DENIED };

  // Form gửi tháng và năm thành hai ô rời (bộ chọn tháng mặc định của trình duyệt
  // hiện tháng bằng chữ theo ngôn ngữ máy). Ghép lại thành "YYYY-MM" cho schema.
  const month = String(formData.get("effectiveMonth") ?? "").padStart(2, "0");
  const year = String(formData.get("effectiveYear") ?? "");

  const parsed = salaryRecordSchema.safeParse({
    userId: String(formData.get("userId") ?? ""),
    effectiveFrom: `${year}-${month}`,
    baseSalary: String(formData.get("baseSalary") ?? ""),
    insuranceBase: String(formData.get("insuranceBase") ?? ""),
    isFixedSalary: formData.get("isFixedSalary") === "on",
    note: String(formData.get("note") ?? ""),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  try {
    await upsertSalaryRecord(user, parsed.data);
  } catch (error) {
    return { error: messageOf(error, "Không lưu được mốc lương.") };
  }
  refresh();
  revalidatePath(`/hr/${parsed.data.userId}`);
  return { error: null, ok: true };
}

/** Xóa một mốc lương. */
export async function deleteSalaryRecordAction(
  input: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  if (!can(user, "payroll.manage")) return { ok: false, error: SALARY_DENIED };

  const parsed = salaryRecordIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  try {
    await deleteSalaryRecord(user, parsed.data.id);
  } catch (error) {
    return { ok: false, error: messageOf(error, "Không xóa được mốc lương.") };
  }
  refresh();
  revalidatePath("/hr");
  return { ok: true };
}

/** Tạo kỳ lương (nếu chưa có) và nạp lại số công từ bảng chấm công. */
export async function recalcPeriodAction(input: {
  year: number;
  month: number;
}): Promise<{ ok: true; lines: number } | { ok: false; error: string }> {
  const user = await requireUser();
  if (!can(user, "payroll.manage")) return { ok: false, error: DENIED };

  const parsed = periodSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  try {
    const r = await recalcPeriod(user, parsed.data.year, parsed.data.month);
    refresh();
    return { ok: true, lines: r.lines };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Không tính lại được.",
    };
  }
}

/** Sửa các ô gõ tay của một dòng lương. */
export async function updateLineAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  if (!can(user, "payroll.manage")) return { error: DENIED };

  const parsed = updateLineSchema.safeParse({
    id: formData.get("id") ?? "",
    roundedSalary: formData.get("roundedSalary") ?? "0",
    materialDeduction: formData.get("materialDeduction") ?? "0",
    deductionNote: formData.get("deductionNote") ?? "",
    bonusSales: formData.get("bonusSales") ?? "0",
    bonusResponsibility: formData.get("bonusResponsibility") ?? "0",
    bonusAttendance: formData.get("bonusAttendance") ?? "0",
    bonusPunctuality: formData.get("bonusPunctuality") ?? "0",
    bonusOther: formData.get("bonusOther") ?? "0",
    otherDeduction: formData.get("otherDeduction") ?? "0",
    actualPaid: formData.get("actualPaid") ?? "",
    note: formData.get("note") ?? "",
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  try {
    await updateLine(user, parsed.data);
    refresh();
    return { error: null, ok: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Không lưu được." };
  }
}

/**
 * Đặt / bỏ ngày chốt công của kỳ lương — công sau ngày chốt chuyển sang kỳ
 * tháng sau. Service tự tính lại cả hai kỳ.
 */
export async function setPeriodCutoffAction(input: {
  year: number;
  month: number;
  cutoffDay: number | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  if (!can(user, "payroll.manage")) return { ok: false, error: DENIED };

  const parsed = periodCutoffSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  try {
    await setPeriodCutoff(user, parsed.data.year, parsed.data.month, parsed.data.cutoffDay);
  } catch (error) {
    return { ok: false, error: messageOf(error, "Không đổi được ngày chốt công.") };
  }
  refresh();
  return { ok: true };
}

/** Chốt / mở lại kỳ lương. */
export async function setPeriodStatusAction(
  periodId: string,
  status: "DRAFT" | "LOCKED",
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  if (!can(user, "payroll.manage")) return { ok: false, error: DENIED };

  const parsed = periodStatusSchema.safeParse({ periodId, status });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  try {
    await setPeriodStatus(user, parsed.data.periodId, parsed.data.status);
  } catch (error) {
    return { ok: false, error: messageOf(error, "Không đổi được trạng thái kỳ lương.") };
  }
  refreshWithFinance();
  return { ok: true };
}

// ═══════════════════ ỨNG LƯƠNG ═══════════════════

export async function createAdvanceAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  if (!can(user, "payroll.manage")) {
    return { error: "Bạn không có quyền ghi ứng lương." };
  }

  const parsed = createAdvanceSchema.safeParse({
    userId: formData.get("userId") ?? "",
    advanceDate: formData.get("advanceDate") ?? "",
    amount: formData.get("amount") ?? "0",
    method: formData.get("method") ?? "CASH",
    note: formData.get("note") ?? "",
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  try {
    await createAdvance(user, parsed.data);
  } catch (error) {
    return { error: messageOf(error, "Không lưu được phiếu ứng lương.") };
  }
  refreshWithFinance();
  return { error: null, ok: true };
}

export async function deleteAdvanceAction(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  if (!can(user, "payroll.manage")) {
    return { ok: false, error: "Bạn không có quyền xóa phiếu ứng lương." };
  }

  try {
    await deleteAdvance(user, id);
  } catch (error) {
    return { ok: false, error: messageOf(error, "Không xóa được.") };
  }
  refreshWithFinance();
  return { ok: true };
}

// ═══════════════════ CẤU HÌNH QUY TẮC ═══════════════════

/**
 * Đổi hệ số chủ nhật / giờ đổi công tăng ca / ngày công chuẩn / tỉ lệ bảo hiểm.
 * Chỉ ảnh hưởng các lần TÍNH LẠI về sau — kỳ lương đã chốt giữ nguyên số cũ.
 *
 * Gác bằng `payroll.manage` chứ KHÔNG phải `setting.manage`: đây là tham số của
 * riêng module Lương, mà kế toán mới là người chạy lương hằng tháng và là người
 * biết nhà nước vừa đổi tỉ lệ bảo hiểm. `setting.manage` đang gác cả mốc lịch
 * bảo trì bên module Bảo hành, cấp nó cho kế toán chỉ để sửa tỉ lệ lương là mở
 * thừa quyền sang nghiệp vụ không liên quan.
 */
export async function updatePayrollSettingsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  if (!can(user, "payroll.manage")) {
    return { error: "Bạn không có quyền sửa cấu hình tính lương." };
  }

  const parsed = payrollSettingsSchema.safeParse({
    sundayFactor: formData.get("sundayFactor") ?? "",
    overtimeHoursPerDay: formData.get("overtimeHoursPerDay") ?? "",
    standardDays: formData.get("standardDays") ?? "",
    insurancePercent: formData.get("insurancePercent") ?? "",
    employerInsurancePercent: formData.get("employerInsurancePercent") ?? "",
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const before = await getPayrollSettings();
  const value = {
    sundayFactor: parsed.data.sundayFactor,
    overtimeHoursPerDay: parsed.data.overtimeHoursPerDay,
    standardDays: parsed.data.standardDays,
    insuranceRate: parsed.data.insurancePercent / 100,
    // Phải ghi lại cả trường này: `value` ghi đè nguyên cụm JSON, bỏ sót là
    // tỉ lệ công ty đóng bị xóa về mặc định mỗi lần kế toán lưu cấu hình.
    employerInsuranceRate: parsed.data.employerInsurancePercent / 100,
  };

  await prisma.$transaction(async (tx) => {
    await tx.systemSetting.upsert({
      where: { key: PAYROLL_SETTING_KEY },
      update: { value },
      create: { key: PAYROLL_SETTING_KEY, value },
    });
    await writeAuditLog(tx, {
      actorId: user.id,
      action: "PAYROLL_SETTING_UPDATE",
      entity: "SystemSetting",
      entityId: PAYROLL_SETTING_KEY,
      before,
      after: value,
    });
  });

  refresh();
  revalidatePath("/cham-cong");
  return { error: null, ok: true };
}
