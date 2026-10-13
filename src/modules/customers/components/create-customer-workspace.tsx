import { ArrowLeft } from "lucide-react";
import { requirePagePermission } from "@/common/guards/page.guard";
import { PageHeader } from "@/components/patterns/page-header";
import { Card, BackLink } from "@/components/ui";
import { CustomerForm } from "@/modules/customers/components/customer-form";

export async function CreateCustomerWorkspace() {
  await requirePagePermission("customer.create");

  return (
    <>
      <BackLink
        href="/customers"
      >
        <ArrowLeft className="size-4" />
        Danh sách khách hàng
      </BackLink>

      <PageHeader title="Thêm khách hàng" />

      <Card className="max-w-3xl p-6">
        <CustomerForm mode="create" />
      </Card>
    </>
  );
}
