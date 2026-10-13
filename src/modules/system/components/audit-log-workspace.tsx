import {
  Badge,
  ButtonLink,
  Card,
  EmptyStatePanel,
  IconTile,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui";
import { ScrollText } from "lucide-react";
import { requirePagePermission } from "@/common/guards/page.guard";
import { PageHeader } from "@/components/patterns/page-header";
import { AuditFilter } from "@/modules/system/components/audit-filter";
import {
  auditFilterOptions,
  listAuditLogs,
} from "@/modules/system/system.service";
import { auditFilterSchema } from "@/modules/system/system.schema";
import { formatDate } from "@/lib/utils";
import { prisma } from "@/shared/prisma/prisma.service";

export type AuditLogWorkspaceProps = {
  searchParams: Promise<{
    actorId?: string;
    entity?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
};

/** Nhãn nghiệp vụ dành cho người quản lý. Mã lạ không được đưa thẳng ra UI. */
const ACTION_LABEL: Record<string, string> = {
  USER_CREATE: "Tạo tài khoản",
  USER_UPDATE: "Cập nhật tài khoản",
  USER_DEACTIVATE: "Cho nghỉ việc",
  USER_PURGE: "Xóa nhân sự",
  ATTENDANCE_LOCK: "Chốt bảng công",
  ATTENDANCE_UNLOCK: "Mở bảng công",
  ROSTER_INCLUDE: "Thao tác công lương",
  ROSTER_EXCLUDE: "Thao tác công lương",
  USER_RESET_PASSWORD: "Đặt lại mật khẩu",
  USER_AVATAR_UPDATE: "Cập nhật ảnh đại diện",
  CUSTOMER_CREATE: "Thêm khách hàng",
  CUSTOMER_UPDATE: "Cập nhật khách hàng",
  CUSTOMER_DELETE: "Xóa khách hàng",
  PROJECT_CREATE: "Tạo dự án",
  PROJECT_UPDATE: "Cập nhật dự án",
  PROJECT_DELETE: "Xóa dự án",
  PROJECT_STAGE_CHANGE: "Chuyển giai đoạn",
  PROJECT_MEMBER_ADD: "Thêm thành viên dự án",
  PROJECT_MEMBER_REMOVE: "Gỡ thành viên dự án",
  CONTRACT_CREATE: "Tạo hợp đồng",
  CONTRACT_UPDATE: "Cập nhật hợp đồng",
  CONTRACT_DELETE: "Xóa hợp đồng",
  TXN_CREATE: "Tạo giao dịch",
  TXN_UPDATE: "Cập nhật giao dịch",
  TXN_DELETE: "Xóa giao dịch",
  EXPENSE_CATEGORY_CREATE: "Thêm danh mục chi",
  EXPENSE_CATEGORY_UPDATE: "Sửa danh mục chi",
  EXPENSE_CATEGORY_DELETE: "Xóa danh mục chi",
  RECURRING_EXPENSE_CREATE: "Ghi khoản cố định",
  MATERIAL_CREATE: "Thêm vật tư",
  MATERIAL_UPDATE: "Cập nhật vật tư",
  MATERIAL_DELETE: "Xóa vật tư",
  ROLE_PERMISSIONS_UPDATE: "Cập nhật phân quyền",
  PERMISSION_UPDATE: "Cập nhật phân quyền",
  FILE_RESTORE: "Khôi phục tài liệu",
};

const ENTITY_LABEL: Record<string, string> = {
  Project: "Dự án",
  Contract: "Hợp đồng",
  Transaction: "Giao dịch tài chính",
  Material: "Vật tư",
  Customer: "Khách hàng",
  Employee: "Nhân sự",
  Permission: "Phân quyền",
  Role: "Phân quyền",
  User: "Tài khoản",
  FileAsset: "Tài liệu",
  Department: "Phòng ban",
  Report: "Báo cáo",
};

function getActionLabel(action: string): string {
  return ACTION_LABEL[action] ?? "Thao tác hệ thống";
}

function getEntityLabel(entity: string): string {
  return ENTITY_LABEL[entity] ?? "Đối tượng khác";
}

function formatAuditTime(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(date);
}

/** SY-02 — màn tra cứu nhật ký. Quyền audit.view: Director + TP Kế toán. */
export async function AuditLogWorkspace({
  searchParams,
}: AuditLogWorkspaceProps) {
  await requirePagePermission("audit.view");

  const raw = await searchParams;
  const filter = auditFilterSchema.parse(raw);

  const [{ rows, page, totalPages }, options] = await Promise.all([
    listAuditLogs(filter, filter.page),
    auditFilterOptions(),
  ]);

  const actorIds = Array.from(
    new Set(rows.flatMap((log) => (log.actor ? [log.actor.id] : []))),
  );
  const actorPositions =
    actorIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, position: true },
        })
      : [];
  const positionByActorId = new Map(
    actorPositions.map((actor) => [actor.id, actor.position]),
  );

  /** Giữ nguyên bộ lọc khi lật trang. */
  const pageHref = (p: number) => {
    const qs = new URLSearchParams();
    if (raw.actorId) qs.set("actorId", raw.actorId);
    if (raw.entity) qs.set("entity", raw.entity);
    if (raw.from) qs.set("from", raw.from);
    if (raw.to) qs.set("to", raw.to);
    qs.set("page", String(p));
    return `/audit-log?${qs.toString()}`;
  };

  return (
    <>
      <PageHeader title="Nhật ký hệ thống" />

      <AuditFilter
        actors={options.actors}
        entities={options.entities.map((entity) => ({
          value: entity,
          label: getEntityLabel(entity),
        }))}
      />

      {rows.length === 0 ? (
        <EmptyStatePanel >
          <IconTile shape="circle" size="xl">
            <ScrollText className="size-5" />
          </IconTile>
          <p className="text-sm text-muted">
            Không có bản ghi nào khớp bộ lọc.
          </p>
        </EmptyStatePanel>
      ) : (
        <Card className="overflow-hidden">
          <TableContainer variant="bare">
            <Table className="table-fixed min-w-[920px]">
              <TableHeader className="text-left">
                <TableRow>
                  <TableHead className="w-[20%] py-2.5">Thời điểm</TableHead>
                  <TableHead className="w-[22%] py-2.5">Người dùng</TableHead>
                  <TableHead className="w-[20%] py-2.5">Chức vụ</TableHead>
                  <TableHead className="w-[20%] py-2.5">Hành động</TableHead>
                  <TableHead className="w-[18%] py-2.5">Đối tượng</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="align-top">
                {rows.map((log) => (
                  <TableRow key={log.id} variant="summary">
                    <TableCell className="whitespace-nowrap py-2.5">
                      <span className="inline-flex items-baseline gap-4 tabular-nums">
                        <span className="text-text-secondary">
                          {formatDate(log.createdAt)}
                        </span>
                        <span className="text-note">
                          {formatAuditTime(log.createdAt)}
                        </span>
                      </span>
                    </TableCell>
                    <TableCell className="py-2.5">
                      {log.actor ? (
                        <span className="text-foreground">
                          {log.actor.fullName}
                        </span>
                      ) : (
                        <span className="text-muted">Hệ thống</span>
                      )}
                    </TableCell>
                    <TableCell tone="secondary" className="py-2.5">
                      {log.actor
                        ? positionByActorId.get(log.actor.id)?.trim() || "—"
                        : "—"}
                    </TableCell>
                    <TableCell className="py-2.5">
                      <Badge variant="success">
                        {getActionLabel(log.action)}
                      </Badge>
                    </TableCell>
                    <TableCell tone="secondary" className="py-2.5">
                      {getEntityLabel(log.entity)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-muted">
            Trang {page}/{totalPages}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <ButtonLink
                href={pageHref(page - 1)}
                variant="outline"
                size="sm"
              >
                ← Trước
              </ButtonLink>
            )}
            {page < totalPages && (
              <ButtonLink
                href={pageHref(page + 1)}
                variant="outline"
                size="sm"
              >
                Sau →
              </ButtonLink>
            )}
          </div>
        </div>
      )}
    </>
  );
}
