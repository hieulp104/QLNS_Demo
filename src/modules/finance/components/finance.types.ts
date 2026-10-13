import type { ContractType } from "@/generated/prisma/enums";
import type {
  listProjectFinance,
  listTransactions,
} from "@/modules/finance/finance.service";

export type FinancePageData = Awaited<ReturnType<typeof listTransactions>>;
export type ProjectFinancePageData = Awaited<
  ReturnType<typeof listProjectFinance>
>;
export type FinanceViewMode = "projects" | "transactions";

export type ProjectOption = {
  id: string;
  code: string;
  name: string;
};

export type ContractOption = {
  id: string;
  code: string;
  projectId: string;
  type: ContractType;
};

export type ExpenseCategoryOption = {
  id: string;
  name: string;
  isActive: boolean;
  /** Số mặc định — chọn danh mục ở form giao dịch thì tự điền vào ô Số tiền. */
  defaultAmount?: number | null;
};
