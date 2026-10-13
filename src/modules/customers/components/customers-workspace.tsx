import { Plus } from "lucide-react";
import { requirePagePermission } from "@/common/guards/page.guard";
import { hasPermission } from "@/common/permissions/permissions";
import { PageHeader } from "@/components/patterns/page-header";
import { ButtonLink } from "@/components/ui";
import { CustomerTable } from "@/modules/customers/components/customer-table";
import { CustomerSearch } from "@/modules/customers/components/customer-search";
import { listCustomers } from "@/modules/customers/customers.service";
import { customerFilterSchema } from "@/modules/customers/customers.schema";

export type CustomersWorkspaceProps = {
  searchParams: Promise<{ q?: string; source?: string }>;
};

export async function CustomersWorkspace({
  searchParams,
}: CustomersWorkspaceProps) {
  const user = await requirePagePermission("customer.view");
  const canCreate = hasPermission(user, "customer.create");

  const raw = await searchParams;
  const filter = customerFilterSchema.parse({
    q: raw.q,
    source: raw.source || undefined,
  });
  const customers = await listCustomers(filter);

  return (
    <>
      <PageHeader
        title="Khách hàng"
        actions={
          canCreate ? (
            <ButtonLink
              href="/customers/tao-moi"
            >
              <Plus className="size-4" />
              Thêm khách hàng
            </ButtonLink>
          ) : null
        }
      />

      <CustomerSearch />
      <CustomerTable customers={customers} />
    </>
  );
}
