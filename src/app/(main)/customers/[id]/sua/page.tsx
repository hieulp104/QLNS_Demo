import type { Metadata } from "next";
import {
  EditCustomerWorkspace,
  type EditCustomerWorkspaceProps,
} from "@/modules/customers/components/edit-customer-workspace";

export const metadata: Metadata = { title: "Sửa khách hàng" };

export default function EditCustomerPage(props: EditCustomerWorkspaceProps) {
  return <EditCustomerWorkspace {...props} />;
}
