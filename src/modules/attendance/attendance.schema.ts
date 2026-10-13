import { z } from "zod";
import { AttendanceMark } from "@/generated/prisma/enums";

/** Ngày "YYYY-MM-DD" → Date 00:00 UTC, khớp cột `date` của bảng chấm công. */
export const workDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày không hợp lệ")
  .transform((v) => new Date(`${v}T00:00:00.000Z`))
  .refine((v) => !Number.isNaN(v.getTime()), { message: "Ngày không hợp lệ" });

/** Tháng cần xem/chấm. */
export const monthSchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});
export type MonthInput = z.infer<typeof monthSchema>;

/**
 * Chấm một ô. `mark` rỗng = xóa ô (khác với chấm N — xem setMark).
 * Giờ tăng ca tối đa 16 để chặn gõ nhầm 100 giờ trong một ngày.
 */
export const setMarkSchema = z.object({
  userId: z.string().min(1),
  workDate: workDateSchema,
  mark: z
    .union([z.enum(AttendanceMark), z.literal("")])
    .transform((v) => (v === "" ? null : v)),
  overtimeHours: z.coerce
    .number()
    .min(0, "Giờ tăng ca không âm")
    .max(16, "Giờ tăng ca một ngày tối đa 16")
    .default(0),
  note: z
    .string()
    .trim()
    .max(200, "Ghi chú tối đa 200 ký tự")
    .optional()
    .transform((v) => (v ? v : null)),
});
export type SetMarkInput = z.infer<typeof setMarkSchema>;

/** Điền đủ công cho các ngày thường còn trống của tháng. */
export const fillMonthSchema = monthSchema.extend({
  /** Bỏ trống = điền cho mọi người trong phạm vi người dùng quản được. */
  userIds: z.array(z.string().min(1)).optional(),
});
export type FillMonthInput = z.infer<typeof fillMonthSchema>;

/**
 * Ghi nhiều ô một lượt (kéo tô / hoàn tác).
 * Giới hạn 600 ô ≈ 20 người × 31 ngày — đủ cho một tháng của cả công ty mà
 * không để ai đó nhét một mảng khổng lồ làm nghẽn transaction.
 */
export const bulkSetMarksSchema = z.object({
  changes: z
    .array(
      z.object({
        userId: z.string().min(1),
        workDate: workDateSchema,
        mark: z
          .union([z.enum(AttendanceMark), z.literal("")])
          .transform((v) => (v === "" ? null : v)),
        overtimeHours: z.coerce.number().min(0).max(16).default(0),
      }),
    )
    .min(1, "Không có ô nào để ghi")
    .max(600, "Một lần ghi tối đa 600 ô"),
});
export type BulkSetMarksInput = z.infer<typeof bulkSetMarksSchema>;

/** Bật/tắt một người khỏi bảng chấm công hoặc bảng lương, từ tháng này trở đi. */
export const setRosterSchema = monthSchema.extend({
  userId: z.string().min(1),
  kind: z.enum(["attendance", "payroll"]),
  included: z.boolean(),
});
export type SetRosterInput = z.infer<typeof setRosterSchema>;
