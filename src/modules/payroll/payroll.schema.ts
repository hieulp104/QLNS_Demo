import { z } from "zod";
import { AdvanceMethod } from "@/generated/prisma/enums";

/** Tiền VND: nhận chuỗi có dấu phân cách nghìn, trả số nguyên đồng. */
const moneySchema = z
  .union([z.string(), z.number()])
  .transform((v) =>
    typeof v === "number" ? Math.round(v) : Number(v.replace(/[^\d-]/g, "") || 0),
  )
  .refine((n) => Number.isFinite(n), { message: "Số tiền không hợp lệ" })
  .refine((n) => Math.abs(n) < 1_000_000_000_000, { message: "Số tiền quá lớn" });

const dateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày không hợp lệ")
  .transform((v) => new Date(`${v}T00:00:00.000Z`));

/** Tiền có thể bỏ trống: chuỗi rỗng → null, nghĩa là "không khai / không đóng". */
const optionalMoneySchema = z
  .union([z.string(), z.number(), z.null()])
  .transform((v) => {
    if (v === null) return null;
    if (typeof v === "number") return Math.round(v);
    const digits = v.replace(/[^\d]/g, "");
    return digits === "" ? null : Number(digits);
  })
  .refine((n) => n === null || n < 1_000_000_000, { message: "Số tiền quá lớn" });

/**
 * Mốc lương có hiệu lực từ một tháng. Ô nhập là `type="month"` nên nhận "YYYY-MM"
 * rồi quy về ngày 1 của tháng đó — mốc luôn tính theo tháng, không theo ngày.
 */
export const salaryRecordSchema = z.object({
  userId: z.string().min(1),
  effectiveFrom: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}$/, "Tháng hiệu lực không hợp lệ")
    .transform((v) => new Date(`${v}-01T00:00:00.000Z`))
    .refine(
      (d) => d.getUTCFullYear() >= 2020 && d.getUTCFullYear() <= 2100,
      { message: "Tháng hiệu lực phải trong khoảng 2020–2100" },
    ),
  /** Null = chưa khai lương cơ bản. */
  baseSalary: optionalMoneySchema,
  /** Null = tháng đó KHÔNG đóng bảo hiểm. */
  insuranceBase: optionalMoneySchema,
  isFixedSalary: z.coerce.boolean().default(false),
  note: z
    .string()
    .trim()
    .max(200, "Ghi chú tối đa 200 ký tự")
    .optional()
    .transform((v) => (v ? v : null)),
});
export type SalaryRecordInput = z.infer<typeof salaryRecordSchema>;

export const salaryRecordIdSchema = z.object({ id: z.string().min(1) });

export const periodSchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});
export type PeriodInput = z.infer<typeof periodSchema>;

/** Ngày chốt công — null = tính hết tháng. Cận trên theo số ngày tháng, kiểm ở service. */
export const periodCutoffSchema = periodSchema.extend({
  cutoffDay: z.coerce.number().int().min(1).max(30).nullable(),
});

/** Chốt / mở lại kỳ — server action nhận thẳng tham số nên vẫn phải validate. */
export const periodStatusSchema = z.object({
  periodId: z.string().min(1),
  status: z.enum(["DRAFT", "LOCKED"]),
});

/**
 * Các ô kế toán gõ tay trên bảng lương.
 * Số công và lương thực tế KHÔNG nằm ở đây — chúng được tính từ bảng chấm công,
 * sửa tay sẽ làm hai bảng lệch nhau mà không ai biết.
 */
export const updateLineSchema = z.object({
  id: z.string().min(1),
  /** Cột "LƯƠNG LÀM TRÒN" — khách chốt tự gõ, hệ thống không tự làm tròn. */
  roundedSalary: moneySchema,
  /** Trừ vào lương (lấy ván, vật tư…). */
  materialDeduction: moneySchema.refine((n) => n >= 0, "Khoản trừ không được âm"),
  deductionNote: z
    .string()
    .trim()
    .max(200, "Lý do trừ tối đa 200 ký tự")
    .optional()
    .transform((v) => (v ? v : null)),
  bonusSales: moneySchema,
  bonusResponsibility: moneySchema,
  bonusAttendance: moneySchema,
  bonusPunctuality: moneySchema,
  /** Thưởng Tết, thưởng bù tháng trước… */
  bonusOther: moneySchema.refine((n) => n >= 0, "Thưởng khác không được âm"),
  /** Quỹ văn phòng… */
  otherDeduction: moneySchema.refine((n) => n >= 0, "Trừ khác không được âm"),
  /** Bỏ trống = bằng lương thực nhận. */
  actualPaid: optionalMoneySchema,
  note: z
    .string()
    .trim()
    .max(200, "Ghi chú tối đa 200 ký tự")
    .optional()
    .transform((v) => (v ? v : null)),
});
export type UpdateLineInput = z.infer<typeof updateLineSchema>;

/** Ứng lương — đúng các cột trong file "ỨNG LƯƠNG CỦA CNV". */
export const createAdvanceSchema = z.object({
  userId: z.string().min(1, "Vui lòng chọn nhân viên"),
  advanceDate: dateSchema,
  amount: moneySchema.refine((n) => n > 0, "Số tiền ứng phải lớn hơn 0"),
  method: z.enum(AdvanceMethod),
  note: z
    .string()
    .trim()
    .max(200, "Ghi chú tối đa 200 ký tự")
    .optional()
    .transform((v) => (v ? v : null)),
});
export type CreateAdvanceInput = z.infer<typeof createAdvanceSchema>;

/** Cấu hình quy tắc tính lương (quyền payroll.manage). */
export const payrollSettingsSchema = z.object({
  sundayFactor: z.coerce.number().min(0).max(5),
  overtimeHoursPerDay: z.coerce.number().min(0.5).max(24),
  standardDays: z.coerce.number().int().min(1).max(31),
  /** Nhập theo phần trăm cho dễ đọc: 10.5 nghĩa là 10,5%. */
  insurancePercent: z.coerce.number().min(0).max(100),
  /** Phần CÔNG TY đóng, cũng theo phần trăm: 21.5 nghĩa là 21,5%. */
  employerInsurancePercent: z.coerce.number().min(0).max(100),
});
export type PayrollSettingsInput = z.infer<typeof payrollSettingsSchema>;
