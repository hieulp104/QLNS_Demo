import {
  AlertTriangle,
  CalendarClock,
  FileSignature,
  FileText,
  LifeBuoy,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { requirePagePermission } from "@/common/guards/page.guard";
import { canSeeMoney, hasPermission } from "@/common/permissions/permissions";
import { PageHeader } from "@/components/patterns/page-header";
import { Badge, Card, CardLink, IconTile, ProgressLink } from "@/components/ui";
import { STAGE_LABEL } from "@/common/enums";
import { formatDate, formatVnd } from "@/lib/utils";
import {
  monthRevenue,
  overdueProjects,
  quickCounts,
  stageDistribution,
  underpaidContracts,
  warrantyEndingSoon,
} from "@/modules/dashboard/dashboard.service";
import {
  checksDueSoon,
  openCustomerRequests,
} from "@/modules/maintenance/maintenance.service";

export async function DashboardWorkspace() {
  const user = await requirePagePermission("project.view");
  const showMoney = canSeeMoney(user);
  const showMaintenance = hasPermission(user, "maintenance.view");

  const [
    counts,
    stages,
    overdue,
    warranty,
    revenue,
    underpaid,
    warrantyRequests,
    dueChecks,
  ] = await Promise.all([
    quickCounts(user),
    stageDistribution(),
    overdueProjects(),
    warrantyEndingSoon(),
    // DB-02 / DB-04b dính tiền — chỉ truy vấn khi có finance.view.
    showMoney ? monthRevenue() : Promise.resolve(null),
    showMoney ? underpaidContracts() : Promise.resolve(null),
    showMaintenance ? openCustomerRequests() : Promise.resolve([]),
    showMaintenance ? checksDueSoon() : Promise.resolve([]),
  ]);

  const stats = [
    {
      label: "Tổng dự án",
      value: counts.projects,
      hint: `${counts.activeProjects} đang chạy`,
      icon: FileText,
      href: "/projects",
    },
    {
      label: "Khách hàng",
      value: counts.customers,
      hint: "Đang theo dõi",
      icon: Users,
      href: "/customers",
    },
    {
      label: "Hợp đồng đang thực hiện",
      value: counts.activeContracts,
      hint: "Đã ký và còn hiệu lực",
      icon: FileSignature,
      href: "/projects",
    },
  ];

  // Bảo hành (GĐ9) tách riêng: nó tích lũy suốt 5 năm nên sẽ phình to, để chung
  // sẽ nuốt hết các thanh của 8 bước sản xuất đang chạy.
  const pipelineStages = stages.filter((s) => s.stage !== "WARRANTY");
  const warrantyCount = stages.find((s) => s.stage === "WARRANTY")?.count ?? 0;
  const maxStageCount = Math.max(1, ...pipelineStages.map((s) => s.count));
  const pipelineTotal = pipelineStages.reduce((sum, s) => sum + s.count, 0);
  const attentionCount =
    overdue.length +
    warranty.length +
    (underpaid?.length ?? 0) +
    warrantyRequests.length +
    dueChecks.length;

  return (
    <>
      <PageHeader title={`Chào ${user.fullName.split(" ").slice(-1)[0]}`} />

      {/* ─────────── DB-01 · Ô SỐ LIỆU NHANH ─────────── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <CardLink
              key={s.label}
              href={s.href}
              className="p-5"
            >
              <div className="flex items-start justify-between">
                <p className="text-sm text-muted">{s.label}</p>
                <IconTile size="sm"><Icon className="size-[18px]" /></IconTile>
              </div>
              <p className="mt-3 text-display font-bold text-foreground">
                {s.value}
              </p>
              <p className="mt-1 text-xs text-muted">{s.hint}</p>
            </CardLink>
          );
        })}

        {/* ─────────── DB-02 · Ô DOANH THU THÁNG (chỉ finance.view) ─────────── */}
        {showMoney && revenue && (
          <CardLink
            href="/reports"
            className="p-5"
          >
            <div className="flex items-start justify-between">
              <p className="text-sm text-muted">Doanh thu tháng này</p>
              <IconTile size="sm"><Wallet className="size-[18px]" /></IconTile>
            </div>
            <p className="mt-3 text-display font-bold text-money-income">
              +{formatVnd(revenue.completed)}
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
              {revenue.completed >= revenue.prevCompleted ? (
                <IconTile tone="success" size="xs"><TrendingUp className="size-3.5" /></IconTile>
              ) : (
                <IconTile tone="danger" size="xs"><TrendingDown className="size-3.5" /></IconTile>
              )}
              <span>Tháng trước {formatVnd(revenue.prevCompleted)}</span>
              {revenue.pending > 0 && (
                <span className="text-money-pending">
                  · chờ thu ~ +{formatVnd(revenue.pending)}
                </span>
              )}
            </p>
          </CardLink>
        )}
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        {/* ─────────── DB-03 · DỰ ÁN THEO GIAI ĐOẠN ─────────── */}
        <Card className="p-5">
          <h2 className="text-h2 font-bold text-foreground">Dự án theo giai đoạn</h2>
          <p className="mt-1 text-sm text-muted">
            {pipelineTotal} dự án đang trong quy trình sản xuất
          </p>

          {pipelineTotal === 0 && warrantyCount === 0 ? (
            <Card
              variant="filled"
              className="mt-4 flex h-40 items-center justify-center text-sm text-muted"
            >
              Chưa có dự án trong quy trình
            </Card>
          ) : (
            <>
              <ol className="mt-4 space-y-3">
                {pipelineStages.map((s, idx) => (
                  <li key={s.stage}>
                    <div className="mb-1 flex items-baseline justify-between gap-2">
                      <span className="text-xs text-foreground">
                        <span className="tabular-nums text-muted">{idx + 1}.</span>{" "}
                        {STAGE_LABEL[s.stage]}
                      </span>
                      <span className="shrink-0 text-xs font-medium tabular-nums text-foreground">
                        {s.count}
                      </span>
                    </div>
                    <ProgressLink
                      href={`/projects?stage=${s.stage}`}
                      aria-label={`${s.count} dự án ở giai đoạn ${STAGE_LABEL[s.stage]}`}
                      value={(s.count / maxStageCount) * 100}
                      className="block w-full rounded"
                    />
                  </li>
                ))}
              </ol>

              {/* Bảo hành tách riêng — tích lũy 5 năm, không đếm chung để khỏi nuốt biểu đồ */}
              <CardLink
                href="/projects?stage=WARRANTY"
                className="mt-4 flex items-center justify-between gap-3 p-3"
              >
                <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <IconTile tone="success" size="xs">
                    <ShieldCheck className="size-3.5" />
                  </IconTile>
                  Đang bảo hành (5 năm)
                </span>
                <span className="text-sm font-bold tabular-nums text-foreground">
                  {warrantyCount}
                </span>
              </CardLink>
            </>
          )}
        </Card>

        {/* ─────────── DB-04 · VIỆC CẦN CHÚ Ý ─────────── */}
        <Card className="p-5">
          <h2 className="flex items-center gap-2 text-h2 font-bold text-foreground">
            Việc cần chú ý
            {attentionCount > 0 && (
              <Badge variant="danger">
                {attentionCount}
              </Badge>
            )}
          </h2>

          {attentionCount === 0 ? (
            <Card
              variant="filled"
              className="mt-4 flex h-40 flex-col items-center justify-center gap-2 text-sm text-muted"
            >
              <IconTile tone="success" size="sm"><ShieldCheck className="size-5" /></IconTile>
              Không có việc nào cần chú ý. Mọi thứ đang trong hạn.
            </Card>
          ) : (
            <div className="mt-4 space-y-4">
              {/* Khách đề nghị bảo hành — khách đang chờ nên xếp trên cùng */}
              {warrantyRequests.length > 0 && (
                <section>
                  <h3 className="mb-2">
                    <Badge variant="danger">
                      <LifeBuoy className="size-3.5" />
                      Khách đề nghị bảo hành ({warrantyRequests.length})
                    </Badge>
                  </h3>
                  <ul className="space-y-1.5">
                    {warrantyRequests.slice(0, 4).map((t) => (
                      <li key={t.id}>
                        <CardLink
                          href={`/projects/${t.projectId}?tab=bao-hanh`}
                          variant="dangerInteractive"
                          className="flex items-baseline justify-between gap-3 px-3 py-2 text-sm"
                        >
                          <span className="min-w-0 truncate text-foreground">
                            {t.projectCode} · {t.title}
                            <span className="text-muted"> — {t.customerName}</span>
                          </span>
                          <Badge variant="danger" className="shrink-0">
                            {t.priority === "URGENT" ? "Gấp · " : ""}
                            {t.assigneeName
                              ? t.assigneeName
                              : t.daysOpen !== null && t.daysOpen > 0
                                ? `chờ ${t.daysOpen} ngày`
                                : "chưa giao ai"}
                          </Badge>
                        </CardLink>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Dự án quá hạn */}
              {overdue.length > 0 && (
                <section>
                  <h3 className="mb-2">
                    <Badge variant="danger">
                    <CalendarClock className="size-3.5" />
                    Dự án quá hạn dự kiến ({overdue.length})
                    </Badge>
                  </h3>
                  <ul className="space-y-1.5">
                    {overdue.slice(0, 4).map((p) => (
                      <li key={p.id}>
                        <CardLink
                          href={`/projects/${p.id}`}
                          variant="dangerInteractive"
                          className="flex items-baseline justify-between gap-3 px-3 py-2 text-sm"
                        >
                          <span className="min-w-0 truncate text-foreground">
                            {p.code} · {p.name}
                          </span>
                          <Badge variant="danger" className="shrink-0">
                            trễ {p.daysLate} ngày
                          </Badge>
                        </CardLink>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Hợp đồng chưa thu đủ — chỉ người thấy tiền */}
              {underpaid && underpaid.length > 0 && (
                <section>
                  <h3 className="mb-2">
                    <Badge variant="warning">
                    <AlertTriangle className="size-3.5" />
                    Hợp đồng đã ký chưa thu đủ ({underpaid.length})
                    </Badge>
                  </h3>
                  <ul className="space-y-1.5">
                    {underpaid.slice(0, 4).map((c) => (
                      <li key={c.id}>
                        <CardLink
                          href={`/projects/${c.projectId}?tab=tai-chinh`}
                          variant="warningInteractive"
                          className="flex items-baseline justify-between gap-3 px-3 py-2 text-sm"
                        >
                          <span className="min-w-0 truncate text-foreground">
                            {c.code} · {c.projectName}
                          </span>
                          <Badge variant="warning" className="shrink-0">
                            thiếu {formatVnd(c.missing)}
                          </Badge>
                        </CardLink>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Lịch kiểm tra bảo hành định kỳ tới hạn */}
              {dueChecks.length > 0 && (
                <section>
                  <h3 className="mb-2">
                    <Badge variant="warning">
                      <CalendarClock className="size-3.5" />
                      Lịch bảo trì tới hạn ({dueChecks.length})
                    </Badge>
                  </h3>
                  <ul className="space-y-1.5">
                    {dueChecks.slice(0, 4).map((t) => (
                      <li key={t.id}>
                        <CardLink
                          href={`/projects/${t.projectId}?tab=bao-hanh`}
                          variant="warningInteractive"
                          className="flex items-baseline justify-between gap-3 px-3 py-2 text-sm"
                        >
                          <span className="min-w-0 truncate text-foreground">
                            {t.projectCode} · {t.title}
                          </span>
                          <Badge variant="warning" className="shrink-0">
                            {t.daysLeft !== null && t.daysLeft < 0
                              ? `quá hạn ${-t.daysLeft} ngày`
                              : `còn ${t.daysLeft} ngày`}
                          </Badge>
                        </CardLink>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Bảo hành sắp hết */}
              {warranty.length > 0 && (
                <section>
                  <h3 className="mb-2">
                    <Badge variant="success">
                    <ShieldCheck className="size-3.5" />
                    Bảo hành sắp hết hạn ({warranty.length})
                    </Badge>
                  </h3>
                  <ul className="space-y-1.5">
                    {warranty.slice(0, 4).map((p) => (
                      <li key={p.id}>
                        <CardLink
                          href={`/projects/${p.id}`}
                          className="flex items-baseline justify-between gap-3 px-3 py-2 text-sm"
                        >
                          <span className="min-w-0 truncate text-foreground">
                            {p.code} · {p.name}
                          </span>
                          <Badge variant="success" className="shrink-0">
                            còn {p.daysLeft} ngày ({formatDate(p.warrantyEnd)})
                          </Badge>
                        </CardLink>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
