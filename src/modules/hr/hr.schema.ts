import { z } from "zod";
import { DepartmentCode } from "@/generated/prisma/enums";
import { HUMAN_ROLE_CODES } from "@/common/permissions/permissions";
import { normalizePhone, PHONE_PATTERN } from "@/lib/utils";

/** Ô chọn để trống trên form gửi lên chuỗi rỗng — quy về undefined cho đúng nullable. */
const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} tối đa ${max} ký tự`)
    .optional()
    .transform((v) => (v ? v : undefined));

/**
 * Số điện thoại VN: 10–11 chữ số. SĐT cũng là tên đăng nhập, nên chuẩn hóa
 * bằng ĐÚNG hàm mà form đăng nhập dùng.
 */
const phoneSchema = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? normalizePhone(v) : undefined))
  .refine((v) => v === undefined || PHONE_PATTERN.test(v), {
    message: "Số điện thoại phải gồm 10–11 chữ số và bắt đầu bằng 0",
  });

/**
 * Ngày dạng "YYYY-MM-DD" từ input type=date.
 * Cho phép ngày TƯƠNG LAI — tuyển trước, hẹn ngày nhận việc sau là chuyện bình
 * thường. Chỉ chặn ngày không hợp lệ (typo năm) chứ không chặn theo mốc hôm nay.
 */
const joinedAtSchema = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? new Date(`${v}T00:00:00.000Z`) : undefined))
  .refine((v) => v === undefined || !Number.isNaN(v.getTime()), {
    message: "Ngày vào làm không hợp lệ",
  });

const roleCodesSchema = z
  .array(z.enum(HUMAN_ROLE_CODES))
  .min(1, "Phải chọn ít nhất một vai trò");

/**
 * HR-02 — Director tạo tài khoản.
 * Không nhận mật khẩu từ form: hệ thống sinh mật khẩu tạm và bật `mustChangePassword`,
 * để người tạo không bao giờ biết mật khẩu lâu dài của nhân viên.
 * `employeeCode` cũng do server sinh, không cho client tự đặt.
 */
export const createEmployeeSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(2, "Họ tên phải có ít nhất 2 ký tự")
      .max(100, "Họ tên tối đa 100 ký tự"),
    /**
     * Người tạo đã xem cảnh báo trùng tên và xác nhận "đây là người khác".
     * Công ty thật CÓ người trùng tên, nên đây là cảnh báo chứ không phải chặn.
     */
    allowDuplicateName: z.coerce.boolean().optional(),
    // Không bắt buộc: thợ lớn tuổi không dùng email, đăng nhập bằng SĐT.
    email: z
      .string()
      .trim()
      .toLowerCase()
      .max(150, "Email tối đa 150 ký tự")
      .optional()
      .transform((v) => (v ? v : undefined))
      .refine((v) => v === undefined || z.email().safeParse(v).success, {
        message: "Email không hợp lệ",
      }),
    phone: phoneSchema,
    departmentCode: z.enum(DepartmentCode).optional(),
    position: optionalText(100, "Chức vụ"),
    joinedAt: joinedAtSchema,
    roleCodes: roleCodesSchema,
  })
  // Khớp CHECK `users_email_or_phone_check` trong DB — báo lỗi dễ hiểu
  // trước khi chạm tới DB.
  .refine((v) => v.email !== undefined || v.phone !== undefined, {
    message: "Phải nhập email hoặc số điện thoại để nhân viên đăng nhập",
    path: ["phone"],
  });

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;

/**
 * HR-04 — sửa hồ sơ.
 *
 * `roleCodes` và `departmentCode` để optional có chủ đích: trưởng phòng (scope
 * DEPARTMENT) không được gửi hai trường này. Nếu ai cũng đổi được vai trò thì
 * trưởng phòng có thể tự nâng quyền cho nhân viên phòng mình — tầng action chặn
 * bằng quyền `role.manage`, schema chỉ cho phép vắng mặt.
 */
export const updateEmployeeSchema = z.object({
  id: z.string().min(1),
  fullName: z
    .string()
    .trim()
    .min(2, "Họ tên phải có ít nhất 2 ký tự")
    .max(100, "Họ tên tối đa 100 ký tự"),
  phone: phoneSchema,
  position: optionalText(100, "Chức vụ"),
  joinedAt: joinedAtSchema,
  departmentCode: z.enum(DepartmentCode).nullish(),
  roleCodes: roleCodesSchema.optional(),

  // Lương KHÔNG còn nằm ở hồ sơ: đã chuyển sang mốc `SalaryRecord` theo tháng.
  // Xem `salaryRecordSchema` trong `payroll.schema.ts`.
});

export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;

/** HR-05 — cho nghỉ việc. Bắt buộc có lý do để hồ sơ cũ tra cứu được về sau. */
/** Hôm nay theo giờ VN, dạng "YYYY-MM-DD". */
function todayVn(): string {
  return new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
}

export const deactivateEmployeeSchema = z.object({
  id: z.string().min(1),
  /**
   * "Nghỉ từ ngày" — ngày ĐẦU TIÊN không còn đi làm, dạng "YYYY-MM-DD".
   * Lưu vào `deletedAt` ở 00:00 giờ VN của ngày đó. Bảng chấm công và bảng
   * lương hiện người này ở tháng M khi `deletedAt >= 01/M` — nên "nghỉ từ 01/10"
   * thì biến mất từ tháng 10, "nghỉ từ 15/09" thì còn ở tháng 9, mất từ tháng 10.
   * Không cho ngày tương lai: khóa đăng nhập là tức thì, ngày tương lai sẽ để
   * người đó vừa bị khóa vừa nằm trong danh sách đang làm.
   */
  resignDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Vui lòng chọn ngày nghỉ việc")
    .refine((v) => !Number.isNaN(new Date(`${v}T00:00:00+07:00`).getTime()), {
      message: "Ngày nghỉ việc không hợp lệ",
    })
    .refine((v) => v >= "2020-01-01", { message: "Ngày nghỉ việc không hợp lệ" })
    .refine((v) => v <= todayVn(), {
      message: "Ngày nghỉ việc không được sau hôm nay",
    })
    .transform((v) => new Date(`${v}T00:00:00+07:00`)),
  reason: z
    .string()
    .trim()
    .min(5, "Vui lòng ghi lý do nghỉ việc (ít nhất 5 ký tự)")
    .max(500, "Lý do tối đa 500 ký tự"),
});

export type DeactivateEmployeeInput = z.infer<typeof deactivateEmployeeSchema>;

/** HR-07 — Director đặt lại mật khẩu cho người khác. */
export const resetPasswordSchema = z.object({
  id: z.string().min(1),
});
