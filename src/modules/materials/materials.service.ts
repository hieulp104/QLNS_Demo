import {
  can,
  canSeeMoney,
  type SessionUser,
} from "@/common/permissions/permissions";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/shared/prisma/prisma.service";
import { writeAuditLog } from "@/shared/audit/audit.service";
import { withDownloadUrls } from "@/shared/minio/file.service";
import { syncMaterialExpenseTransaction } from "@/modules/finance/finance.service";
import type {
  MaterialFilter,
  MaterialInput,
  MaterialProjectFilter,
  UpdateMaterialInput,
} from "./materials.schema";
import { materialTotalSql } from "./materials.amount";
import { materialTotal } from "./materials.utils";

const MATERIAL_PROJECT_PAGE_SIZE = 15;
const MATERIAL_TOTAL_SQL = materialTotalSql(Prisma.sql`m.`);
/**
 * Lọc/nhóm theo THÁNG NGHIỆP VỤ (`material_date`), không phải ngày nhập liệu
 * (`created_at`). Trước đây dùng `created_at`: tiền thì đi theo `material_date`
 * nhưng bộ lọc lại chạy trên ngày nhập, nên lọc tháng 12 không bao giờ ra dòng
 * vật tư ghi ngày tháng 12 mà nhập từ tháng 8 — lỗi sai tháng không ai soi ra được.
 *
 * Cột là TIMESTAMP không kèm vùng giờ và đang lưu UTC, nên phải quy về giờ Việt
 * Nam trước khi cắt tháng; không thì bản ghi 0–7h sáng giờ VN rơi sang tháng trước.
 */
const LATEST_MATERIAL_VN_SQL = Prisma.sql`
  (MAX(m."material_date") AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh')
`;

const materialSelect = {
  id: true,
  projectId: true,
  name: true,
  unit: true,
  quantity: true,
  unitPrice: true,
  additionalCost: true,
  materialDate: true,
  note: true,
  createdAt: true,
  updatedAt: true,
  project: { select: { id: true, code: true, name: true } },
  files: {
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" as const },
    select: {
      id: true,
      fileName: true,
      objectKey: true,
      mimeType: true,
      sizeBytes: true,
      kind: true,
      createdAt: true,
      uploadedBy: { select: { fullName: true } },
    },
  },
} as const;

export function listProjectOptions() {
  return prisma.project.findMany({
    where: { deletedAt: null },
    orderBy: { code: "desc" },
    select: { id: true, code: true, name: true },
  });
}

export async function listManageableProjectIds(user: SessionUser) {
  const projects = await prisma.project.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      members: { select: { userId: true } },
    },
  });

  return projects
    .filter((project) =>
      can(user, "material.manage", {
        memberIds: project.members.map((member) => member.userId),
      }),
    )
    .map((project) => project.id);
}

export async function getMaterialOwner(id: string) {
  return prisma.material.findFirst({
    where: { id, project: { is: { deletedAt: null } } },
    select: { id: true, projectId: true },
  });
}

export async function listMaterials(user: SessionUser, filter: MaterialFilter = {}) {
  const rows = await prisma.material.findMany({
    where: {
      project: { is: { deletedAt: null } },
      ...(filter.projectId ? { projectId: filter.projectId } : {}),
      ...(filter.q
        ? {
            OR: [
              { name: { contains: filter.q, mode: "insensitive" as const } },
              { project: { is: { code: { contains: filter.q, mode: "insensitive" as const } } } },
              { project: { is: { name: { contains: filter.q, mode: "insensitive" as const } } } },
            ],
          }
        : {}),
    },
    orderBy: [{ materialDate: "desc" }, { createdAt: "desc" }],
    select: materialSelect,
  });

  const showMoney = canSeeMoney(user);
  return Promise.all(rows.map((row) => serializeMaterial(row, showMoney)));
}

export type MaterialView = Awaited<ReturnType<typeof listMaterials>>[number];

async function serializeMaterial(
  row: Prisma.MaterialGetPayload<{ select: typeof materialSelect }>,
  showMoney: boolean,
) {
  const { unitPrice, additionalCost, ...safeRow } = row;
  return {
    ...safeRow,
    quantity: String(row.quantity),
    ...(showMoney
      ? {
          unitPrice: unitPrice !== null ? String(unitPrice) : null,
          additionalCost: String(additionalCost),
        }
      : {}),
    files: await withDownloadUrls(
      row.files.map((file) => ({ ...file, sizeBytes: String(file.sizeBytes) })),
    ),
  };
}

/**
 * Tổng quan vật tư theo dự án. Project được đếm/phân trang tại DB; vật tư con
 * chỉ nạp cho các Project của trang hiện tại nên không group từ material page.
 */
export async function listMaterialProjects(
  user: SessionUser,
  filter: MaterialProjectFilter,
) {
  const showMoney = canSeeMoney(user);
  const sort =
    !showMoney && (filter.sort === "total-desc" || filter.sort === "total-asc")
      ? "latest-desc"
      : filter.sort;
  const searchFilter = filter.q
    ? Prisma.sql`AND (p."code" ILIKE ${`%${filter.q}%`} OR p."name" ILIKE ${`%${filter.q}%`})`
    : Prisma.empty;
  const periodFilter =
    filter.month && filter.year
      ? Prisma.sql`HAVING EXTRACT(MONTH FROM ${LATEST_MATERIAL_VN_SQL}) = ${filter.month}
          AND EXTRACT(YEAR FROM ${LATEST_MATERIAL_VN_SQL}) = ${filter.year}`
      : filter.month
        ? Prisma.sql`HAVING EXTRACT(MONTH FROM ${LATEST_MATERIAL_VN_SQL}) = ${filter.month}`
        : filter.year
          ? Prisma.sql`HAVING EXTRACT(YEAR FROM ${LATEST_MATERIAL_VN_SQL}) = ${filter.year}`
          : Prisma.empty;
  const [countRows, yearRows] = await Promise.all([
    prisma.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
      SELECT COUNT(*) AS "total"
      FROM (
        SELECT p."id"
        FROM "projects" p
        INNER JOIN "materials" m ON m."project_id" = p."id"
        WHERE p."deleted_at" IS NULL
          ${searchFilter}
        GROUP BY p."id"
        ${periodFilter}
      ) filtered_projects
    `),
    prisma.$queryRaw<Array<{ year: number }>>(Prisma.sql`
      SELECT DISTINCT EXTRACT(YEAR FROM "latest_material_date")::int AS "year"
      FROM (
        SELECT ${LATEST_MATERIAL_VN_SQL} AS "latest_material_date"
        FROM "projects" p
        INNER JOIN "materials" m ON m."project_id" = p."id"
        WHERE p."deleted_at" IS NULL
        GROUP BY p."id"
      ) latest_projects
      ORDER BY "year" DESC
    `),
  ]);
  const total = Number(countRows[0]?.total ?? 0);
  const pageCount = Math.max(
    1,
    Math.ceil(total / MATERIAL_PROJECT_PAGE_SIZE),
  );
  const page = Math.min(Math.max(1, filter.page), pageCount);
  const orderBy =
    sort === "latest-asc"
      ? Prisma.sql`MAX(m."material_date") ASC, p."id" ASC`
      : sort === "total-desc"
        ? Prisma.sql`SUM(${MATERIAL_TOTAL_SQL}) DESC, p."id" ASC`
        : sort === "total-asc"
          ? Prisma.sql`SUM(${MATERIAL_TOTAL_SQL}) ASC, p."id" ASC`
          : sort === "count-desc"
            ? Prisma.sql`COUNT(*) DESC, p."id" ASC`
            : sort === "count-asc"
              ? Prisma.sql`COUNT(*) ASC, p."id" ASC`
              : sort === "name-asc"
                ? Prisma.sql`LOWER(p."name") ASC, p."id" ASC`
                : sort === "name-desc"
                  ? Prisma.sql`LOWER(p."name") DESC, p."id" ASC`
                  : Prisma.sql`MAX(m."material_date") DESC, p."id" ASC`;
  const pageRows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT p."id"
    FROM "projects" p
    INNER JOIN "materials" m ON m."project_id" = p."id"
    WHERE p."deleted_at" IS NULL
      ${searchFilter}
    GROUP BY p."id", p."name"
    ${periodFilter}
    ORDER BY ${orderBy}
    LIMIT ${MATERIAL_PROJECT_PAGE_SIZE}
    OFFSET ${(page - 1) * MATERIAL_PROJECT_PAGE_SIZE}
  `);
  const pageIds = pageRows.map((row) => row.id);
  const unorderedProjects = pageIds.length
    ? await prisma.project.findMany({
        where: { deletedAt: null, id: { in: pageIds } },
        select: {
          id: true,
          code: true,
          name: true,
          materials: {
            orderBy: { materialDate: "desc" },
            select: materialSelect,
          },
        },
      })
    : [];
  const projectsById = new Map(
    unorderedProjects.map((project) => [project.id, project]),
  );
  const projects = pageIds.flatMap((id) => {
    const project = projectsById.get(id);
    return project ? [project] : [];
  });

  const items = await Promise.all(
    projects.map(async (project) => {
      const totalValue = showMoney
        ? project.materials.reduce(
            (sum, material) =>
              sum + materialTotal(material),
            0,
          )
        : null;
      const materials = await Promise.all(
        project.materials.map((material) =>
          serializeMaterial(material, showMoney),
        ),
      );

      return {
        id: project.id,
        code: project.code,
        name: project.name,
        materialCount: materials.length,
        totalValue: totalValue === null ? null : String(totalValue),
        latestMaterialDate: project.materials[0]?.materialDate ?? null,
        materials,
      };
    }),
  );

  return {
    items,
    total,
    page,
    pageSize: MATERIAL_PROJECT_PAGE_SIZE,
    pageCount,
    years: yearRows.map((row) => row.year),
  };
}

export type MaterialProjectPage = Awaited<
  ReturnType<typeof listMaterialProjects>
>;

async function createMaterialRecord(
  tx: Prisma.TransactionClient,
  user: SessionUser,
  input: MaterialInput,
  keepMoney: boolean,
) {
  const created = await tx.material.create({
    data: {
      projectId: input.projectId,
      catalogId: null,
      name: input.name,
      unit: input.unit,
      quantity: input.quantity,
      unitPrice: keepMoney ? input.unitPrice ?? null : null,
      additionalCost: keepMoney ? input.additionalCost : "0",
      materialDate: input.materialDate,
      note: input.note ?? null,
    },
    select: { id: true },
  });
  await writeAuditLog(tx, {
    actorId: user.id,
    action: "MATERIAL_CREATE",
    entity: "Material",
    entityId: created.id,
    after: {
      ...input,
      unitPrice: keepMoney ? input.unitPrice : undefined,
      additionalCost: keepMoney ? input.additionalCost : undefined,
    },
  });
  return created;
}

export async function createMaterial(user: SessionUser, input: MaterialInput, keepMoney: boolean) {
  return prisma.$transaction(async (tx) => {
    const project = await tx.project.findFirst({
      where: { id: input.projectId, deletedAt: null },
      select: { id: true },
    });
    if (!project) return { ok: false as const, reason: "PROJECT_NOT_FOUND" as const };
    const material = await createMaterialRecord(tx, user, input, keepMoney);
    await syncMaterialExpenseTransaction(tx, input.projectId, user.id);
    return { ok: true as const, id: material.id };
  });
}

export async function createMaterials(
  user: SessionUser,
  inputs: MaterialInput[],
  keepMoney: boolean,
) {
  const projectId = inputs[0]?.projectId;
  if (!projectId || inputs.some((input) => input.projectId !== projectId)) {
    return { ok: false as const, reason: "PROJECT_NOT_FOUND" as const };
  }

  return prisma.$transaction(async (tx) => {
    const project = await tx.project.findFirst({
      where: { id: projectId, deletedAt: null },
      select: { id: true },
    });
    if (!project) return { ok: false as const, reason: "PROJECT_NOT_FOUND" as const };
    for (const input of inputs) {
      await createMaterialRecord(tx, user, input, keepMoney);
    }
    // Batch import chỉ aggregate và sync Finance đúng một lần sau khi ghi đủ dòng.
    await syncMaterialExpenseTransaction(tx, projectId, user.id);
    return { ok: true as const, count: inputs.length };
  });
}

export async function updateMaterial(user: SessionUser, input: UpdateMaterialInput, keepMoney: boolean) {
  const before = await prisma.material.findFirst({
    where: { id: input.id, project: { is: { deletedAt: null } } },
    select: {
      id: true,
      projectId: true,
      name: true,
      unit: true,
      quantity: true,
      unitPrice: true,
      additionalCost: true,
      materialDate: true,
      note: true,
    },
  });
  if (!before) return { ok: false as const, reason: "NOT_FOUND" as const };
  await prisma.$transaction(async (tx) => {
    const after = await tx.material.update({
      where: { id: input.id },
      data: {
        catalogId: null,
        name: input.name,
        unit: input.unit,
        quantity: input.quantity,
        ...(keepMoney ? { unitPrice: input.unitPrice ?? null } : {}),
        ...(keepMoney ? { additionalCost: input.additionalCost } : {}),
        ...(input.materialDate ? { materialDate: input.materialDate } : {}),
        note: input.note ?? null,
      },
      select: {
        id: true,
        projectId: true,
        name: true,
        unit: true,
        quantity: true,
        unitPrice: true,
        additionalCost: true,
        materialDate: true,
        note: true,
      },
    });
    await writeAuditLog(tx, {
      actorId: user.id,
      action: "MATERIAL_UPDATE",
      entity: "Material",
      entityId: input.id,
      before,
      after,
    });
    await syncMaterialExpenseTransaction(tx, before.projectId, user.id);
  });
  return { ok: true as const };
}

export async function deleteMaterial(user: SessionUser, id: string) {
  const before = await prisma.material.findFirst({
    where: { id, project: { is: { deletedAt: null } } },
    select: {
      id: true,
      projectId: true,
      name: true,
      unit: true,
      quantity: true,
      unitPrice: true,
      additionalCost: true,
      materialDate: true,
      _count: { select: { files: { where: { deletedAt: null } } } },
    },
  });
  if (!before) return { ok: false as const, reason: "NOT_FOUND" as const };
  if (before._count.files > 0) return { ok: false as const, reason: "HAS_FILES" as const };
  await prisma.$transaction(async (tx) => {
    await tx.material.delete({ where: { id } });
    await writeAuditLog(tx, {
      actorId: user.id,
      action: "MATERIAL_DELETE",
      entity: "Material",
      entityId: id,
      before,
    });
    await syncMaterialExpenseTransaction(tx, before.projectId, user.id);
  });
  return { ok: true as const };
}
