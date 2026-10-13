"use client";

import { Alert, Button, ButtonAnchor, Card, EmptyStatePanel, Input } from "@/components/ui";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Download,
  Eye,
  FileText,
  LoaderCircle,
  Trash2,
  Upload,
} from "lucide-react";
import {
  deleteTransactionFileAction,
  registerTransactionFileAction,
  requestTransactionUploadTicketAction,
} from "@/modules/finance/finance.actions";
import type { FinanceTransactionItem } from "@/modules/finance/finance.service";

function humanSize(bytes: string): string {
  const value = Number(bytes);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export function TransactionDocuments({
  transaction,
  canManage,
}: {
  transaction: FinanceTransactionItem;
  canManage: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload() {
    const file = inputRef.current?.files?.[0];
    if (!file) {
      setError("Vui lòng chọn một chứng từ.");
      return;
    }

    setBusy(true);
    setError(null);
    const ticket = await requestTransactionUploadTicketAction({
      transactionId: transaction.id,
      fileName: file.name,
      mimeType: file.type || undefined,
    });
    if (!ticket.ok) {
      setBusy(false);
      setError(ticket.message);
      return;
    }
    if (file.size > ticket.data.maxSizeBytes) {
      setBusy(false);
      setError(
        `File vượt quá ${Math.round(ticket.data.maxSizeBytes / 1024 / 1024)} MB.`,
      );
      return;
    }

    try {
      const response = await fetch(ticket.data.uploadUrl, {
        method: "PUT",
        body: file,
        headers: {
          "Content-Type": file.type || "application/octet-stream",
        },
      });
      if (!response.ok) throw new Error(String(response.status));
    } catch {
      setBusy(false);
      setError("Tải chứng từ lên thất bại. Vui lòng thử lại.");
      return;
    }

    const saved = await registerTransactionFileAction({
      transactionId: transaction.id,
      objectKey: ticket.data.objectKey,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
    });
    setBusy(false);
    if (!saved.ok) {
      setError(saved.message);
      return;
    }

    if (inputRef.current) inputRef.current.value = "";
    router.refresh();
  }

  async function remove(id: string) {
    if (!window.confirm("Xóa chứng từ này khỏi giao dịch?")) return;
    setError(null);
    const result = await deleteTransactionFileAction({ id });
    if (!result.ok) {
      setError(result.message);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="danger" className="px-3 py-2">
          {error}
        </Alert>
      )}

      {transaction.files.length === 0 ? (
        <EmptyStatePanel className="px-6 py-10">
          <FileText className="mx-auto size-6 text-muted" />
          <p className="mt-2 text-sm text-text-secondary">Giao dịch chưa có chứng từ đính kèm.</p>
        </EmptyStatePanel>
      ) : (
        <Card as="ul" variant="list">
          {transaction.files.map((file) => {
            const isImage = file.mimeType?.startsWith("image/");

            return (
              <li key={file.id} className="flex items-center gap-3 px-4 py-3">
                <FileText className="size-4 shrink-0 text-muted" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {file.fileName}
                  </p>
                  <p className="text-sm text-text-secondary">
                    {humanSize(file.sizeBytes)}
                    {file.uploadedBy?.fullName ? ` · ${file.uploadedBy.fullName}` : ""}
                  </p>
                </div>
                {isImage && file.url && (
                  <ButtonAnchor
                    href={file.url}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Xem ${file.fileName}`}
                    variant="ghost"
                    size="icon-sm"
                  >
                    <Eye className="size-4" />
                  </ButtonAnchor>
                )}
                {file.url ? (
                  <ButtonAnchor
                    href={file.url}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Tải ${file.fileName}`}
                    variant="ghost"
                    size="icon-sm"
                  >
                    <Download className="size-4" />
                  </ButtonAnchor>
                ) : (
                  <span
                    className="px-2 text-xs text-muted"
                    title="Không tạo được liên kết tải. Kiểm tra kho file (MinIO)."
                  >
                    Lỗi tải
                  </span>
                )}
                {canManage && (
                  <Button
                    type="button"
                    onClick={() => remove(file.id)}
                    aria-label={`Xóa ${file.fileName}`}
                    variant="dangerGhost"
                    size="icon-sm"
                    className="p-1.5"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </li>
            );
          })}
        </Card>
      )}

      {canManage && (
        <Card variant="filled" className="space-y-2 p-4">
          <p className="text-sm font-semibold text-foreground">
            Thêm hóa đơn / ủy nhiệm chi
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              ref={inputRef}
              type="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip,.rar,.jpg,.jpeg,.png"
              disabled={busy}
              className="min-w-0 flex-1 file:mr-3 file:px-3 file:py-1.5"
            />
            <Button
              type="button"
              onClick={upload}
              disabled={busy}
              variant="outline"
              className="px-3 py-2"
            >
              {busy ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Upload className="size-4" />
              )}
              Tải lên
            </Button>
          </div>
          <p className="text-sm text-text-secondary">
            Hỗ trợ PDF, Office, ảnh và file nén; tối đa 50 MB.
          </p>
        </Card>
      )}
    </div>
  );
}
