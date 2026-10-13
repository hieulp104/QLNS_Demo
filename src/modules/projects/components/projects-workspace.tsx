import { Plus } from "lucide-react";
import { requirePagePermission } from "@/common/guards/page.guard";
import { canSeeMoney, hasPermission } from "@/common/permissions/permissions";
import { PageHeader } from "@/components/patterns/page-header";
import { ButtonLink } from "@/components/ui";
import { ProjectTable } from "@/modules/projects/components/project-table";
import { ProjectFilter } from "@/modules/projects/components/project-filter";
import { listProjects } from "@/modules/projects/projects.service";
import { projectFilterSchema } from "@/modules/projects/projects.schema";
import { listCustomerOptions } from "@/modules/customers/customers.service";

export type ProjectsWorkspaceProps = {
  searchParams: Promise<{
    stage?: string;
    type?: string;
    status?: string;
    customerId?: string;
    q?: string;
    month?: string;
  }>;
};

export async function ProjectsWorkspace({
  searchParams,
}: ProjectsWorkspaceProps) {
  const user = await requirePagePermission("project.view");
  const canCreate = hasPermission(user, "project.create");
  const showMoney = canSeeMoney(user);

  const raw = await searchParams;
  const filter = projectFilterSchema.parse({
    stage: raw.stage || undefined,
    type: raw.type || undefined,
    status: raw.status || undefined,
    customerId: raw.customerId || undefined,
    q: raw.q,
    month: raw.month || undefined,
  });

  const [projects, customers] = await Promise.all([
    listProjects(user, filter),
    listCustomerOptions(),
  ]);

  return (
    <>
      <PageHeader
        title="Dự án"
        actions={
          canCreate ? (
            <ButtonLink
              href="/projects/tao-moi"
            >
              <Plus className="size-4" />
              Tạo dự án
            </ButtonLink>
          ) : null
        }
      />

      <ProjectFilter customers={customers} />
      <ProjectTable projects={projects} showMoney={showMoney} />
    </>
  );
}
