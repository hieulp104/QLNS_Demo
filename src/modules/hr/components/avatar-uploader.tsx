"use client";

import { Alert, Avatar, Button, Input } from "@/components/ui";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, LoaderCircle, TriangleAlert } from "lucide-react";
import {
  requestAvatarTicketAction,
  saveAvatarAction,
} from "@/modules/hr/hr.actions";
import { initials } from "@/lib/utils";

type Props = {
  userId: string;
  fullName: string;
  /** Presigned URL ảnh hiện tại — null thì hiện chữ cái viết tắt. */
  avatarSrc: string | null;
  /** Người xem có được đổi ảnh không (chính chủ hoặc user.update). */
  canChange: boolean;
};

/**
 * HR-08 — avatar + nút đổi ảnh, upload 2 pha lên MinIO (kind AVATAR).
 * Server action có giới hạn body 1MB nên KHÔNG gửi file qua action —
 * PUT thẳng lên MinIO bằng presigned URL.
 */
export function AvatarUploader({
  userId,
  fullName,
  avatarSrc,
  canChange,
}: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePick(file: File) {
    setError(null);
    setBusy(true);

    const ticket = await requestAvatarTicketAction({
      userId,
      fileName: file.name,
      mimeType: file.type,
    });
    if (!ticket.ok) {
      setBusy(false);
      setError(ticket.message);
      return;
    }
    if (file.size > ticket.data.maxSizeBytes) {
      setBusy(false);
      setError(
        `Ảnh vượt quá ${Math.round(ticket.data.maxSizeBytes / 1024 / 1024)}MB.`,
      );
      return;
    }

    try {
      const put = await fetch(ticket.data.uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "image/jpeg" },
      });
      if (!put.ok) throw new Error(String(put.status));
    } catch {
      setBusy(false);
      setError("Tải ảnh lên thất bại. Vui lòng thử lại.");
      return;
    }

    const saved = await saveAvatarAction({
      userId,
      objectKey: ticket.data.objectKey,
      fileName: file.name,
      mimeType: file.type || "image/jpeg",
      sizeBytes: file.size,
    });
    setBusy(false);
    if (!saved.ok) {
      setError(saved.message);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex items-center gap-3">
      <div className="relative">
        <Avatar
          src={avatarSrc}
          alt={`Ảnh đại diện của ${fullName}`}
          fallback={initials(fullName)}
          size="lg"
        />

        {canChange && (
          <Button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            aria-label="Đổi ảnh đại diện"
            title="Đổi ảnh đại diện"
            variant="primary"
            size="icon-sm"
            className="absolute -bottom-1 -right-1"
          >
            {busy ? (
              <LoaderCircle className="size-3.5 animate-spin" />
            ) : (
              <Camera className="size-3.5" />
            )}
          </Button>
        )}
        <Input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/heic"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handlePick(file);
            e.target.value = "";
          }}
        />
      </div>

      {error && (
        <Alert variant="danger" className="flex items-start gap-1.5 text-xs">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
          {error}
        </Alert>
      )}
    </div>
  );
}
