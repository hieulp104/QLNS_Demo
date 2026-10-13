"use client";

import { Input, Alert, Label } from "@/components/ui";
import { DocumentUploadPattern } from "@/components/patterns/document-upload";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import {
  registerProjectFileAction,
  requestUploadTicketAction,
} from "@/modules/projects/projects.actions";
import { FILE_KIND_LABEL } from "@/common/enums";
import type { FileKind } from "@/generated/prisma/enums";

type Props = {
  projectId: string;
  /** Loại file cho phép chọn — file tài liệu hoặc ảnh. */
  kinds: FileKind[];
  /** Bật ô chú thích (dùng cho ảnh gallery). */
  withCaption?: boolean;
  /** Giới hạn định dạng ở hộp chọn file. */
  accept?: string;
  projectFileLayout?: boolean;
};

type Phase = "idle" | "uploading" | "saving";

/**
 * PJ-18 / PJ-17 — upload file theo luồng 2 pha:
 *   1. xin presigned URL từ server
 *   2. PUT thẳng lên MinIO (không nghẽn server với file lớn)
 *   3. báo server ghi FileAsset
 */
export function FileUploader({
  projectId,
  kinds,
  withCaption,
  accept,
  projectFileLayout,
}: Props) {
  const router = useRouter();
  const [kind, setKind] = useState<FileKind>(kinds[0]);
  const [caption, setCaption] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);

  const busy = phase !== "idle";

  async function handleUpload(file: File | null) {
    setError(null);
    if (!file) {
      setError("Vui lòng chọn một file.");
      return false;
    }

    // Pha 1 — xin vé upload.
    setPhase("uploading");
    const ticket = await requestUploadTicketAction({
      projectId,
      fileName: file.name,
      kind,
    });
    if (!ticket.ok) {
      setPhase("idle");
      setError(ticket.message);
      return false;
    }
    if (file.size > ticket.data.maxSizeBytes) {
      setPhase("idle");
      setError(
        `File vượt quá dung lượng cho phép (${Math.round(ticket.data.maxSizeBytes / 1024 / 1024)}MB).`,
      );
      return false;
    }

    // Pha 2 — PUT thẳng lên MinIO.
    try {
      const put = await fetch(ticket.data.uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "application/octet-stream" },
      });
      if (!put.ok) throw new Error(`MinIO trả ${put.status}`);
    } catch {
      setPhase("idle");
      setError("Tải file lên thất bại. Vui lòng thử lại.");
      return false;
    }

    // Pha 3 — ghi FileAsset.
    setPhase("saving");
    const saved = await registerProjectFileAction({
      projectId,
      objectKey: ticket.data.objectKey,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      kind,
      caption: withCaption ? caption.trim() || undefined : undefined,
    });
    setPhase("idle");

    if (!saved.ok) {
      setError(saved.message);
      return false;
    }

    setCaption("");
    router.refresh();
    return true;
  }

  return (
    <div className="space-y-3 rounded-card border border-line bg-surface px-3 py-3 shadow-sm sm:px-4">
      {error && (
        <Alert variant="danger" className="flex items-start gap-2">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </Alert>
      )}

      {withCaption && (
        <div className="space-y-1.5">
          <Label className="block text-sm font-medium text-foreground">
            Chú thích ảnh
          </Label>
          <Input
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            disabled={busy}
            maxLength={500}
            placeholder="VD: Phối cảnh phòng khách phương án 2"
            className="px-3.5 py-2.5"
          />
        </div>
      )}

      <DocumentUploadPattern
        options={kinds.map((fileKind) => ({
          value: fileKind,
          label: FILE_KIND_LABEL[fileKind],
          accept,
        }))}
        value={kind}
        onChange={(value) => setKind(value as FileKind)}
        onUpload={handleUpload}
        loading={busy}
        placeholder="Chọn loại tài liệu dự án"
        projectFileLayout={projectFileLayout}
      />
    </div>
  );
}
