/**
 * Tầng số liệu cho Dashboard (DB-01 → DB-04).
 *
 * Trang /dashboard mở cho mọi nhân viên (project.view) nên MỌI HÀM TRẢ TIỀN
 * ở đây chỉ được gọi sau khi đã kiểm `canSeeMoney(user)` — người gọi chịu
 * trách nhiệm, giống quy tắc ẩn tiền của toàn hệ thống.
 */

import { prisma } from "@/shared/prisma/prisma.service";
import { STAGE_ORDER } from "@/common/enums";
import type { ProjectStage } from "@/generated/prisma/enums";
import {
  can,
  type SessionUser,
} from "@/common/permissions/permissions";

const toNumber = (v: unknown): number => Number(v ?? 0);

async function activeContractCount(user: SessionUser) {
  const where = {
    deletedAt: null,
    status: "SIGNED" as const,
    project: { is: { deletedAt: null } },
  };
  if (can(user, "contract.view")) {
    return prisma.contract.count({ where });
  }
  if (can(user, "contract.view", { memberIds: [user.id] })) {
    return prisma.contract.count({
      where: {
        ...where,
        project: {
          is: {
            deletedAt: null,
            members: { some: { userId: user.id } },
          },
        },
      },
    });
  }
  return 0;
}

/** DB-01 — ô số liệu nhanh: dự án · khách hàng · hợp đồng đang thực hiện. */
export async function quickCounts(user: SessionUser) {
  const [projects, activeProjects, customers, activeContracts] = await Promise.all([
    prisma.project.count({ where: { deletedAt: null } }),
    prisma.project.count({ where: { deletedAt: null, status: "ACTIVE" } }),
    prisma.customer.count({ where: { deletedAt: null } }),
    activeContractCount(user),
  ]);
  return { projects, activeProjects, customers, activeContracts };
}

/**
 * DB-02 — doanh thu tháng hiện tại (chỉ gọi cho người có finance.view):
 * thu đã thực (COMPLETED) + đang chờ (PENDING), so với tháng trước.
 */
export async function monthRevenue(now = new Date()) {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const startThis = new Date(Date.UTC(y, m, 1));
  const startNext = new Date(Date.UTC(y, m + 1, 1));
  const startPrev = new Date(Date.UTC(y, m - 1, 1));

  const rows = await prisma.transaction.groupBy({
    by: ["status"],
    where: {
      deletedAt: null,
      direction: "INCOME",
      txnDate: { gte: startThis, lt: startNext },
    },
    _sum: { amount: true },
  });
  const prev = await prisma.transaction.aggregate({
    where: {
      deletedAt: null,
      direction: "INCOME",
      status: "COMPLETED",
      txnDate: { gte: startPrev, lt: startThis },
    },
    _sum: { amount: true },
  });

  const completed = toNumber(rows.find((r) => r.status === "COMPLETED")?._sum.amount);
  const pending = toNumber(rows.find((r) => r.status === "PENDING")?._sum.amount);
  return { completed, pending, prevCompleted: toNumber(prev._sum.amount) };
}

export type StageCount = { stage: ProjectStage; count: number };

/** DB-03 — phân bố dự án đang chạy trên 9 giai đoạn, đủ cả giai đoạn 0 dự án. */
export async function stageDistribution(): Promise<StageCount[]> {
  // Đếm mọi dự án còn trong quy trình (chưa Hoàn thành/Hủy) — gồm cả Bảo hành
  // (GĐ9), Tạm dừng — để bức tranh 9 giai đoạn phản ánh đúng thực tế.
  const grouped = await prisma.project.groupBy({
    by: ["currentStage"],
    where: {
      deletedAt: null,
      status: { notIn: ["COMPLETED", "CANCELLED"] },
    },
    _count: true,
  });
  const byStage = new Map(grouped.map((g) => [g.currentStage, g._count]));
  return STAGE_ORDER.map((stage) => ({
    stage,
    count: byStage.get(stage) ?? 0,
  }));
}

/** Số ngày bảo hành còn lại được coi là "sắp hết" (5 năm kể từ ngày bàn giao). */
const WARRANTY_YEARS = 5;
const WARRANTY_SOON_DAYS = 90;

export type OverdueProject = {
  id: string;
  code: string;
  name: string;
  expectedEndDate: Date;
  daysLate: number;
};

export type UnderpaidContract = {
  id: string;
  code: string;
  projectId: string;
  projectName: string;
  value: number;
  paid: number;
  missing: number;
};

export type WarrantyEnding = {
  id: string;
  code: string;
  name: string;
  warrantyEnd: Date;
  daysLeft: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** DB-04a — dự án ACTIVE đã quá hạn hoàn thành dự kiến. Ai cũng xem được. */
export async function overdueProjects(now = new Date()): Promise<OverdueProject[]> {
  const rows = await prisma.project.findMany({
    where: {
      deletedAt: null,
      status: "ACTIVE",
      expectedEndDate: { lt: now },
      // Đã sang bàn giao / bảo hành thì không tính là trễ thi công nữa.
      currentStage: { notIn: ["HANDOVER", "WARRANTY"] },
    },
    orderBy: { expectedEndDate: "asc" },
    select: { id: true, code: true, name: true, expectedEndDate: true },
  });
  return rows.map((r) => ({
    ...r,
    expectedEndDate: r.expectedEndDate!,
    daysLate: Math.floor((now.getTime() - r.expectedEndDate!.getTime()) / DAY_MS),
  }));
}

/**
 * DB-04b — hợp đồng ĐÃ KÝ nhưng tổng thu COMPLETED chưa đủ giá trị.
 * Trả về số tiền → CHỈ gọi cho người có finance.view.
 */
export async function underpaidContracts(): Promise<UnderpaidContract[]> {
  const contracts = await prisma.contract.findMany({
    where: { deletedAt: null, status: "SIGNED" },
    select: {
      id: true,
      code: true,
      value: true,
      project: { select: { id: true, name: true } },
    },
  });
  if (contracts.length === 0) return [];

  const sums = await prisma.transaction.groupBy({
    by: ["contractId"],
    where: {
      contractId: { in: contracts.map((c) => c.id) },
      deletedAt: null,
      direction: "INCOME",
      status: "COMPLETED",
    },
    _sum: { amount: true },
  });
  const paidBy = new Map(sums.map((s) => [s.contractId, toNumber(s._sum.amount)]));

  return contracts
    .map((c) => {
      const value = toNumber(c.value);
      const paid = paidBy.get(c.id) ?? 0;
      return {
        id: c.id,
        code: c.code,
        projectId: c.project.id,
        projectName: c.project.name,
        value,
        paid,
        missing: value - paid,
      };
    })
    .filter((c) => c.missing > 0)
    .sort((a, b) => b.missing - a.missing);
}

/** DB-04c — dự án đang bảo hành mà hạn 5 năm sắp hết (trong 90 ngày tới). */
export async function warrantyEndingSoon(now = new Date()): Promise<WarrantyEnding[]> {
  const rows = await prisma.project.findMany({
    where: {
      deletedAt: null,
      currentStage: "WARRANTY",
      actualEndDate: { not: null },
    },
    select: { id: true, code: true, name: true, actualEndDate: true },
  });

  return rows
    .map((r) => {
      const warrantyEnd = new Date(r.actualEndDate!);
      warrantyEnd.setUTCFullYear(warrantyEnd.getUTCFullYear() + WARRANTY_YEARS);
      return {
        id: r.id,
        code: r.code,
        name: r.name,
        warrantyEnd,
        daysLeft: Math.ceil((warrantyEnd.getTime() - now.getTime()) / DAY_MS),
      };
    })
    .filter((r) => r.daysLeft >= 0 && r.daysLeft <= WARRANTY_SOON_DAYS)
    .sort((a, b) => a.daysLeft - b.daysLeft);
}
