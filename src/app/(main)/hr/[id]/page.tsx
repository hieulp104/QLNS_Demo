import type { Metadata } from "next";
import {
  EmployeeDetailWorkspace,
  type EmployeeDetailWorkspaceProps,
} from "@/modules/hr/components/employee-detail-workspace";

export const metadata: Metadata = { title: "Hồ sơ nhân viên" };

export default function EmployeeDetailPage(
  props: EmployeeDetailWorkspaceProps,
) {
  return <EmployeeDetailWorkspace {...props} />;
}
