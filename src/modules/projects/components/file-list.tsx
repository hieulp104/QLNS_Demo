"use client";

import { Badge, Button, ButtonAnchor, EmptyState, Input } from "@/components/ui";

import { useActionState } from "react";
import { Download, Eye, File, FileText, LoaderCircle, Trash2 } from "lucide-react";
import {
  deleteProjectFileAction,
  type ActionState,
} from "@/modules/projects/projects.actions";
import { FILE_KIND_LABEL } from "@/common/enums";
import { formatDate } from "@/lib/utils";
import type { FileKind } from "@/generated/prisma/enums";

const initialState: ActionState = { error: null };

export type ProjectFile = {
  id: string;
  fileName: string;
  /** `null` khi không ký được URL tải (MinIO lỗi) — UI tắt nút thay vì sập trang. */
  url: string | null;
  mimeType: string;
  sizeBytes: string;
  kind: FileKind;
  caption: string | null;
  createdAt: Date;
  uploadedBy: { fullName: string } | null;
};

function humanSize(bytes: string): string {
  const n = Number(bytes);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function DeleteFileButton({ fileId }: { fileId: string }) {
  const [, formAction, pending] = useActionState(
    deleteProjectFileAction,
    initialState,
  );
  return (
    <form action={formAction}>
      <Input type="hidden" name="fileId" value={fileId} />
      <Button
        type="submit"
        disabled={pending}
        aria-label="Xóa file"
        variant="dangerGhost" size="icon-sm" className="p-1.5"
      >
        {pending ? (
          <LoaderCircle className="size-4 animate-spin" />
        ) : (
          <Trash2 className="size-4" />
        )}
      </Button>
    </form>
  );
}

/** PJ-18 — danh sách file tài liệu (không phải ảnh). */
export function FileList({
  files,
  canManage,
}: {
  files: ProjectFile[];
  canManage: boolean;
}) {
  return (
    <section>
      <h3 className="mb-4 text-h3 font-semibold text-foreground">Tài liệu dự án</h3>
      {files.length === 0 ? (
        <EmptyState
          icon={<FileText />}
          title="Chưa có tài liệu."
          description="Upload tài liệu đầu tiên của dự án."
          className="min-h-44 py-8"
        />
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
          {files.map((f) => (
            <li
              key={f.id}
              className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center"
            >
              <File className="size-5 shrink-0 text-muted" />
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {f.fileName}
                  </p>
                  <Badge variant="info" className="shrink-0">
                    {FILE_KIND_LABEL[f.kind]}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted">
                  {humanSize(f.sizeBytes)} · {formatDate(f.createdAt)} ·{" "}
                  {f.uploadedBy?.fullName ?? "Không rõ người tải"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1 self-end sm:self-auto">
                {f.url ? (
                  <>
                    <ButtonAnchor
                      href={f.url}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Xem trước ${f.fileName}`}
                      variant="ghost"
                      size="icon-sm"
                    >
                      <Eye className="size-4" />
                    </ButtonAnchor>
                    <ButtonAnchor
                      href={f.url}
                      download={f.fileName}
                      aria-label={`Tải xuống ${f.fileName}`}
                      variant="ghost"
                      size="icon-sm"
                    >
                      <Download className="size-4" />
                    </ButtonAnchor>
                  </>
                ) : (
                  <span
                    className="px-2 text-xs text-muted"
                    title="Không tạo được liên kết tải. Kiểm tra kho file (MinIO)."
                  >
                    Lỗi tải
                  </span>
                )}
                {canManage && <DeleteFileButton fileId={f.id} />}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
