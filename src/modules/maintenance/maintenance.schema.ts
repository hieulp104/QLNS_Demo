import { z } from "zod";
import {
  MaintenanceKind,
  MaintenancePriority,
  MaintenanceStatus,
} from "@/generated/prisma/enums";

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} tối đa ${max} ký tự`)
    .optional()
    .transform((v) => (v ? v : undefined));

/** Ngày "YYYY-MM-DD" từ input date → Date UTC, hoặc undefined nếu bỏ trống. */
const dateSchema = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? new Date(`${v}T00:00:00.000Z`) : undefined))
  .refine((v) => v === undefined || !Number.isNaN(v.getTime()), {
    message: "Ngày không hợp lệ",
  });

const titleSchema = z
  .string()
  .trim()
  .min(3, "Nội dung phải có ít nhất 3 ký tự")
  .max(200, "Nội dung tối đa 200 ký tự");

/** Chọn người phụ trách — chuỗi rỗng nghĩa là "chưa giao ai". */
const assigneeSchema = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined));

/**
 * Khách báo hỏng, đề nghị bảo hành. `reportedAt` để trống thì service lấy hôm nay —
 * người trực điện thoại ghi nhanh, không bắt điền đủ mọi ô.
 */
export const createRequestSchema = z.object({
  projectId: z.string().min(1, "Thiếu dự án"),
  title: titleSchema,
  description: optionalText(2000, "Mô tả sự cố"),
  reporterNote: optionalText(200, "Người báo"),
  reportedAt: dateSchema,
  dueDate: dateSchema,
  priority: z.enum(MaintenancePriority),
  assigneeId: assigneeSchema,
});
export type CreateRequestInput = z.infer<typeof createRequestSchema>;

/** Lịch kiểm tra thêm tay (ngoài các mốc tự sinh) — bắt buộc có hạn. */
export const createCheckSchema = z.object({
  projectId: z.string().min(1, "Thiếu dự án"),
  title: titleSchema,
  description: optionalText(2000, "Ghi chú"),
  dueDate: dateSchema.refine((v) => v !== undefined, {
    message: "Vui lòng chọn ngày kiểm tra",
  }),
  assigneeId: assigneeSchema,
});
export type CreateCheckInput = z.infer<typeof createCheckSchema>;

/** Sửa nội dung một việc bảo hành. Trạng thái đổi qua action riêng. */
export const updateTaskSchema = z.object({
  id: z.string().min(1),
  title: titleSchema,
  description: optionalText(2000, "Mô tả"),
  dueDate: dateSchema,
  priority: z.enum(MaintenancePriority),
  assigneeId: assigneeSchema,
});
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

/** Giao việc cho người đi kiểm tra / sửa chữa. */
export const assignTaskSchema = z.object({
  id: z.string().min(1),
  assigneeId: assigneeSchema,
});
export type AssignTaskInput = z.infer<typeof assignTaskSchema>;

/**
 * Kết thúc một việc: đã xử lý xong (DONE) hoặc bỏ qua (CANCELLED).
 * Bỏ qua thì bắt buộc ghi lý do — nếu không, vài tháng sau không ai biết
 * vì sao mốc bảo hành đó bị cho qua.
 */
export const resolveTaskSchema = z
  .object({
    id: z.string().min(1),
    status: z.enum([MaintenanceStatus.DONE, MaintenanceStatus.CANCELLED]),
    resultNote: optionalText(2000, "Ghi chú kết quả"),
  })
  .refine((v) => v.status !== "CANCELLED" || Boolean(v.resultNote), {
    message: "Bỏ qua thì phải ghi lý do",
    path: ["resultNote"],
  });
export type ResolveTaskInput = z.infer<typeof resolveTaskSchema>;

/** Bộ lọc trang /maintenance. */
export const maintenanceFilterSchema = z.object({
  kind: z.enum(MaintenanceKind).optional(),
  status: z.enum(MaintenanceStatus).optional(),
  projectId: z.string().trim().optional(),
  assigneeId: z.string().trim().optional(),
  /** "1" = chỉ việc chưa xong (PENDING + IN_PROGRESS) */
  open: z.enum(["1"]).optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
});
export type MaintenanceFilter = z.infer<typeof maintenanceFilterSchema>;

/**
 * Cấu hình mốc kiểm tra định kỳ (SY — chỉ người có setting.manage).
 * Nhận chuỗi "3, 6, 12" từ form.
 */
export const milestoneSettingSchema = z.object({
  months: z
    .string()
    .trim()
    .transform((v) =>
      v
        .split(/[,;\s]+/)
        .filter(Boolean)
        .map((n) => Number(n)),
    )
    .refine((arr) => arr.length > 0, "Phải có ít nhất một mốc")
    .refine((arr) => arr.length <= 12, "Tối đa 12 mốc")
    .refine(
      (arr) => arr.every((n) => Number.isInteger(n) && n >= 1 && n <= 120),
      "Mỗi mốc là số tháng nguyên từ 1 đến 120",
    )
    .transform((arr) => [...new Set(arr)].sort((a, b) => a - b)),
});
export type MilestoneSettingInput = z.infer<typeof milestoneSettingSchema>;
