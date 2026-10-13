"use client";

import { Alert, Button, Card, Input } from "@/components/ui";

import { useActionState, useState } from "react";
import { LoaderCircle, Trash2, TriangleAlert } from "lucide-react";
import {
  deleteProjectAction,
  type ActionState,
} from "@/modules/projects/projects.actions";

const initialState: ActionState = { error: null };

/** PJ-06 — xóa mềm dự án. Chỉ hiện với Director (có project.delete). */
export function DeleteProjectButton({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [state, formAction, pending] = useActionState(
    deleteProjectAction,
    initialState,
  );

  if (!confirming) {
    return (
      <Button
        type="button"
        onClick={() => setConfirming(true)}
        variant="dangerOutline" className="px-4 py-2"
      >
        <Trash2 className="size-4" />
        Xóa dự án
      </Button>
    );
  }

  return (
    <Card variant="danger" className="space-y-2.5 p-4">
      <p className="text-sm text-foreground">
        Xóa dự án <strong>{projectName}</strong>? Dữ liệu được ẩn đi (xóa mềm),
        có thể khôi phục trong DB.
      </p>
      {state.error && (
        <Alert variant="danger" className="flex items-start gap-2">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>{state.error}</span>
        </Alert>
      )}
      <div className="flex gap-2.5">
        <form action={formAction}>
          <Input type="hidden" name="id" value={projectId} />
          <Button
            type="submit"
            disabled={pending}
            variant="danger" className="px-4 py-2 disabled:cursor-not-allowed"
          >
            {pending && <LoaderCircle className="size-4 animate-spin" />}
            Xác nhận xóa
          </Button>
        </form>
        <Button
          type="button"
          onClick={() => setConfirming(false)}
          variant="outline" className="px-4 py-2"
        >
          Hủy
        </Button>
      </div>
    </Card>
  );
}
