"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, LoaderCircle } from "lucide-react";
import { Alert, Button } from "@/components/ui";
import { completeProjectAction } from "@/modules/projects/projects.actions";

/**
 * PJ — nút kết thúc dự án ở giai đoạn bảo hành: chuyển trạng thái sang
 * "Hoàn thành", đưa dự án ra khỏi danh sách đang theo dõi.
 */
export function CompleteProjectButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  function complete() {
    setError(null);
    startTransition(async () => {
      const result = await completeProjectAction(projectId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setConfirming(false);
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      {error && <Alert variant="danger">{error}</Alert>}
      {confirming ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface-subtle p-3.5">
          <span className="text-sm text-foreground">
            Kết thúc dự án này? Trạng thái sẽ chuyển sang <b>Hoàn thành</b> và dự
            án ra khỏi danh sách đang theo dõi.
          </span>
          <div className="flex gap-2">
            <Button onClick={complete} disabled={pending} size="sm">
              {pending && <LoaderCircle className="size-4 animate-spin" />}
              Xác nhận kết thúc
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirming(false)}
              disabled={pending}
            >
              Hủy
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" onClick={() => setConfirming(true)}>
          <CheckCircle2 className="size-4" />
          Kết thúc dự án
        </Button>
      )}
    </div>
  );
}
