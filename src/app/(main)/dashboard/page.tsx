import type { Metadata } from "next";
import { DashboardWorkspace } from "@/modules/dashboard/components/dashboard-workspace";

export const metadata: Metadata = { title: "Tổng quan" };

export default function DashboardPage() {
  return <DashboardWorkspace />;
}
