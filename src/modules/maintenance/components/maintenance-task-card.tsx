"use client";

import { useActionState, useState } from "react";
import {
  CalendarClock,
  CheckCheck,
  LoaderCircle,
  RotateCcw,
  Trash2,
  TriangleAlert,
  UserRound,
} from "lucide-react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Input,
  Select,
  TextLink,
  Textarea,
} from "@/components/ui";
import {
  MAINTENANCE_PRIORITY_LABEL,
  MAINTENANCE_STATUS_LABEL,
} from "@/common/enums";
import { formatDate } from "@/lib/utils";
import type {
  MaintenanceKind,
  MaintenancePriority,
  MaintenanceStatus,
} from "@/generated/prisma/enums";
import {
  assignTaskAction,
  deleteTaskAction,
  reopenTaskAction,
  resolveTaskAction,
  type ActionState,
} from "@/modules/maintenance/maintenance.actions";

const initialState: ActionState = { error: null };

export type TaskView = {
  id: string;
  projectId: string;
  kind: MaintenanceKind;
  title: string;
  description: string | null;
  milestoneMonths: number | null;
  dueDate: Date | null;
  reportedAt: Date | null;
  reporterNote: string | null;
  priority: MaintenancePriority;
  status: MaintenanceStatus;
  assigneeId: string | null;
  assignee: { id: string; fullName: string } | null;
  handledBy: { id: string; fullName: string } | null;
  handledAt: Date | null;
  resultNote: string | null;
  createdAt: Date;
  /** Chỉ có ở trang /maintenance — tab trong dự án không cần lặp lại tên dự án. */
  project?: { id: string; code: string; name: string; customerName: string };
};

export type AssignableUser = { id: string; fullName: string };

const DAY_MS = 24 * 60 * 60 * 1000;

function daysLeftOf(due: Date): number {
  return Math.ceil((new Date(due).getTime() - Date.now()) / DAY_MS);
}

const STATUS_VARIANT: Record<
  MaintenanceStatus,
  "info" | "warning" | "success" | "danger"
> = {
  PENDING: "warning",
  IN_PROGRESS: "info",
  DONE: "success",
  CANCELLED: "info",
};

/** Nhãn hạn xử lý kèm mức độ trễ — trống hạn thì không bịa ra con số nào. */
function DueBadge({ dueDate, closed }: { dueDate: Date; closed: boolean }) {
  const left = daysLeftOf(dueDate);
  if (closed) {
    return (
      <Badge variant="info">
        <CalendarClock className="size-3.5" />
        Hạn {formatDate(dueDate)}
      </Badge>
    );
  }
  return (
    <Badge variant={left < 0 ? "danger" : left <= 7 ? "warning" : "info"}>
      <CalendarClock className="size-3.5" />
      {left < 0
        ? `Quá hạn ${-left} ngày (${formatDate(dueDate)})`
        : `Còn ${left} ngày (${formatDate(dueDate)})`}
    </Badge>
  );
}

/**
 * Một việc bảo hành: đề nghị của khách hoặc mốc kiểm tra định kỳ.
 * Dùng chung cho tab "Bảo hành" trong dự án và trang /maintenance.
 */
export function MaintenanceTaskCard({
  task,
  canManage,
  assignableUsers,
}: {
  task: TaskView;
  canManage: boolean;
  assignableUsers: AssignableUser[];
}) {
  const [mode, setMode] = useState<null | "assign" | "resolve" | "cancel">(null);
  const [assignState, assignAction, assigning] = useActionState(
    assignTaskAction,
    initialState,
  );
  const [resolveState, resolveAction, resolving] = useActionState(
    resolveTaskAction,
    initialState,
  );
  const [rowError, setRowError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const closed = task.status === "DONE" || task.status === "CANCELLED";
  const isRequest = task.kind === "CUSTOMER_REQUEST";
  const urgent = task.priority === "URGENT" && !closed;

  async function runReopen() {
    setBusy(true);
    setRowError(null);
    const res = await reopenTaskAction(task.id);
    if (!res.ok) setRowError(res.error);
    setBusy(false);
  }

  async function runDelete() {
    if (!window.confirm(`Xóa việc bảo hành "${task.title}"?`)) return;
    setBusy(true);
    setRowError(null);
    const res = await deleteTaskAction(task.id);
    if (!res.ok) setRowError(res.error);
    setBusy(false);
  }

  return (
    <Card
      variant={urgent ? "danger" : closed ? "filled" : "default"}
      className="space-y-3 p-4"
    >
      {/* ── Dòng nhãn ── */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={STATUS_VARIANT[task.status]}>
          {MAINTENANCE_STATUS_LABEL[task.status]}
        </Badge>
        {urgent && (
          <Badge variant="danger">
            <TriangleAlert className="size-3.5" />
            {MAINTENANCE_PRIORITY_LABEL.URGENT}
          </Badge>
        )}
        {task.milestoneMonths !== null && (
          <Badge variant="info">Mốc {task.milestoneMonths} tháng</Badge>
        )}
        {task.dueDate && <DueBadge dueDate={task.dueDate} closed={closed} />}
        {task.assignee ? (
          <Badge variant="success">
            <UserRound className="size-3.5" />
            {task.assignee.fullName}
          </Badge>
        ) : (
          !closed && <Badge variant="warning">Chưa giao ai</Badge>
        )}
      </div>

      {/* ── Nội dung ── */}
      <div>
        <p className="font-medium text-foreground">{task.title}</p>
        {task.project && (
          <p className="mt-0.5 text-xs text-muted">
            <TextLink href={`/projects/${task.project.id}`}>
              {task.project.code} · {task.project.name}
            </TextLink>
            {" · khách "}
            {task.project.customerName}
          </p>
        )}
        {task.description && (
          <p className="mt-1.5 whitespace-pre-line text-sm text-muted">
            {task.description}
          </p>
        )}
        <p className="mt-1.5 text-xs text-muted">
          {isRequest
            ? `Khách báo ngày ${formatDate(task.reportedAt)}`
            : `Tạo ngày ${formatDate(task.createdAt)}`}
          {task.reporterNote ? ` · Người báo: ${task.reporterNote}` : ""}
        </p>
        {closed && (
          <p className="mt-1.5 text-xs text-muted">
            {task.handledBy
              ? `${task.handledBy.fullName} xử lý ngày ${formatDate(task.handledAt)}`
              : "Đã đóng"}
            {task.resultNote ? ` — ${task.resultNote}` : ""}
          </p>
        )}
      </div>

      {(rowError || assignState.error || resolveState.error) && (
        <Alert variant="danger" className="flex items-start gap-2 text-xs">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
          <span>{rowError ?? assignState.error ?? resolveState.error}</span>
        </Alert>
      )}

      {/* ── Thao tác ── */}
      {canManage && (
        <div className="flex flex-wrap gap-2">
          {!closed && (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="px-2.5 py-1.5"
                onClick={() => setMode(mode === "assign" ? null : "assign")}
              >
                <UserRound className="size-3.5" />
                {task.assignee ? "Đổi người phụ trách" : "Giao người xử lý"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="px-2.5 py-1.5"
                onClick={() => setMode(mode === "resolve" ? null : "resolve")}
              >
                <CheckCheck className="size-3.5" />
                Đã xử lý xong
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="px-2.5 py-1.5"
                onClick={() => setMode(mode === "cancel" ? null : "cancel")}
              >
                Bỏ qua
              </Button>
            </>
          )}
          {closed && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="px-2.5 py-1.5"
              disabled={busy}
              onClick={runReopen}
            >
              {busy ? (
                <LoaderCircle className="size-3.5 animate-spin" />
              ) : (
                <RotateCcw className="size-3.5" />
              )}
              Mở lại
            </Button>
          )}
          <Button
            type="button"
            variant="dangerGhost"
            size="sm"
            className="px-2.5 py-1.5"
            disabled={busy}
            onClick={runDelete}
          >
            <Trash2 className="size-3.5" />
            Xóa
          </Button>
        </div>
      )}

      {/* ── Giao người phụ trách ── */}
      {canManage && mode === "assign" && (
        <form action={assignAction} className="flex flex-col gap-2 sm:flex-row">
          <Input type="hidden" name="id" value={task.id} />
          <Select
            name="assigneeId"
            defaultValue={task.assigneeId ?? ""}
            className="flex-1 px-3 py-2"
          >
            <option value="">— Chưa giao ai —</option>
            {assignableUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.fullName}
              </option>
            ))}
          </Select>
          <Button type="submit" disabled={assigning} className="px-4 py-2">
            {assigning && <LoaderCircle className="size-4 animate-spin" />}
            Lưu
          </Button>
        </form>
      )}

      {/* ── Đóng việc: đã xử lý xong hoặc bỏ qua ── */}
      {canManage && (mode === "resolve" || mode === "cancel") && (
        <form action={resolveAction} className="space-y-2">
          <Input type="hidden" name="id" value={task.id} />
          <Input
            type="hidden"
            name="status"
            value={mode === "resolve" ? "DONE" : "CANCELLED"}
          />
          <Textarea
            name="resultNote"
            rows={2}
            maxLength={2000}
            placeholder={
              mode === "resolve"
                ? "Kết quả kiểm tra / sửa chữa (không bắt buộc)"
                : "Lý do bỏ qua (bắt buộc)"
            }
          />
          <div className="flex gap-2">
            <Button type="submit" disabled={resolving} className="px-4 py-2">
              {resolving && <LoaderCircle className="size-4 animate-spin" />}
              {mode === "resolve" ? "Xác nhận đã xử lý" : "Xác nhận bỏ qua"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="px-4 py-2"
              onClick={() => setMode(null)}
            >
              Hủy
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
