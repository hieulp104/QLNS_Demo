import type { Metadata } from "next";
import {
  CustomersWorkspace,
  type CustomersWorkspaceProps,
} from "@/modules/customers/components/customers-workspace";

export const metadata: Metadata = { title: "Khách hàng" };

export default function CustomersPage(props: CustomersWorkspaceProps) {
  return <CustomersWorkspace {...props} />;
}
