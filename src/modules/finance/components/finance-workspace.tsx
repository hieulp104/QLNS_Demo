"use client";

import {
  Alert,
  Badge,
  Button,
  Card,
  CardFooter,
  CardHeader,
  Dialog,
  DescriptionRow,
  DividerSection,
  IconTile,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  TabButton,
  Tabs,
  TabsList,
  TextLink,
} from "@/components/ui";
import { StatCard } from "@/components/patterns/stat-card";

import { Fragment, useState, useTransition, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarPlus,
  Clock,
  ChevronDown,
  Tags,
  Eye,
  LoaderCircle,
  Pencil,
  Plus,
  Trash2,
  Wallet,
} from "lucide-react";
import type { ContractStatus, TxnStatus } from "@/generated/prisma/enums";
import {
  CONTRACT_STATUS_LABEL,
  TXN_DIRECTION_LABEL,
  TXN_STATUS_LABEL,
  TXN_TYPE_LABEL,
} from "@/common/enums";
import { cn, formatDate, formatVnd } from "@/lib/utils";
import { deleteTransactionAction } from "@/modules/finance/finance.actions";
import {
  isAutoManaged,
  type TransactionFilter,
} from "@/modules/finance/finance.schema";
import type { FinanceTransactionItem } from "@/modules/finance/finance.service";
import { FinanceFilters } from "@/modules/finance/components/finance-filters";
import { TransactionForm } from "@/modules/finance/components/transaction-form";
import { TransactionDocuments } from "@/modules/finance/components/transaction-documents";
import {
  ExpenseCategoryManager,
  RecurringExpensesForm,
} from "@/modules/finance/components/expense-category-manager";
import type { ExpenseCategoryItem } from "@/modules/finance/finance.expense";
import type {
  ContractOption,
  ExpenseCategoryOption,
  FinancePageData,
  FinanceViewMode,
  ProjectFinancePageData,
  ProjectOption,
} from "@/modules/finance/components/finance.types";

type Editor =
  | { kind: "create"; projectId?: string; contractId?: string }
  | { kind: "edit"; transaction: FinanceTransactionItem }
  | { kind: "detail"; transaction: FinanceTransactionItem }
  | { kind: "categories" }
  | { kind: "recurring" }
  | null;

/** Tháng bảng lương sinh ra giao dịch — kỳ lương, hoặc tháng của ngày ứng. */
function payrollMonthOf(transaction: FinanceTransactionItem) {
  if (transaction.payrollPeriod) return transaction.payrollPeriod;
  const date = transaction.salaryAdvance?.advanceDate;
  return date
    ? { year: new Date(date).getUTCFullYear(), month: new Date(date).getUTCMonth() + 1 }
    : null;
}

/** Nguồn của giao dịch; giao dịch từ bảng lương dẫn link về đúng tháng. */
function SourceValue({ transaction }: { transaction: FinanceTransactionItem }) {
  if (transaction.source === "MATERIAL_SYNC") {
    return <Badge variant="info">Tự động từ vật tư</Badge>;
  }
  if (transaction.source === "PAYROLL_SYNC") {
    const period = payrollMonthOf(transaction);
    return (
      <span className="flex flex-wrap items-center gap-2">
        <Badge variant="info">
          {transaction.salaryAdvance ? "Tự động từ sổ ứng lương" : "Tự động từ bảng lương"}
        </Badge>
        {period && (
          <TextLink
            href={`/bang-luong?year=${period.year}&month=${period.month}`}
            className="text-sm font-semibold"
          >
            Xem bảng lương tháng {period.month}/{period.year}
          </TextLink>
        )}
      </span>
    );
  }
  return <span className="font-semibold">Nhập thủ công</span>;
}

function Message({ value }: { value: string | null }) {
  return value ? (
    <Alert variant="danger" className="px-3 py-2">
      {value}
    </Alert>
  ) : null;
}

function Modal({
  title,
  children,
  onClose,
  size = "lg",
  titleClassName,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  size?: "lg" | "xl";
  titleClassName?: string;
}) {
  return (
    <Dialog title={title} onClose={onClose} size={size} titleClassName={titleClassName}>
      {children}
    </Dialog>
  );
}

function SummaryCards({ data }: { data: FinancePageData["summary"] }) {
  const pendingBalance =
    BigInt(data.incomePending) - BigInt(data.expensePending);
  const pendingBalancePrefix = pendingBalance >= 0 ? "+" : "−";
  const pendingBalanceValue =
    pendingBalance >= 0 ? pendingBalance : -pendingBalance;

  const cards = [
    {
      label: "Thực thu",
      value: data.incomeCompleted,
      prefix: "+",
      icon: ArrowDownLeft,
      tone: "income" as const,
    },
    {
      label: "Thực chi",
      value: data.expenseCompleted,
      prefix: "−",
      icon: ArrowUpRight,
      tone: "expense" as const,
    },
    {
      label: "Dòng tiền thực",
      value: data.netCompleted,
      prefix: "",
      icon: Wallet,
      tone: "warning" as const,
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <StatCard
          key={card.label}
          label={card.label}
          value={`${card.prefix}${formatVnd(card.value)}`}
          icon={<card.icon className="size-5" />}
          tone={card.tone}
        />
      ))}
      <StatCard
        label="Đang chờ thực hiện"
        value={`${pendingBalancePrefix}${formatVnd(String(pendingBalanceValue))}`}
        icon={<Clock className="size-5" />}
        tone="pending"
        detail={
          <div className="space-y-1">
            <p className="flex items-center gap-1.5">
              <span className="text-muted">Thu:</span>
              <span className="font-semibold text-money-pending">
                +{formatVnd(data.incomePending)}
              </span>
            </p>
            <p className="flex items-center gap-1.5">
              <span className="text-muted">Chi:</span>
              <span className="font-semibold text-money-expense">
                −{formatVnd(data.expensePending)}
              </span>
            </p>
          </div>
        }
      />
    </div>
  );
}

function StatusBadge({ status }: { status: TxnStatus }) {
  return (
    <Badge variant={status === "COMPLETED" ? "success" : "warning"}>
      {TXN_STATUS_LABEL[status]}
    </Badge>
  );
}

const CONTRACT_STATUS_VARIANT: Record<
  ContractStatus,
  "warning" | "success" | "info" | "danger"
> = {
  DRAFT: "warning",
  SIGNED: "success",
  LIQUIDATED: "info",
  CANCELLED: "danger",
};

function DirectionBadge({
  direction,
}: {
  direction: FinanceTransactionItem["direction"];
}) {
  return (
    <Badge variant={direction === "INCOME" ? "income" : "expense"}>
      {TXN_DIRECTION_LABEL[direction]}
    </Badge>
  );
}

function TransactionAmount({
  transaction,
  compact = false,
  showDirection = true,
  align = "end",
}: {
  transaction: FinanceTransactionItem;
  compact?: boolean;
  showDirection?: boolean;
  align?: "start" | "end";
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2",
        align === "start"
          ? "justify-start"
          : compact
            ? "justify-end"
            : "justify-end xl:justify-between",
      )}
    >
      {showDirection && <DirectionBadge direction={transaction.direction} />}
      <span
        className={cn(
          "whitespace-nowrap font-semibold",
          transaction.direction === "INCOME"
            ? "text-money-income"
            : "text-money-expense",
        )}
      >
        {transaction.direction === "INCOME" ? "+" : "−"}
        {formatVnd(transaction.amount)}
      </span>
    </div>
  );
}

export function TransactionDetailDialog({
  transaction,
  canManage,
  onEdit,
}: {
  transaction: FinanceTransactionItem;
  canManage: boolean;
  onEdit: () => void;
}) {
  return (
    <div className="space-y-8">
      <Card variant="filled" className="flex items-center justify-between gap-4 p-5 sm:px-6">
        <p className="flex min-w-0 items-center gap-2 text-sm">
          <span className="shrink-0 font-medium text-text-secondary/80">Mã giao dịch:</span>
          <span className="truncate font-semibold text-foreground">{transaction.code}</span>
        </p>
        <div className="flex shrink-0 items-center gap-3">
          {canManage && !isAutoManaged(transaction.source) && (
            <Button variant="plain" size="sm" onClick={onEdit}>
              <Pencil className="size-4" />
              Chỉnh sửa
            </Button>
          )}
          <StatusBadge status={transaction.status} />
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5 sm:p-6">
          <h3 className="text-h3 font-semibold leading-tight text-foreground">Thông tin giao dịch</h3>
          <DividerSection className="mt-4" />
          <dl className="pt-1">
            <DescriptionRow
              label="Nguồn"
              value={<SourceValue transaction={transaction} />}
            />
            <DescriptionRow
              label="Ngày giao dịch"
              value={<span className="font-semibold">{formatDate(transaction.txnDate)}</span>}
            />
            <DescriptionRow
              label="Dự án"
              value={
                transaction.project ? (
                  <TextLink
                    href={`/projects/${transaction.project.id}?tab=tai-chinh`}
                    className="font-semibold text-foreground hover:text-foreground"
                  >
                    {transaction.project.code} — {transaction.project.name}
                  </TextLink>
                ) : (
                  <span className="font-semibold">Không gắn dự án</span>
                )
              }
            />
            <DescriptionRow
              label="Hợp đồng"
              value={
                <span className="font-semibold">
                  {transaction.contract ? `HĐ ${transaction.contract.code}` : "Không gắn hợp đồng"}
                </span>
              }
            />
            <DescriptionRow
              label="Người nhập"
              value={
                <span className="font-semibold">
                  {transaction.createdBy?.fullName ?? "—"}
                </span>
              }
            />
          </dl>
        </Card>

        <Card className="p-5 sm:p-6">
          <h3 className="text-h3 font-semibold leading-tight text-foreground">Thông tin tài chính</h3>
          <DividerSection className="mt-4" />
          <dl className="pt-1">
            <DescriptionRow
              label="Số tiền"
              value={
                <TransactionAmount
                  transaction={transaction}
                  compact
                  showDirection={false}
                  align="start"
                />
              }
            />
            <DescriptionRow
              label="Loại giao dịch"
              value={<DirectionBadge direction={transaction.direction} />}
            />
            <DescriptionRow
              label="Danh mục giao dịch"
              value={
                <span className="font-semibold">
                  {TXN_TYPE_LABEL[transaction.type]}
                  {transaction.expenseCategory && ` · ${transaction.expenseCategory.name}`}
                </span>
              }
            />
            <DescriptionRow
              label="Phương thức"
              value={
                <span className="font-semibold">
                  {transaction.paymentMethod ?? "—"}
                </span>
              }
            />
          </dl>
        </Card>
      </div>

      <Card variant="filled" className="p-5 sm:p-6">
        <h3 className="text-h3 font-semibold leading-tight text-foreground">Ghi chú</h3>
        <DividerSection className="my-4" />
        <p
          className={cn(
            "whitespace-pre-line text-sm font-medium leading-relaxed",
            transaction.note?.trim() ? "text-foreground" : "text-text-secondary",
          )}
        >
          {transaction.note?.trim() || "Không có ghi chú."}
        </p>
      </Card>

      <Card className="p-5 sm:p-6">
        <h3 className="text-h3 font-semibold leading-tight text-foreground">Chứng từ</h3>
        <DividerSection className="my-4" />
        <TransactionDocuments
          transaction={transaction}
          canManage={canManage && !isAutoManaged(transaction.source)}
        />
      </Card>
    </div>
  );
}

export function CompactTransactionTable({
  title,
  transactions,
  canManage,
  showScope,
  showDirectionColumn = false,
  emptyMessage = "Chưa có giao dịch nào khớp bộ lọc.",
  onCreate,
  onDetail,
  onEdit,
  onRemove,
  deletingId,
}: {
  title: string;
  transactions: FinanceTransactionItem[];
  canManage: boolean;
  showScope?: boolean;
  showDirectionColumn?: boolean;
  emptyMessage?: string;
  onCreate: () => void;
  onDetail: (transaction: FinanceTransactionItem) => void;
  onEdit: (transaction: FinanceTransactionItem) => void;
  onRemove: (transaction: FinanceTransactionItem) => void;
  deletingId: string | null;
}) {
  return (
    <div className="space-y-3 bg-surface-subtle/50 px-5 py-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {canManage && (
          <Button type="button" size="sm" onClick={onCreate}>
            <Plus className="size-4" />
            Thêm giao dịch
          </Button>
        )}
      </div>

      {transactions.length === 0 ? (
        <p className="rounded-control border border-dashed border-line bg-surface px-4 py-6 text-center text-sm text-muted">
          {emptyMessage}
        </p>
      ) : (
        <TableContainer className="rounded-control border border-line bg-surface">
          <Table
            className={cn(
              "text-xs",
              showDirectionColumn ? "min-w-[980px]" : "min-w-[860px]",
            )}
          >
            <TableHeader>
              <TableRow>
                <TableHead>Mã giao dịch</TableHead>
                <TableHead>Ngày giao dịch</TableHead>
                {showDirectionColumn && <TableHead>Thu / Chi</TableHead>}
                <TableHead>Loại</TableHead>
                <TableHead className="text-right">Số tiền</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead className="text-center">Chi tiết</TableHead>
                {canManage && <TableHead className="text-center">Thao tác</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((transaction) => (
                <TableRow key={transaction.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold">{transaction.code}</p>
                      {isAutoManaged(transaction.source) && (
                        <Badge variant="info">Tự động</Badge>
                      )}
                    </div>
                    {showScope && (
                      <p className="mt-0.5 text-xs text-note">
                        {transaction.project
                          ? `${transaction.project.code} · ${transaction.project.name}`
                          : "Giao dịch cấp công ty"}
                      </p>
                    )}
                  </TableCell>
                  <TableCell tone="muted">{formatDate(transaction.txnDate)}</TableCell>
                  {showDirectionColumn && (
                    <TableCell>
                      <DirectionBadge direction={transaction.direction} />
                    </TableCell>
                  )}
                  <TableCell>
                    {transaction.expenseCategory?.name ?? TXN_TYPE_LABEL[transaction.type]}
                  </TableCell>
                  <TableCell className="text-right">
                    <TransactionAmount
                      transaction={transaction}
                      compact
                      showDirection={!showDirectionColumn}
                    />
                  </TableCell>
                  <TableCell><StatusBadge status={transaction.status} /></TableCell>
                  <TableCell className="text-center">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => onDetail(transaction)}
                      aria-label={`Xem chi tiết ${transaction.code}`}
                    >
                      <Eye className="size-4" />
                    </Button>
                  </TableCell>
                  {canManage && (
                    <TableCell>
                      {isAutoManaged(transaction.source) ? (
                        <div className="text-center">
                          <Badge variant="info">Chỉ đọc</Badge>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => onEdit(transaction)}
                            aria-label={`Sửa ${transaction.code}`}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="dangerGhost"
                            size="icon-sm"
                            onClick={() => onRemove(transaction)}
                            disabled={deletingId === transaction.id}
                            aria-label={`Xóa ${transaction.code}`}
                          >
                            {deletingId === transaction.id ? (
                              <LoaderCircle className="size-4 animate-spin" />
                            ) : (
                              <Trash2 className="size-4" />
                            )}
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </div>
  );
}

function ProjectFinanceTable({
  data,
  canManage,
  deletingId,
  setEditor,
  onRemove,
}: {
  data: ProjectFinancePageData;
  canManage: boolean;
  deletingId: string | null;
  setEditor: (editor: Editor) => void;
  onRemove: (transaction: FinanceTransactionItem) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (data.projects.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <IconTile shape="circle" size="xl">
          <Wallet className="size-5" />
        </IconTile>
        <p className="text-sm text-muted">Không có dự án nào khớp bộ lọc.</p>
      </div>
    );
  }

  return (
    <TableContainer variant="bare">
      <Table className="min-w-[980px] table-fixed">
        <colgroup>
          <col className="w-[25%]" />
          <col className="w-[19%]" />
          <col className="w-[17%]" />
          <col className="w-[17%]" />
          <col className="w-[16%]" />
          <col className="w-[6%]" />
        </colgroup>
        <TableHeader>
          <TableRow>
            <TableHead>Dự án</TableHead>
            <TableHead className="text-right">Hợp đồng</TableHead>
            <TableHead className="text-right">Thực thu</TableHead>
            <TableHead className="text-right">Thực chi</TableHead>
            <TableHead className="text-right">Dòng tiền thực</TableHead>
            <TableHead className="text-center">Mở rộng</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.projects.map((project) => {
            const isExpanded = expanded.has(project.id);
            return (
              <Fragment key={project.id}>
                <TableRow variant="summary">
                  <TableCell>
                    <TextLink
                      href={`/projects/${project.id}?tab=tai-chinh`}
                      className="font-semibold text-foreground hover:text-foreground"
                    >
                      {project.name}
                    </TextLink>
                    <p className="mt-0.5 text-xs text-note">{project.code}</p>
                  </TableCell>
                  <TableCell emphasis className="text-right">
                    <p>{project.contracts.length} hợp đồng</p>
                    <p className="mt-0.5 text-xs font-normal text-note">
                      {formatVnd(project.contractValue)}
                    </p>
                  </TableCell>
                  <TableCell emphasis className="text-right text-money-income">
                    +{formatVnd(project.summary.incomeCompleted)}
                  </TableCell>
                  <TableCell emphasis className="text-right text-money-expense">
                    −{formatVnd(project.summary.expenseCompleted)}
                  </TableCell>
                  <TableCell emphasis className="text-right">
                    {formatVnd(project.summary.netCompleted)}
                  </TableCell>
                  <TableCell className="text-center">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => toggle(project.id)}
                      aria-expanded={isExpanded}
                      aria-label={`${isExpanded ? "Thu gọn" : "Mở rộng"} ${project.code}`}
                    >
                      <ChevronDown
                        className={cn("size-4 transition-transform", isExpanded && "rotate-180")}
                      />
                    </Button>
                  </TableCell>
                </TableRow>
                {isExpanded && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={6} className="p-0">
                      <div className="space-y-5 bg-surface-subtle/50 px-4 py-5 sm:px-6">
                        <section className="space-y-3">
                          <h3 className="text-sm font-semibold text-foreground">
                            Hợp đồng ({project.contracts.length})
                          </h3>
                          {project.contracts.length === 0 ? (
                            <p className="rounded-control border border-dashed border-line bg-surface px-4 py-6 text-center text-sm text-muted">
                              Dự án chưa có hợp đồng.
                            </p>
                          ) : (
                            <div className="space-y-4">
                              {project.contracts.map((contract) => (
                                <div
                                  key={contract.id}
                                  className="overflow-hidden rounded-control border border-line bg-surface"
                                >
                                  <div className="flex flex-col gap-3 border-b border-line px-5 py-4 md:flex-row md:items-center md:justify-between">
                                    <div>
                                      <div className="flex flex-wrap items-center gap-2">
                                        <p className="font-semibold text-foreground">
                                          {contract.code}
                                        </p>
                                        <Badge variant={CONTRACT_STATUS_VARIANT[contract.status]}>
                                          {CONTRACT_STATUS_LABEL[contract.status]}
                                        </Badge>
                                      </div>
                                      <p className="mt-1 text-xs text-note">
                                        Ký ngày {formatDate(contract.signedDate)}
                                      </p>
                                    </div>
                                    <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                                      <p>
                                        <span className="text-muted">Giá trị: </span>
                                        <span className="font-semibold">{formatVnd(contract.value)}</span>
                                      </p>
                                      <p>
                                        <span className="text-muted">Đã thanh toán: </span>
                                        <span className="font-semibold text-money-income">
                                          {formatVnd(contract.paidAmount)}
                                        </span>
                                      </p>
                                    </div>
                                  </div>
                                  <CompactTransactionTable
                                    title={`Giao dịch của ${contract.code}`}
                                    transactions={contract.transactions}
                                    canManage={canManage}
                                    deletingId={deletingId}
                                    onCreate={() =>
                                      setEditor({
                                        kind: "create",
                                        projectId: project.id,
                                        contractId: contract.id,
                                      })
                                    }
                                    onDetail={(transaction) =>
                                      setEditor({ kind: "detail", transaction })
                                    }
                                    onEdit={(transaction) =>
                                      setEditor({ kind: "edit", transaction })
                                    }
                                    onRemove={onRemove}
                                  />
                                </div>
                              ))}
                            </div>
                          )}
                        </section>

                        <section className="overflow-hidden rounded-control border border-line bg-surface">
                          <CompactTransactionTable
                            title={`Giao dịch khác của dự án (${project.projectTransactions.length})`}
                            transactions={project.projectTransactions}
                            canManage={canManage}
                            showDirectionColumn
                            emptyMessage="Chưa có giao dịch khác cho dự án này."
                            deletingId={deletingId}
                            onCreate={() =>
                              setEditor({ kind: "create", projectId: project.id })
                            }
                            onDetail={(transaction) =>
                              setEditor({ kind: "detail", transaction })
                            }
                            onEdit={(transaction) =>
                              setEditor({ kind: "edit", transaction })
                            }
                            onRemove={onRemove}
                          />
                        </section>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}

        </TableBody>
      </Table>
    </TableContainer>
  );
}

export function FinanceWorkspace({
  data,
  view,
  projects,
  contracts,
  expenseCategories,
  categoryAdmin,
  filter,
  canManage,
}: {
  data: FinancePageData | ProjectFinancePageData;
  view: FinanceViewMode;
  projects: ProjectOption[];
  contracts: ContractOption[];
  expenseCategories: ExpenseCategoryOption[];
  /** Danh mục kèm số giao dịch — chỉ nạp cho người có finance.manage. */
  categoryAdmin: ExpenseCategoryItem[] | null;
  filter: TransactionFilter;
  canManage: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [editor, setEditor] = useState<Editor>(null);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [navigationPending, startNavigation] = useTransition();
  const transactionData = view === "transactions" ? (data as FinancePageData) : null;
  const projectData = view === "projects" ? (data as ProjectFinancePageData) : null;

  function changeView(nextView: FinanceViewMode) {
    const next = new URLSearchParams(params);
    next.delete("page");
    if (nextView === "transactions") next.delete("view");
    else next.set("view", nextView);
    if (nextView === "projects" && next.get("projectRelation") === "UNASSIGNED") {
      next.delete("projectRelation");
    }
    startNavigation(() => {
      const query = next.toString();
      router.push(query ? `/finance?${query}` : "/finance");
    });
  }

  function goToPage(page: number) {
    const next = new URLSearchParams(params);
    if (page <= 1) next.delete("page");
    else next.set("page", String(page));
    startNavigation(() => {
      const query = next.toString();
      router.push(query ? `/finance?${query}` : "/finance");
    });
  }

  async function remove(transaction: FinanceTransactionItem) {
    if (
      !window.confirm(
        `Xóa giao dịch ${transaction.code}? Giao dịch sẽ được xóa mềm và loại khỏi báo cáo.`,
      )
    ) {
      return;
    }

    setDeletingId(transaction.id);
    setError(null);
    const result = await deleteTransactionAction({ id: transaction.id });
    setDeletingId(null);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <SummaryCards data={data.summary} />

      <FinanceFilters
        key={JSON.stringify(filter)}
        projects={projects}
        contracts={contracts}
        expenseCategories={expenseCategories}
        filter={filter}
        view={view}
      />

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted">Chế độ xem</p>
        <Tabs className="w-fit max-w-full rounded-t-control border border-line bg-surface px-1 pt-1">
          <TabsList>
            <TabButton
              active={view === "projects"}
              onClick={() => changeView("projects")}
              disabled={navigationPending}
            >
              Theo dự án
            </TabButton>
            <TabButton
              active={view === "transactions"}
              onClick={() => changeView("transactions")}
              disabled={navigationPending}
            >
              Theo giao dịch
            </TabButton>
          </TabsList>
        </Tabs>
      </div>

      <Card as="section" className="overflow-hidden">
        <CardHeader className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-h2 font-bold text-foreground">
              {view === "projects" ? "Tài chính theo dự án" : "Giao dịch thu / chi"}
            </h2>
            <p className="text-xs text-muted">
              {view === "projects"
                ? `${data.total} dự án khớp bộ lọc hiện tại`
                : `${data.total} giao dịch khớp bộ lọc hiện tại`}
            </p>
          </div>
          {canManage && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditor({ kind: "categories" })}
                className="px-3 py-2"
              >
                <Tags className="size-4" />
                Danh mục chi khác
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditor({ kind: "recurring" })}
                className="px-3 py-2"
              >
                <CalendarPlus className="size-4" />
                Ghi khoản cố định
              </Button>
              {view === "transactions" && (
                <Button
                  type="button"
                  onClick={() => setEditor({ kind: "create" })}
                  className="px-4 py-2"
                >
                  <Plus className="size-4" />
                  Thêm giao dịch
                </Button>
              )}
            </div>
          )}
        </CardHeader>

        {error && (
          <div className="p-4">
            <Message value={error} />
          </div>
        )}

        {projectData ? (
          <ProjectFinanceTable
            data={projectData}
            canManage={canManage}
            deletingId={deletingId}
            setEditor={setEditor}
            onRemove={remove}
          />
        ) : transactionData?.items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <IconTile shape="circle" size="xl">
              <Wallet className="size-5" />
            </IconTile>
            <p className="text-sm text-muted">
              Chưa có giao dịch nào khớp. Thử bỏ bộ lọc hoặc thêm giao dịch mới.
            </p>
          </div>
        ) : (
          <TableContainer variant="bare">
            <Table className="min-w-[820px] table-fixed">
              <colgroup>
                <col className="w-[14%]" />
                <col className="w-[34%]" />
                <col className="w-[14%]" />
                <col className="w-[12%]" />
                <col className="w-[8%]" />
                {canManage && <col className="w-[8%]" />}
              </colgroup>
              <TableHeader className="text-left">
                <TableRow>
                  <TableHead className="px-3 sm:px-5">Mã giao dịch</TableHead>
                  <TableHead className="px-3 sm:px-5">Dự án / Hợp đồng</TableHead>
                  <TableHead className="px-3 text-right sm:px-5">Số tiền</TableHead>
                  <TableHead className="px-3 sm:px-5">Trạng thái</TableHead>
                  <TableHead className="px-3 text-center sm:px-5">Chi tiết</TableHead>
                  {canManage && (
                    <TableHead className="px-3 text-center sm:px-5">Thao tác</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactionData?.items.map((transaction) => (
                  <TableRow
                    key={transaction.id}
                    className="align-middle hover:bg-surface-subtle/60"
                  >
                    <TableCell className="px-3 sm:px-5">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-semibold text-foreground">
                          {transaction.code}
                        </p>
                        {isAutoManaged(transaction.source) && (
                          <Badge variant="info">Tự động</Badge>
                        )}
                      </div>
                      <p className="mt-1 text-xs font-normal text-note">
                        {formatDate(transaction.txnDate)}
                      </p>
                    </TableCell>
                    <TableCell className="px-3 sm:px-5">
                      {transaction.project ? (
                        <TextLink
                          href={`/projects/${transaction.project.id}?tab=tai-chinh`}
                          className="block truncate font-semibold text-foreground hover:text-foreground"
                        >
                          {transaction.project.code} · {transaction.project.name}
                        </TextLink>
                      ) : transaction.expenseCategory ? (
                        <p className="truncate font-semibold text-foreground">
                          Chi khác · {transaction.expenseCategory.name}
                        </p>
                      ) : (
                        <p className="truncate font-semibold text-foreground">
                          Không gắn dự án
                        </p>
                      )}
                      <p className="mt-1 truncate text-xs font-normal text-note">
                        {transaction.contract
                          ? `HĐ ${transaction.contract.code}`
                          : transaction.project && transaction.expenseCategory
                            ? `Chi khác · ${transaction.expenseCategory.name}`
                            : transaction.expenseCategory
                              ? "Chi phí chung, không gắn dự án"
                              : "Không gắn hợp đồng"}
                      </p>
                    </TableCell>
                    <TableCell className="px-3 text-right sm:px-5">
                      <TransactionAmount transaction={transaction} />
                    </TableCell>
                    <TableCell className="px-3 sm:px-5">
                      <StatusBadge status={transaction.status} />
                    </TableCell>
                    <TableCell className="px-3 text-center sm:px-5">
                      <Button
                        type="button"
                        onClick={() => setEditor({ kind: "detail", transaction })}
                        variant="ghost"
                        size="icon-sm"
                        className="p-1.5"
                        aria-label={`Xem chi tiết ${transaction.code}`}
                      >
                        <Eye className="size-4" />
                      </Button>
                    </TableCell>
                    {canManage && (
                      <TableCell className="px-3 sm:px-5">
                        {isAutoManaged(transaction.source) ? (
                          <div className="text-center">
                            <Badge variant="info">Chỉ đọc</Badge>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              type="button"
                              onClick={() => setEditor({ kind: "edit", transaction })}
                              aria-label={`Sửa ${transaction.code}`}
                              variant="ghost"
                              size="icon-sm"
                              className="p-1.5"
                            >
                              <Pencil className="size-4" />
                            </Button>
                            <Button
                              type="button"
                              onClick={() => remove(transaction)}
                              disabled={deletingId === transaction.id}
                              aria-label={`Xóa ${transaction.code}`}
                              variant="dangerGhost"
                              size="icon-sm"
                              className="p-1.5"
                            >
                              {deletingId === transaction.id ? (
                                <LoaderCircle className="size-4 animate-spin" />
                              ) : (
                                <Trash2 className="size-4" />
                              )}
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {(transactionData ?? projectData) && data.pageCount > 1 && (
          <CardFooter className="flex flex-col gap-3 px-5 py-4 text-sm sm:flex-row sm:items-center sm:justify-between">
            <p className="text-muted">
              Hiển thị {(data.page - 1) * data.pageSize + 1}–
              {Math.min(data.page * data.pageSize, data.total)} trong {data.total}{" "}
              {view === "projects" ? "dự án" : "giao dịch"}
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                disabled={data.page <= 1 || navigationPending}
                onClick={() => goToPage(data.page - 1)}
                variant="outline"
                size="sm"
                className="px-3 py-1.5"
              >
                Trang trước
              </Button>
              <span className="text-muted">
                {data.page}/{data.pageCount}
              </span>
              <Button
                type="button"
                disabled={data.page >= data.pageCount || navigationPending}
                onClick={() => goToPage(data.page + 1)}
                variant="outline"
                size="sm"
                className="px-3 py-1.5"
              >
                Trang sau
              </Button>
            </div>
          </CardFooter>
        )}
      </Card>

      {editor?.kind === "create" && (
        <Modal title="Thêm giao dịch thu / chi" onClose={() => setEditor(null)}>
          <TransactionForm
            projects={projects}
            contracts={contracts}
            initialProjectId={editor.projectId}
            initialContractId={editor.contractId}
            expenseCategories={expenseCategories}
            onDone={() => setEditor(null)}
          />
        </Modal>
      )}

      {editor?.kind === "edit" && (
        <Modal
          title={`Sửa giao dịch ${editor.transaction.code}`}
          onClose={() => setEditor(null)}
        >
          <TransactionForm
            transaction={editor.transaction}
            projects={projects}
            contracts={contracts}
            expenseCategories={expenseCategories}
            onDone={() => setEditor(null)}
          />
        </Modal>
      )}

      {editor?.kind === "categories" && categoryAdmin && (
        <Modal title="Danh mục chi khác" onClose={() => setEditor(null)}>
          <ExpenseCategoryManager categories={categoryAdmin} />
        </Modal>
      )}

      {editor?.kind === "recurring" && (
        <Modal title="Ghi khoản cố định hàng tháng" onClose={() => setEditor(null)}>
          <RecurringExpensesForm onDone={() => setEditor(null)} />
        </Modal>
      )}

      {editor?.kind === "detail" && (
        <Modal
          title="Chi tiết giao dịch"
          onClose={() => setEditor(null)}
          size="xl"
          titleClassName="text-h2 font-bold"
        >
          <TransactionDetailDialog
            transaction={editor.transaction}
            canManage={canManage}
            onEdit={() =>
              setEditor({ kind: "edit", transaction: editor.transaction })
            }
          />
        </Modal>
      )}
    </div>
  );
}
