import type { Metadata } from "next";
import { PermissionsWorkspace } from "@/modules/system/components/permissions-workspace";

export const metadata: Metadata = { title: "Phân quyền" };

export default function PermissionsPage() {
  return <PermissionsWorkspace />;
}
