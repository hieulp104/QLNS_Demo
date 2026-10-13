import { z } from "zod";
import {
  MemberArea,
  ProjectStage,
  ProjectStatus,
  ProjectType,
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

/**
 * Giá trị dự kiến (VND, số nguyên). Nhận chuỗi có dấu phân cách nghìn từ form,
 * trả về CHUỖI số — cột `estimatedValue` là Decimal(15,0), Prisma nhận string.
 * Đây là TRƯỜNG TIỀN — chỉ người có finance.view mới được gửi lên (chặn ở action).
 */
const moneySchema = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v.replace(/[^\d]/g, "") : undefined))
  .refine((v) => v === undefined || v.length > 0, {
    message: "Giá trị dự kiến không hợp lệ",
  });

/**
 * PJ-02 — trường bắt buộc khi tạo: tên · khách hàng · loại dự án · loại hình
 * công trình · giá trị dự kiến · thời gian dự kiến. File đính kèm xử lý riêng
 * qua luồng upload (không nhét vào form action này).
 */
export const createProjectSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, "Tên dự án phải có ít nhất 3 ký tự")
    .max(200, "Tên dự án tối đa 200 ký tự"),
  customerId: z.string().min(1, "Vui lòng chọn khách hàng"),
  type: z.enum(ProjectType),
  propertyType: z
    .string()
    .trim()
    .min(1, "Vui lòng nhập loại hình công trình")
    .max(50),
  estimatedValue: moneySchema,
  address: optionalText(255, "Địa chỉ"),
  description: optionalText(2000, "Mô tả"),
  expectedEndDate: dateSchema,
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

/** PJ-05 — sửa thông tin. Không đổi khách hàng & loại (giữ toàn vẹn lịch sử). */
export const updateProjectSchema = z.object({
  id: z.string().min(1),
  name: z
    .string()
    .trim()
    .min(3, "Tên dự án phải có ít nhất 3 ký tự")
    .max(200, "Tên dự án tối đa 200 ký tự"),
  propertyType: z.string().trim().min(1).max(50),
  estimatedValue: moneySchema,
  address: optionalText(255, "Địa chỉ"),
  description: optionalText(2000, "Mô tả"),
  status: z.enum(ProjectStatus),
  startDate: dateSchema,
  expectedEndDate: dateSchema,
  /** Ngày bàn giao thực tế — mốc tính bảo hành 5 năm VÀ lịch kiểm tra định kỳ. */
  actualEndDate: dateSchema,
});
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

/** PJ-09 / PJ-12 — chuyển (hoặc lùi) giai đoạn, kèm ghi chú. */
export const changeStageSchema = z.object({
  id: z.string().min(1),
  toStage: z.enum(ProjectStage),
  note: optionalText(500, "Ghi chú"),
});
export type ChangeStageInput = z.infer<typeof changeStageSchema>;

/** PJ-13 — gán một người vào một mảng của dự án. */
export const addMemberSchema = z.object({
  projectId: z.string().min(1),
  userId: z.string().min(1, "Vui lòng chọn nhân viên"),
  area: z.enum(MemberArea),
});
export type AddMemberInput = z.infer<typeof addMemberSchema>;

/** PJ-14 — gỡ thành viên. */
export const removeMemberSchema = z.object({
  projectId: z.string().min(1),
  memberId: z.string().min(1),
});

/** PJ-16 — bình luận / chú thích. */
export const addCommentSchema = z.object({
  projectId: z.string().min(1),
  content: z
    .string()
    .trim()
    .min(1, "Nội dung bình luận không được để trống")
    .max(2000, "Bình luận tối đa 2000 ký tự"),
});
export type AddCommentInput = z.infer<typeof addCommentSchema>;

/** Bộ lọc danh sách dự án (PJ-01). */
export const projectFilterSchema = z.object({
  stage: z.enum(ProjectStage).optional(),
  type: z.enum(ProjectType).optional(),
  status: z.enum(ProjectStatus).optional(),
  customerId: z.string().optional(),
  q: z.string().trim().optional(),
  /** Lọc theo tháng của hạn dự kiến, dạng "YYYY-MM". */
  month: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
});
export type ProjectFilter = z.infer<typeof projectFilterSchema>;
