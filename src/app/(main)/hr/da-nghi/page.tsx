import type { Metadata } from "next";
import { ResignedEmployeesWorkspace } from "@/modules/hr/components/resigned-employees-workspace";

export const metadata: Metadata = { title: "Nhân viên đã nghỉ" };

export default function ResignedEmployeesPage() {
  return <ResignedEmployeesWorkspace />;
}
