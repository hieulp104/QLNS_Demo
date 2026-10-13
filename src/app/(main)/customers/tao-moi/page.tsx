import type { Metadata } from "next";
import { CreateCustomerWorkspace } from "@/modules/customers/components/create-customer-workspace";

export const metadata: Metadata = { title: "Thêm khách hàng" };

export default function CreateCustomerPage() {
  return <CreateCustomerWorkspace />;
}
