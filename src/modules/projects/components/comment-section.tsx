"use client";

import { Alert, Button, Card, EmptyStatePanel, FormCard, IconTile, Input, Textarea } from "@/components/ui";

import { useActionState, useEffect, useRef } from "react";
import { LoaderCircle, MessageSquare, Send, TriangleAlert } from "lucide-react";
import {
  addCommentAction,
  type ActionState,
} from "@/modules/projects/projects.actions";
import { formatDateTime, initials } from "@/lib/utils";

const initialState: ActionState = { error: null };

type Comment = {
  id: string;
  content: string;
  createdAt: Date;
  author: { id: string; fullName: string };
};

/** PJ-16 — bình luận / chú thích. Mọi nhân viên đều đăng được. */
export function CommentSection({
  projectId,
  comments,
}: {
  projectId: string;
  comments: Comment[];
}) {
  const [state, formAction, pending] = useActionState(
    addCommentAction,
    initialState,
  );
  const formRef = useRef<HTMLFormElement>(null);

  // Xóa ô nhập sau khi gửi thành công.
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  return (
    <div className="space-y-5">
      <FormCard
        ref={formRef}
        action={formAction}
        className="p-4"
      >
        <Input type="hidden" name="projectId" value={projectId} />
        <Textarea
          name="content"
          rows={3}
          required
          maxLength={2000}
          placeholder="Viết bình luận hoặc chú thích cho dự án..."
          className="resize-none px-3.5 py-2.5"
        />
        {state.error && (
          <Alert variant="danger" className="mt-2 flex items-center gap-1.5 text-xs">
            <TriangleAlert className="size-3.5" />
            {state.error}
          </Alert>
        )}
        <div className="mt-2 flex justify-end">
          <Button
            type="submit"
            disabled={pending}
            className="px-4 py-2 disabled:cursor-not-allowed"
          >
            {pending ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            Gửi
          </Button>
        </div>
      </FormCard>

      {comments.length === 0 ? (
        <EmptyStatePanel >
          <IconTile shape="circle" size="xl">
            <MessageSquare className="size-5" />
          </IconTile>
          <p className="text-sm text-muted">
            Chưa có bình luận nào. Hãy là người đầu tiên.
          </p>
        </EmptyStatePanel>
      ) : (
        <ul className="space-y-3">
          {comments.map((c) => (
            <li key={c.id} className="flex gap-3">
              <IconTile tone="primary" shape="circle" size="sm">
                {initials(c.author.fullName)}
              </IconTile>
              <Card className="min-w-0 flex-1 px-4 py-3">
                <div className="mb-1 flex items-baseline gap-2">
                  <span className="text-sm font-medium text-foreground">
                    {c.author.fullName}
                  </span>
                  <span className="text-xs text-muted">
                    {formatDateTime(c.createdAt)}
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-sm text-foreground">
                  {c.content}
                </p>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
