import type { Metadata } from "next";
import {
  PayrollWorkspace,
  type PayrollWorkspaceProps,
} from "@/modules/payroll/components/payroll-workspace";

export const metadata: Metadata = { title: "Bảng lương" };

export default function PayrollPage(props: PayrollWorkspaceProps) {
  return <PayrollWorkspace {...props} />;
}
