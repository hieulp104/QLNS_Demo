import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/modules/auth/auth.service";
import { can, canSeeMoney } from "@/common/permissions/permissions";
import { PageHeader } from "@/components/patterns/page-header";
import { Card, BackLink } from "@/components/ui";
import { ProjectForm } from "@/modules/projects/components/project-form";
import { getProject, memberIdsOf } from "@/modules/projects/projects.service";
import { listCustomerOptions } from "@/modules/customers/customers.service";

export type EditProjectWorkspaceProps = {
  params: Promise<{ id: string }>;
};

/** PJ-05 — sửa thông tin dự án. Chỉ Director hoặc thành viên dự án (scope ASSIGNED). */
export async function EditProjectWorkspace({
  params,
}: EditProjectWorkspaceProps) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const project = await getProject(user, id);
  if (!project) notFound();

  const memberIds = await memberIdsOf(id);
  if (!can(user, "project.update", { memberIds })) {
    redirect("/khong-co-quyen");
  }

  const customers = await listCustomerOptions();

  return (
    <>
      <BackLink
        href={`/projects/${project.id}`}
      >
        <ArrowLeft className="size-4" />
        {project.name}
      </BackLink>

      <PageHeader title="Sửa dự án" />

      <Card className="max-w-3xl p-6">
        <ProjectForm
          mode="edit"
          canSeeMoney={canSeeMoney(user)}
          customers={customers}
          project={{
            id: project.id,
            name: project.name,
            type: project.type,
            propertyType: project.propertyType ?? "",
            estimatedValue: project.estimatedValue,
            address: project.address,
            description: project.description,
            status: project.status,
            startDate: project.startDate,
            expectedEndDate: project.expectedEndDate,
            actualEndDate: project.actualEndDate,
          }}
        />
      </Card>
    </>
  );
}
