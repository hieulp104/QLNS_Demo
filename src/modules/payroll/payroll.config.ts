/**
 * ═══════════════════════════════════════════════════════════════
 * Quy tắc tính công & lương — MỘT nguồn chân lý cho cả hai module
 * ═══════════════════════════════════════════════════════════════
 * Công thức ở đây được dò ngược từ file Excel tháng 8/2026 của công ty và đã
 * đối chiếu khớp cả 11 dòng:
 *
 *   Công HC        = tổng giá trị ký hiệu của các NGÀY THƯỜNG (X=1 · /=0.5 · N=0 · L=1)
 *   Công chủ nhật  = tổng giá trị ký hiệu các NGÀY CHỦ NHẬT × 1.5
 *   Công tăng ca   = tổng giờ tăng ca ÷ 4            (8 giờ × 200%)
 *   Tổng công      = công HC + công chủ nhật + công tăng ca
 *   Lương thực tế  = lương cơ bản ÷ 26 × tổng công
 *   Tổng lương     = lương làm tròn − ứng lương − trừ lương (ván, vật tư…) − BHXH
 *   Lương thực nhận= tổng lương + tổng thưởng + thưởng khác − trừ khác
 *   Chi thực tế    = kế toán gõ (làm tròn lần cuối), bỏ trống = thực nhận
 *
 * "Thưởng khác" / "trừ khác" dò từ bảng chi tháng 2/2026: thưởng Tết, chuyên
 * cần + đúng giờ tháng trước trả bù, trừ quỹ văn phòng. Trong file Excel chúng
 * đứng SAU cột "Tổng thưởng" nên không cộng vào tổng thưởng.
 *
 * KHÔNG tự làm tròn lương (khách đã chốt): hệ thống tính ra số lẻ, kế toán tự
 * gõ con số làm tròn ở cột riêng — đúng thói quen đang làm trên Excel.
 *
 * Năm tham số dưới đây sửa được trong `system_settings` mà không cần deploy —
 * Giám đốc và Kế toán (quyền `payroll.manage`).
 */

import type { PrismaClient } from "@/generated/prisma/client";
import type { AttendanceMark } from "@/generated/prisma/enums";
import { prisma } from "@/shared/prisma/prisma.service";

type SettingClient = Pick<PrismaClient, "systemSetting">;

export const PAYROLL_SETTING_KEY = "payroll.rules";

export type PayrollSettings = {
  /** Hệ số công ngày chủ nhật. */
  sundayFactor: number;
  /** Bao nhiêu giờ tăng ca đổi được 1 công. */
  overtimeHoursPerDay: number;
  /** Số ngày công chuẩn để chia lương tháng. */
  standardDays: number;
  /** Tỉ lệ BHXH trừ vào lương (0.105 = 10,5%). */
  insuranceRate: number;
  /** Tỉ lệ bảo hiểm phần CÔNG TY đóng (0.215 = 21,5%: BHXH 17,5 + BHYT 3 + BHTN 1). */
  employerInsuranceRate: number;
};

export const DEFAULT_PAYROLL_SETTINGS: PayrollSettings = {
  sundayFactor: 1.5,
  overtimeHoursPerDay: 4,
  standardDays: 26,
  insuranceRate: 0.105,
  employerInsuranceRate: 0.215,
};

/**
 * Đọc tham số từ DB, thiếu trường nào thì lấy mặc định.
 * Cấu hình hỏng không được làm sập bảng lương — sai một tham số còn sửa được,
 * chứ trang trắng thì kế toán không làm được gì cả.
 */
export async function getPayrollSettings(
  client: SettingClient = prisma,
): Promise<PayrollSettings> {
  const row = await client.systemSetting.findUnique({
    where: { key: PAYROLL_SETTING_KEY },
  });
  const raw = (row?.value ?? {}) as Partial<Record<keyof PayrollSettings, unknown>>;

  const num = (v: unknown, fallback: number, min: number, max: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
  };

  return {
    sundayFactor: num(raw.sundayFactor, DEFAULT_PAYROLL_SETTINGS.sundayFactor, 0, 5),
    overtimeHoursPerDay: num(
      raw.overtimeHoursPerDay,
      DEFAULT_PAYROLL_SETTINGS.overtimeHoursPerDay,
      0.5,
      24,
    ),
    standardDays: num(raw.standardDays, DEFAULT_PAYROLL_SETTINGS.standardDays, 1, 31),
    insuranceRate: num(raw.insuranceRate, DEFAULT_PAYROLL_SETTINGS.insuranceRate, 0, 1),
    employerInsuranceRate: num(
      raw.employerInsuranceRate,
      DEFAULT_PAYROLL_SETTINGS.employerInsuranceRate,
      0,
      1,
    ),
  };
}

// ═══════════════════ TÍNH CÔNG ═══════════════════

/** Giá trị công của một ký hiệu chấm công. */
export const MARK_DAY_VALUE: Record<AttendanceMark, number> = {
  FULL: 1,
  HALF: 0.5,
  ABSENT: 0,
  HOLIDAY: 1,
  ANNUAL_LEAVE: 1,
};

/**
 * Ngày công lưu bằng cột `date` nên Prisma trả về mốc 00:00 UTC của đúng ngày
 * đó — dùng getUTCDay() là chính xác, KHÔNG được dùng getDay() (giờ máy chủ).
 */
export function isSunday(date: Date): boolean {
  return date.getUTCDay() === 0;
}

export type AttendanceEntry = {
  workDate: Date;
  mark: AttendanceMark;
  overtimeHours: number;
};

export type DaySummary = {
  /** Công hành chính — ngày thường. */
  workDays: number;
  /** Công chủ nhật, ĐÃ nhân hệ số. */
  sundayDays: number;
  /** Công tăng ca quy đổi từ giờ. */
  overtimeDays: number;
  /** Tổng giờ tăng ca (để hiển thị, không dùng tính lương). */
  overtimeHours: number;
  totalDays: number;
};

/** Làm tròn 2 chữ số — công luôn là bội của 0.25 nên đủ và tránh số lẻ nhị phân. */
const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Gộp các ngày công của MỘT người thành số liệu đưa vào bảng lương.
 * Ngày chủ nhật tách khỏi ngày thường vì hai loại nhân hệ số khác nhau.
 */
export function summarizeDays(
  entries: AttendanceEntry[],
  settings: PayrollSettings,
): DaySummary {
  let workDays = 0;
  let sundayRaw = 0;
  let overtimeHours = 0;

  for (const e of entries) {
    const value = MARK_DAY_VALUE[e.mark] ?? 0;
    if (isSunday(e.workDate)) sundayRaw += value;
    else workDays += value;
    overtimeHours += Number(e.overtimeHours ?? 0);
  }

  const sundayDays = round2(sundayRaw * settings.sundayFactor);
  const overtimeDays = round2(overtimeHours / settings.overtimeHoursPerDay);

  return {
    workDays: round2(workDays),
    sundayDays,
    overtimeDays,
    overtimeHours: round2(overtimeHours),
    totalDays: round2(workDays + sundayDays + overtimeDays),
  };
}

// ═══════════════════ TÍNH TIỀN ═══════════════════

/** Lương thực tế = lương cơ bản ÷ số ngày công chuẩn × tổng công. Trả về số nguyên đồng. */
export function grossSalaryOf(
  baseSalary: number,
  totalDays: number,
  settings: PayrollSettings,
): number {
  if (baseSalary <= 0 || settings.standardDays <= 0) return 0;
  return Math.round((baseSalary / settings.standardDays) * totalDays);
}

/** BHXH = tỉ lệ × mức đóng riêng của người đó. Không khai mức đóng = không trừ. */
export function insuranceOf(
  insuranceBase: number | null | undefined,
  settings: PayrollSettings,
): number {
  if (!insuranceBase || insuranceBase <= 0) return 0;
  return Math.round(insuranceBase * settings.insuranceRate);
}

/**
 * Bảo hiểm phần công ty đóng — tính trên CÙNG mức đóng riêng của từng người,
 * không phải trên lương cơ bản (hai con số này lệch nhau rất xa trong dữ liệu thật).
 * Không khai mức đóng = công ty không đóng, giống hệt phần trừ của nhân viên.
 */
export function employerInsuranceOf(
  insuranceBase: number | null | undefined,
  settings: PayrollSettings,
): number {
  if (!insuranceBase || insuranceBase <= 0) return 0;
  return Math.round(insuranceBase * settings.employerInsuranceRate);
}

// Công thức tiền nằm ở file thuần (không Prisma) để client dùng chung.
export {
  actualPaidOf,
  netSalaryOf,
  totalBonusOf,
  totalSalaryOf,
  type PayrollAmounts,
} from "@/modules/payroll/payroll.formula";
