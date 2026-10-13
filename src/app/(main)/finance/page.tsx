import type { Metadata } from "next";
import {
  FinancePageWorkspace,
  type FinancePageWorkspaceProps,
} from "@/modules/finance/components/finance-page-workspace";

export const metadata: Metadata = { title: "Tài chính" };

export default function FinancePage(props: FinancePageWorkspaceProps) {
  return <FinancePageWorkspace {...props} />;
}
