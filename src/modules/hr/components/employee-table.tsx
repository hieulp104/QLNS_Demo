import { Avatar, Card, EmptyStatePanel, IconTile, PlainLink, Table, TableBody, TableCell, TableContainer, TableHead, TableHeader, TableRow } from "@/components/ui";
import { UsersRound } from "lucide-react";
import { DEPARTMENT_LABEL } from "@/common/enums";
import { formatDate, initials } from "@/lib/utils";
import type { EmployeeListItem } from "@/modules/hr/hr.service";
import { PurgeEmployeeButton } from "@/modules/hr/components/purge-employee-button";

type Props = {
  employees: EmployeeListItem[];
  emptyMessage: string;
  /** Bảng "đã nghỉ" thay cột Vai trò bằng Ngày nghỉ + Lý do. */
  variant?: "active" | "resigned";
  /** Hiện nút xóa vĩnh viễn ở bảng "đã nghỉ" — chỉ người có quyền toàn công ty. */
  canPurge?: boolean;
};

/** Server Component — không cần state, giữ nguyên khả năng render trên server. */
export function EmployeeTable({
  employees,
  emptyMessage,
  variant = "active",
  canPurge = false,
}: Props) {
  if (employees.length === 0) {
    return (
      <EmptyStatePanel >
        <IconTile shape="circle" size="xl">
          <UsersRound className="size-5" />
        </IconTile>
        <p className="text-sm text-muted">{emptyMessage}</p>
      </EmptyStatePanel>
    );
  }

  const resigned = variant === "resigned";

  return (
    <Card className="overflow-hidden">
      <TableContainer variant="bare">
        <Table className="min-w-[720px]">
          <TableHeader className="text-left">
            <TableRow>
              <TableHead className="px-5 py-2.5">Nhân viên</TableHead>
              <TableHead className="px-5 py-2.5">Mã</TableHead>
              <TableHead className="px-5 py-2.5">Phòng ban</TableHead>
              <TableHead className="px-5 py-2.5">
                {resigned ? "Ngày nghỉ" : "Vai trò"}
              </TableHead>
              {resigned && <TableHead className="px-5 py-2.5">Lý do</TableHead>}
              {resigned && canPurge && (
                <TableHead className="w-12 px-3 py-2.5">
                  <span className="sr-only">Thao tác</span>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody >
            {employees.map((e) => (
              <TableRow key={e.id} variant="summary">
                <TableCell className="px-5">
                  <PlainLink href={`/hr/${e.id}`} className="flex items-center gap-3">
                    <Avatar
                      src={e.avatarSrc}
                      fallback={initials(e.fullName)}
                      size="sm"
                      muted={resigned}
                    />
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-foreground">
                        {e.fullName}
                      </span>
                      <span className="block truncate text-xs text-note">
                        {e.email ?? e.phone}
                      </span>
                    </span>
                  </PlainLink>
                </TableCell>
                <TableCell tone="secondary" className="px-5">{e.employeeCode}</TableCell>
                <TableCell tone="secondary" className="px-5">
                  {e.department
                    ? DEPARTMENT_LABEL[e.department.code]
                    : "Ban giám đốc"}
                </TableCell>
                <TableCell tone="muted" className="px-5">
                  {resigned
                    ? formatDate(e.deletedAt)
                    : e.roles.map((r) => r.role.name).join(", ")}
                </TableCell>
                {resigned && (
                  <TableCell tone="muted" className="max-w-xs px-5">
                    <span className="line-clamp-2">{e.deletedReason ?? "—"}</span>
                  </TableCell>
                )}
                {resigned && canPurge && (
                  <TableCell className="px-3 text-right">
                    <PurgeEmployeeButton
                      employeeId={e.id}
                      employeeName={e.fullName}
                      employeeCode={e.employeeCode}
                    />
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Card>
  );
}
