import type { Metadata } from "next";
import {
  EditEmployeeWorkspace,
  type EditEmployeeWorkspaceProps,
} from "@/modules/hr/components/edit-employee-workspace";

export const metadata: Metadata = { title: "Sửa hồ sơ" };

export default function EditEmployeePage(props: EditEmployeeWorkspaceProps) {
  return <EditEmployeeWorkspace {...props} />;
}
