import type { Metadata } from "next";
import {
  MaintenanceWorkspace,
  type MaintenanceWorkspaceProps,
} from "@/modules/maintenance/components/maintenance-workspace";

export const metadata: Metadata = { title: "Bảo hành" };

export default function MaintenancePage(props: MaintenanceWorkspaceProps) {
  return <MaintenanceWorkspace {...props} />;
}
