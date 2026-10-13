import type { Metadata } from "next";
import { HrWorkspace } from "@/modules/hr/components/hr-workspace";

export const metadata: Metadata = { title: "Nhân sự" };

export default function HrPage() {
  return <HrWorkspace />;
}
