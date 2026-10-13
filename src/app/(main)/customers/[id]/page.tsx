import type { Metadata } from "next";
import {
  CustomerDetailWorkspace,
  type CustomerDetailWorkspaceProps,
} from "@/modules/customers/components/customer-detail-workspace";

export const metadata: Metadata = { title: "Chi tiết khách hàng" };

export default function CustomerDetailPage(
  props: CustomerDetailWorkspaceProps,
) {
  return <CustomerDetailWorkspace {...props} />;
}
