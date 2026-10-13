"use client";

import { useActionState, useState } from "react";
import {
  CalendarClock,
  Info,
  LifeBuoy,
  LoaderCircle,
  Plus,
  TriangleAlert,
} from "lucide-react";
import {
  Alert,
  Button,
  Card,
  FormCard,
  FormField,
  Input,
  Select,
  Textarea,
} from "@/components/ui";
import { MAINTENANCE_PRIORITY_LABEL } from "@/common/enums";
import { formatDate } from "@/lib/utils";
import type { MaintenancePriority } from "@/generated/prisma/enums";
import {
  createCheckAction,
  createRequestAction,
  type ActionState,
} from "@/modules/maintenance/maintenance.actions";
import {
  MaintenanceTaskCard,
  type AssignableUser,
  type TaskView,
} from "@/modules/maintenance/components/maintenance-task-card";

const initialState: ActionState = { error: null };

/** "YYYY-MM-DD" của hôm nay theo giờ Việt Nam — mặc định cho ô ngày khách báo. */
function todayInput(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date());
}

type Props = {
  projectId: string;
  /** Ngày bàn giao thực tế — gốc tính mốc định kỳ. */
  handoverDate: Date | null;
  /** Các mốc định kỳ đang cấu hình, tính bằng tháng. */
  milestones: number[];
  tasks: TaskView[];
  assignableUsers: AssignableUser[];
  /** Quyền trên phạm vi dự án — quyết định có hiện nút tạo mới không. */
  canManage: boolean;
  /**
   * Việc mà người xem quản được dù không phải thành viên dự án: họ đang được
   * giao chính việc đó. Thợ thi công cử đi bảo hành một dự án cũ rơi vào ca này.
   */
  manageableTaskIds?: string[];
};

/**
 * Tab "Bảo hành" trong trang dự án.
 *
 * Hai khối tách bạch vì nguồn phát sinh khác nhau: khách gọi báo hỏng (bị động,
 * cần xử lý ngay) và lịch kiểm tra định kỳ do hệ thống tự đặt (chủ động).
 */
export function MaintenanceSection({
  projectId,
  handoverDate,
  milestones,
  tasks,
  assignableUsers,
  canManage,
  manageableTaskIds = [],
}: Props) {
  const canManageTask = (id: string) =>
    canManage || manageableTaskIds.includes(id);
  const [open, setOpen] = useState<null | "request" | "check">(null);
  const [requestState, requestAction, creatingRequest] = useActionState(
    createRequestAction,
    initialState,
  );
  const [checkState, checkAction, creatingCheck] = useActionState(
    createCheckAction,
    initialState,
  );

  const requests = tasks.filter((t) => t.kind === "CUSTOMER_REQUEST");
  const checks = tasks.filter((t) => t.kind === "SCHEDULED_CHECK");
  const openRequests = requests.filter(
    (t) => t.status === "PENDING" || t.status === "IN_PROGRESS",
  ).length;

  return (
    <div className="space-y-8">
      {/* ─────────── KHÁCH ĐỀ NGHỊ BẢO HÀNH ─────────── */}
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="flex items-center gap-2 text-h3 font-semibold text-foreground">
              <LifeBuoy className="size-4" />
              Khách đề nghị bảo hành
            </h3>
            <p className="mt-0.5 text-xs text-muted">
              Khách báo hỏng thì ghi vào đây — việc chưa xử lý sẽ nổi lên mục
              &quot;Việc cần chú ý&quot; ở trang Tổng quan.
              {openRequests > 0 && ` Đang có ${openRequests} việc chưa xong.`}
            </p>
          </div>
          {canManage && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="px-2.5 py-1.5"
              onClick={() => setOpen(open === "request" ? null : "request")}
            >
              <Plus className="size-3.5" />
              Ghi nhận đề nghị
            </Button>
          )}
        </div>

        {canManage && open === "request" && (
          <FormCard
            action={requestAction}
            variant="filled"
            className="mb-4 space-y-3 p-4"
          >
            <Input type="hidden" name="projectId" value={projectId} />

            <FormField label="Khách báo hỏng gì" htmlFor="title">
              <Input
                id="title"
                name="title"
                required
                maxLength={200}
                placeholder="VD: Cánh tủ bếp bị xệ, bản lề kêu"
              />
            </FormField>

            <FormField label="Mô tả chi tiết" htmlFor="description">
              <Textarea
                id="description"
                name="description"
                rows={3}
                maxLength={2000}
                placeholder="Vị trí, mức độ hư hỏng, khách hẹn thời gian nào tiện..."
              />
            </FormField>

            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Ngày khách báo" htmlFor="reportedAt">
                <Input
                  id="reportedAt"
                  name="reportedAt"
                  type="date"
                  defaultValue={todayInput()}
                />
              </FormField>

              <FormField
                label="Mức độ"
                htmlFor="priority"
                hint="Chọn Gấp thì việc được đẩy lên đầu trang Tổng quan"
              >
                <Select id="priority" name="priority" defaultValue="NORMAL">
                  {(
                    Object.entries(MAINTENANCE_PRIORITY_LABEL) as [
                      MaintenancePriority,
                      string,
                    ][]
                  ).map(([code, label]) => (
                    <option key={code} value={code}>
                      {label}
                    </option>
                  ))}
                </Select>
              </FormField>

              <FormField
                label="Người báo bên khách"
                htmlFor="reporterNote"
                hint="Tên + số điện thoại người gọi, nếu khác chủ nhà"
              >
                <Input
                  id="reporterNote"
                  name="reporterNote"
                  maxLength={200}
                  placeholder="VD: Chị Lan 09xx xxx xxx"
                />
              </FormField>

              <FormField label="Hẹn xử lý trước ngày" htmlFor="dueDate">
                <Input id="dueDate" name="dueDate" type="date" />
              </FormField>
            </div>

            <FormField
              label="Giao cho"
              htmlFor="assigneeId"
              hint="Để trống nếu chưa chọn được người đi kiểm tra"
            >
              <Select id="assigneeId" name="assigneeId" defaultValue="">
                <option value="">— Chưa giao ai —</option>
                {assignableUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName}
                  </option>
                ))}
              </Select>
            </FormField>

            {requestState.error && (
              <Alert variant="danger" className="flex items-start gap-2 text-xs">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                <span>{requestState.error}</span>
              </Alert>
            )}

            <div className="flex gap-2">
              <Button type="submit" disabled={creatingRequest} className="px-4 py-2">
                {creatingRequest && <LoaderCircle className="size-4 animate-spin" />}
                Lưu đề nghị
              </Button>
              <Button
                type="button"
                variant="outline"
                className="px-4 py-2"
                onClick={() => setOpen(null)}
              >
                Hủy
              </Button>
            </div>
          </FormCard>
        )}

        {requests.length === 0 ? (
          <Card variant="filled" className="p-4 text-sm text-muted">
            Chưa có đề nghị bảo hành nào từ khách.
          </Card>
        ) : (
          <div className="space-y-3">
            {requests.map((t) => (
              <MaintenanceTaskCard
                key={t.id}
                task={t}
                canManage={canManageTask(t.id)}
                assignableUsers={assignableUsers}
              />
            ))}
          </div>
        )}
      </section>

      {/* ─────────── LỊCH KIỂM TRA ĐỊNH KỲ ─────────── */}
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="flex items-center gap-2 text-h3 font-semibold text-foreground">
              <CalendarClock className="size-4" />
              Lịch kiểm tra định kỳ
            </h3>
            <p className="mt-0.5 text-xs text-muted">
              Hệ thống tự đặt các mốc {milestones.join(" · ")} tháng kể từ ngày
              bàn giao.
            </p>
          </div>
          {canManage && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="px-2.5 py-1.5"
              onClick={() => setOpen(open === "check" ? null : "check")}
            >
              <Plus className="size-3.5" />
              Thêm mốc kiểm tra
            </Button>
          )}
        </div>

        {!handoverDate && (
          <Alert variant="info" className="mb-3 flex items-start gap-2 text-sm">
            <Info className="mt-0.5 size-4 shrink-0" />
            <span>
              Dự án chưa có <strong>ngày bàn giao thực tế</strong> nên chưa tính
              được mốc kiểm tra. Ngày này được điền tự động khi dự án chuyển sang
              giai đoạn Bảo hành, hoặc nhập tay ở màn hình sửa dự án.
            </span>
          </Alert>
        )}
        {handoverDate && (
          <p className="mb-3 text-xs text-muted">
            Ngày bàn giao: <strong>{formatDate(handoverDate)}</strong>
          </p>
        )}

        {canManage && open === "check" && (
          <FormCard
            action={checkAction}
            variant="filled"
            className="mb-4 space-y-3 p-4"
          >
            <Input type="hidden" name="projectId" value={projectId} />

            <FormField label="Nội dung kiểm tra" htmlFor="check-title">
              <Input
                id="check-title"
                name="title"
                required
                maxLength={200}
                placeholder="VD: Kiểm tra chống thấm nhà tắm"
              />
            </FormField>

            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Ngày kiểm tra" htmlFor="check-dueDate">
                <Input id="check-dueDate" name="dueDate" type="date" required />
              </FormField>

              <FormField label="Giao cho" htmlFor="check-assigneeId">
                <Select id="check-assigneeId" name="assigneeId" defaultValue="">
                  <option value="">— Chưa giao ai —</option>
                  {assignableUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.fullName}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>

            <FormField label="Ghi chú" htmlFor="check-description">
              <Textarea
                id="check-description"
                name="description"
                rows={2}
                maxLength={2000}
              />
            </FormField>

            {checkState.error && (
              <Alert variant="danger" className="flex items-start gap-2 text-xs">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                <span>{checkState.error}</span>
              </Alert>
            )}

            <div className="flex gap-2">
              <Button type="submit" disabled={creatingCheck} className="px-4 py-2">
                {creatingCheck && <LoaderCircle className="size-4 animate-spin" />}
                Thêm mốc
              </Button>
              <Button
                type="button"
                variant="outline"
                className="px-4 py-2"
                onClick={() => setOpen(null)}
              >
                Hủy
              </Button>
            </div>
          </FormCard>
        )}

        {checks.length === 0 ? (
          <Card variant="filled" className="p-4 text-sm text-muted">
            Chưa có mốc kiểm tra nào.
          </Card>
        ) : (
          <div className="space-y-3">
            {checks.map((t) => (
              <MaintenanceTaskCard
                key={t.id}
                task={t}
                canManage={canManageTask(t.id)}
                assignableUsers={assignableUsers}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
