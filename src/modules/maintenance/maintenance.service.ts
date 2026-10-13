/**
 * ═══════════════════════════════════════════════════════════════
 * Bảo hành sau bàn giao — tầng truy vấn & nghiệp vụ
 * ═══════════════════════════════════════════════════════════════
 * Hai loại việc nằm chung một bảng vì luồng xử lý giống hệt nhau
 * (giao người → đi kiểm tra → ghi kết quả):
 *
 *   SCHEDULED_CHECK  — lịch kiểm tra định kỳ, hệ thống tự sinh theo mốc
 *                      3/6/12 tháng kể từ NGÀY BÀN GIAO (Project.actualEndDate)
 *   CUSTOMER_REQUEST — khách gọi báo hỏng, người trực nhập tay
 *
 * Mốc định kỳ lấy từ bảng system_settings (Giám đốc sửa được), không hard-code.
 *
 * KHÔNG có trường tiền nào trong module này, nên không cần lớp ẩn tiền — nhưng
 * cũng vì thế TUYỆT ĐỐI không viết số tiền vào tiêu đề / ghi chú việc bảo hành:
 * mọi vai trò, kể cả Thiết kế và Thi công, đều đọc được bảng này.
 */

import { addMonths } from "date-fns";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type {
  MaintenanceKind,
  MaintenancePriority,
  MaintenanceStatus,
} from "@/generated/prisma/enums";
import { prisma } from "@/shared/prisma/prisma.service";
import { writeAuditLog } from "@/shared/audit/audit.service";
import {
  notify,
  projectRecipients,
  usersWithPermission,
} from "@/modules/notifications/notifications.service";
import { MAINTENANCE_OPEN_STATUSES } from "@/common/enums";
import { can, type SessionUser } from "@/common/permissions/permissions";
import type {
  CreateCheckInput,
  CreateRequestInput,
  MaintenanceFilter,
  ResolveTaskInput,
  UpdateTaskInput,
} from "@/modules/maintenance/maintenance.schema";

/** Client thường hoặc client trong transaction — chỉ cần đúng các model dùng tới. */
type MaintenanceClient = Pick<
  PrismaClient,
  "maintenanceTask" | "project" | "systemSetting" | "projectMember"
>;

export const MILESTONE_SETTING_KEY = "maintenance.milestones";

/** Mốc mặc định khi chưa ai cấu hình: 3 · 6 · 12 tháng sau bàn giao. */
export const DEFAULT_MILESTONE_MONTHS = [3, 6, 12];

/** Bao nhiêu ngày trước hạn thì coi là "sắp tới hạn" trên Dashboard. */
export const DUE_SOON_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Số ngày còn lại tới hạn — số âm nghĩa là đã quá hạn. */
export function daysUntil(due: Date, now = new Date()): number {
  return Math.ceil((due.getTime() - now.getTime()) / DAY_MS);
}

// ═══════════════════ CẤU HÌNH MỐC ĐỊNH KỲ ═══════════════════

/**
 * Đọc danh sách mốc (tháng) từ system_settings.
 * Dữ liệu hỏng / sai kiểu thì rơi về mặc định thay vì ném lỗi: một dòng cấu
 * hình sai không đáng để cả module bảo hành ngừng hoạt động.
 */
export async function getMilestoneMonths(
  client: MaintenanceClient = prisma,
): Promise<number[]> {
  const row = await client.systemSetting.findUnique({
    where: { key: MILESTONE_SETTING_KEY },
  });
  const raw = (row?.value as { months?: unknown } | null)?.months;
  if (!Array.isArray(raw)) return DEFAULT_MILESTONE_MONTHS;

  const months = raw
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 120);
  if (months.length === 0) return DEFAULT_MILESTONE_MONTHS;

  return [...new Set(months)].sort((a, b) => a - b);
}

/** Ghi lại danh sách mốc + nhật ký. Chỉ gọi sau khi đã kiểm quyền setting.manage. */
export async function setMilestoneMonths(
  user: SessionUser,
  months: number[],
): Promise<void> {
  const before = await getMilestoneMonths();

  await prisma.$transaction(async (tx) => {
    await tx.systemSetting.upsert({
      where: { key: MILESTONE_SETTING_KEY },
      update: { value: { months } },
      create: { key: MILESTONE_SETTING_KEY, value: { months } },
    });
    await writeAuditLog(tx, {
      actorId: user.id,
      action: "MAINTENANCE_SETTING_UPDATE",
      entity: "SystemSetting",
      entityId: MILESTONE_SETTING_KEY,
      before: { months: before },
      after: { months },
    });
  });
}

// ═══════════════════ SINH LỊCH ĐỊNH KỲ ═══════════════════

export type SyncResult = { created: number; shifted: number; cancelled: number };

/**
 * Đồng bộ lịch kiểm tra định kỳ của MỘT dự án theo ngày bàn giao hiện tại.
 *
 * Gọi ở 3 chỗ: khi dự án chuyển sang giai đoạn Bảo hành, khi ai đó sửa ngày
 * bàn giao, và trong script đồng bộ dữ liệu cũ (npm run maintenance:sync).
 * Hàm idempotent — chạy lại nhiều lần không sinh trùng.
 *
 * - Thiếu mốc nào thì tạo mốc đó.
 * - Mốc đã có nhưng CHƯA xử lý xong thì dời hạn theo ngày bàn giao mới: sửa
 *   ngày bàn giao mà lịch đứng im là sai lệch âm thầm, không ai phát hiện ra.
 * - Mốc đã xong / đã bỏ qua / đã xóa thì giữ nguyên — đó là lịch sử.
 *
 * @param opts.cancelOverdueBeyondDays Mốc sinh mới mà đã quá hạn quá số ngày
 *   này thì tạo thẳng ở trạng thái "Bỏ qua" kèm lý do. Dùng khi sinh bù cho dự
 *   án cũ, để không dội một loạt việc quá hạn từ nhiều năm trước lên Dashboard.
 */
export async function syncScheduledChecks(
  client: MaintenanceClient,
  projectId: string,
  opts: { cancelOverdueBeyondDays?: number; now?: Date } = {},
): Promise<SyncResult> {
  const now = opts.now ?? new Date();
  const result: SyncResult = { created: 0, shifted: 0, cancelled: 0 };

  const project = await client.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: { id: true, actualEndDate: true, currentStage: true, status: true },
  });
  // Chưa bàn giao hoặc chưa có ngày bàn giao thì không có gì để tính mốc.
  if (!project?.actualEndDate) return result;
  const handedOver =
    project.currentStage === "HANDOVER" ||
    project.currentStage === "WARRANTY" ||
    project.status === "COMPLETED";
  if (!handedOver) return result;

  const months = await getMilestoneMonths(client);
  const existing = await client.maintenanceTask.findMany({
    where: { projectId, milestoneMonths: { not: null } },
    select: {
      id: true,
      milestoneMonths: true,
      status: true,
      dueDate: true,
      deletedAt: true,
    },
  });
  const byMonth = new Map(existing.map((t) => [t.milestoneMonths!, t]));

  for (const m of months) {
    const dueDate = addMonths(project.actualEndDate, m);
    const current = byMonth.get(m);

    if (!current) {
      const tooOld =
        opts.cancelOverdueBeyondDays !== undefined &&
        daysUntil(dueDate, now) < -opts.cancelOverdueBeyondDays;

      await client.maintenanceTask.create({
        data: {
          projectId,
          kind: "SCHEDULED_CHECK",
          milestoneMonths: m,
          title: `Kiểm tra bảo hành ${m} tháng sau bàn giao`,
          dueDate,
          status: tooOld ? "CANCELLED" : "PENDING",
          resultNote: tooOld
            ? "Mốc đã qua từ trước khi bật tính năng nhắc bảo trì — sinh bù để lưu lịch sử."
            : null,
        },
      });
      result.created += 1;
      if (tooOld) result.cancelled += 1;
      continue;
    }

    // Việc đã đóng hoặc đã xóa là lịch sử — không đụng vào.
    if (current.deletedAt || !MAINTENANCE_OPEN_STATUSES.includes(current.status)) {
      continue;
    }
    if (current.dueDate?.getTime() !== dueDate.getTime()) {
      await client.maintenanceTask.update({
        where: { id: current.id },
        data: { dueDate },
      });
      result.shifted += 1;
    }
  }

  return result;
}

// ═══════════════════ TRUY VẤN ═══════════════════

const taskSelect = {
  id: true,
  projectId: true,
  kind: true,
  title: true,
  description: true,
  milestoneMonths: true,
  dueDate: true,
  reportedAt: true,
  reporterNote: true,
  priority: true,
  status: true,
  assigneeId: true,
  handledAt: true,
  resultNote: true,
  createdAt: true,
  assignee: { select: { id: true, fullName: true } },
  handledBy: { select: { id: true, fullName: true } },
  createdBy: { select: { id: true, fullName: true } },
} as const;

const taskWithProjectSelect = {
  ...taskSelect,
  project: {
    select: {
      id: true,
      code: true,
      name: true,
      customer: { select: { id: true, name: true, phone: true } },
    },
  },
} as const;

export type TaskRow = Prisma.MaintenanceTaskGetPayload<{
  select: typeof taskSelect;
}>;
export type TaskWithProject = Prisma.MaintenanceTaskGetPayload<{
  select: typeof taskWithProjectSelect;
}>;

function findTaskOrNull(id: string) {
  return prisma.maintenanceTask.findFirst({
    where: { id, deletedAt: null },
    select: taskSelect,
  });
}

// ═══════════════════ NGỮ CẢNH PHÂN QUYỀN ═══════════════════

/**
 * memberIds cho can(user, "maintenance.manage", ctx) khi scope là ASSIGNED.
 *
 * Gồm thành viên dự án CỘNG người đang được giao việc: thợ thi công được cử đi
 * bảo hành một dự án cũ thường không nằm trong danh sách thành viên, mà vẫn
 * phải ghi được kết quả kiểm tra.
 */
export async function maintenanceContext(
  projectId: string,
  assigneeId?: string | null,
): Promise<{ memberIds: string[] }> {
  const members = await prisma.projectMember.findMany({
    where: { projectId },
    select: { userId: true },
  });
  const ids = members.map((m) => m.userId);
  if (assigneeId && !ids.includes(assigneeId)) ids.push(assigneeId);
  return { memberIds: ids };
}

/**
 * Trong một danh sách việc, việc nào người này quản được.
 * Gộp một lần truy vấn thành viên thay vì hỏi lại cho từng dòng — trang
 * /maintenance liệt kê 30 dòng của nhiều dự án khác nhau.
 */
export async function manageableTaskIds(
  user: SessionUser,
  tasks: { id: string; projectId: string; assigneeId: string | null }[],
): Promise<Set<string>> {
  if (tasks.length === 0) return new Set();
  // scope ALL — không cần ngữ cảnh.
  if (can(user, "maintenance.manage")) return new Set(tasks.map((t) => t.id));
  // Không có quyền kể cả khi tự mình là "thành viên" → chắc chắn không quản được.
  if (!can(user, "maintenance.manage", { memberIds: [user.id] })) return new Set();

  const memberships = await prisma.projectMember.findMany({
    where: {
      userId: user.id,
      projectId: { in: [...new Set(tasks.map((t) => t.projectId))] },
    },
    select: { projectId: true },
  });
  const mine = new Set(memberships.map((m) => m.projectId));
  return new Set(
    tasks
      .filter((t) => mine.has(t.projectId) || t.assigneeId === user.id)
      .map((t) => t.id),
  );
}

/** Việc + ngữ cảnh quyền của nó. null khi không tìm thấy hoặc đã xóa. */
export async function taskContext(
  taskId: string,
): Promise<{ task: TaskRow; ctx: { memberIds: string[] } } | null> {
  const task = await findTaskOrNull(taskId);
  if (!task) return null;
  return {
    task,
    ctx: await maintenanceContext(task.projectId, task.assigneeId),
  };
}

/** Toàn bộ việc bảo hành của một dự án — dùng ở tab "Bảo hành" trang dự án. */
export function listByProject(projectId: string) {
  return prisma.maintenanceTask.findMany({
    where: { projectId, deletedAt: null },
    select: taskSelect,
    orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
  });
}

export const PAGE_SIZE = 30;

/** Danh sách có lọc + phân trang cho trang /maintenance. */
export async function listTasks(filter: MaintenanceFilter) {
  const where = {
    deletedAt: null,
    project: { is: { deletedAt: null } },
    ...(filter.kind ? { kind: filter.kind } : {}),
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.open ? { status: { in: MAINTENANCE_OPEN_STATUSES } } : {}),
    ...(filter.projectId ? { projectId: filter.projectId } : {}),
    ...(filter.assigneeId ? { assigneeId: filter.assigneeId } : {}),
    ...(filter.q
      ? {
          OR: [
            { title: { contains: filter.q, mode: "insensitive" as const } },
            { description: { contains: filter.q, mode: "insensitive" as const } },
            {
              project: {
                is: {
                  OR: [
                    { code: { contains: filter.q, mode: "insensitive" as const } },
                    { name: { contains: filter.q, mode: "insensitive" as const } },
                  ],
                },
              },
            },
          ],
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.maintenanceTask.count({ where }),
    prisma.maintenanceTask.findMany({
      where,
      select: taskWithProjectSelect,
      // Việc chưa xong lên trước, trong đó việc gấp lên đầu, rồi tới hạn gần nhất.
      orderBy: [
        { status: "asc" },
        { priority: "desc" },
        { dueDate: "asc" },
        { createdAt: "desc" },
      ],
      skip: (filter.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  return {
    total,
    rows,
    page: filter.page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

/** Đếm nhanh theo loại + trạng thái — cho các ô số liệu đầu trang /maintenance. */
export async function countByStatus() {
  const grouped = await prisma.maintenanceTask.groupBy({
    by: ["kind", "status"],
    where: { deletedAt: null, project: { is: { deletedAt: null } } },
    _count: true,
  });
  const count = (kind: MaintenanceKind, statuses: MaintenanceStatus[]) =>
    grouped
      .filter((g) => g.kind === kind && statuses.includes(g.status))
      .reduce((sum, g) => sum + g._count, 0);

  return {
    openRequests: count("CUSTOMER_REQUEST", MAINTENANCE_OPEN_STATUSES),
    doneRequests: count("CUSTOMER_REQUEST", ["DONE"]),
    openChecks: count("SCHEDULED_CHECK", MAINTENANCE_OPEN_STATUSES),
    doneChecks: count("SCHEDULED_CHECK", ["DONE"]),
  };
}

export type AttentionTask = {
  id: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  customerName: string;
  title: string;
  priority: MaintenancePriority;
  status: MaintenanceStatus;
  dueDate: Date | null;
  reportedAt: Date | null;
  assigneeName: string | null;
  /** Số ngày còn lại tới hạn (âm = quá hạn). null khi việc không đặt hạn. */
  daysLeft: number | null;
  /** Số ngày kể từ lúc khách báo — dùng cho đề nghị chưa đặt hạn xử lý. */
  daysOpen: number | null;
};

function toAttention(t: TaskWithProject, now: Date): AttentionTask {
  return {
    id: t.id,
    projectId: t.project.id,
    projectCode: t.project.code,
    projectName: t.project.name,
    customerName: t.project.customer.name,
    title: t.title,
    priority: t.priority,
    status: t.status,
    dueDate: t.dueDate,
    reportedAt: t.reportedAt,
    assigneeName: t.assignee?.fullName ?? null,
    daysLeft: t.dueDate ? daysUntil(t.dueDate, now) : null,
    daysOpen: t.reportedAt
      ? Math.floor((now.getTime() - t.reportedAt.getTime()) / DAY_MS)
      : null,
  };
}

/**
 * DB-04d — khách đề nghị bảo hành mà chưa xử lý xong.
 * Việc gấp lên đầu, rồi tới việc khách báo lâu nhất: để khách chờ càng lâu
 * càng dễ mất khách, nên thứ tự này chính là thứ tự cần gọi người đi xử lý.
 */
export async function openCustomerRequests(
  now = new Date(),
): Promise<AttentionTask[]> {
  const rows = await prisma.maintenanceTask.findMany({
    select: taskWithProjectSelect,
    where: {
      deletedAt: null,
      kind: "CUSTOMER_REQUEST",
      status: { in: MAINTENANCE_OPEN_STATUSES },
      project: { is: { deletedAt: null } },
    },
    orderBy: [{ priority: "desc" }, { reportedAt: "asc" }, { createdAt: "asc" }],
  });
  return rows.map((r) => toAttention(r, now));
}

/** DB-04e — lịch kiểm tra định kỳ đã tới hạn hoặc sắp tới hạn (mặc định 30 ngày). */
export async function checksDueSoon(
  now = new Date(),
  withinDays = DUE_SOON_DAYS,
): Promise<AttentionTask[]> {
  const limit = new Date(now.getTime() + withinDays * DAY_MS);
  const rows = await prisma.maintenanceTask.findMany({
    select: taskWithProjectSelect,
    where: {
      deletedAt: null,
      kind: "SCHEDULED_CHECK",
      status: { in: MAINTENANCE_OPEN_STATUSES },
      dueDate: { lte: limit },
      project: { is: { deletedAt: null } },
    },
    orderBy: [{ dueDate: "asc" }],
  });
  return rows.map((r) => toAttention(r, now));
}

// ═══════════════════ GHI ═══════════════════

/** Khách báo hỏng → tạo đề nghị bảo hành. */
export async function createRequest(
  user: SessionUser,
  input: CreateRequestInput,
): Promise<TaskRow> {
  return prisma.$transaction(async (tx) => {
    const task = await tx.maintenanceTask.create({
      data: {
        projectId: input.projectId,
        kind: "CUSTOMER_REQUEST",
        title: input.title,
        description: input.description ?? null,
        reporterNote: input.reporterNote ?? null,
        reportedAt: input.reportedAt ?? new Date(),
        dueDate: input.dueDate ?? null,
        priority: input.priority,
        assigneeId: input.assigneeId ?? null,
        status: input.assigneeId ? "IN_PROGRESS" : "PENDING",
        createdById: user.id,
      },
      select: taskSelect,
    });
    await writeAuditLog(tx, {
      actorId: user.id,
      action: "MAINTENANCE_CREATE",
      entity: "MaintenanceTask",
      entityId: task.id,
      after: task,
    });

    const project = await tx.project.findUnique({
      where: { id: input.projectId },
      select: { code: true },
    });
    // Người nhận: thành viên dự án + người quản bảo hành toàn công ty
    // (maintenance.manage phạm vi ALL) + người vừa được giao việc.
    await notify(tx, {
      recipientIds: [
        ...(await projectRecipients(tx, input.projectId)),
        ...(await usersWithPermission(tx, "maintenance.manage", {
          scope: "ALL",
        })),
        ...(input.assigneeId ? [input.assigneeId] : []),
      ],
      actorId: user.id,
      type: "MAINTENANCE_REQUEST_NEW",
      title: `Khách đề nghị bảo hành — ${project?.code ?? "dự án"}`,
      body: task.title,
      href: `/projects/${input.projectId}?tab=bao-hanh`,
      entity: "MaintenanceTask",
      entityId: task.id,
    });
    return task;
  });
}

/** Thêm một mốc kiểm tra ngoài lịch tự sinh. */
export async function createCheck(
  user: SessionUser,
  input: CreateCheckInput,
): Promise<TaskRow> {
  return prisma.$transaction(async (tx) => {
    const task = await tx.maintenanceTask.create({
      data: {
        projectId: input.projectId,
        kind: "SCHEDULED_CHECK",
        title: input.title,
        description: input.description ?? null,
        dueDate: input.dueDate,
        assigneeId: input.assigneeId ?? null,
        status: input.assigneeId ? "IN_PROGRESS" : "PENDING",
        createdById: user.id,
      },
      select: taskSelect,
    });
    await writeAuditLog(tx, {
      actorId: user.id,
      action: "MAINTENANCE_CREATE",
      entity: "MaintenanceTask",
      entityId: task.id,
      after: task,
    });
    return task;
  });
}

export async function updateTask(
  user: SessionUser,
  before: TaskRow,
  input: UpdateTaskInput,
): Promise<TaskRow> {
  return prisma.$transaction(async (tx) => {
    const task = await tx.maintenanceTask.update({
      where: { id: input.id },
      data: {
        title: input.title,
        description: input.description ?? null,
        dueDate: input.dueDate ?? null,
        priority: input.priority,
        assigneeId: input.assigneeId ?? null,
      },
      select: taskSelect,
    });
    await writeAuditLog(tx, {
      actorId: user.id,
      action: "MAINTENANCE_UPDATE",
      entity: "MaintenanceTask",
      entityId: task.id,
      before,
      after: task,
    });
    return task;
  });
}

/**
 * Giao / đổi / gỡ người phụ trách. Giao người thì việc tự chuyển sang "Đang xử
 * lý" để danh sách phản ánh đúng thực tế mà không cần thêm một thao tác nữa.
 */
export async function assignTask(
  user: SessionUser,
  before: TaskRow,
  assigneeId: string | null,
): Promise<TaskRow> {
  return prisma.$transaction(async (tx) => {
    const task = await tx.maintenanceTask.update({
      where: { id: before.id },
      data: {
        assigneeId,
        status:
          assigneeId && before.status === "PENDING"
            ? "IN_PROGRESS"
            : !assigneeId && before.status === "IN_PROGRESS"
              ? "PENDING"
              : before.status,
      },
      select: taskSelect,
    });
    await writeAuditLog(tx, {
      actorId: user.id,
      action: "MAINTENANCE_ASSIGN",
      entity: "MaintenanceTask",
      entityId: task.id,
      before: { assigneeId: before.assigneeId, status: before.status },
      after: { assigneeId: task.assigneeId, status: task.status },
    });

    // Chỉ báo khi ĐỔI sang người khác — giao lại đúng người cũ thì im lặng.
    if (assigneeId && assigneeId !== before.assigneeId) {
      const project = await tx.project.findUnique({
        where: { id: before.projectId },
        select: { code: true },
      });
      await notify(tx, {
        recipientIds: [assigneeId],
        actorId: user.id,
        type: "MAINTENANCE_ASSIGNED",
        title: `Bạn được giao xử lý bảo hành — ${project?.code ?? "dự án"}`,
        body: before.title,
        href: `/projects/${before.projectId}?tab=bao-hanh`,
        entity: "MaintenanceTask",
        entityId: task.id,
      });
    }
    return task;
  });
}

/** Đánh dấu đã xử lý xong hoặc bỏ qua, kèm ghi chú kết quả. */
export async function resolveTask(
  user: SessionUser,
  before: TaskRow,
  input: ResolveTaskInput,
): Promise<TaskRow> {
  return prisma.$transaction(async (tx) => {
    const task = await tx.maintenanceTask.update({
      where: { id: before.id },
      data: {
        status: input.status,
        resultNote: input.resultNote ?? null,
        handledById: user.id,
        handledAt: new Date(),
      },
      select: taskSelect,
    });
    await writeAuditLog(tx, {
      actorId: user.id,
      action: "MAINTENANCE_RESOLVE",
      entity: "MaintenanceTask",
      entityId: task.id,
      before: { status: before.status },
      after: { status: task.status, resultNote: task.resultNote },
    });
    return task;
  });
}

/** Mở lại việc đã đóng nhầm — xóa dấu vết xử lý nhưng giữ nguyên nhật ký. */
export async function reopenTask(
  user: SessionUser,
  before: TaskRow,
): Promise<TaskRow> {
  return prisma.$transaction(async (tx) => {
    const task = await tx.maintenanceTask.update({
      where: { id: before.id },
      data: {
        status: before.assigneeId ? "IN_PROGRESS" : "PENDING",
        handledById: null,
        handledAt: null,
      },
      select: taskSelect,
    });
    await writeAuditLog(tx, {
      actorId: user.id,
      action: "MAINTENANCE_REOPEN",
      entity: "MaintenanceTask",
      entityId: task.id,
      before: { status: before.status },
      after: { status: task.status },
    });
    return task;
  });
}

/**
 * Xóa mềm. Giữ bản ghi để tra lại, và cũng để lịch định kỳ KHÔNG tự sinh lại
 * đúng mốc vừa xóa ở lần đồng bộ sau.
 */
export async function softDeleteTask(
  user: SessionUser,
  before: TaskRow,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.maintenanceTask.update({
      where: { id: before.id },
      data: { deletedAt: new Date() },
    });
    await writeAuditLog(tx, {
      actorId: user.id,
      action: "MAINTENANCE_DELETE",
      entity: "MaintenanceTask",
      entityId: before.id,
      before,
    });
  });
}
