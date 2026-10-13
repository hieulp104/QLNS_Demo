import { z } from "zod";
import { CustomerSource } from "@/generated/prisma/enums";

const phoneSchema = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v.replace(/[\s.\-()]/g, "") : undefined))
  .refine((v) => v === undefined || /^0\d{9,10}$/.test(v), {
    message: "Số điện thoại phải gồm 10–11 chữ số và bắt đầu bằng 0",
  });

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .optional()
  .transform((v) => (v ? v : undefined))
  .refine((v) => v === undefined || z.string().email().safeParse(v).success, {
    message: "Email không hợp lệ",
  });

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} tối đa ${max} ký tự`)
    .optional()
    .transform((v) => (v ? v : undefined));

/** Trường chung cho tạo & sửa khách hàng. Mã `KH-{năm}-{stt}` do server sinh. */
const customerFields = {
  name: z
    .string()
    .trim()
    .min(2, "Tên khách hàng phải có ít nhất 2 ký tự")
    .max(150, "Tên khách hàng tối đa 150 ký tự"),
  phone: phoneSchema,
  email: emailSchema,
  address: optionalText(255, "Địa chỉ"),
  source: z.enum(CustomerSource).default("OTHER"),
  sourceDetail: optionalText(255, "Chi tiết nguồn khách"),
  note: optionalText(1000, "Ghi chú"),
};

/** Chọn nguồn khách = Khác thì bắt buộc ghi rõ nguồn đó là gì. */
function requireSourceDetailWhenOther(
  data: { source: CustomerSource; sourceDetail?: string },
  ctx: z.RefinementCtx,
) {
  if (data.source === "OTHER" && !data.sourceDetail) {
    ctx.addIssue({
      code: "custom",
      path: ["sourceDetail"],
      message: "Vui lòng ghi rõ nguồn khách khi chọn \"Khác\"",
    });
  }
}

export const createCustomerSchema = z
  .object(customerFields)
  .superRefine(requireSourceDetailWhenOther);
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

export const updateCustomerSchema = z
  .object({
    id: z.string().min(1),
    ...customerFields,
  })
  .superRefine(requireSourceDetailWhenOther);
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

/** Bộ lọc danh sách khách hàng (PJ dùng lại để chọn khách khi tạo dự án). */
export const customerFilterSchema = z.object({
  q: z.string().trim().optional(),
  source: z.enum(CustomerSource).optional(),
});
export type CustomerFilter = z.infer<typeof customerFilterSchema>;
