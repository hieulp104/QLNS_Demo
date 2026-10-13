import { Fragment } from "react";
import { Card, EmptyStatePanel, Table, TableBody, TableCell, TableContainer, TableHead, TableHeader, TableRow, TextLink } from "@/components/ui";
import { StatCard } from "@/components/patterns/stat-card";
import { requirePagePermission } from "@/common/guards/page.guard";
import { PageHeader } from "@/components/patterns/page-header";
import { formatVnd } from "@/lib/utils";
import { PROJECT_STATUS_LABEL, TXN_TYPE_LABEL } from "@/common/enums";
import {
  availableYears,
  expenseBreakdown,
  monthlyReport,
  projectReport,
  yearlyReport,
  type ReportTotals,
} from "@/modules/reports/reports.service";
import {
  ListExportLinks,
  ReportToolbar,
  type ReportView,
} from "@/modules/reports/components/report-toolbar";
import {
  PendingVsCompletedChart,
  RevenueChart,
} from "@/modules/reports/components/report-charts";

export type ReportsWorkspaceProps = {
  searchParams: Promise<{ xem?: string; nam?: string }>;
};

const EXPORT_TYPE: Record<ReportView, string> = {
  thang: "monthly",
  nam: "yearly",
  "du-an": "projects-report",
};

function absoluteVnd(value: number | string) {
  return formatVnd(Math.abs(Number(value)));
}

function incomeVnd(value: number | string) {
  return `+${absoluteVnd(value)}`;
}

function expenseVnd(value: number | string) {
  return `−${absoluteVnd(value)}`;
}

function netVnd(value: number | string) {
  const numericValue = Number(value);
  if (numericValue === 0) return formatVnd(0);
  return `${numericValue > 0 ? "+" : "−"}${absoluteVnd(numericValue)}`;
}

function netTone(value: number | string): "default" | "income" | "expense" {
  const numericValue = Number(value);
  if (numericValue === 0) return "default";
  return numericValue > 0 ? "income" : "expense";
}

/** Ô số tổng trên đầu trang. */
function StatTile({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "income" | "incomeMuted" | "expense";
}) {
  return (
    <StatCard
      label={label}
      value={value}
      tone={
        tone === "income"
          ? "income"
          : tone === "incomeMuted"
            ? "incomeMuted"
          : tone === "expense"
            ? "expense"
            : "neutral"
      }
    />
  );
}

function TotalTiles({ totals }: { totals: ReportTotals }) {
  return (
    <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatTile label="Thu thực" value={incomeVnd(totals.thuCompleted)} tone="income" />
      <StatTile
        label="Thu dự kiến"
        value={formatVnd(totals.thuPending)}
        tone="incomeMuted"
      />
      <StatTile label="Chi thực" value={expenseVnd(totals.chiCompleted)} tone="expense" />
      <StatTile
        label="Chênh lệch (thực)"
        value={netVnd(totals.net)}
        tone={netTone(totals.net)}
      />
    </div>
  );
}

const thClass = "px-4 py-2.5 font-medium";
const tdMoney = "py-2.5 text-right tabular-nums";

/** RP-08 — trang báo cáo tài chính, chỉ Director + Kế toán (report.financial). */
export async function ReportsWorkspace({
  searchParams,
}: ReportsWorkspaceProps) {
  await requirePagePermission("report.financial");

  const raw = await searchParams;
  const view: ReportView = ["thang", "nam", "du-an"].includes(raw.xem ?? "")
    ? (raw.xem as ReportView)
    : "thang";

  const years = await availableYears();
  const year = years.includes(Number(raw.nam)) ? Number(raw.nam) : years[0];

  return (
    <>
      <PageHeader title="Báo cáo tài chính" />

      <ReportToolbar
        view={view}
        year={year}
        years={years}
        exportType={EXPORT_TYPE[view]}
      />

      {/* ─────────── RP-01 · THEO THÁNG ─────────── */}
      {view === "thang" && (
        <MonthlyView year={year} />
      )}

      {/* ─────────── RP-02 · THEO NĂM ─────────── */}
      {view === "nam" && <YearlyView />}

      {/* ─────────── RP-03 · THEO DỰ ÁN ─────────── */}
      {view === "du-an" && <ProjectView />}

      <div className="mt-6">
        <ListExportLinks />
      </div>
    </>
  );
}

async function MonthlyView({ year }: { year: number }) {
  const [report, breakdown] = await Promise.all([
    monthlyReport(year),
    expenseBreakdown(year),
  ]);
  const hasData = report.months.some(
    (m) => m.thuCompleted || m.thuPending || m.chiCompleted || m.chiPending,
  );

  return (
    <>
      <TotalTiles totals={report.totals} />

      {hasData ? (
        <div className="mb-6 grid gap-6 xl:grid-cols-2">
          <RevenueChart months={report.months} />
          <PendingVsCompletedChart months={report.months} />
        </div>
      ) : (
        <EmptyStatePanel className="mb-6">
          <p className="text-sm text-muted">
            Năm {year} chưa có giao dịch nào. Số liệu sẽ tự xuất hiện khi Kế toán
            nhập thu/chi.
          </p>
        </EmptyStatePanel>
      )}

      {breakdown.rows.length > 0 && (
        <ExpenseBreakdownCard year={year} breakdown={breakdown} />
      )}

      {/* Bảng số liệu — kênh đọc chính xác từng đồng, bù cho biểu đồ */}
      <Card className="overflow-hidden">
        <TableContainer variant="bare">
          <Table className="min-w-[760px]">
            <TableHeader className="text-left">
              <TableRow>
                <TableHead className={thClass}>Tháng</TableHead>
                <TableHead className={`${thClass} text-right`}>Thu thực</TableHead>
                <TableHead className={`${thClass} text-right`}>Thu dự kiến</TableHead>
                <TableHead className={`${thClass} text-right`}>Chi thực</TableHead>
                <TableHead className={`${thClass} text-right`}>Chi dự kiến</TableHead>
                <TableHead className={`${thClass} text-right`}>Chênh lệch</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody >
              {report.months.map((m) => (
                <TableRow key={m.month}>
                  <TableCell className="py-2.5">Tháng {m.month}</TableCell>
                  <TableCell tone="income" emphasis className={tdMoney}>{incomeVnd(m.thuCompleted)}</TableCell>
                  <TableCell tone="incomeMuted" className={tdMoney}>{formatVnd(m.thuPending)}</TableCell>
                  <TableCell tone="expense" emphasis className={tdMoney}>{expenseVnd(m.chiCompleted)}</TableCell>
                  <TableCell className={tdMoney}>{formatVnd(m.chiPending)}</TableCell>
                  <TableCell
                    tone={netTone(m.net)}
                    emphasis
                    className={tdMoney}
                  >
                    {netVnd(m.net)}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow variant="summary">
                <TableCell className="py-2.5">Cả năm {report.year}</TableCell>
                <TableCell tone="income" emphasis className={tdMoney}>{incomeVnd(report.totals.thuCompleted)}</TableCell>
                <TableCell tone="incomeMuted" className={tdMoney}>{formatVnd(report.totals.thuPending)}</TableCell>
                <TableCell tone="expense" emphasis className={tdMoney}>{expenseVnd(report.totals.chiCompleted)}</TableCell>
                <TableCell className={tdMoney}>{formatVnd(report.totals.chiPending)}</TableCell>
                <TableCell
                  tone={netTone(report.totals.net)}
                  emphasis
                  className={tdMoney}
                >
                  {netVnd(report.totals.net)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

    </>
  );
}

function ShareBar({ share, subtle = false }: { share: number; subtle?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-subtle">
        <div
          className={`h-full rounded-full bg-money-expense ${subtle ? "opacity-50" : ""}`}
          style={{ width: `${share}%` }}
        />
      </div>
      <span className="w-12 text-right text-xs tabular-nums text-muted">{share}%</span>
    </div>
  );
}

/**
 * Cơ cấu chi phí theo loại — nhờ bảng này mới thấy được chi lương / BHXH
 * (từ bảng lương) và vật tư (từ dự án) chiếm bao nhiêu trong tổng chi.
 */
function ExpenseBreakdownCard({
  year,
  breakdown,
}: {
  year: number;
  breakdown: Awaited<ReturnType<typeof expenseBreakdown>>;
}) {
  return (
    <Card className="mb-6 overflow-hidden">
      <div className="px-4 pt-4">
        <h2 className="text-h3 font-semibold text-foreground">
          Cơ cấu chi phí năm {year}
        </h2>
        <p className="mt-0.5 text-xs text-muted">
          Chi lương gồm tạm ứng (theo ngày ứng) và lương thực nhận (khi chốt bảng lương).
          {breakdown.categories.length > 0 &&
            " Chi khác được tách theo từng danh mục ngay bên dưới."}
        </p>
      </div>
      <TableContainer variant="bare" className="mt-3">
        <Table className="min-w-[640px]">
          <TableHeader className="text-left">
            <TableRow>
              <TableHead className={thClass}>Loại chi</TableHead>
              <TableHead className={`${thClass} text-right`}>Chi thực</TableHead>
              <TableHead className={`${thClass} text-right`}>Chi dự kiến</TableHead>
              <TableHead className={`${thClass} w-[220px]`}>Tỉ trọng chi thực</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {breakdown.rows.map((r) => (
              <Fragment key={r.type}>
                <TableRow>
                  <TableCell emphasis className="py-2.5">{TXN_TYPE_LABEL[r.type]}</TableCell>
                  <TableCell tone="expense" emphasis className={tdMoney}>{expenseVnd(r.completed)}</TableCell>
                  <TableCell className={tdMoney}>{formatVnd(r.pending)}</TableCell>
                  <TableCell className="py-2.5">
                    <ShareBar share={r.share} />
                  </TableCell>
                </TableRow>
                {r.type === "OPERATING_COST" &&
                  breakdown.categories.map((c) => (
                    <TableRow key={c.categoryId}>
                      <TableCell className="py-2 pl-8 text-sm text-muted">
                        <span aria-hidden className="mr-1.5">└</span>
                        {c.name}
                        {!c.isActive && <span className="ml-1 text-xs">(đã ngưng)</span>}
                      </TableCell>
                      <TableCell tone="expense" className={`${tdMoney} text-sm`}>{expenseVnd(c.completed)}</TableCell>
                      <TableCell className={`${tdMoney} text-sm`}>{formatVnd(c.pending)}</TableCell>
                      <TableCell className="py-2">
                        <ShareBar share={c.share} subtle />
                      </TableCell>
                    </TableRow>
                  ))}
              </Fragment>
            ))}
            <TableRow variant="summary">
              <TableCell className="py-2.5">Tổng chi</TableCell>
              <TableCell tone="expense" emphasis className={tdMoney}>{expenseVnd(breakdown.totalCompleted)}</TableCell>
              <TableCell className={tdMoney}>{formatVnd(breakdown.totalPending)}</TableCell>
              <TableCell />
            </TableRow>
          </TableBody>
        </Table>
      </TableContainer>
    </Card>
  );
}

async function YearlyView() {
  const rows = await yearlyReport();

  if (rows.length === 0) {
    return (
      <EmptyStatePanel >
        <p className="text-sm text-muted">Chưa có giao dịch nào trong hệ thống.</p>
      </EmptyStatePanel>
    );
  }

  return (
    <Card className="overflow-hidden">
      <TableContainer variant="bare">
        <Table className="min-w-[720px]">
          <TableHeader className="text-left">
            <TableRow>
              <TableHead className={thClass}>Năm</TableHead>
              <TableHead className={`${thClass} text-right`}>Thu thực</TableHead>
              <TableHead className={`${thClass} text-right`}>Thu dự kiến</TableHead>
              <TableHead className={`${thClass} text-right`}>Chi thực</TableHead>
              <TableHead className={`${thClass} text-right`}>Chi dự kiến</TableHead>
              <TableHead className={`${thClass} text-right`}>Chênh lệch</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody >
            {rows.map((r) => (
              <TableRow key={r.year}>
                <TableCell emphasis className="py-2.5">{r.year}</TableCell>
                <TableCell tone="income" emphasis className={tdMoney}>{incomeVnd(r.thuCompleted)}</TableCell>
                <TableCell tone="incomeMuted" className={tdMoney}>{formatVnd(r.thuPending)}</TableCell>
                <TableCell tone="expense" emphasis className={tdMoney}>{expenseVnd(r.chiCompleted)}</TableCell>
                <TableCell className={tdMoney}>{formatVnd(r.chiPending)}</TableCell>
                <TableCell
                  tone={netTone(r.net)}
                  emphasis
                  className={tdMoney}
                >
                  {netVnd(r.net)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Card>
  );
}

async function ProjectView() {
  const rows = await projectReport();

  if (rows.length === 0) {
    return (
      <EmptyStatePanel >
        <p className="text-sm text-muted">Chưa có dự án nào.</p>
      </EmptyStatePanel>
    );
  }

  return (
    <Card className="overflow-hidden">
      <TableContainer variant="bare">
        <Table className="min-w-[980px]">
          <TableHeader className="text-left">
            <TableRow>
              <TableHead className={thClass}>Dự án</TableHead>
              <TableHead className={thClass}>Trạng thái</TableHead>
              <TableHead className={`${thClass} text-right`}>Giá trị hợp đồng</TableHead>
              <TableHead className={`${thClass} text-right`}>Thu thực</TableHead>
              <TableHead className={`${thClass} text-right`}>Thu dự kiến</TableHead>
              <TableHead className={`${thClass} text-right`}>Chi thực</TableHead>
              <TableHead className={`${thClass} text-right`}>Chênh lệch</TableHead>
              <TableHead className={`${thClass} text-right`}>% thu / HĐ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody >
            {rows.map((r) => (
              <TableRow key={r.id} variant="summary">
                <TableCell className="py-2.5">
                  <TextLink
                    href={`/projects/${r.id}?tab=tai-chinh`}
                    className="font-semibold text-foreground hover:text-foreground"
                  >
                    {r.name}
                  </TextLink>
                  <p className="text-xs text-note">
                    {r.code} · {r.customerName}
                  </p>
                </TableCell>
                <TableCell tone="secondary" className="py-2.5">
                  {PROJECT_STATUS_LABEL[
                    r.status as keyof typeof PROJECT_STATUS_LABEL
                  ] ?? r.status}
                </TableCell>
                <TableCell emphasis className={tdMoney}>{formatVnd(r.contractValue)}</TableCell>
                <TableCell tone="income" emphasis className={tdMoney}>{incomeVnd(r.thuCompleted)}</TableCell>
                <TableCell tone="incomeMuted" className={tdMoney}>{formatVnd(r.thuPending)}</TableCell>
                <TableCell tone="expense" emphasis className={tdMoney}>{expenseVnd(r.chiCompleted)}</TableCell>
                <TableCell
                  tone={netTone(r.net)}
                  emphasis
                  className={tdMoney}
                >
                  {netVnd(r.net)}
                </TableCell>
                <TableCell tone="muted" className={tdMoney}>{r.collectedPercent}%</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Card>
  );
}
