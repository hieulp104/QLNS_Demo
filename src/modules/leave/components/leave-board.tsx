"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CalendarPlus,
  Check,
  LoaderCircle,
  TriangleAlert,
  X,
} from "lucide-react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  FormCard,
  FormField,
  Input,
  Pagination,
  Select,
  TabButton,
  Tabs,
  TabsList,
  Textarea,
} from "@/components/ui";
import {
  LEAVE_STATUS_LABEL,
  LEAVE_TYPES,
  LEAVE_TYPE_LABEL,
} from "@/common/enums";
import { formatDate } from "@/lib/utils";
import type { LeaveStatus, LeaveType } from "@/generated/prisma/enums";
import {
  cancelLeaveAction,
  createLeaveAction,
  decideLeaveAction,
  type ActionState,
} from "@/modules/leave/leave.actions";

const initialState: ActionState = { error: null };

const STATUS_VARIANT: Record<LeaveStatus, "warning" | "success" | "danger" | "info"> =
  {
    PENDING: "warning",
    APPROVED: "success",
    REJECTED: "danger",
    CANCELLED: "info",
  };

export type LeaveRow = {
  id: string;
  type: LeaveType;
  fromDate: Date;
  toDate: Date;
  halfDay: boolean;
  dayCount: number;
  reason: string;
  status: LeaveStatus;
  decisionNote: string | null;
  decidedAt: Date | null;
  createdAt: Date;
  userId: string;
  userName: string;
  departmentName: string | null;
  approverName: string | null;
  canDecide: boolean;
  canCancel: boolean;
};

/** "YYYY-MM-DD" hôm nay theo giờ Việt Nam. */
function todayInput(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date());
}

function DecideForm({ row }: { row: LeaveRow }) {
  const [mode, setMode] = useState<null | "approve" | "reject">(null);
  const [state, formAction, pending] = useActionState(
    decideLeaveAction,
    initialState,
  );

  if (!mode) {
    return (
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          className="px-2.5 py-1.5"
          onClick={() => setMode("approve")}
        >
          <Check className="size-3.5" />
          Duyệt
        </Button>
        <Button
          type="button"
          variant="dangerOutline"
          size="sm"
          className="px-2.5 py-1.5"
          onClick={() => setMode("reject")}
        >
          <X className="size-3.5" />
          Từ chối
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-2">
      <Input type="hidden" name="id" value={row.id} />
      <Input
        type="hidden"
        name="status"
        value={mode === "approve" ? "APPROVED" : "REJECTED"}
      />
      <Textarea
        name="decisionNote"
        rows={2}
        maxLength={500}
        placeholder={
          mode === "approve"
            ? "Ghi chú (không bắt buộc)"
            : "Lý do từ chối (bắt buộc)"
        }
      />
      {state.error && (
        <Alert variant="danger" className="flex items-start gap-2 text-xs">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
          <span>{state.error}</span>
        </Alert>
      )}
      <div className="flex gap-2">
        <Button
          type="submit"
          size="sm"
          variant={mode === "approve" ? "primary" : "danger"}
          className="px-3 py-1.5"
          disabled={pending}
        >
          {pending && <LoaderCircle className="size-3.5 animate-spin" />}
          {mode === "approve" ? "Xác nhận duyệt" : "Xác nhận từ chối"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="px-3 py-1.5"
          onClick={() => setMode(null)}
        >
          Hủy
        </Button>
      </div>
      {mode === "approve" && (
        <p className="text-xs text-muted">
          Duyệt xong hệ thống tự điền ký hiệu nghỉ vào bảng chấm công những ngày
          này (bỏ qua chủ nhật).
        </p>
      )}
    </form>
  );
}

/** Trang /nghi-phep: nộp đơn, xem đơn, duyệt đơn. */
export function LeaveBoard({
  rows,
  page,
  pageCount,
  total,
  pendingCount,
  canApproveAny,
  currentUserId,
}: {
  rows: LeaveRow[];
  page: number;
  pageCount: number;
  total: number;
  pendingCount: number;
  canApproveAny: boolean;
  currentUserId: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [creating, setCreating] = useState(false);
  const [busy, startTransition] = useTransition();
  const [rowError, setRowError] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState(
    createLeaveAction,
    initialState,
  );

  const mineOnly = params.get("mine") === "1";
  const status = params.get("status") ?? "";

  function go(next: URLSearchParams) {
    const qs = next.toString();
    router.push(qs ? `/nghi-phep?${qs}` : "/nghi-phep");
  }

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    go(next);
  }

  function cancel(id: string) {
    setRowError(null);
    startTransition(async () => {
      const res = await cancelLeaveAction(id);
      if (!res.ok) setRowError(res.error);
      else router.refresh();
    });
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <Tabs>
          <TabsList>
            <TabButton active={!mineOnly} onClick={() => setParam("mine", "")}>
              {canApproveAny ? "Cần duyệt & tất cả" : "Tất cả"}
              {pendingCount > 0 && (
                <Badge variant="warning" className="ml-2">
                  {pendingCount} chờ duyệt
                </Badge>
              )}
            </TabButton>
            <TabButton active={mineOnly} onClick={() => setParam("mine", "1")}>
              Đơn của tôi
            </TabButton>
          </TabsList>
        </Tabs>

        <Select
          value={status}
          onChange={(e) => setParam("status", e.target.value)}
          className="w-[11rem]"
        >
          <option value="">Mọi trạng thái</option>
          {(
            Object.entries(LEAVE_STATUS_LABEL) as [LeaveStatus, string][]
          ).map(([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </Select>

        <Button
          type="button"
          className="ml-auto px-3 py-2"
          onClick={() => setCreating((v) => !v)}
        >
          <CalendarPlus className="size-4" />
          Xin nghỉ
        </Button>
      </div>

      {creating && (
        <FormCard action={formAction} variant="filled" className="mb-5 space-y-3 p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <FormField label="Loại nghỉ" htmlFor="type">
              <Select id="type" name="type" defaultValue="UNPAID">
                {LEAVE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {LEAVE_TYPE_LABEL[t]}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Từ ngày" htmlFor="fromDate">
              <Input
                id="fromDate"
                name="fromDate"
                type="date"
                required
                defaultValue={todayInput()}
              />
            </FormField>
            <FormField label="Đến ngày" htmlFor="toDate">
              <Input
                id="toDate"
                name="toDate"
                type="date"
                required
                defaultValue={todayInput()}
              />
            </FormField>
            <FormField label="Nghỉ nửa ngày" htmlFor="halfDay">
              <label className="flex h-10 items-center gap-2 text-sm text-foreground">
                <Checkbox id="halfDay" name="halfDay" />
                Chỉ nghỉ nửa ngày
              </label>
            </FormField>
          </div>

          <FormField label="Lý do" htmlFor="reason">
            <Textarea
              id="reason"
              name="reason"
              rows={2}
              required
              maxLength={500}
              placeholder="VD: Về quê có việc gia đình"
            />
          </FormField>

          {state.error && (
            <Alert variant="danger" className="flex items-start gap-2 text-xs">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              <span>{state.error}</span>
            </Alert>
          )}

          <div className="flex gap-2">
            <Button type="submit" disabled={pending} className="px-4 py-2">
              {pending && <LoaderCircle className="size-4 animate-spin" />}
              Gửi đơn
            </Button>
            <Button
              type="button"
              variant="outline"
              className="px-4 py-2"
              onClick={() => setCreating(false)}
            >
              Đóng
            </Button>
          </div>
          <p className="text-xs text-muted">
            Đơn gửi xong sẽ báo cho trưởng phòng của bạn và Giám đốc. Chủ nhật
            không tính vào số ngày nghỉ.
          </p>
        </FormCard>
      )}

      {rowError && (
        <Alert variant="danger" className="mb-3 flex items-start gap-2 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>{rowError}</span>
        </Alert>
      )}

      {rows.length === 0 ? (
        <Card variant="filled" className="p-6 text-sm text-muted">
          Chưa có đơn nghỉ phép nào.
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <Card key={row.id} className="space-y-3 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={STATUS_VARIANT[row.status]}>
                  {LEAVE_STATUS_LABEL[row.status]}
                </Badge>
                <Badge variant="info">{LEAVE_TYPE_LABEL[row.type]}</Badge>
                <Badge variant="info">
                  {row.dayCount} ngày{row.halfDay ? " (nửa ngày)" : ""}
                </Badge>
                <span className="text-sm font-medium text-foreground">
                  {row.userId === currentUserId ? "Bạn" : row.userName}
                  {row.departmentName ? ` · ${row.departmentName}` : ""}
                </span>
              </div>

              <div className="text-sm text-foreground">
                {formatDate(row.fromDate)} → {formatDate(row.toDate)}
                <p className="mt-1 text-sm text-muted">{row.reason}</p>
                {row.status !== "PENDING" && (
                  <p className="mt-1 text-xs text-muted">
                    {row.approverName
                      ? `${row.approverName} xử lý ${formatDate(row.decidedAt)}`
                      : "Đã xử lý"}
                    {row.decisionNote ? ` — ${row.decisionNote}` : ""}
                  </p>
                )}
              </div>

              {row.canDecide && <DecideForm row={row} />}

              {row.canCancel && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="px-2.5 py-1.5"
                  disabled={busy}
                  onClick={() => cancel(row.id)}
                >
                  {busy && <LoaderCircle className="size-3.5 animate-spin" />}
                  Hủy đơn
                </Button>
              )}
            </Card>
          ))}
        </div>
      )}

      {pageCount > 1 && (
        <div className="mt-5 flex items-center justify-between gap-3 text-sm">
          <p className="text-muted">{total} đơn</p>
          <Pagination
            page={page}
            pageCount={pageCount}
            onPageChange={(p) => {
              const next = new URLSearchParams(params);
              if (p <= 1) next.delete("page");
              else next.set("page", String(p));
              go(next);
            }}
            ariaLabel="Phân trang đơn nghỉ phép"
          />
        </div>
      )}
    </>
  );
}
