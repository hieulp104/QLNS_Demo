import { z } from "zod";
import {
  TxnDirection,
  TxnStatus,
  TxnType,
} from "@/generated/prisma/enums";

const id = (label: string) =>
  z.string().trim().min(1, `Thiếu ${label}`);

const optionalId = z
  .string()
  .trim()
  .optional()
  .transform((value) => value || undefined);

const optionalText = (label: string, max: number) =>
  z
    .string()
    .trim()
    .max(max, `${label} tối đa ${max} ký tự`)
    .optional()
    .transform((value) => value || undefined);

const dateText = (label: string) =>
  z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${label} không hợp lệ`)
    .refine((value) => {
      const date = new Date(`${value}T00:00:00.000Z`);
      return (
        !Number.isNaN(date.getTime()) &&
        date.toISOString().slice(0, 10) === value
      );
    }, `${label} không hợp lệ`);

const transactionDate = dateText("Ngày giao dịch").transform(
  (value) => new Date(`${value}T00:00:00.000Z`),
);

/**
 * VND không có phần lẻ, lưu Decimal(15,0). Chỉ loại dấu phân cách thường dùng,
 * không âm thầm bỏ chữ để tránh biến dữ liệu sai thành một số tiền hợp lệ.
 */
const money = z
  .string()
  .trim()
  .transform((value) => value.replace(/[.,\s₫]/g, ""))
  .refine((value) => /^\d+$/.test(value), "Số tiền không hợp lệ")
  .refine((value) => value.length <= 15, "Số tiền tối đa 15 chữ số")
  .refine(
    (value) => /^\d+$/.test(value) && BigInt(value) > BigInt(0),
    "Số tiền phải lớn hơn 0",
  );

const INCOME_TYPES: TxnType[] = [
  "DESIGN_DEPOSIT",
  "CONTRACT_DEPOSIT",
  "PROGRESS_PAYMENT",
  "FINAL_PAYMENT",
  "OTHER",
];

/**
 * Không có SALARY_COST / INSURANCE_COST: hai loại này CHỈ bảng lương sinh ra.
 * Cho nhập tay là kế toán vừa chốt bảng lương vừa ghi tay "chi lương" thì
 * chi phí lương bị đếm hai lần mà không ai thấy.
 */
export const MANUAL_EXPENSE_TYPES: TxnType[] = [
  "MATERIAL_COST",
  "FACTORY_COST",
  "SUBCONTRACTOR_COST",
  "TRANSPORT_COST",
  "OPERATING_COST",
  "OTHER",
];

/**
 * Giao dịch do hệ thống sinh (vật tư, bảng lương) — chỉ đọc trong Tài chính,
 * muốn đổi số thì sửa ở nguồn. Kiểm tra theo "khác MANUAL" chứ không liệt kê
 * từng nguồn, để nguồn tự động thêm sau này mặc định cũng bị khóa.
 */
export function isAutoManaged(source: string): boolean {
  return source !== "MANUAL";
}

function validateDirectionAndType(
  value: { direction: TxnDirection; type: TxnType; expenseCategoryId?: string },
  context: z.RefinementCtx,
) {
  const allowed = value.direction === "INCOME" ? INCOME_TYPES : MANUAL_EXPENSE_TYPES;
  if (!allowed.includes(value.type)) {
    context.addIssue({
      code: "custom",
      path: ["type"],
      message: "Loại giao dịch không phù hợp với chiều thu/chi",
    });
  }
  // Khớp CHECK transactions_operating_cost_category_check ở DB — báo lỗi tiếng
  // Việt ở đây thay vì để DB ném lỗi ràng buộc khó hiểu.
  if (value.type === "OPERATING_COST" && !value.expenseCategoryId) {
    context.addIssue({
      code: "custom",
      path: ["expenseCategoryId"],
      message: "Chi khác phải chọn danh mục chi",
    });
  }
}

/** Danh mục chỉ thuộc về Chi khác — loại khác gửi kèm thì bỏ đi, không báo lỗi. */
function dropStrayCategory<T extends { type: TxnType; expenseCategoryId?: string }>(value: T): T {
  return value.type === "OPERATING_COST" ? value : { ...value, expenseCategoryId: undefined };
}

const transactionFields = {
  projectId: optionalId,
  contractId: optionalId,
  direction: z.enum(TxnDirection),
  type: z.enum(TxnType),
  status: z.enum(TxnStatus).default("PENDING"),
  amount: money,
  txnDate: transactionDate,
  paymentMethod: optionalText("Phương thức thanh toán", 100),
  note: optionalText("Nội dung giao dịch", 1000),
  expenseCategoryId: optionalId,
};

/** FN-02 / FN-04 / FN-05 — dữ liệu tạo giao dịch. Mã do server sinh. */
export const createTransactionSchema = z
  .object(transactionFields)
  .superRefine(validateDirectionAndType)
  .transform(dropStrayCategory);

/** FN-03 — dữ liệu sửa giao dịch. */
export const updateTransactionSchema = z
  .object({ id: id("mã giao dịch"), ...transactionFields })
  .superRefine(validateDirectionAndType)
  .transform(dropStrayCategory);

export const transactionIdSchema = z.object({
  id: id("mã giao dịch"),
});

/** FN-01 — bộ lọc danh sách giao dịch. */
export const transactionFilterSchema = z
  .object({
    q: z.string().trim().max(100).optional().transform((value) => value || undefined),
    projectId: optionalId,
    projectRelation: z.enum(["UNASSIGNED"]).optional(),
    contractId: optionalId,
    contractRelation: z.enum(["UNASSIGNED"]).optional(),
    direction: z.enum(TxnDirection).optional(),
    type: z.enum(TxnType).optional(),
    expenseCategoryId: optionalId,
    status: z.enum(TxnStatus).optional(),
    from: dateText("Từ ngày").optional(),
    to: dateText("Đến ngày").optional(),
    page: z.coerce.number().int().min(1).catch(1),
  })
  .superRefine((value, context) => {
    if (value.from && value.to && value.from > value.to) {
      context.addIssue({
        code: "custom",
        path: ["to"],
        message: "Đến ngày phải bằng hoặc sau từ ngày",
      });
    }
  });

export const transactionUploadTicketSchema = z.object({
  transactionId: id("giao dịch"),
  fileName: z.string().trim().min(1, "Thiếu tên file").max(200),
  mimeType: z.string().trim().max(150).optional(),
});

export const registerTransactionFileSchema =
  transactionUploadTicketSchema.extend({
    objectKey: z.string().trim().min(1, "Thiếu đường dẫn file").max(1000),
    mimeType: z.string().trim().min(1).max(150),
    sizeBytes: z.number().int().positive().max(50 * 1024 * 1024),
  });

// ═══════════════════ DANH MỤC CHI KHÁC ═══════════════════

/** Số tiền mặc định cho khoản cố định — trống được (điện xưởng đổi theo tháng). */
const optionalMoney = z
  .string()
  .trim()
  .optional()
  .transform((value) => value?.replace(/[.,\s₫]/g, "") || undefined)
  .refine((value) => value === undefined || /^\d{1,15}$/.test(value), "Số tiền không hợp lệ")
  .refine((value) => value === undefined || BigInt(value) > BigInt(0), "Số tiền phải lớn hơn 0");

const expenseCategoryFields = {
  /** Gộp khoảng trắng thừa để "Điện  xưởng" không thành danh mục thứ hai. */
  name: z
    .string()
    .trim()
    .transform((value) => value.replace(/\s+/g, " "))
    .pipe(z.string().min(1, "Thiếu tên danh mục").max(80, "Tên danh mục tối đa 80 ký tự")),
  isRecurring: z.boolean().default(false),
  defaultAmount: optionalMoney,
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
};

export const createExpenseCategorySchema = z.object(expenseCategoryFields);

export const updateExpenseCategorySchema = z.object({
  id: id("danh mục"),
  ...expenseCategoryFields,
  isActive: z.boolean(),
});

export const expenseCategoryIdSchema = z.object({ id: id("danh mục") });

const monthText = z
  .string()
  .trim()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Tháng không hợp lệ");

/** "Chép khoản cố định": xem danh sách khoản của tháng trước để tick chọn. */
export const recurringCandidatesSchema = z.object({ month: monthText });

/** Các khoản đã tick — số tiền sửa được từng dòng trước khi ghi. */
export const copyRecurringSchema = z.object({
  month: monthText,
  items: z
    .array(
      z.object({
        expenseCategoryId: id("danh mục"),
        amount: money,
        note: optionalText("Nội dung", 1000),
        projectId: optionalId,
        day: z.coerce.number().int().min(1).max(31),
      }),
    )
    .min(1, "Chưa tick khoản nào")
    .max(100, "Tối đa 100 khoản mỗi lần"),
});

export type CreateExpenseCategoryInput = z.infer<typeof createExpenseCategorySchema>;
export type UpdateExpenseCategoryInput = z.infer<typeof updateExpenseCategorySchema>;

export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;
export type TransactionFilter = z.infer<typeof transactionFilterSchema>;
