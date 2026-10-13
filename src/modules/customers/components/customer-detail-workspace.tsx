import { notFound } from "next/navigation";
import { ArrowLeft, FolderOpen, Pencil } from "lucide-react";
import { requirePagePermission } from "@/common/guards/page.guard";
import { hasPermission } from "@/common/permissions/permissions";
import { PageHeader } from "@/components/patterns/page-header";
import { Badge, ButtonLink, Card, CardLink, DescriptionRow, EmptyStatePanel, IconTile, BackLink } from "@/components/ui";
import { DeleteCustomerButton } from "@/modules/customers/components/delete-customer-button";
import { getCustomer } from "@/modules/customers/customers.service";
import {
  CUSTOMER_SOURCE_LABEL,
  PROJECT_STATUS_LABEL,
  PROJECT_TYPE_LABEL,
  STAGE_LABEL,
} from "@/common/enums";
import { formatDate } from "@/lib/utils";

export type CustomerDetailWorkspaceProps = {
  params: Promise<{ id: string }>;
};

export async function CustomerDetailWorkspace({
  params,
}: CustomerDetailWorkspaceProps) {
  const user = await requirePagePermission("customer.view");
  const { id } = await params;

  const customer = await getCustomer(id);
  if (!customer) notFound();

  const canEdit = hasPermission(user, "customer.update");
  const canDelete = hasPermission(user, "customer.delete");

  return (
    <>
      <BackLink
        href="/customers"
      >
        <ArrowLeft className="size-4" />
        Danh sách khách hàng
      </BackLink>

      <PageHeader
        title={customer.name}
        actions={
          canEdit ? (
            <ButtonLink
              href={`/customers/${customer.id}/sua`}
            >
              <Pencil className="size-4" />
              Sửa
            </ButtonLink>
          ) : null
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <div className="space-y-6">
          <Card className="p-6">
            <dl>
              <DescriptionRow label="Mã khách" value={customer.code} />
              <DescriptionRow label="Số điện thoại" value={customer.phone} />
              <DescriptionRow label="Email" value={customer.email} />
              <DescriptionRow label="Địa chỉ" value={customer.address} />
              <DescriptionRow
                label="Nguồn khách"
                value={
                  customer.source === "OTHER" && customer.sourceDetail
                    ? `${CUSTOMER_SOURCE_LABEL[customer.source]} — ${customer.sourceDetail}`
                    : CUSTOMER_SOURCE_LABEL[customer.source]
                }
              />
              <DescriptionRow label="Ghi chú" value={customer.note} />
              <DescriptionRow label="Người tạo" value={customer.createdBy?.fullName} />
              <DescriptionRow label="Ngày tạo" value={formatDate(customer.createdAt)} />
            </dl>
          </Card>

          {canDelete && (
            <DeleteCustomerButton
              customerId={customer.id}
              customerName={customer.name}
            />
          )}
        </div>

        <div>
          <h2 className="mb-3 text-h2 font-bold text-foreground">
            Lịch sử dự án ({customer.projects.length})
          </h2>

          {customer.projects.length === 0 ? (
            <EmptyStatePanel >
              <IconTile shape="circle" size="xl">
                <FolderOpen className="size-5" />
              </IconTile>
              <p className="text-sm text-muted">
                Khách hàng này chưa có dự án nào.
              </p>
            </EmptyStatePanel>
          ) : (
            <div className="space-y-2.5">
              {customer.projects.map((p) => (
                <CardLink
                  key={p.id}
                  href={`/projects/${p.id}`}
                  className="block p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">
                        {p.name}
                      </p>
                      <p className="mt-0.5 text-xs text-muted">
                        {p.code} · {PROJECT_TYPE_LABEL[p.type]}
                      </p>
                    </div>
                    <Badge variant="success" className="shrink-0">
                      {PROJECT_STATUS_LABEL[p.status]}
                    </Badge>
                  </div>
                  <p className="mt-2 text-xs text-muted">
                    Giai đoạn: {STAGE_LABEL[p.currentStage]}
                  </p>
                </CardLink>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
