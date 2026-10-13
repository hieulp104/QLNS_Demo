import type { AiProvider } from "@/modules/ai/ai.provider";
import type { SessionUser } from "@/common/permissions/permissions";
import { can } from "@/common/permissions/permissions";
import { loadSessionUser } from "@/modules/auth/auth.service";
import { AI_AGENT_EMPLOYEE_CODE, AI_LIMITS } from "@/modules/ai/ai.constants";
import { runAiAgent, type AgentHistoryMessage } from "@/modules/ai/ai.agent";
import { prisma } from "@/shared/prisma/prisma.service";

export function canUseTamNestAi(user: SessionUser | null | undefined): user is SessionUser {
  return Boolean(
    user?.userType === "HUMAN" &&
      user.roleCodes.includes("DIRECTOR") &&
      can(user, "ai.chat.use"),
  );
}

export async function loadAiPrincipal(): Promise<SessionUser> {
  const row = await prisma.user.findFirst({
    where: {
      employeeCode: AI_AGENT_EMPLOYEE_CODE,
      userType: "AI_AGENT",
      deletedAt: null,
      isActive: true,
    },
    select: { id: true },
  });
  if (!row) throw new Error("AI_AGENT_NOT_CONFIGURED");
  const principal = await loadSessionUser(row.id);
  if (!principal || principal.userType !== "AI_AGENT") {
    throw new Error("AI_AGENT_NOT_CONFIGURED");
  }
  return principal;
}

export function listAiConversations(userId: string) {
  return prisma.aiConversation.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: {
      id: true,
      title: true,
      createdAt: true,
      updatedAt: true,
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { content: true, role: true },
      },
    },
  });
}

export function getAiConversation(userId: string, conversationId: string) {
  return prisma.aiConversation.findFirst({
    where: { id: conversationId, userId },
    select: {
      id: true,
      title: true,
      createdAt: true,
      updatedAt: true,
      messages: {
        orderBy: { createdAt: "asc" },
        select: { id: true, role: true, content: true, createdAt: true },
      },
    },
  });
}

// Serialize messages for one conversation in this app process. Without this,
// two requests can both append USER first and persist ASSISTANT replies in the
// opposite order, corrupting the context shown on the next turn.
const conversationQueues = new Map<string, Promise<void>>();

async function withConversationLock<T>(conversationId: string, task: () => Promise<T>): Promise<T> {
  const previous = conversationQueues.get(conversationId) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  conversationQueues.set(conversationId, current);
  await previous;
  try {
    return await task();
  } finally {
    release();
    if (conversationQueues.get(conversationId) === current) {
      conversationQueues.delete(conversationId);
    }
  }
}

export async function createAiConversation(userId: string, title?: string) {
  const agent = await loadAiPrincipal();
  return prisma.aiConversation.create({
    data: {
      userId,
      agentId: agent.id,
      title: title?.trim() || "Cuộc trò chuyện mới",
    },
    select: { id: true, title: true },
  });
}

export async function renameAiConversation(
  userId: string,
  conversationId: string,
  title: string,
): Promise<boolean> {
  const result = await prisma.aiConversation.updateMany({
    where: { id: conversationId, userId },
    data: { title },
  });
  return result.count === 1;
}

export async function deleteAiConversation(
  userId: string,
  conversationId: string,
): Promise<boolean> {
  const result = await prisma.aiConversation.deleteMany({
    where: { id: conversationId, userId },
  });
  return result.count === 1;
}

function contextWindow(
  rows: AgentHistoryMessage[],
): AgentHistoryMessage[] {
  const chosen: AgentHistoryMessage[] = [];
  let chars = 0;
  for (const row of [...rows].reverse()) {
    if (chosen.length >= AI_LIMITS.maxContextMessages) break;
    if (chosen.length > 0 && chars + row.content.length > AI_LIMITS.maxContextChars) break;
    chosen.push(row);
    chars += row.content.length;
  }
  return chosen.reverse();
}

export async function sendAiMessage(input: {
  human: SessionUser;
  conversationId: string;
  content: string;
  provider?: AiProvider;
  onToolExecution?: (event: { name: string; success: boolean }) => void | Promise<void>;
}) {
  return withConversationLock(input.conversationId, () => sendAiMessageLocked(input));
}

async function sendAiMessageLocked(input: {
  human: SessionUser;
  conversationId: string;
  content: string;
  provider?: AiProvider;
  onToolExecution?: (event: { name: string; success: boolean }) => void | Promise<void>;
}) {
  const recentMessages = await prisma.aiMessage.count({
    where: {
      role: "USER",
      createdAt: { gte: new Date(Date.now() - 60_000) },
      conversation: { userId: input.human.id },
    },
  });
  if (recentMessages >= AI_LIMITS.maxMessagesPerMinute) {
    throw new Error("AI_RATE_LIMITED");
  }

  const conversation = await prisma.aiConversation.findFirst({
    where: { id: input.conversationId, userId: input.human.id },
    select: { id: true, title: true, agentId: true },
  });
  if (!conversation) return { ok: false as const, reason: "NOT_FOUND" as const };

  const agent = await loadSessionUser(conversation.agentId);
  if (!agent || agent.userType !== "AI_AGENT") {
    throw new Error("AI_AGENT_NOT_CONFIGURED");
  }

  await prisma.$transaction([
    prisma.aiMessage.create({
      data: { conversationId: conversation.id, role: "USER", content: input.content },
    }),
    prisma.aiConversation.update({
      where: { id: conversation.id },
      data: conversation.title === "Cuộc trò chuyện mới"
        ? { title: input.content.slice(0, AI_LIMITS.maxTitleChars) }
        : {},
    }),
  ]);

  const historyRows = await prisma.aiMessage.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "desc" },
    take: AI_LIMITS.maxContextMessages,
    select: { role: true, content: true },
  });
  const history = contextWindow(historyRows.reverse());
  const answer = await runAiAgent({
    human: input.human,
    agent,
    conversationId: conversation.id,
    history,
    provider: input.provider,
    onToolExecution: input.onToolExecution,
  });

  const message = await prisma.aiMessage.create({
    data: { conversationId: conversation.id, role: "ASSISTANT", content: answer },
    select: { id: true, role: true, content: true, createdAt: true },
  });
  await prisma.aiConversation.update({
    where: { id: conversation.id },
    data: { updatedAt: new Date() },
  });
  return { ok: true as const, message };
}
