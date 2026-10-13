import type { Metadata } from "next";
import {
  AuditLogWorkspace,
  type AuditLogWorkspaceProps,
} from "@/modules/system/components/audit-log-workspace";

export const metadata: Metadata = { title: "Nhật ký hệ thống" };

export default function AuditLogPage(props: AuditLogWorkspaceProps) {
  return <AuditLogWorkspace {...props} />;
}
