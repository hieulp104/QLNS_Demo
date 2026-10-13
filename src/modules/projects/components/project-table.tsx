import { Badge, Card, EmptyStatePanel, IconTile, Table, TableBody, TableCell, TableContainer, TableHead, TableHeader, TableRow, TextLink } from "@/components/ui";
import { FolderOpen } from "lucide-react";
import {
  PROJECT_STATUS_LABEL,
  PROJECT_TYPE_LABEL,
  STAGE_LABEL,
  STAGE_ORDER,
} from "@/common/enums";
import { formatDate, formatVnd } from "@/lib/utils";
import type { ProjectListItem } from "@/modules/projects/projects.service";

const STATUS_VARIANT: Record<
  string,
  "success" | "warning" | "info" | "danger"
> = {
  ACTIVE: "success",
  ON_HOLD: "warning",
  COMPLETED: "info",
  CANCELLED: "danger",
};

export function ProjectTable({
  projects,
  showMoney,
}: {
  projects: ProjectListItem[];
  /** Ẩn cả cột giá trị nếu người xem không có quyền xem tiền. */
  showMoney: boolean;
}) {
  if (projects.length === 0) {
    return (
      <EmptyStatePanel >
        <IconTile shape="circle" size="xl">
          <FolderOpen className="size-5" />
        </IconTile>
        <p className="text-sm text-muted">
          Chưa có dự án nào khớp bộ lọc.
        </p>
      </EmptyStatePanel>
    );
  }

  return (
    <Card className="overflow-hidden">
      <TableContainer variant="bare">
        <Table className="min-w-[820px]">
          <TableHeader className="text-left">
            <TableRow>
              <TableHead className="px-5 py-2.5">Dự án</TableHead>
              <TableHead className="px-5 py-2.5">Khách hàng</TableHead>
              <TableHead className="px-5 py-2.5">Giai đoạn</TableHead>
              <TableHead className="px-5 py-2.5">Trạng thái</TableHead>
              {showMoney && (
                <TableHead className="px-5 py-2.5 text-right">Giá trị dự kiến</TableHead>
              )}
              <TableHead className="px-5 py-2.5">Hạn dự kiến</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody >
            {projects.map((p) => {
              const stageNo = STAGE_ORDER.indexOf(p.currentStage) + 1;
              return (
                <TableRow key={p.id} variant="summary">
                  <TableCell className="px-5">
                    <TextLink
                      href={`/projects/${p.id}`}
                      className="font-semibold text-foreground hover:text-foreground"
                    >
                      {p.name}
                    </TextLink>
                    <p className="mt-0.5 text-xs text-note">
                      {p.code} · {PROJECT_TYPE_LABEL[p.type]}
                    </p>
                  </TableCell>
                  <TableCell className="px-5 font-medium">{p.customer.name}</TableCell>
                  <TableCell className="px-5">
                    <span className="text-xs text-note">GĐ {stageNo}/9</span>
                    <p className="text-foreground">{STAGE_LABEL[p.currentStage]}</p>
                  </TableCell>
                  <TableCell className="px-5">
                    <Badge variant={STATUS_VARIANT[p.status]}>
                      {PROJECT_STATUS_LABEL[p.status]}
                    </Badge>
                  </TableCell>
                  {showMoney && (
                    <TableCell emphasis className="px-5 text-right">
                      {formatVnd(p.displayEstimatedValue)}
                    </TableCell>
                  )}
                  <TableCell tone="muted" className="px-5">
                    {formatDate(p.expectedEndDate)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Card>
  );
}
