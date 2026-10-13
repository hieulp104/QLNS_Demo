"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Search, TriangleAlert } from "lucide-react";
import { Alert, Badge, Dialog, Input, Switch } from "@/components/ui";
import { cn, formatDate } from "@/lib/utils";
import { setRosterAction } from "@/modules/attendance/attendance.actions";
import type { RosterEntry } from "@/modules/attendance/attendance.service";

type Kind = "attendance" | "payroll";

/**
 * "Tùy chỉnh danh sách" — ai hiện ở bảng chấm công, ai hiện ở bảng lương.
 * Hai công tắc tách riêng vì hai nhu cầu khác nhau: tài khoản kỹ thuật tắt cả
 * hai; người lương khoán tắt Chấm công nhưng vẫn giữ Bảng lương.
 * Mỗi lần bật/tắt ghi ngay (không có nút Lưu) — thao tác một-hai người mỗi lần,
 * bắt bấm Lưu là thêm một bước dễ quên.
 */
export function RosterDialog({
  year,
  month,
  entries,
  fixedSalaryIds,
  canAttendance,
  canPayroll,
  onClose,
}: {
  year: number;
  month: number;
  entries: RosterEntry[];
  fixedSalaryIds: string[];
  canAttendance: boolean;
  canPayroll: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  // Trạng thái lạc quan — đổi công tắc ngay, lỗi thì trả lại.
  const [local, setLocal] = useState<Record<string, boolean>>({});

  const fixed = useMemo(() => new Set(fixedSalaryIds), [fixedSalaryIds]);
  const valueOf = (e: RosterEntry, kind: Kind) =>
    local[`${e.userId}:${kind}`] ?? (kind === "attendance" ? e.inAttendance : e.inPayroll);

  const q = query.trim().toLowerCase();
  const list = q
    ? entries.filter(
        (e) =>
          e.fullName.toLowerCase().includes(q) ||
          e.employeeCode.toLowerCase().includes(q),
      )
    : entries;

  const hiddenAttendance = entries.filter((e) => !valueOf(e, "attendance")).length;
  const hiddenPayroll = entries.filter((e) => !valueOf(e, "payroll")).length;

  function toggle(e: RosterEntry, kind: Kind, included: boolean) {
    const key = `${e.userId}:${kind}`;
    setError(null);
    setBusy(key);
    setLocal((s) => ({ ...s, [key]: included }));
    startTransition(async () => {
      const res = await setRosterAction({ userId: e.userId, year, month, kind, included });
      setBusy(null);
      if (!res.ok) {
        setLocal((s) => ({ ...s, [key]: !included }));
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <Dialog title="Tùy chỉnh danh sách" onClose={onClose} size="lg">
      <div className="space-y-4">
        <p className="text-sm text-muted">
          Tắt để ẩn người không cần chấm công hoặc không tính lương —{" "}
          <strong className="font-medium text-foreground">
            áp dụng từ tháng {month}/{year} trở về sau
          </strong>
          , các tháng trước giữ nguyên. Dữ liệu cũ không bị xóa, bật lại là hiện.
        </p>
        <ul className="space-y-1 text-xs text-muted">
          <li>– Tài khoản kỹ thuật, không phải nhân viên: tắt cả hai.</li>
          <li>– Lương khoán (trả cố định theo tháng): tắt Chấm công, giữ Bảng lương.</li>
          {canPayroll && (
            <li>– Bật lại Bảng lương thì bấm “Tính lại” ở trang Bảng lương để có số.</li>
          )}
        </ul>

        {error && (
          <Alert variant="danger" className="flex items-start gap-2.5 px-3.5 py-3">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </Alert>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm theo tên hoặc mã"
              className="py-2 pl-9"
              aria-label="Tìm nhân viên"
            />
          </div>
          <span className="text-xs text-muted">
            Đang ẩn: {hiddenAttendance} khỏi chấm công · {hiddenPayroll} khỏi bảng lương
          </span>
        </div>

        <div className="overflow-x-auto rounded-card border border-line">
          <table className="w-full min-w-[32rem] text-sm">
            <thead className="bg-surface-subtle text-xs text-muted">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium">Nhân viên</th>
                <th className="w-28 px-3 py-2.5 text-center font-medium">Chấm công</th>
                <th className="w-28 px-3 py-2.5 text-center font-medium">Bảng lương</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-muted">
                    Không tìm thấy nhân viên phù hợp.
                  </td>
                </tr>
              )}
              {list.map((e) => {
                const off = !valueOf(e, "attendance") && !valueOf(e, "payroll");
                return (
                  <tr key={e.userId} className="border-t border-line">
                    <td className="px-4 py-2.5">
                      <div className={cn("font-medium text-foreground", off && "text-muted")}>
                        {e.fullName}
                        <span className="ml-1.5 text-xs font-normal text-muted">
                          {e.employeeCode}
                        </span>
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                        <span>
                          {e.resignedAt
                            ? `Nghỉ từ ${formatDate(e.resignedAt)}`
                            : (e.position ?? e.departmentName ?? "—")}
                        </span>
                        {fixed.has(e.userId) && <Badge>Lương khoán</Badge>}
                      </div>
                    </td>
                    {(["attendance", "payroll"] as const).map((kind) => {
                      const allowed = kind === "attendance" ? canAttendance : canPayroll;
                      const key = `${e.userId}:${kind}`;
                      return (
                        <td key={kind} className="px-3 py-2.5 text-center">
                          <span className="inline-flex items-center gap-1.5">
                            <Switch
                              checked={valueOf(e, kind)}
                              disabled={!allowed || (pending && busy === key)}
                              onChange={(ev) => toggle(e, kind, ev.target.checked)}
                              aria-label={`${kind === "attendance" ? "Chấm công" : "Bảng lương"} — ${e.fullName}`}
                              title={allowed ? undefined : "Bạn không có quyền chỉnh mục này"}
                            />
                            {pending && busy === key && (
                              <LoaderCircle className="size-3.5 animate-spin text-muted" />
                            )}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </Dialog>
  );
}
