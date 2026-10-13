import { z } from "zod";
import {
  ContractStatus,
  ContractType,
  TxnStatus,
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
 * Tiền VND (CT-04): cột Decimal(15,0), Prisma nhận chuỗi số.
 * TRƯỜNG TIỀN — chỉ người có finance.view được gửi lên (chặn ở action).
 */
const moneySchema = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v.replace(/[^\d]/g, "") : undefined))
  .refine((v) => v === undefined || v.length > 0, {
    message: "Số tiền không hợp lệ",
  });

const depositFields = {
  depositAmount: moneySchema,
  depositStatus: z.enum(TxnStatus).default("COMPLETED"),
  depositPaidDate: dateSchema,
};

function validatePaidDeposit(
  value: {
    depositAmount?: string;
    depositStatus: TxnStatus;
    depositPaidDate?: Date;
    signedDate?: Date;
  },
  context: z.RefinementCtx,
) {
  if (
    BigInt(value.depositAmount ?? "0") > BigInt(0) &&
    value.depositStatus === "COMPLETED" &&
    !value.depositPaidDate &&
    !value.signedDate
  ) {
    context.addIssue({
      code: "custom",
      path: ["depositPaidDate"],
      message: "Cọc đã đóng cần có ngày đóng cọc hoặc ngày ký hợp đồng",
    });
  }
}

/** CT-02 — thêm hợp đồng. Mã `HD-{năm}-{stt}` do server sinh (CT-07). */
export const createContractSchema = z
  .object({
    projectId: z.string().min(1),
    type: z.enum(ContractType),
    value: moneySchema,
    ...depositFields,
    signedDate: dateSchema,
    note: optionalText(1000, "Ghi chú"),
  })
  .superRefine(validatePaidDeposit);
export type CreateContractInput = z.infer<typeof createContractSchema>;

/** CT-03 — sửa hợp đồng. */
export const updateContractSchema = z
  .object({
    id: z.string().min(1),
    type: z.enum(ContractType),
    status: z.enum(ContractStatus),
    value: moneySchema,
    signedDate: dateSchema,
    note: optionalText(1000, "Ghi chú"),
  });
export type UpdateContractInput = z.infer<typeof updateContractSchema>;
