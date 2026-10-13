"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Lock, LockOpen, TriangleAlert } from "lucide-react";
import { Alert, Button, Dialog } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";
import { setMonthLockAction } from "@/modules/attendance/attendance.actions";

/**
 * Chốt / mở lại bảng công của tháng đang xem — giống chốt kỳ bên bảng lương.
 * Đã chốt thì cả bảng chỉ xem, server chặn mọi đường ghi (xem attendance.lock.ts).
 */
export function MonthLockControl({
  year,
  month,
  lock,
  canLock,
}: {
  year: number;
  month: number;
  lock: { at: string; byName: string } | null;
  canLock: boolean;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState<"lock" | "unlock" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(locked: boolean) {
    setError(null);
    startTransition(async () => {
      const res = await setMonthLockAction({ year, month, locked });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setConfirming(null);
      router.refresh();
    });
  }

  return (
    <>
      {lock ? (
        <Alert
          variant="info"
          className="order-last flex w-full basis-full flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 text-sm"
        >
          <Lock className="size-4 shrink-0" />
          <span className="min-w-0 flex-1">
            <strong className="font-semibold">Bảng công tháng {month}/{year} đã chốt</strong>{" "}
            · {lock.byName} · {formatDateTime(lock.at)}
          </span>
          {canLock && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="px-3 py-1.5"
              onClick={() => setConfirming("unlock")}
            >
              <LockOpen className="size-4" />
              Mở chốt
            </Button>
          )}
        </Alert>
      ) : (
        canLock && (
          <Button
            type="button"
            variant="outline"
            className="px-3 py-2"
            onClick={() => setConfirming("lock")}
          >
            <Lock className="size-4" />
            Chốt bảng công
          </Button>
        )
      )}

      {confirming && (
        <Dialog
          title={confirming === "lock" ? "Chốt bảng công" : "Mở chốt bảng công"}
          size="sm"
          onClose={() => !pending && setConfirming(null)}
          footer={
            <div className="flex justify-end gap-2.5">
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => setConfirming(null)}
              >
                Hủy
              </Button>
              <Button type="button" disabled={pending} onClick={() => submit(confirming === "lock")}>
                {pending && <LoaderCircle className="size-4 animate-spin" />}
                {confirming === "lock" ? "Chốt" : "Mở chốt"}
              </Button>
            </div>
          }
        >
          <div className="space-y-3 text-sm">
            <p>
              {confirming === "lock"
                ? `Chốt bảng công tháng ${month}/${year}?`
                : `Mở chốt bảng công tháng ${month}/${year}?`}
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
