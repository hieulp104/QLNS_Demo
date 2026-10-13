import { redirect } from "next/navigation";
import { requirePagePermission } from "@/common/guards/page.guard";
import { PageHeader } from "@/components/patterns/page-header";
import { AiChat } from "@/modules/ai/components/ai-chat";
import {
  canUseTamNestAi,
  getAiConversation,
  listAiConversations,
} from "@/modules/ai/ai.service";

export type AiWorkspaceProps = {
  searchParams: Promise<{ conversation?: string | string[] }>;
};

export async function AiWorkspace({ searchParams }: AiWorkspaceProps) {
  const user = await requirePagePermission("ai.chat.use");
  if (!canUseTamNestAi(user)) redirect("/khong-co-quyen");

  const raw = await searchParams;
  const requested = Array.isArray(raw.conversation) ? raw.conversation[0] : raw.conversation;
  const conversations = await listAiConversations(user.id);
  const activeId = requested ?? conversations[0]?.id;
  const active = activeId ? await getAiConversation(user.id, activeId) : null;

  return (
    <>
      <PageHeader title="NA AI" />
      <AiChat
        key={active?.id ?? "new"}
        conversations={conversations.map((conversation) => ({
          id: conversation.id,
          title: conversation.title,
          updatedAt: conversation.updatedAt,
          preview: conversation.messages[0]?.content ?? "Chưa có tin nhắn",
        }))}
        activeConversation={active}
      />
    </>
  );
}
