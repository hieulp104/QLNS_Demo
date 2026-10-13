import type { Metadata } from "next";
import {
  ProjectDetailWorkspace,
  type ProjectDetailWorkspaceProps,
} from "@/modules/projects/components/project-detail-workspace";

export const metadata: Metadata = { title: "Chi tiết dự án" };

export default function ProjectDetailPage(
  props: ProjectDetailWorkspaceProps,
) {
  return <ProjectDetailWorkspace {...props} />;
}
