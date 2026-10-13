import { z } from "zod";
import { LeaveStatus, LeaveType } from "@/generated/prisma/enums";

const dateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày không hợp lệ")
  .transform((v) => new Date(`${v}T00:00:00.000Z`))
  .refine((v) => !Number.isNaN(v.getTime()), { message: "Ngày không hợp lệ" });

/**
 * Nộp đơn xin nghỉ. Nghỉ nửa ngày chỉ áp dụng cho đơn một ngày — nửa ngày trải
 * dài nhiều ngày là vô nghĩa và làm số công tính sai.
 */
export const createLeaveSchema = z
  .object({
    type: z.enum(LeaveType),
    fromDate: dateSchema,
    toDate: dateSchema,
    halfDay: z.coerce.boolean().default(false),
    reason: z
      .string()
      .trim()
      .min(3, "Vui lòng ghi lý do nghỉ")
      .max(500, "Lý do tối đa 500 ký tự"),
  })
  .refine((v) => v.toDate.getTime() >= v.fromDate.getTime(), {
    message: "Ngày kết thúc phải sau hoặc bằng ngày bắt đầu",
    path: ["toDate"],
  })
  .refine(
    (v) => !v.halfDay || v.toDate.getTime() === v.fromDate.getTime(),
    { message: "Nghỉ nửa ngày chỉ áp dụng cho đơn trong một ngày", path: ["halfDay"] },
  );
export type CreateLeaveInput = z.infer<typeof createLeaveSchema>;

/** Duyệt hoặc từ chối. Từ chối thì bắt buộc nêu lý do. */
export const decideLeaveSchema = z
  .object({
    id: z.string().min(1),
    status: z.enum([LeaveStatus.APPROVED, LeaveStatus.REJECTED]),
    decisionNote: z
      .string()
      .trim()
      .max(500, "Ghi chú tối đa 500 ký tự")
      .optional()
      .transform((v) => (v ? v : null)),
  })
  .refine((v) => v.status !== "REJECTED" || Boolean(v.decisionNote), {
    message: "Từ chối đơn thì phải ghi lý do",
    path: ["decisionNote"],
  });
export type DecideLeaveInput = z.infer<typeof decideLeaveSchema>;

export const leaveFilterSchema = z.object({
  status: z.enum(LeaveStatus).optional(),
  userId: z.string().trim().optional(),
  /** "1" = chỉ đơn của tôi */
  mine: z.enum(["1"]).optional(),
  year: z.coerce.number().int().min(2020).max(2100).optional(),
  page: z.coerce.number().int().min(1).default(1),
});
export type LeaveFilter = z.infer<typeof leaveFilterSchema>;
