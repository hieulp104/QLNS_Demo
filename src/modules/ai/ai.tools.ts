import type { SessionUser } from "@/common/permissions/permissions";
import { hasPermission } from "@/common/permissions/permissions";
import { prisma } from "@/shared/prisma/prisma.service";
import {
  contractsToolSchema,
  financeToolSchema,
  projectDetailToolSchema,
  projectsToolSchema,
  type ContractsToolInput,
  type FinanceToolInput,
  type ProjectDetailToolInput,
  type ProjectsToolInput,
} from "@/modules/ai/ai.schema";

export type AiToolName =
  | "queryFinance"
  | "queryProjects"
  | "queryContracts"
  | "getProjectDetail";

export type AiToolDefinition = {
  type: "function";
  name: AiToolName;
  description: string;
  strict: false;
  parameters: Record<string, unknown>;
};

const dateSchema = { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" };
const limitSchema = { type: "integer", minimum: 1, maximum: 20 };

export const AI_TOOL_DEFINITIONS: AiToolDefinition[] = [
  {
    type: "function",
    name: "queryFinance",
    description: "Tổng hợp thu chi đã lọc. Chỉ trả số liệu tổng hợp, không trả toàn bộ giao dịch. netCompleted là chênh lệch thu − chi trong phạm vi lọc, KHÔNG phải lãi/lợi nhuận. OPERATING_COST (Chi khác) là chi phí chung ngoài vật tư/lương — groupBy EXPENSE_CATEGORY để xem từng danh mục (thuê xưởng, điện, xe ô tô…).",
    strict: false,
    parameters: {
      type: "object",
      properties: {
        from: dateSchema,
        to: dateSchema,
        direction: { type: "string", enum: ["INCOME", "EXPENSE"] },
        status: { type: "string", enum: ["PENDING", "COMPLETED"] },
        type: { type: "string", enum: ["DESIGN_DEPOSIT", "CONTRACT_DEPOSIT", "PROGRESS_PAYMENT", "FINAL_PAYMENT", "MATERIAL_COST", "FACTORY_COST", "SUBCONTRACTOR_COST", "TRANSPORT_COST", "OTHER", "SALARY_COST", "INSURANCE_COST", "OPERATING_COST"] },
        projectId: { type: "string", description: "ID nội bộ chính xác lấy từ queryProjects; không tự tạo từ tên hoặc mã dự án." },
        projectIds: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 20, description: "Danh sách ID nội bộ chính xác lấy từ queryProjects khi phân tích nhiều dự án." },
        contractId: { type: "string" },
        groupBy: { type: "string", enum: ["SUMMARY", "MONTH", "PROJECT", "CONTRACT", "CATEGORY", "EXPENSE_CATEGORY", "STATUS", "DIRECTION"] },
        limit: limitSchema,
      },
      required: ["groupBy", "limit"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "queryProjects",
    description: "Tìm và tóm tắt dự án theo trạng thái, giai đoạn hoặc quá hạn.",
    strict: false,
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", maxLength: 100 },
        status: { type: "string", enum: ["ACTIVE", "ON_HOLD", "WARRANTY", "COMPLETED", "CANCELLED"] },
        stage: { type: "string", enum: ["INTAKE", "SURVEY_3D", "REVISE_QUOTE", "CONTRACT", "TECH_DRAWING", "PROCUREMENT", "CONSTRUCTION", "HANDOVER", "WARRANTY"] },
        overdueOnly: { type: "boolean" },
        limit: limitSchema,
      },
      required: ["overdueOnly", "limit"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "queryContracts",
    description: "Tóm tắt hợp đồng, số đã thực thu từ giao dịch hoàn tất và khoản thu đang chờ xử lý.",
    strict: false,
    parameters: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        status: { type: "string", enum: ["DRAFT", "SIGNED", "LIQUIDATED", "CANCELLED"] },
        underpaidOnly: { type: "boolean" },
        limit: limitSchema,
      },
      required: ["underpaidOnly", "limit"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "getProjectDetail",
    description: "Lấy chi tiết gọn của một dự án theo id hoặc mã dự án.",
    strict: false,
    parameters: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        projectCode: { type: "string", maxLength: 40 },
      },
      required: [],
      additionalProperties: false,
    },
  },
];

export class AiToolError extends Error {
  constructor(
    public readonly code: "PERMISSION_DENIED" | "VALIDATION_ERROR" | "NOT_FOUND" | "UNKNOWN_TOOL",
    message: string,
  ) {
    super(message);
  }
}

function requireAllScope(agent: SessionUser, permission: keyof SessionUser["permissions"]) {
  if (!hasPermission(agent, permission as never) || agent.permissions[permission] !== "ALL") {
    throw new AiToolError(
      "PERMISSION_DENIED",
      `Tài khoản AI cần quyền ${permission} với phạm vi ALL để dùng công cụ này.`,
    );
  }
}

function dateBounds(from?: string, to?: string) {
  if (from && to && from > to) {
    throw new AiToolError("VALIDATION_ERROR", "Ngày kết thúc phải bằng hoặc sau ngày bắt đầu.");
  }
  if (!from && !to) return undefined;
  const end = to ? new Date(`${to}T00:00:00.000Z`) : undefined;
  if (end) end.setUTCDate(end.getUTCDate() + 1);
  return {
    ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
    ...(end ? { lt: end } : {}),
  };
}

function financeWhere(input: FinanceToolInput) {
  const bounds = dateBounds(input.from, input.to);
  return {
    deletedAt: null,
    ...(bounds ? { txnDate: bounds } : {}),
    ...(input.direction ? { direction: input.direction } : {}),
    ...(input.status ? { status: input.status } : {}),
    ...(input.type ? { type: input.type } : {}),
    ...(input.projectId ? { projectId: input.projectId } : {}),
    ...(input.projectIds ? { projectId: { in: input.projectIds } } : {}),
    ...(input.contractId ? { contractId: input.contractId } : {}),
  };
}

const n = (value: unknown) => Number(value ?? 0);

function financeSummary(rows: Array<{ direction: string; status: string; _sum: { amount: unknown } }>) {
  let incomeCompleted = 0;
  let expenseCompleted = 0;
  let incomePending = 0;
  let expensePending = 0;
  for (const row of rows) {
    const amount = n(row._sum.amount);
    if (row.direction === "INCOME" && row.status === "COMPLETED") incomeCompleted += amount;
    else if (row.direction === "EXPENSE" && row.status === "COMPLETED") expenseCompleted += amount;
    else if (row.direction === "INCOME") incomePending += amount;
    else expensePending += amount;
  }
  return {
    incomeCompleted,
    expenseCompleted,
    netCompleted: incomeCompleted - expenseCompleted,
    incomePending,
    expensePending,
  };
}

async function queryFinance(agent: SessionUser, raw: unknown) {
  requireAllScope(agent, "finance.view");
  const parsed = financeToolSchema.safeParse(raw);
  if (!parsed.success) throw new AiToolError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Bộ lọc tài chính không hợp lệ.");
  const input = parsed.data;
  const requestedProjectIds = input.projectIds ?? (input.projectId ? [input.projectId] : []);
  if (requestedProjectIds.length > 0) {
    const existingCount = await prisma.project.count({
      where: { id: { in: requestedProjectIds }, deletedAt: null },
    });
    if (existingCount !== new Set(requestedProjectIds).size) {
      throw new AiToolError(
        "NOT_FOUND",
        "projectId không tồn tại. Hãy dùng queryProjects để lấy ID nội bộ chính xác; không tự tạo ID từ tên hoặc mã dự án.",
      );
    }
  }
  const where = financeWhere(input);

  // Always include a control total. A grouping (for example CONTRACT) can have
  // null keys and is useful for drill-down, but the model must not be forced to
  // infer the overall completed/pending totals from truncated grouped rows.
  const totalRows = await prisma.transaction.groupBy({
    by: ["direction", "status"], where, _sum: { amount: true }, _count: { _all: true },
  });
  const summary = financeSummary(totalRows);

  if (input.groupBy === "SUMMARY") {
    return { filters: input, summary, rows: totalRows.map((row) => ({ direction: row.direction, status: row.status, amount: n(row._sum?.amount), count: row._count?._all ?? 0 })) };
  }

  if (input.groupBy === "MONTH") {
    const rows = await prisma.transaction.groupBy({
      by: ["txnDate", "direction", "status"], where, _sum: { amount: true }, _count: { _all: true },
      orderBy: { txnDate: "asc" },
    });
    const months = new Map<string, {
      month: string;
      incomeCompleted: number;
      incomePending: number;
      expenseCompleted: number;
      expensePending: number;
      count: number;
    }>();
    for (const row of rows) {
      const key = row.txnDate.toISOString().slice(0, 7);
      const value = months.get(key) ?? {
        month: key,
        incomeCompleted: 0,
        incomePending: 0,
        expenseCompleted: 0,
        expensePending: 0,
        count: 0,
      };
      const bucket = `${row.direction === "INCOME" ? "income" : "expense"}${row.status === "COMPLETED" ? "Completed" : "Pending"}` as
        | "incomeCompleted"
        | "incomePending"
        | "expenseCompleted"
        | "expensePending";
      value[bucket] += n(row._sum?.amount);
      value.count += row._count?._all ?? 0;
      months.set(key, value);
    }
    return {
      filters: input,
      summary,
      rows: [...months.values()].slice(-input.limit).map((row) => ({
        ...row,
        netCompleted: row.incomeCompleted - row.expenseCompleted,
      })),
    };
  }

  const field = input.groupBy === "PROJECT" ? "projectId" : input.groupBy === "CONTRACT" ? "contractId" : input.groupBy === "CATEGORY" ? "type" : input.groupBy === "EXPENSE_CATEGORY" ? "expenseCategoryId" : input.groupBy === "STATUS" ? "status" : "direction";
  const rows = await prisma.transaction.groupBy({
    by: [field, "direction", "status"] as never,
    where,
    _sum: { amount: true },
    _count: true,
    orderBy: { _sum: { amount: "desc" } },
    take: input.limit,
  } as never) as unknown as Array<Record<string, unknown> & { direction: string; status: string; _sum: { amount: unknown }; _count: number }>;

  const ids = rows.map((row) => row[field]).filter((id): id is string => typeof id === "string");
  const labels = new Map<string, string>();
  if (field === "projectId" && ids.length) {
    for (const project of await prisma.project.findMany({ where: { id: { in: ids } }, select: { id: true, code: true, name: true } })) labels.set(project.id, `${project.code} — ${project.name}`);
  }
  if (field === "contractId" && ids.length) {
    for (const contract of await prisma.contract.findMany({ where: { id: { in: ids } }, select: { id: true, code: true } })) labels.set(contract.id, contract.code);
  }
  if (field === "expenseCategoryId" && ids.length) {
    for (const category of await prisma.expenseCategory.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })) labels.set(category.id, category.name);
  }
  const unassignedLabel = field === "contractId"
    ? "Không gắn hợp đồng"
    : field === "projectId"
      ? "Không gắn dự án"
      : field === "expenseCategoryId"
        ? "Không phải chi khác (vật tư, lương, thu…)"
        : "Không xác định";
  const serializedRows = rows.map((row) => ({ key: row[field] ?? "UNASSIGNED", label: typeof row[field] === "string" ? labels.get(row[field] as string) ?? row[field] : unassignedLabel, direction: row.direction, status: row.status, amount: n(row._sum.amount), count: row._count }));
  const grouped = new Map<string, {
    key: unknown;
    label: string;
    incomeCompleted: number;
    expenseCompleted: number;
    netCompleted: number;
    incomePending: number;
    expensePending: number;
  }>();
  for (const row of serializedRows) {
    const key = String(row.key);
    const value = grouped.get(key) ?? {
      key: row.key,
      label: row.label,
      incomeCompleted: 0,
      expenseCompleted: 0,
      netCompleted: 0,
      incomePending: 0,
      expensePending: 0,
    };
    const bucket = `${row.direction === "INCOME" ? "income" : "expense"}${row.status === "COMPLETED" ? "Completed" : "Pending"}` as
      | "incomeCompleted" | "expenseCompleted" | "incomePending" | "expensePending";
    value[bucket] += row.amount;
    value.netCompleted = value.incomeCompleted - value.expenseCompleted;
    grouped.set(key, value);
  }
  return { filters: input, summary, groups: [...grouped.values()], rows: serializedRows };
}

async function queryProjects(agent: SessionUser, raw: unknown) {
  requireAllScope(agent, "project.view");
  const parsed = projectsToolSchema.safeParse(raw);
  if (!parsed.success) throw new AiToolError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Bộ lọc dự án không hợp lệ.");
  const input: ProjectsToolInput = parsed.data;
  const rows = await prisma.project.findMany({
    where: {
      deletedAt: null,
      ...(input.query ? { OR: [{ code: { contains: input.query, mode: "insensitive" as const } }, { name: { contains: input.query, mode: "insensitive" as const } }] } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.stage ? { currentStage: input.stage } : {}),
      ...(input.overdueOnly ? { expectedEndDate: { lt: new Date() }, status: { in: ["ACTIVE", "ON_HOLD"] as const } } : {}),
    },
    orderBy: [{ expectedEndDate: "asc" }, { createdAt: "desc" }],
    take: input.limit,
    select: { id: true, code: true, name: true, currentStage: true, status: true, expectedEndDate: true, actualEndDate: true, customer: { select: { name: true } } },
  });
  return {
    filters: input,
    rows: rows.map((project) => ({
      ...project,
      actualEndDateSemantics: "Ngày bàn giao/mốc bắt đầu bảo hành; không tự động đồng nghĩa toàn bộ lifecycle Project đã COMPLETED.",
      lifecycleCompleted: project.status === "COMPLETED",
      consistencyWarnings: project.actualEndDate && !["WARRANTY", "COMPLETED"].includes(project.status)
        ? ["Có actualEndDate nhưng status chưa WARRANTY hoặc COMPLETED; cần xác minh, không kết luận hoàn thành/trễ hạn chỉ từ ngày này."]
        : [],
    })),
    count: rows.length,
  };
}

async function queryContracts(agent: SessionUser, raw: unknown) {
  requireAllScope(agent, "contract.view");
  requireAllScope(agent, "finance.view");
  const parsed = contractsToolSchema.safeParse(raw);
  if (!parsed.success) throw new AiToolError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Bộ lọc hợp đồng không hợp lệ.");
  const input: ContractsToolInput = parsed.data;
  const contracts = await prisma.contract.findMany({
    where: { deletedAt: null, ...(input.projectId ? { projectId: input.projectId } : {}), ...(input.status ? { status: input.status } : {}) },
    orderBy: { createdAt: "desc" },
    take: input.underpaidOnly ? 100 : input.limit,
    select: { id: true, code: true, type: true, status: true, value: true, depositAmount: true, signedDate: true, project: { select: { id: true, code: true, name: true } } },
  });
  const ids = contracts.map((contract) => contract.id);
  const receipts = ids.length ? await prisma.transaction.groupBy({
    by: ["contractId", "status"],
    where: { contractId: { in: ids }, deletedAt: null, direction: "INCOME" },
    _sum: { amount: true },
  }) : [];
  const paidById = new Map<string | null, number>();
  const pendingById = new Map<string | null, number>();
  for (const row of receipts) {
    const target = row.status === "COMPLETED" ? paidById : pendingById;
    target.set(row.contractId, n(row._sum.amount));
  }
  const rows = contracts
    .map((contract) => ({
      ...contract,
      value: n(contract.value),
      depositAmount: n(contract.depositAmount),
      paidAmount: paidById.get(contract.id) ?? 0,
      pendingIncomeAmount: pendingById.get(contract.id) ?? 0,
    }))
    .map((contract) => ({
      ...contract,
      remainingAmount: Math.max(0, contract.value - contract.paidAmount),
    }))
    .filter((contract) => !input.underpaidOnly || contract.remainingAmount > 0)
    .slice(0, input.limit);
  return { filters: input, rows };
}

async function getProjectDetail(agent: SessionUser, raw: unknown) {
  requireAllScope(agent, "project.view");
  const parsed = projectDetailToolSchema.safeParse(raw);
  if (!parsed.success) throw new AiToolError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Dự án không hợp lệ.");
  const input: ProjectDetailToolInput = parsed.data;
  const project = await prisma.project.findFirst({
    where: { deletedAt: null, ...(input.projectId ? { id: input.projectId } : { code: { equals: input.projectCode!, mode: "insensitive" } }) },
    select: {
      id: true, code: true, name: true, type: true, propertyType: true, currentStage: true, status: true, address: true, startDate: true, expectedEndDate: true, actualEndDate: true,
      customer: { select: { code: true, name: true } },
      members: { where: { user: { userType: "HUMAN" } }, select: { area: true, user: { select: { fullName: true } } } },
      _count: { select: { contracts: { where: { deletedAt: null } }, materials: true, maintenance: true } },
    },
  });
  if (!project) throw new AiToolError("NOT_FOUND", "Không tìm thấy dự án.");
  const consistencyWarnings: string[] = [];
  if (project.actualEndDate && !["WARRANTY", "COMPLETED"].includes(project.status)) {
    consistencyWarnings.push(
      "Có actualEndDate (ngày bàn giao/mốc bảo hành) nhưng status chưa WARRANTY hoặc COMPLETED; không được dùng riêng ngày này để kết luận lifecycle đã hoàn thành.",
    );
  }
  if (project.status === "COMPLETED" && !project.actualEndDate) {
    consistencyWarnings.push("Status là COMPLETED nhưng chưa có actualEndDate; cần xác minh ngày bàn giao.");
  }
  return {
    ...project,
    actualEndDateSemantics: "Ngày bàn giao/mốc bắt đầu bảo hành; không tự động đồng nghĩa toàn bộ lifecycle Project đã COMPLETED.",
    lifecycleCompleted: project.status === "COMPLETED",
    consistencyWarnings,
  };
}

export async function executeAiTool(agent: SessionUser, name: string, raw: unknown) {
  if (agent.userType !== "AI_AGENT") throw new AiToolError("PERMISSION_DENIED", "Công cụ chỉ nhận AI principal.");
  switch (name) {
    case "queryFinance": return queryFinance(agent, raw);
    case "queryProjects": return queryProjects(agent, raw);
    case "queryContracts": return queryContracts(agent, raw);
    case "getProjectDetail": return getProjectDetail(agent, raw);
    default: throw new AiToolError("UNKNOWN_TOOL", `Công cụ ${name} không nằm trong whitelist.`);
  }
}
