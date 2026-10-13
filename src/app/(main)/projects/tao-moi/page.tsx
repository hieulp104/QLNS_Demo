import type { Metadata } from "next";
import { CreateProjectWorkspace } from "@/modules/projects/components/create-project-workspace";

export const metadata: Metadata = { title: "Tạo dự án" };

export default function CreateProjectPage() {
  return <CreateProjectWorkspace />;
}
