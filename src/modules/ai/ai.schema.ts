import { z } from "zod";
import {
  ContractStatus,
  ProjectStage,
  ProjectStatus,
  TxnDirection,
  TxnStatus,
  TxnType,
} from "@/generated/prisma/enums";
import { AI_LIMITS } from "@/modules/ai/ai.constants";

const dateText = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày phải có dạng YYYY-MM-DD")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Ngày không hợp lệ")
  .optional();

export const financeToolSchema = z.object({
  from: dateText,
  to: dateText,
  direction: z.enum(TxnDirection).optional(),
  status: z.enum(TxnStatus).optional(),
  type: z.enum(TxnType).optional(),
  projectId: z.string().min(1).optional(),
  projectIds: z.array(z.string().min(1)).min(1).max(AI_LIMITS.maxResultRows).optional(),
  contractId: z.string().min(1).optional(),
  groupBy: z
    .enum(["SUMMARY", "MONTH", "PROJECT", "CONTRACT", "CATEGORY", "EXPENSE_CATEGORY", "STATUS", "DIRECTION"])
    .default("SUMMARY"),
  limit: z.number().int().min(1).max(AI_LIMITS.maxResultRows).default(12),
}).refine((value) => !(value.projectId && value.projectIds), {
  message: "Chỉ dùng projectId hoặc projectIds, không dùng đồng thời",
});

export const projectsToolSchema = z.object({
  query: z.string().trim().max(100).optional(),
  status: z.enum(ProjectStatus).optional(),
  stage: z.enum(ProjectStage).optional(),
  overdueOnly: z.boolean().default(false),
  limit: z.number().int().min(1).max(AI_LIMITS.maxResultRows).default(10),
});

export const contractsToolSchema = z.object({
  projectId: z.string().min(1).optional(),
  status: z.enum(ContractStatus).optional(),
  underpaidOnly: z.boolean().default(false),
  limit: z.number().int().min(1).max(AI_LIMITS.maxResultRows).default(10),
});

export const projectDetailToolSchema = z.object({
  projectId: z.string().min(1).optional(),
  projectCode: z.string().trim().min(1).max(40).optional(),
}).refine((value) => Boolean(value.projectId || value.projectCode), {
  message: "Cần projectId hoặc projectCode",
});

export const createConversationSchema = z.object({
  title: z.string().trim().max(AI_LIMITS.maxTitleChars).optional(),
});

export const conversationIdSchema = z.object({
  conversationId: z.string().trim().min(1),
});

export const renameConversationSchema = conversationIdSchema.extend({
  title: z.string().trim().min(1).max(AI_LIMITS.maxTitleChars),
});

export const sendMessageSchema = conversationIdSchema.extend({
  content: z
    .string()
    .trim()
    .min(1, "Vui lòng nhập câu hỏi.")
    .max(AI_LIMITS.maxQuestionChars, `Câu hỏi tối đa ${AI_LIMITS.maxQuestionChars} ký tự.`),
});

export type FinanceToolInput = z.infer<typeof financeToolSchema>;
export type ProjectsToolInput = z.infer<typeof projectsToolSchema>;
export type ContractsToolInput = z.infer<typeof contractsToolSchema>;
export type ProjectDetailToolInput = z.infer<typeof projectDetailToolSchema>;
