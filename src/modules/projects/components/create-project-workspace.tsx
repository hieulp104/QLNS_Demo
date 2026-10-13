import { ArrowLeft, Users } from "lucide-react";
import { requirePagePermission } from "@/common/guards/page.guard";
import { canSeeMoney, hasPermission } from "@/common/permissions/permissions";
import { PageHeader } from "@/components/patterns/page-header";
import { ButtonLink, Card, EmptyStatePanel, IconTile, BackLink } from "@/components/ui";
import { ProjectForm } from "@/modules/projects/components/project-form";
import { listCustomerOptions } from "@/modules/customers/customers.service";

/** PJ-02 — chỉ Director / Kinh doanh / Kế toán (có project.create). */
export async function CreateProjectWorkspace() {
  const user = await requirePagePermission("project.create");
  const customers = await listCustomerOptions();
  const canCreateCustomer = hasPermission(user, "customer.create");

  return (
    <>
      <BackLink
        href="/projects"
      >
        <ArrowLeft className="size-4" />
        Danh sách dự án
      </BackLink>

      <PageHeader title="Tạo dự án" />

      {customers.length === 0 && !canCreateCustomer ? (
        <EmptyStatePanel >
          <IconTile shape="circle" size="xl">
            <Users className="size-5" />
          </IconTile>
          <p className="text-sm text-muted">
            Chưa có khách hàng nào. Cần thêm khách hàng trước khi tạo dự án.
          </p>
          <ButtonLink
            href="/customers/tao-moi"
          >
            Thêm khách hàng
          </ButtonLink>
        </EmptyStatePanel>
      ) : (
        <Card className="max-w-3xl p-6">
          <ProjectForm
            mode="create"
            canSeeMoney={canSeeMoney(user)}
            customers={customers}
            canCreateCustomer={canCreateCustomer}
          />
        </Card>
      )}
    </>
  );
}
