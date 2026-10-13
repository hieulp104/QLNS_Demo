import type { Metadata } from "next";
import { CreateEmployeeWorkspace } from "@/modules/hr/components/create-employee-workspace";

export const metadata: Metadata = { title: "Tạo tài khoản" };

export default function CreateEmployeePage() {
  return <CreateEmployeeWorkspace />;
}
