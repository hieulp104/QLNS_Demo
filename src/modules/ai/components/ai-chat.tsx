"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bot, LoaderCircle, MessageSquarePlus, Send, Trash2, UserRound } from "lucide-react";
import { Alert, Button, Card, EmptyState, Textarea } from "@/components/ui";
import {
  createAiConversationAction,
  deleteAiConversationAction,
  sendAiMessageAction,
} from "@/modules/ai/ai.actions";
import { cn, formatRelativeTime } from "@/lib/utils";

type ConversationListItem = {
  id: string;
  title: string;
  updatedAt: Date;
  preview: string;
};

type Message = {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  createdAt: Date;
};

type ActiveConversation = {
  id: string;
  title: string;
  messages: Message[];
} | null;

const SUGGESTIONS = [
  "Tổng hợp thực thu, thực chi tháng này.",
  "Dự án nào đang quá hạn nhưng chưa hoàn thành?",
  "Liệt kê các hợp đồng đã ký còn thu thiếu.",
  "Viết báo cáo ngắn về tình hình dự án hiện tại.",
];

export function AiChat({
  conversations,
  activeConversation,
}: {
  conversations: ConversationListItem[];
  activeConversation: ActiveConversation;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>(activeConversation?.messages ?? []);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pending]);

  function createConversation() {
    setError(null);
    startTransition(async () => {
      const result = await createAiConversationAction({});
      if (!result.ok) return setError(result.message);
      router.push(`/chatbot?conversation=${result.data.id}`);
      router.refresh();
    });
  }

  function deleteConversation(id: string) {
    if (!window.confirm("Xóa cuộc trò chuyện này?")) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteAiConversationAction({ conversationId: id });
      if (!result.ok) return setError(result.message);
      router.push("/chatbot");
      router.refresh();
    });
  }

  function send() {
    const text = content.trim();
    if (!text || !activeConversation || pending) return;
    const optimistic: Message = {
      id: `local-${Date.now()}`,
      role: "USER",
      content: text,
      createdAt: new Date(),
    };
    setMessages((current) => [...current, optimistic]);
    setContent("");
    setError(null);
    startTransition(async () => {
      const result = await sendAiMessageAction({
        conversationId: activeConversation.id,
        content: text,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setMessages((current) => [...current, result.data.message]);
      router.refresh();
    });
  }

  return (
    <div className="grid min-h-[calc(100vh-12rem)] gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      <Card className="flex max-h-[calc(100vh-12rem)] flex-col overflow-hidden">
        <div className="border-b border-line p-3">
          <Button type="button" className="w-full" onClick={createConversation} disabled={pending}>
            <MessageSquarePlus className="size-4" />
            Cuộc trò chuyện mới
          </Button>
        </div>
        <div className="flex-1 space-y-1 overflow-y-auto p-2">
          {conversations.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted">Chưa có cuộc trò chuyện.</p>
          ) : conversations.map((conversation) => (
            <div
              key={conversation.id}
              className={cn(
                "group flex items-start gap-1 rounded-control",
                activeConversation?.id === conversation.id ? "bg-primary/10" : "hover:bg-surface-subtle",
              )}
            >
              <button
                type="button"
                className="min-w-0 flex-1 px-3 py-2.5 text-left"
                onClick={() => router.push(`/chatbot?conversation=${conversation.id}`)}
              >
                <span className="block truncate text-sm font-semibold text-foreground">{conversation.title}</span>
                <span className="mt-0.5 block truncate text-xs text-muted">{conversation.preview}</span>
                <span className="mt-1 block text-[11px] text-note">{formatRelativeTime(conversation.updatedAt)}</span>
              </button>
              <button
                type="button"
                aria-label="Xóa cuộc trò chuyện"
                className="mt-2 mr-1 rounded-control p-2 text-muted opacity-0 hover:bg-surface-danger hover:text-danger group-hover:opacity-100 focus:opacity-100"
                onClick={() => deleteConversation(conversation.id)}
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>
      </Card>

      <Card className="flex min-h-[620px] max-h-[calc(100vh-12rem)] flex-col overflow-hidden">
        {!activeConversation ? (
          <div className="flex flex-1 items-center justify-center p-6">
            <EmptyState
              icon={<Bot />}
              title="Bắt đầu với NA AI"
              description="AI chỉ đọc dữ liệu theo quyền được cấp và không thể sửa hay xóa dữ liệu ERP."
              action={<Button type="button" onClick={createConversation}>Tạo cuộc trò chuyện</Button>}
            />
          </div>
        ) : (
          <>
            <div className="border-b border-line px-5 py-3">
              <p className="font-semibold text-foreground">{activeConversation.title}</p>
              <p className="text-xs text-muted">Read-only · quyền dữ liệu theo tài khoản NA AI</p>
            </div>
            <div className="flex-1 space-y-5 overflow-y-auto p-4 sm:p-6">
              {messages.length === 0 ? (
                <div className="mx-auto max-w-2xl py-8 text-center">
                  <Bot className="mx-auto size-10 text-primary" />
                  <h2 className="mt-3 text-lg font-semibold">Tôi có thể tổng hợp gì cho anh/chị?</h2>
                  <div className="mt-5 grid gap-2 sm:grid-cols-2">
                    {SUGGESTIONS.map((suggestion) => (
                      <button key={suggestion} type="button" className="rounded-control border border-line bg-surface-subtle p-3 text-left text-sm hover:border-primary/40" onClick={() => setContent(suggestion)}>
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              ) : messages.map((message) => (
                <div key={message.id} className={cn("flex gap-3", message.role === "USER" && "justify-end")}>
                  {message.role === "ASSISTANT" && <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><Bot className="size-4" /></span>}
                  <div className={cn("max-w-[88%] rounded-card px-4 py-3 text-sm leading-7 whitespace-pre-wrap", message.role === "USER" ? "bg-primary text-on-primary" : "border border-line bg-surface-subtle text-foreground")}>
                    {message.content}
                  </div>
                  {message.role === "USER" && <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-subtle text-muted"><UserRound className="size-4" /></span>}
                </div>
              ))}
              {pending && messages.length > 0 && (
                <div className="flex items-center gap-3 text-sm text-muted"><LoaderCircle className="size-5 animate-spin text-primary" /> NA AI đang tổng hợp dữ liệu…</div>
              )}
              <div ref={bottomRef} />
            </div>
            <div className="border-t border-line p-3 sm:p-4">
              {error && <Alert variant="danger" className="mb-3">{error}</Alert>}
              <div className="flex items-end gap-2">
                <Textarea
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      send();
                    }
                  }}
                  disabled={pending}
                  maxLength={4000}
                  placeholder="Hỏi về thu chi, dự án, hợp đồng…"
                  className="min-h-12 max-h-36 resize-none"
                />
                <Button type="button" size="icon" onClick={send} disabled={pending || !content.trim()} aria-label="Gửi">
                  {pending ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}
                </Button>
              </div>
              <p className="mt-2 text-xs text-note">AI có thể nhầm khi diễn giải. Hãy kiểm tra các con số quan trọng trong module nguồn.</p>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
