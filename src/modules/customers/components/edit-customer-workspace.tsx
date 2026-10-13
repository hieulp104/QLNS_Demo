import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requirePagePermission } from "@/common/guards/page.guard";
import { PageHeader } from "@/components/patterns/page-header";
import { Card, BackLink } from "@/components/ui";
import { CustomerForm } from "@/modules/customers/components/customer-form";
import { getCustomer } from "@/modules/customers/customers.service";

export type EditCustomerWorkspaceProps = {
  params: Promise<{ id: string }>;
};

export async function EditCustomerWorkspace({
  params,
}: EditCustomerWorkspaceProps) {
  await requirePagePermission("customer.update");
  const { id } = await params;

  const customer = await getCustomer(id);
  if (!customer) notFound();

  return (
    <>
      <BackLink
        href={`/customers/${customer.id}`}
      >
        <ArrowLeft className="size-4" />
        {customer.name}
      </BackLink>

      <PageHeader title="Sửa khách hàng" />

      <Card className="max-w-3xl p-6">
        <CustomerForm
          mode="edit"
          customer={{
            id: customer.id,
            name: customer.name,
            phone: customer.phone,
            email: customer.email,
            address: customer.address,
            source: customer.source,
            sourceDetail: customer.sourceDetail,
            note: customer.note,
          }}
        />
      </Card>
    </>
  );
}
