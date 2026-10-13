"use client";

import { Alert, Badge, Button, Card, DividerList, IconTile, Input } from "@/components/ui";

import { useActionState, useState } from "react";
import { ChevronDown, LoaderCircle, RotateCcw, Trash2 } from "lucide-react";
import {
  restoreProjectFileAction,
  type ActionState,
} from "@/modules/projects/projects.actions";
import { FILE_KIND_LABEL } from "@/common/enums";
import { formatDate } from "@/lib/utils";
import type { FileKind } from "@/generated/prisma/enums";

const initialState: ActionState = { error: null };

export type TrashedFile = {
  id: string;
  fileName: string;
  sizeBytes: string;
  kind: FileKind;
  deletedAt: Date;
  /** Còn bao nhiêu ngày nữa bị dọn hẳn — server tính sẵn để client khỏi lệch giờ. */
  daysLeft: number;
  uploadedBy: { fullName: string } | null;
};

function humanSize(bytes: string): string {
  const n = Number(bytes);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function RestoreButton({ fileId }: { fileId: string }) {
  const [state, formAction, pending] = useActionState(
    restoreProjectFileAction,
    initialState,
  );

  return (
    <form action={formAction} className="flex items-center gap-2">
      <Input type="hidden" name="fileId" value={fileId} />
      {state.error && (
        <Alert variant="danger" className="px-2 py-1 text-xs">{state.error}</Alert>
      )}
      <Button
        type="submit"
        disabled={pending}
        size="sm" className="px-2.5 py-1.5"
      >
        {pending ? (
          <LoaderCircle className="size-3.5 animate-spin" />
        ) : (
          <RotateCcw className="size-3.5" />
        )}
        Khôi phục
      </Button>
    </form>
  );
}

/**
 * Thùng rác file của dự án — mặc định thu gọn để không làm rối màn hình chính.
 * File ở đây vẫn còn nguyên trên MinIO, khôi phục là dùng lại được ngay.
 */
export function FileTrash({
  files,
  canRestore,
  retentionDays,
}: {
  files: TrashedFile[];
  canRestore: boolean;
  retentionDays: number;
}) {
  const [open, setOpen] = useState(false);

  if (files.length === 0) return null;

  return (
    <Card className="overflow-hidden">
      <Button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        variant="plain" className="w-full gap-2.5 px-4 py-3 text-left"
      >
        <IconTile size="sm">
          <Trash2 className="size-4" />
        </IconTile>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-foreground">
            Thùng rác ({files.length})
          </span>
          <span className="block text-xs text-muted">
            File đã xóa vẫn giữ {retentionDays} ngày trước khi xóa hẳn
          </span>
        </span>
        <ChevronDown
          className={`size-4 shrink-0 text-muted transition ${open ? "rotate-180" : ""}`}
        />
      </Button>

      {open && (
        <DividerList>
          {files.map((f) => (
            <li
              key={f.id}
              className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-muted line-through">
                  {f.fileName}
                </p>
                <p className="text-xs text-muted">
                  {FILE_KIND_LABEL[f.kind]} · {humanSize(f.sizeBytes)} ·{" "}
                  {f.uploadedBy?.fullName ?? "?"} · đã xóa{" "}
                  {formatDate(f.deletedAt)} ·{" "}
                  {f.daysLeft > 0 ? (
                    <Badge variant="warning">
                      còn {f.daysLeft} ngày
                    </Badge>
                  ) : (
                    <Badge variant="danger">sắp bị dọn</Badge>
                  )}
                </p>
              </div>
              {canRestore && <RestoreButton fileId={f.id} />}
            </li>
          ))}
        </DividerList>
      )}
    </Card>
  );
}
