"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Trash2, TriangleAlert } from "lucide-react";
import { Alert, Button, Dialog } from "@/components/ui";
import { purgeEmployeeAction } from "@/modules/hr/hr.actions";

/**
 * Nút xóa một hồ sơ khỏi danh sách nhân viên đã nghỉ. Dữ liệu cũ của người
 * đó (chấm công, lương…) server giữ nguyên — xem `purgeResignedEmployee`.
 */
export function PurgeEmployeeButton({
  employeeId,
  employeeName,
  employeeCode,
}: {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function close() {
    if (pending) return;
    setOpen(false);
    setError(null);
  }

  function confirm() {
    setError(null);
    startTransition(async () => {
      const res = await purgeEmployeeAction(employeeId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="dangerGhost"
        size="icon-sm"
        aria-label={`Xóa ${employeeName}`}
        title="Xóa khỏi danh sách"
        onClick={() => setOpen(true)}
      >
        <Trash2 className="size-4" />
      </Button>

      {open && (
        <Dialog
          title="Xóa hồ sơ"
          variant="danger"
          size="sm"
          onClose={close}
          footer={
            <div className="flex justify-end gap-2.5">
              <Button type="button" variant="outline" onClick={close} disabled={pending}>
                Hủy
              </Button>
              <Button type="button" variant="danger" onClick={confirm} disabled={pending}>
                {pending && <LoaderCircle className="size-4 animate-spin" />}
                {pending ? "Đang xóa..." : "Xóa"}
              </Button>
            </div>
          }
        >
          <div className="space-y-3 text-sm">
            <p>
              Xóa{" "}
              <strong className="font-semibold text-foreground">
                {employeeName} ({employeeCode})
              </strong>{" "}
              khỏi danh sách nhân viên đã nghỉ?
            </p>
            <p className="text-muted">
              Chấm công, bảng lương và dữ liệu cũ của người này vẫn được giữ nguyên.
            </p>
            {error && (
              <Alert variant="danger" className="flex items-start gap-2.5 px-3.5 py-3">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                <span>{error}</span>
              </Alert>
            )}
          </div>
        </Dialog>
      )}
    </>
  );
}
