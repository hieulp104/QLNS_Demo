import type { Metadata } from "next";
import {
  EditProjectWorkspace,
  type EditProjectWorkspaceProps,
} from "@/modules/projects/components/edit-project-workspace";

export const metadata: Metadata = { title: "Sửa dự án" };

export default function EditProjectPage(props: EditProjectWorkspaceProps) {
  return <EditProjectWorkspace {...props} />;
}
