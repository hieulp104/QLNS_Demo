import { z } from "zod";
import { normalizePhone, PHONE_PATTERN } from "@/lib/utils";

/**
 * Tên đăng nhập là email HOẶC số điện thoại — thợ lớn tuổi không dùng email.
 * Có "@" thì coi là email, không thì coi là SĐT.
 */
export const loginIdSchema = z
  .string()
  .trim()
  .min(1, "Vui lòng nhập email hoặc số điện thoại")
  .transform((v) =>
    v.includes("@")
      ? ({ kind: "email", value: v.toLowerCase() } as const)
      : ({ kind: "phone", value: normalizePhone(v) } as const),
  )
  .refine(
    (id) =>
      id.kind === "email"
        ? z.email().safeParse(id.value).success
        : PHONE_PATTERN.test(id.value),
    { message: "Email hoặc số điện thoại không hợp lệ" },
  );

/** Schema validate form đăng nhập — dùng chung cho server action và provider Auth.js. */
export const loginSchema = z.object({
  login: loginIdSchema,
  password: z.string().min(1, "Vui lòng nhập mật khẩu"),
});

export type LoginInput = z.infer<typeof loginSchema>;

/** Schema đổi mật khẩu — bắt nhập mật khẩu cũ để xác nhận danh tính. */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Vui lòng nhập mật khẩu hiện tại"),
    newPassword: z
      .string()
      .min(8, "Mật khẩu mới phải có ít nhất 8 ký tự")
      .regex(/[A-Za-z]/, "Mật khẩu mới phải có ít nhất một chữ cái")
      .regex(/[0-9]/, "Mật khẩu mới phải có ít nhất một chữ số"),
    confirmPassword: z.string().min(1, "Vui lòng nhập lại mật khẩu mới"),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: "Mật khẩu nhập lại không khớp",
    path: ["confirmPassword"],
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    message: "Mật khẩu mới phải khác mật khẩu hiện tại",
    path: ["newPassword"],
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
