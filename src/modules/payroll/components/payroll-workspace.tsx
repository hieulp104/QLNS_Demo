import { redirect } from "next/navigation";
import { getCurrentUser } from "@/modules/auth/auth.service";
import { can, hasPermission } from "@/common/permissions/permissions";
import { PageHeader } from "@/components/patterns/page-header";
import { Card } from "@/components/ui";
import {
  advanceTotals,
  findPeriod,
  listAdvances,
  missingSalaryNames,
  periodFinanceCodes,
  periodLines,
  sumLines,
  workRangeOf,
} from "@/modules/payroll/payroll.service";
import { daysInMonth } from "@/modules/attendance/attendance.service";
import { advanceMismatches } from "@/modules/finance/finance.payroll";
import { getPayrollSettings } from "@/modules/payroll/payroll.config";
import { prisma } from "@/shared/prisma/prisma.service";
import { PayrollBoard } from "@/modules/payroll/components/payroll-board";
import { Payslip } from "@/modules/payroll/components/payslip";

export type PayrollWorkspaceProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const first = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v;

function currentMonthVN(): { year: number; month: number } {
  const [year, month] = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
  })
    .format(new Date())
    .split("-")
    .map(Number);
  return { year, month };
}

/**
 * Trang /bang-luong.
 *
 * Hai giao diện khác hẳn nhau tùy phạm vi quyền `payroll.view`:
 *  - ALL (Giám đốc, Kế toán) → cả bảng lương công ty, sửa và chốt được.
 *  - SELF (nhân viên)        → chỉ phiếu lương của chính mình.
 * Dữ liệu người khác không bao giờ rời khỏi server ở trường hợp thứ hai.
 */
export async function PayrollWorkspace({ searchParams }: PayrollWorkspaceProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!hasPermission(user, "payroll.view")) redirect("/khong-co-quyen");

  const sp = await searchParams;
  const now = currentMonthVN();
  const yearRaw = Number(first(sp.year));
  const monthRaw = Number(first(sp.month));
  const year =
    Number.isInteger(yearRaw) && yearRaw >= 2020 && yearRaw <= 2100 ? yearRaw : now.year;
  const month =
    Number.isInteger(monthRaw) && monthRaw >= 1 && monthRaw <= 12 ? monthRaw : now.month;

  const seeAll = can(user, "payroll.view");
  const canManage = can(user, "payroll.manage");
  const period = await findPeriod(year, month);
  const lines = period ? await periodLines(user, period.id) : [];

  // ── Nhân viên chỉ xem phiếu lương của mình ──
  if (!seeAll) {
    return (
      <>
        <PageHeader title={`Phiếu lương tháng ${month}/${year}`} />
        <Payslip
          year={year}
          month={month}
          line={lines[0] ?? null}
          locked={period?.status === "LOCKED"}
        />
      </>
    );
  }

  const locked = period?.status === "LOCKED";
  const [
    advances,
    settings,
    employees,
    advanceMap,
    financeCodes,
    staleAdvances,
    missingSalary,
    range,
    nextPeriod,
  ] = await Promise.all([
      listAdvances(year, month),
      getPayrollSettings(),
      prisma.user.findMany({
        where: { userType: "HUMAN", deletedAt: null, isActive: true },
        select: { id: true, fullName: true },
        orderBy: { fullName: "asc" },
      }),
      advanceTotals(year, month),
      period && locked ? periodFinanceCodes(period.id) : [],
      // Báo sớm ngay trên màn hình, khỏi đợi bấm Chốt mới biết bị chặn.
      period && !locked && lines.length > 0 ? advanceMismatches(prisma, period.id) : [],
      // Người có công / có ứng trong tháng mà chưa khai mốc lương — họ không có
      // dòng trong bảng, nên phải réo tên lên chứ không im lặng bỏ qua.
      missingSalaryNames(year, month),
      workRangeOf(year, month),
      findPeriod(month === 12 ? year + 1 : year, month === 12 ? 1 : month + 1),
    ]);

  return (
    <>
      <PageHeader title={`Bảng lương tháng ${month}/${year}`} />

      {!period ? (
        <Card variant="filled" className="mb-4 p-4 text-sm text-muted">
          Tháng này chưa có bảng lương. Bấm <strong>Tính lại từ bảng chấm công</strong>{" "}
          để tạo.
        </Card>
      ) : null}

      <PayrollBoard
        year={year}
        month={month}
        status={period?.status ?? null}
        periodId={period?.id ?? null}
        lockedBy={period?.lockedBy?.fullName ?? null}
        lockedAt={period?.lockedAt ?? null}
        lines={lines}
        totals={sumLines(lines)}
        canManage={canManage}
        canManageSettings={can(user, "payroll.manage")}
        settings={settings}
        employees={employees}
        advances={advances.map((a) => ({
          id: a.id,
          userId: a.user.id,
          userName: a.user.fullName,
          advanceDate: a.advanceDate,
          amount: Number(a.amount),
          method: a.method,
          note: a.note,
        }))}
        advancedUserIds={[...advanceMap.keys()]}
        financeCodes={financeCodes}
        canSeeFinance={can(user, "finance.view")}
        staleAdvanceNames={staleAdvances.map((m) => m.fullName)}
        missingSalaryNames={missingSalary}
        workRange={{
          ...range,
          daysInMonth: daysInMonth(year, month),
          nextLocked: nextPeriod?.status === "LOCKED",
        }}
      />
    </>
  );
}
