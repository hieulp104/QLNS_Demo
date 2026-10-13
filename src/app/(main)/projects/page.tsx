import type { Metadata } from "next";
import {
  ProjectsWorkspace,
  type ProjectsWorkspaceProps,
} from "@/modules/projects/components/projects-workspace";

export const metadata: Metadata = { title: "Dự án" };

export default function ProjectsPage(props: ProjectsWorkspaceProps) {
  return <ProjectsWorkspace {...props} />;
}
