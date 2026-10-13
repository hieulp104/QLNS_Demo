import { Card, EmptyStatePanel, IconTile, Table, TableBody, TableCell, TableContainer, TableHead, TableHeader, TableRow, TextLink } from "@/components/ui";
import { Users } from "lucide-react";
import { CUSTOMER_SOURCE_LABEL } from "@/common/enums";
import { formatDate } from "@/lib/utils";
import type { CustomerListItem } from "@/modules/customers/customers.service";

export function CustomerTable({
  customers,
}: {
  customers: CustomerListItem[];
}) {
  if (customers.length === 0) {
    return (
      <EmptyStatePanel >
        <IconTile shape="circle" size="xl">
          <Users className="size-5" />
        </IconTile>
        <p className="text-sm text-muted">
          Chưa có khách hàng nào khớp. Thử bỏ bộ lọc hoặc thêm khách mới.
        </p>
      </EmptyStatePanel>
    );
  }

  return (
    <Card className="overflow-hidden">
      <TableContainer variant="bare">
        <Table className="min-w-[720px]">
          <TableHeader className="text-left">
            <TableRow>
              <TableHead className="px-5 py-2.5">Khách hàng</TableHead>
              <TableHead className="px-5 py-2.5">Mã</TableHead>
              <TableHead className="px-5 py-2.5">Liên hệ</TableHead>
              <TableHead className="px-5 py-2.5">Nguồn</TableHead>
              <TableHead className="px-5 py-2.5">Dự án</TableHead>
              <TableHead className="px-5 py-2.5">Ngày tạo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody >
            {customers.map((c) => (
              <TableRow key={c.id} variant="summary">
                <TableCell className="px-5">
                  <TextLink
                    href={`/customers/${c.id}`}
                    className="font-semibold text-foreground hover:text-foreground"
                  >
                    {c.name}
                  </TextLink>
                </TableCell>
                <TableCell tone="secondary" className="px-5">{c.code}</TableCell>
                <TableCell tone="muted" className="px-5">
                  {c.phone ?? c.email ?? "—"}
                </TableCell>
                <TableCell tone="muted" className="px-5">
                  {CUSTOMER_SOURCE_LABEL[c.source]}
                </TableCell>
                <TableCell tone="muted" className="px-5">{c._count.projects}</TableCell>
                <TableCell tone="muted" className="px-5">{formatDate(c.createdAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Card>
  );
}
