/**
 * Tầng truy vấn & nghiệp vụ module Dự án — module trung tâm của hệ thống.
 *
 * HAI RÀNG BUỘC QUAN TRỌNG được xử lý tại đây:
 *  1. ẨN TIỀN: `estimatedValue` bị loại BỎ ở tầng server cho người không có
 *     finance.view (phòng Thiết kế / Thi công). Xem `stripMoney()`.
 *  2. SCOPE ASSIGNED: quyền sửa/chuyển-giai-đoạn/upload dựa trên việc user có là
 *     thành viên dự án không → `memberIdsOf()` cấp ngữ cảnh cho `can()`.
 */

import { prisma } from "@/shared/prisma/prisma.service";
import { writeAuditLog } from "@/shared/audit/audit.service";
import { syncScheduledChecks } from "@/modules/maintenance/maintenance.service";
import {
  notify,
  projectRecipients,
} from "@/modules/notifications/notifications.service";
import { canSeeMoney, type SessionUser } from "@/common/permissions/permissions";
import { MEMBER_AREA_LABEL, STAGE_LABEL, STAGE_ORDER } from "@/common/enums";
import type {
  ChangeStageInput,
  CreateProjectInput,
  ProjectFilter,
  UpdateProjectInput,
} from "@/modules/projects/projects.schema";
import { contractValueTotalsByProject } from "@/modules/contracts/contracts.service";

/** userId của mọi thành viên dự án — dùng làm ctx cho can(..., { memberIds }). */
export async function memberIdsOf(projectId: string): Promise<string[]> {
  const members = await prisma.projectMember.findMany({
    where: { projectId },
    select: { userId: true },
  });
  return [...new Set(members.map((m) => m.userId))];
}

/**
 * Bỏ trường tiền nếu user không được xem. Decimal → string để truyền xuống client
 * an toàn (Decimal không serialize thẳng qua ranh giới server/client).
 */
function stripMoney<T extends { estimatedValue: unknown }>(
  row: T,
  user: SessionUser,
  contractValueTotal: string | null = null,
): Omit<T, "estimatedValue"> & {
  estimatedValue: string | null;
  displayEstimatedValue: string | null;
} {
  const canSee = canSeeMoney(user);
  const raw = row.estimatedValue;
  const estimatedValue = canSee && raw != null ? String(raw) : null;
  return {
    ...row,
    estimatedValue,
    displayEstimatedValue: canSee
      ? (estimatedValue ?? contractValueTotal)
      : null,
  };
}

const listSelect = {
  id: true,
  code: true,
  name: true,
  type: true,
  propertyType: true,
  currentStage: true,
  status: true,
  estimatedValue: true,
  expectedEndDate: true,
  createdAt: true,
  customer: { select: { id: true, name: true } },
  _count: { select: { members: true } },
} as const;

/** Kiểu một dòng trong danh sách dự án — suy ra từ chính hàm listProjects. */
export type ProjectListItem = Awaited<ReturnType<typeof listProjects>>[number];

/**
 * PJ-01 — danh sách dự án. PJ-15 đã chốt: MỌI nhân viên xem MỌI dự án, không
 * giới hạn phòng ban, nên không lọc theo scope — chỉ lọc theo bộ lọc người dùng.
 */
export async function listProjects(user: SessionUser, filter: ProjectFilter = {}) {
  const q = filter.q?.trim();

  // Lọc theo tháng của "Hạn dự kiến" (cột ngày hiển thị trong danh sách) —
  // "YYYY-MM" → khoảng [đầu tháng, đầu tháng sau) theo UTC.
  let monthRange: { gte: Date; lt: Date } | undefined;
  if (filter.month) {
    const [y, m] = filter.month.split("-").map(Number);
    monthRange = {
      gte: new Date(Date.UTC(y, m - 1, 1)),
      lt: new Date(Date.UTC(y, m, 1)),
    };
  }

  const rows = await prisma.project.findMany({
    where: {
      deletedAt: null,
      ...(filter.stage ? { currentStage: filter.stage } : {}),
      ...(filter.type ? { type: filter.type } : {}),
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.customerId ? { customerId: filter.customerId } : {}),
      ...(monthRange ? { expectedEndDate: monthRange } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { code: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    select: listSelect,
  });

  const contractTotals = canSeeMoney(user)
    ? await contractValueTotalsByProject(rows.map((row) => row.id))
    : new Map<string, string>();

  return rows.map((r) =>
    stripMoney(r, user, contractTotals.get(r.id) ?? null),
  );
}

/** PJ-04 — chi tiết dự án đầy đủ cho 6 tab. Cũng ẩn tiền theo quyền. */
export async function getProject(
  user: SessionUser,
  id: string,
  options: { withContractFallback?: boolean } = {},
) {
  const [project, contractTotals] = await Promise.all([
    prisma.project.findFirst({
      where: { id, deletedAt: null },
      select: {
        ...listSelect,
        address: true,
        description: true,
        startDate: true,
        actualEndDate: true,
        customer: {
          select: { id: true, name: true, code: true, phone: true },
        },
        createdBy: { select: { fullName: true } },
        members: {
          orderBy: { addedAt: "asc" },
          select: {
            id: true,
            area: true,
            user: {
              select: {
                id: true,
                fullName: true,
                email: true,
                department: { select: { code: true } },
              },
            },
          },
        },
        stageLogs: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            fromStage: true,
            toStage: true,
            note: true,
            createdAt: true,
            changedBy: { select: { fullName: true } },
          },
        },
        comments: {
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            content: true,
            createdAt: true,
            author: { select: { id: true, fullName: true } },
          },
        },
        files: {
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            fileName: true,
            objectKey: true,
            mimeType: true,
            sizeBytes: true,
            kind: true,
            caption: true,
            createdAt: true,
            uploadedBy: { select: { fullName: true } },
          },
        },
      },
    }),
    canSeeMoney(user) && options.withContractFallback
      ? contractValueTotalsByProject([id])
      : Promise.resolve(new Map<string, string>()),
  ]);

  if (!project) return null;

  // BigInt sizeBytes → string cho client; tiền xử lý qua stripMoney.
  const files = project.files.map((f) => ({
    ...f,
    sizeBytes: String(f.sizeBytes),
  }));

  return {
    ...stripMoney(
      { ...project, files },
      user,
      contractTotals.get(id) ?? null,
    ),
  };
}

/** Số thứ tự kế tiếp cho mã dự án TN-{năm}-{stt}. */
async function nextProjectCode(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `TN-${year}-`;
  const last = await prisma.project.findFirst({
    where: { code: { startsWith: prefix } },
    orderBy: { code: "desc" },
    select: { code: true },
  });
  const lastNumber = last ? Number(last.code.slice(prefix.length)) : 0;
  return `${prefix}${String(lastNumber + 1).padStart(3, "0")}`;
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string })?.code === "P2002";
}

/**
 * PJ-02 / PJ-03 — tạo dự án. Mã tự sinh, xử lý race condition bằng retry khi
 * trùng (2 người tạo cùng lúc nhận cùng số → bắt P2002, sinh số kế tiếp).
 * Người tạo được tự động add làm thành viên mảng Sales để có quyền ASSIGNED.
 */
export async function createProject(
  user: SessionUser,
  input: CreateProjectInput,
): Promise<{ id: string; code: string }> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = await nextProjectCode();
    try {
      return await prisma.$transaction(async (tx) => {
        const project = await tx.project.create({
          data: {
            code,
            name: input.name,
            customerId: input.customerId,
            type: input.type,
            propertyType: input.propertyType,
            estimatedValue: input.estimatedValue ?? null,
            address: input.address ?? null,
            description: input.description ?? null,
            expectedEndDate: input.expectedEndDate ?? null,
            createdById: user.id,
          },
          select: { id: true, code: true },
        });

        // Ghi mốc khởi tạo vào lịch sử giai đoạn (from = null → INTAKE).
        await tx.stageLog.create({
          data: {
            projectId: project.id,
            fromStage: null,
            toStage: "INTAKE",
            changedById: user.id,
            note: "Khởi tạo dự án",
          },
        });

        await writeAuditLog(tx, {
          actorId: user.id,
          action: "PROJECT_CREATE",
          entity: "Project",
          entityId: project.id,
          after: {
            code: project.code,
            name: input.name,
            customerId: input.customerId,
            type: input.type,
          },
        });

        return project;
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // Trùng mã → thử số kế tiếp.
    }
  }
  throw new Error("Không sinh được mã dự án sau nhiều lần thử");
}

/** PJ-05 — sửa thông tin. `keepMoney=false` thì bỏ qua estimatedValue (TK/TC). */
export async function updateProject(
  user: SessionUser,
  input: UpdateProjectInput,
  keepMoney: boolean,
): Promise<{ ok: true } | { ok: false; reason: "NOT_FOUND" }> {
  const before = await prisma.project.findFirst({
    where: { id: input.id, deletedAt: null },
    select: {
      id: true,
      name: true,
      status: true,
      propertyType: true,
      actualEndDate: true,
    },
  });
  if (!before) return { ok: false, reason: "NOT_FOUND" };

  await prisma.$transaction(async (tx) => {
    await tx.project.update({
      where: { id: input.id },
      data: {
        name: input.name,
        propertyType: input.propertyType,
        address: input.address ?? null,
        description: input.description ?? null,
        status: input.status,
        startDate: input.startDate ?? null,
        expectedEndDate: input.expectedEndDate ?? null,
        actualEndDate: input.actualEndDate ?? null,
        // Chỉ ghi tiền khi người sửa có quyền xem tiền — tránh người không thấy
        // tiền vô tình ghi đè estimatedValue thành null.
        ...(keepMoney ? { estimatedValue: input.estimatedValue ?? null } : {}),
      },
    });

    await writeAuditLog(tx, {
      actorId: user.id,
      action: "PROJECT_UPDATE",
      entity: "Project",
      entityId: input.id,
      before,
      after: { name: input.name, status: input.status },
    });

    // Đổi ngày bàn giao thì lịch kiểm tra định kỳ phải dời theo, nếu không mốc
    // 3/6/12 tháng vẫn tính trên ngày cũ mà không ai nhận ra.
    if (
      before.actualEndDate?.getTime() !== (input.actualEndDate ?? null)?.getTime()
    ) {
      await syncScheduledChecks(tx, input.id);
    }
  });

  return { ok: true };
}

/** PJ-06 — xóa mềm. Chỉ Director (kiểm ở action). */
export async function softDeleteProject(
  user: SessionUser,
  id: string,
): Promise<{ ok: true } | { ok: false; reason: "NOT_FOUND" }> {
  const project = await prisma.project.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, code: true, name: true },
  });
  if (!project) return { ok: false, reason: "NOT_FOUND" };

  await prisma.$transaction(async (tx) => {
    // Giữ đúng lifecycle file hiện có: đưa chứng từ/file vật tư vào thùng rác
    // trước khi hard-delete bản ghi cha làm các FK này bị SET NULL.
    await tx.fileAsset.updateMany({
      where: {
        deletedAt: null,
        OR: [
          { transaction: { is: { projectId: id } } },
          { material: { is: { projectId: id } } },
        ],
      },
      data: { deletedAt: new Date() },
    });
    await tx.transaction.deleteMany({ where: { projectId: id } });
    await tx.material.deleteMany({ where: { projectId: id } });
    await tx.project.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await writeAuditLog(tx, {
      actorId: user.id,
      action: "PROJECT_DELETE",
      entity: "Project",
      entityId: id,
      before: { code: project.code, name: project.name },
    });
  });

  return { ok: true };
}

/**
 * PJ-09 / PJ-10 / PJ-12 — chuyển giai đoạn (tiến hoặc LÙI), ghi StageLog.
 * Cho phép lùi (PJ-12) nhưng vẫn ghi log, không xóa lịch sử cũ.
 */
export async function changeStage(
  user: SessionUser,
  input: ChangeStageInput,
): Promise<
  | { ok: true; direction: "forward" | "backward" | "same" }
  | { ok: false; reason: "NOT_FOUND" | "SAME_STAGE" }
> {
  const project = await prisma.project.findFirst({
    where: { id: input.id, deletedAt: null },
    select: {
      id: true,
      code: true,
      currentStage: true,
      actualEndDate: true,
    },
  });
  if (!project) return { ok: false, reason: "NOT_FOUND" };
  if (project.currentStage === input.toStage) {
    return { ok: false, reason: "SAME_STAGE" };
  }

  const fromIdx = STAGE_ORDER.indexOf(project.currentStage);
  const toIdx = STAGE_ORDER.indexOf(input.toStage);
  const direction = toIdx > fromIdx ? "forward" : "backward";

  // Tới giai đoạn 9 (Bảo hành) → tự chuyển trạng thái sang "Bảo hành" để dự án
  // thoát khỏi danh sách "Đang chạy". Lùi khỏi GĐ9 → trả lại "Đang chạy".
  const statusPatch =
    input.toStage === "WARRANTY"
      ? { status: "WARRANTY" as const }
      : project.currentStage === "WARRANTY"
        ? { status: "ACTIVE" as const }
        : {};

  // Sang giai đoạn 9 mà chưa có ngày bàn giao thì chốt luôn hôm nay: đây là
  // gốc tính bảo hành 5 năm và lịch kiểm tra định kỳ. Sửa lại được ở form dự án.
  const handoverPatch =
    input.toStage === "WARRANTY" && !project.actualEndDate
      ? { actualEndDate: new Date() }
      : {};

  await prisma.$transaction(async (tx) => {
    await tx.project.update({
      where: { id: input.id },
      data: { currentStage: input.toStage, ...statusPatch, ...handoverPatch },
    });
    await tx.stageLog.create({
      data: {
        projectId: input.id,
        fromStage: project.currentStage,
        toStage: input.toStage,
        changedById: user.id,
        note: input.note ?? null,
      },
    });
    await writeAuditLog(tx, {
      actorId: user.id,
      action: "PROJECT_STAGE_CHANGE",
      entity: "Project",
      entityId: input.id,
      before: { stage: project.currentStage },
      after: { stage: input.toStage, direction },
    });

    // Đã bàn giao → sinh lịch kiểm tra định kỳ (3/6/12 tháng, cấu hình được).
    await syncScheduledChecks(tx, input.id);

    // Báo cho thành viên dự án (trừ chính người vừa chuyển).
    await notify(tx, {
      recipientIds: await projectRecipients(tx, input.id),
      actorId: user.id,
      type: "PROJECT_STAGE_CHANGED",
      title: `${project.code} chuyển sang giai đoạn ${STAGE_LABEL[input.toStage]}`,
      body: input.note ?? null,
      href: `/projects/${input.id}?tab=tien-do`,
      entity: "Project",
      entityId: input.id,
    });
  });

  return { ok: true, direction };
}

/** Kết thúc dự án ở giai đoạn bảo hành → trạng thái "Hoàn thành". */
export async function completeProject(
  user: SessionUser,
  id: string,
): Promise<{ ok: true } | { ok: false; reason: "NOT_FOUND" }> {
  const project = await prisma.project.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, status: true },
  });
  if (!project) return { ok: false, reason: "NOT_FOUND" };

  await prisma.$transaction(async (tx) => {
    await tx.project.update({
      where: { id },
      data: { status: "COMPLETED" },
    });
    await writeAuditLog(tx, {
      actorId: user.id,
      action: "PROJECT_UPDATE",
      entity: "Project",
      entityId: id,
      before: { status: project.status },
      after: { status: "COMPLETED" },
    });
  });
  return { ok: true };
}

/** Nhân viên có thể được add vào dự án — danh sách để chọn (PJ-13). */
export function listAssignableUsers() {
  return prisma.user.findMany({
    where: { userType: "HUMAN", deletedAt: null, isActive: true },
    orderBy: { fullName: "asc" },
    select: {
      id: true,
      fullName: true,
      department: { select: { code: true } },
    },
  });
}

/** PJ-13 — gán thành viên. Trùng (cùng người, cùng mảng) thì bỏ qua êm. */
export async function addMember(
  user: SessionUser,
  input: { projectId: string; userId: string; area: "SALES" | "DESIGN" | "CONSTRUCTION" },
): Promise<{ ok: true } | { ok: false; reason: "ALREADY_MEMBER" }> {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.projectMember.create({
        data: { projectId: input.projectId, userId: input.userId, area: input.area },
      });
      await writeAuditLog(tx, {
        actorId: user.id,
        action: "PROJECT_MEMBER_ADD",
        entity: "Project",
        entityId: input.projectId,
        after: { userId: input.userId, area: input.area },
      });

      const project = await tx.project.findUnique({
        where: { id: input.projectId },
        select: { code: true, name: true },
      });
      await notify(tx, {
        recipientIds: [input.userId],
        actorId: user.id,
        type: "PROJECT_MEMBER_ADDED",
        title: `Bạn được thêm vào dự án ${project?.code ?? ""}`,
        body: `${project?.name ?? "Dự án"} — mảng ${MEMBER_AREA_LABEL[input.area]}`,
        href: `/projects/${input.projectId}`,
        entity: "Project",
        entityId: input.projectId,
      });
    });
    return { ok: true };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, reason: "ALREADY_MEMBER" };
    throw error;
  }
}

/** PJ-14 — gỡ thành viên khỏi dự án. */
export async function removeMember(
  user: SessionUser,
  projectId: string,
  memberId: string,
): Promise<{ ok: true } | { ok: false; reason: "NOT_FOUND" }> {
  const member = await prisma.projectMember.findFirst({
    where: { id: memberId, projectId },
    select: { id: true, userId: true, area: true },
  });
  if (!member) return { ok: false, reason: "NOT_FOUND" };

  await prisma.$transaction(async (tx) => {
    await tx.projectMember.delete({ where: { id: memberId } });
    await writeAuditLog(tx, {
      actorId: user.id,
      action: "PROJECT_MEMBER_REMOVE",
      entity: "Project",
      entityId: projectId,
      before: { userId: member.userId, area: member.area },
    });
  });

  return { ok: true };
}

/** PJ-16 — thêm bình luận. Mọi nhân viên đều được (kiểm quyền ở action). */
export async function addComment(
  user: SessionUser,
  projectId: string,
  content: string,
): Promise<{ ok: true } | { ok: false; reason: "NOT_FOUND" }> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: { id: true, code: true },
  });
  if (!project) return { ok: false, reason: "NOT_FOUND" };

  await prisma.$transaction(async (tx) => {
    await tx.projectComment.create({
      data: { projectId, authorId: user.id, content },
    });
    await notify(tx, {
      recipientIds: await projectRecipients(tx, projectId),
      actorId: user.id,
      type: "PROJECT_COMMENT",
      title: `${user.fullName} bình luận trong dự án ${project.code}`,
      // Cắt ngắn để danh sách thông báo không bị một bình luận dài nuốt mất.
      body: content.length > 160 ? `${content.slice(0, 160)}…` : content,
      href: `/projects/${projectId}?tab=tien-do`,
      entity: "Project",
      entityId: projectId,
    });
  });

  return { ok: true };
}
