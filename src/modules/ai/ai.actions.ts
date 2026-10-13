"use server";

import { revalidatePath } from "next/cache";
import { fail, ok, type ActionResult } from "@/common/filters/error";
import { requireUser } from "@/modules/auth/auth.service";
import {
  conversationIdSchema,
  createConversationSchema,
  renameConversationSchema,
  sendMessageSchema,
} from "@/modules/ai/ai.schema";
import {
  canUseTamNestAi,
  createAiConversation,
  deleteAiConversation,
  renameAiConversation,
  sendAiMessage,
} from "@/modules/ai/ai.service";

async function requireAiHuman() {
  const user = await requireUser();
  return canUseTamNestAi(user) ? user : null;
}

function friendlyProviderError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message === "AI_AGENT_NOT_CONFIGURED") return "Tài khoản NA AI chưa được khởi tạo. Hãy chạy bước thiết lập AI.";
  if (message === "AI_PROVIDER_NOT_CONFIGURED") return "Nhà cung cấp AI chưa được cấu hình trên máy chủ.";
  if (message === "AI_TOOL_LOOP_LIMIT") return "AI đã dùng quá nhiều bước xử lý. Hãy thu hẹp câu hỏi và thử lại.";
  if (message === "AI_EMPTY_RESPONSE") return "AI không trả về nội dung. Vui lòng thử lại.";
  if (message === "AI_RATE_LIMITED") return "Bạn gửi quá nhanh. Vui lòng chờ một phút rồi thử lại.";
  if (message === "AI_PROVIDER_TIMEOUT") return "AI phản hồi quá lâu. Vui lòng thử lại.";
  return "Không thể nhận phản hồi từ AI lúc này. Vui lòng thử lại sau.";
}

export async function createAiConversationAction(input: unknown): Promise<ActionResult<{ id: string; title: string }>> {
  const user = await requireAiHuman();
  if (!user) return fail("PERMISSION_DENIED", "Chỉ Giám đốc được sử dụng NA AI.");
  const parsed = createConversationSchema.safeParse(input ?? {});
  if (!parsed.success) return fail("VALIDATION_ERROR", parsed.error.issues[0]?.message);
  try {
    const conversation = await createAiConversation(user.id, parsed.data.title);
    revalidatePath("/chatbot");
    return ok(conversation);
  } catch (error) {
    return fail("INTERNAL_ERROR", friendlyProviderError(error));
  }
}

export async function sendAiMessageAction(input: unknown): Promise<ActionResult<{ message: { id: string; role: "ASSISTANT"; content: string; createdAt: Date } }>> {
  const user = await requireAiHuman();
  if (!user) return fail("PERMISSION_DENIED", "Chỉ Giám đốc được sử dụng NA AI.");
  const parsed = sendMessageSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION_ERROR", parsed.error.issues[0]?.message);
  try {
    const result = await sendAiMessage({ human: user, ...parsed.data });
    if (!result.ok) return fail("NOT_FOUND", "Không tìm thấy cuộc trò chuyện.");
    revalidatePath("/chatbot");
    return ok({ message: { ...result.message, role: "ASSISTANT" as const } });
  } catch (error) {
    return fail("INTERNAL_ERROR", friendlyProviderError(error));
  }
}

export async function renameAiConversationAction(input: unknown): Promise<ActionResult<{ renamed: true }>> {
  const user = await requireAiHuman();
  if (!user) return fail("PERMISSION_DENIED", "Chỉ Giám đốc được sử dụng NA AI.");
  const parsed = renameConversationSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION_ERROR", parsed.error.issues[0]?.message);
  const renamed = await renameAiConversation(user.id, parsed.data.conversationId, parsed.data.title);
  if (!renamed) return fail("NOT_FOUND", "Không tìm thấy cuộc trò chuyện.");
  revalidatePath("/chatbot");
  return ok({ renamed: true });
}

export async function deleteAiConversationAction(input: unknown): Promise<ActionResult<{ deleted: true }>> {
  const user = await requireAiHuman();
  if (!user) return fail("PERMISSION_DENIED", "Chỉ Giám đốc được sử dụng NA AI.");
  const parsed = conversationIdSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION_ERROR", parsed.error.issues[0]?.message);
  const deleted = await deleteAiConversation(user.id, parsed.data.conversationId);
  if (!deleted) return fail("NOT_FOUND", "Không tìm thấy cuộc trò chuyện.");
  revalidatePath("/chatbot");
  return ok({ deleted: true });
}
