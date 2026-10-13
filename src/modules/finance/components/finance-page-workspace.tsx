import { redirect } from "next/navigation";
import { requirePagePermission } from "@/common/guards/page.guard";
import { can } from "@/common/permissions/permissions";
import { PageHeader } from "@/components/patterns/page-header";
import { FinanceWorkspace } from "@/modules/finance/components/finance-workspace";
import { transactionFilterSchema } from "@/modules/finance/finance.schema";
import {
  listFinanceOptions,
  listProjectFinance,
  listTransactions,
} from "@/modules/finance/finance.service";
import { listExpenseCategories } from "@/modules/finance/finance.expense";
import type { FinanceViewMode } from "@/modules/finance/components/finance.types";

export type FinancePageWorkspaceProps = {
  searchParams: Promise<{
    q?: string;
    view?: string;
    projectId?: string;
    projectRelation?: string;
    contractId?: string;
    contractRelation?: string;
    direction?: string;
    type?: string;
    expenseCategoryId?: string;
    status?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
};

/** Chỉ Director và Kế toán vào được — chặn ở server, không chỉ ẩn menu. */
export async function FinancePageWorkspace({
  searchParams,
}: FinancePageWorkspaceProps) {
  const user = await requirePagePermission("finance.view");
  // Dữ liệu tài chính là tập toàn công ty; scope khác ALL không đủ ngữ cảnh để
  // mở danh sách trung tâm và phải bị từ chối an toàn.
  if (!can(user, "finance.view")) redirect("/khong-co-quyen");
  const raw = await searchParams;
  const view: FinanceViewMode = raw.view === "projects" ? "projects" : "transactions";
  const parsed = transactionFilterSchema.safeParse({
    ...raw,
    projectId: raw.projectId || undefined,
    projectRelation: raw.projectRelation || undefined,
    contractId: raw.contractId || undefined,
    contractRelation: raw.contractRelation || undefined,
    direction: raw.direction || undefined,
    type: raw.type || undefined,
    expenseCategoryId: raw.expenseCategoryId || undefined,
    status: raw.status || undefined,
    from: raw.from || undefined,
    to: raw.to || undefined,
    page: raw.page,
  });
  const filter = parsed.success
    ? parsed.data
    : transactionFilterSchema.parse({ page: 1 });

  const canManage = can(user, "finance.manage");
  const [data, options, categoryAdmin] = await Promise.all([
    view === "projects" ? listProjectFinance(filter) : listTransactions(filter),
    listFinanceOptions(),
    canManage ? listExpenseCategories() : Promise.resolve(null),
  ]);

  return (
    <>
      <PageHeader title="Tài chính" />
      <FinanceWorkspace
        data={data}
        view={view}
        projects={options.projects}
        contracts={options.contracts}
        expenseCategories={options.expenseCategories}
        categoryAdmin={categoryAdmin}
        filter={filter}
        canManage={canManage}
      />
    </>
  );
}
