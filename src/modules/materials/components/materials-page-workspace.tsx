import { requirePagePermission } from "@/common/guards/page.guard";
import { canSeeMoney } from "@/common/permissions/permissions";
import { PageHeader } from "@/components/patterns/page-header";
import { MaterialsWorkspace } from "@/modules/materials/components/materials-workspace";
import {
  listMaterialProjects,
  listManageableProjectIds,
  listMaterials,
  listProjectOptions,
} from "@/modules/materials/materials.service";
import { materialProjectFilterSchema } from "@/modules/materials/materials.schema";

export type MaterialsPageSearchParams = Promise<{
  view?: string;
  q?: string;
  month?: string;
  year?: string;
  sort?: string;
  page?: string;
}>;

export async function MaterialsPageWorkspace({
  searchParams,
}: {
  searchParams: MaterialsPageSearchParams;
}) {
  const user = await requirePagePermission("material.view");
  const raw = await searchParams;
  const view = raw.view === "materials" ? "materials" : "projects";
  const parsed = materialProjectFilterSchema.safeParse({
    q: raw.q || undefined,
    month: raw.month || undefined,
    year: raw.year || undefined,
    sort: raw.sort || undefined,
    page: raw.page,
  });
  const parsedProjectFilter = parsed.success
    ? parsed.data
    : materialProjectFilterSchema.parse({ page: 1 });
  const showMoney = canSeeMoney(user);
  const projectFilter =
    !showMoney &&
    (parsedProjectFilter.sort === "total-desc" ||
      parsedProjectFilter.sort === "total-asc")
      ? { ...parsedProjectFilter, sort: "latest-desc" as const }
      : parsedProjectFilter;

  const [projects, materials, manageableProjectIds, projectData] =
    await Promise.all([
      listProjectOptions(),
      view === "materials" ? listMaterials(user) : Promise.resolve([]),
      listManageableProjectIds(user),
      view === "projects"
        ? listMaterialProjects(user, projectFilter)
        : Promise.resolve(null),
    ]);

  return (
    <>
      <PageHeader title="Vật tư" />
      <MaterialsWorkspace
        projects={projects}
        materials={materials}
        view={view}
        projectData={projectData}
        projectViewFilter={projectFilter}
        showMoney={showMoney}
        manageableProjectIds={manageableProjectIds}
      />
    </>
  );
}
