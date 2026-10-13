import { requirePagePermission } from "@/common/guards/page.guard";
import { PageHeader } from "@/components/patterns/page-header";
import { can } from "@/common/permissions/permissions";
import {
  canMarkFor,
  monthSheet,
  rosterEntries,
} from "@/modules/attendance/attendance.service";
import { salaryMapAt } from "@/modules/payroll/payroll.service";
import { monthLock } from "@/modules/attendance/attendance.lock";
import { getPayrollSettings } from "@/modules/payroll/payroll.config";
import { AttendanceSheet } from "@/modules/attendance/components/attendance-sheet";

export type AttendanceWorkspaceProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const first = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v;

/** Tháng hiện tại theo giờ Việt Nam — tránh lệch tháng vào đêm cuối tháng. */
function currentMonthVN(): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
  const [year, month] = parts.split("-").map(Number);
  return { year, month };
}

/**
 * Trang /cham-cong — bảng lưới nhân viên × ngày, dựng lại file Excel của công ty.
 * Gác `attendance.view`; ai được sửa ô nào do `attendance.manage` quyết định
 * theo từng người (kiểm lại ở server mỗi lần chấm).
 */
export async function AttendanceWorkspace({
  searchParams,
}: AttendanceWorkspaceProps) {
  const user = await requirePagePermission("attendance.view");
  const sp = await searchParams;

  const now = currentMonthVN();
  const yearRaw = Number(first(sp.year));
  const monthRaw = Number(first(sp.month));
  const year =
    Number.isInteger(yearRaw) && yearRaw >= 2020 && yearRaw <= 2100
      ? yearRaw
      : now.year;
  const month =
    Number.isInteger(monthRaw) && monthRaw >= 1 && monthRaw <= 12
      ? monthRaw
      : now.month;

  const [sheet, settings, lock] = await Promise.all([
    monthSheet(user, year, month),
    // Hệ số chủ nhật / giờ đổi công hiện lên đầu bảng để người xem hiểu con số
    // ở cột Tổng ở đâu ra, thay vì phải tin suông.
    getPayrollSettings(),
    monthLock(year, month),
  ]);
  // Hộp "Tùy chỉnh danh sách" chỉ dành cho người quản cả công ty: chấm công
  // toàn công ty, hoặc quản lương. Trưởng phòng không thấy nút này.
  const canRosterAttendance = can(user, "attendance.manage");
  const canRosterPayroll = can(user, "payroll.manage");
  const roster =
    canRosterAttendance || canRosterPayroll ? await rosterEntries(year, month) : [];
  // Gợi ý "Lương khoán" cạnh tên — chỉ người quản lương mới được biết.
  const fixedSalaryIds = canRosterPayroll
    ? [...(await salaryMapAt(roster.map((r) => r.userId), year, month))]
        .filter(([, s]) => s.isFixedSalary)
        .map(([id]) => id)
    : [];

  // Tháng đã chốt thì cả bảng chỉ xem — không ô nào bấm được.
  const manageableUserIds = lock
    ? []
    : sheet.rows
        .filter((r) => canMarkFor(user, { id: r.userId, departmentId: r.departmentId }))
        .map((r) => r.userId);

  return (
    <>
      <PageHeader title={`Chấm công tháng ${month}/${year}`} />
      <AttendanceSheet
        sheet={sheet}
        settings={settings}
        canManage={manageableUserIds.length > 0}
        manageableUserIds={manageableUserIds}
        roster={roster}
        fixedSalaryIds={fixedSalaryIds}
        canRosterAttendance={canRosterAttendance}
        canRosterPayroll={canRosterPayroll}
        lock={lock ? { at: lock.at, byName: lock.byName } : null}
        canLock={can(user, "attendance.manage")}
      />
    </>
  );
}
