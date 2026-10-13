import type { Metadata } from "next";
import {
  ReportsWorkspace,
  type ReportsWorkspaceProps,
} from "@/modules/reports/components/reports-workspace";

export const metadata: Metadata = { title: "Báo cáo" };

export default function ReportsPage(props: ReportsWorkspaceProps) {
  return <ReportsWorkspace {...props} />;
}
