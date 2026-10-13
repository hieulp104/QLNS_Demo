"use client";

import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Input,
  Label,
  MoneyInput,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui";

import { useEffect, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Pencil, Plus, Trash2 } from "lucide-react";
import { formatVnd } from "@/lib/utils";
import {
  createExpenseCategoryAction,
  copyRecurringExpensesAction,
  deleteExpenseCategoryAction,
  listRecurringCandidatesAction,
  updateExpenseCategoryAction,
} from "@/modules/finance/finance.actions";
import type { ExpenseCategoryItem } from "@/modules/finance/finance.expense";
import type { RecurringCandidate } from "@/modules/finance/finance.expense";

/**
 * Màn "Danh mục chi khác": kế toán tự đặt tên các khoản phụ chi (thuê xưởng,
 * điện xưởng, xe ô tô, thưởng doanh số…). Danh mục đã có giao dịch chỉ được
 * ngưng dùng — xóa đi thì báo cáo năm cũ mất tên dòng.
 */
export function ExpenseCategoryManager({
  categories,
}: {
  categories: ExpenseCategoryItem[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<ExpenseCategoryItem | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function toggleActive(category: ExpenseCategoryItem) {
    setBusyId(category.id);
    setError(null);
    const result = await updateExpenseCategoryAction({
      id: category.id,
      name: category.name,
      isRecurring: category.isRecurring,
      defaultAmount: category.defaultAmount ?? undefined,
      sortOrder: category.sortOrder,
      isActive: !category.isActive,
    });
    setBusyId(null);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    router.refresh();
  }

  async function remove(category: ExpenseCategoryItem) {
    if (!window.confirm(`Xóa danh mục "${category.name}"?`)) return;
    setBusyId(category.id);
    setError(null);
    const result = await deleteExpenseCategoryAction({ id: category.id });
    setBusyId(null);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Các khoản chi chung ngoài vật tư và lương. Mỗi danh mục là một dòng riêng
        trong <b>Cơ cấu chi phí</b> của trang Báo cáo. Đánh dấu <b>Cố định hàng tháng</b>{" "}
        để nút &quot;Ghi khoản cố định&quot; tạo sẵn mỗi tháng.
      </p>

      {error && (
        <Alert variant="danger" className="px-3 py-2">
          {error}
        </Alert>
      )}

      {editing ? (
        <CategoryForm
          category={editing === "new" ? undefined : editing}
          nextSortOrder={(categories.at(-1)?.sortOrder ?? 0) + 10}
          onDone={() => setEditing(null)}
        />
      ) : (
        <div className="flex justify-end">
          <Button type="button" size="sm" onClick={() => setEditing("new")}>
            <Plus className="size-4" />
            Thêm danh mục
          </Button>
        </div>
      )}

      <TableContainer>
        <Table className="min-w-[640px]">
          <TableHeader className="text-left">
            <TableRow>
              <TableHead className="px-3">Danh mục</TableHead>
              <TableHead className="px-3">Cố định</TableHead>
              <TableHead className="px-3 text-right">Số mặc định</TableHead>
              <TableHead className="px-3 text-right">Đã dùng</TableHead>
              <TableHead className="px-3 text-center">Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="px-3 py-8 text-center text-sm text-muted">
                  Chưa có danh mục nào. Bấm &quot;Thêm danh mục&quot; để tạo.
                </TableCell>
              </TableRow>
            )}
            {categories.map((category) => (
              <TableRow
                key={category.id}
                className={category.isActive ? undefined : "opacity-60"}
              >
                <TableCell className="px-3">
                  <span className="font-semibold text-foreground">{category.name}</span>
                  {!category.isActive && (
                    <Badge variant="warning" className="ml-2">
                      Đã ngưng
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="px-3 text-sm">
                  {category.isRecurring ? "Hàng tháng" : "—"}
                </TableCell>
                <TableCell className="px-3 text-right text-sm tabular-nums">
                  {category.defaultAmount ? formatVnd(category.defaultAmount) : "—"}
                </TableCell>
                <TableCell className="px-3 text-right text-sm tabular-nums">
                  {category.transactionCount} GD
                </TableCell>
                <TableCell className="px-3">
                  <div className="flex items-center justify-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="p-1.5"
                      aria-label={`Sửa ${category.name}`}
                      onClick={() => setEditing(category)}
                      disabled={busyId === category.id}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="plain"
                      size="sm"
                      onClick={() => toggleActive(category)}
                      disabled={busyId === category.id}
                    >
                      {category.isActive ? "Ngưng" : "Dùng lại"}
                    </Button>
                    {category.transactionCount === 0 && (
                      <Button
                        type="button"
                        variant="dangerGhost"
                        size="icon-sm"
                        className="p-1.5"
                        aria-label={`Xóa ${category.name}`}
                        onClick={() => remove(category)}
                        disabled={busyId === category.id}
                      >
                        {busyId === category.id ? (
                          <LoaderCircle className="size-4 animate-spin" />
                        ) : (
                          <Trash2 className="size-4" />
                        )}
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </div>
  );
}

function CategoryForm({
  category,
  nextSortOrder,
  onDone,
}: {
  category?: ExpenseCategoryItem;
  nextSortOrder: number;
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [isRecurring, setIsRecurring] = useState(category?.isRecurring ?? false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const base = {
      name: form.get("name"),
      isRecurring,
      defaultAmount: isRecurring ? form.get("defaultAmount") || undefined : undefined,
      sortOrder: form.get("sortOrder"),
    };
    startTransition(async () => {
      const result = category
        ? await updateExpenseCategoryAction({
            ...base,
            id: category.id,
            isActive: category.isActive,
          })
        : await createExpenseCategoryAction(base);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      onDone();
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-4 rounded-control border border-line bg-surface-subtle/50 p-4"
    >
      <p className="text-sm font-semibold text-foreground">
        {category ? `Sửa danh mục "${category.name}"` : "Thêm danh mục chi khác"}
      </p>
      {error && (
        <Alert variant="danger" className="px-3 py-2">
          {error}
        </Alert>
      )}
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
        <Label className="space-y-1.5 text-sm font-medium text-foreground">
          <span>Tên danh mục *</span>
          <Input
            name="name"
            required
            maxLength={80}
            defaultValue={category?.name ?? ""}
            placeholder="VD: Điện xưởng, Xăng xe giao hàng…"
          />
        </Label>
        <Label className="space-y-1.5 text-sm font-medium text-foreground">
          <span>Thứ tự hiển thị</span>
          <Input
            name="sortOrder"
            type="number"
            min={0}
            max={9999}
            defaultValue={category?.sortOrder ?? nextSortOrder}
          />
        </Label>
      </div>

      <label className="flex items-center gap-2 text-sm text-foreground">
        <Checkbox
          checked={isRecurring}
          onChange={(event) => setIsRecurring(event.target.checked)}
        />
        Khoản cố định hàng tháng (thuê xưởng, quỹ văn phòng…)
      </label>

      {isRecurring && (
        <Label className="block max-w-xs space-y-1.5 text-sm font-medium text-foreground">
          <span>Số tiền mặc định mỗi tháng</span>
          <MoneyInput
            name="defaultAmount"
            maxLength={30}
            defaultValue={category?.defaultAmount ?? ""}
            placeholder="Để trống nếu số đổi theo tháng"
          />
          <span className="block text-xs font-normal text-muted">
            Để trống với khoản thay đổi theo tháng như tiền điện — hệ thống chỉ
            nhắc tên, kế toán tự nhập số.
          </span>
        </Label>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onDone}>
          Hủy
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending && <LoaderCircle className="size-4 animate-spin" />}
          {category ? "Lưu" : "Thêm"}
        </Button>
      </div>
    </form>
  );
}

function currentMonthInVietnam(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}`;
}

/** "2026-09" → "tháng 9/2026" */
function monthLabel(month: string) {
  const [year, monthNumber] = month.split("-");
  return `tháng ${Number(monthNumber)}/${year}`;
}

type CandidateRow = RecurringCandidate & { checked: boolean; editedAmount: string };

/**
 * "Chép khoản cố định": liệt kê các khoản Chi khác của tháng trước (cộng khoản
 * cố định có số mặc định mà tháng trước chưa ghi), kế toán TICK khoản cần, sửa
 * số nếu tháng này khác (tiền điện…) rồi ghi sang tháng đang chọn — Đang chờ.
 */
export function RecurringExpensesForm({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const [initialMonth] = useState(currentMonthInVietnam);
  const thisYear = Number(initialMonth.slice(0, 4));
  const yearOptions = [thisYear - 1, thisYear, thisYear + 1];

  const [month, setMonth] = useState(initialMonth);
  const [sourceMonth, setSourceMonth] = useState<string | null>(null);
  const [rows, setRows] = useState<CandidateRow[] | null>(null);
  const [loading, startLoading] = useTransition();
  const [saving, startSaving] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ name: string; code: string }[] | null>(null);

  function fetchCandidates(nextMonth: string) {
    startLoading(async () => {
      const response = await listRecurringCandidatesAction({ month: nextMonth });
      if (!response.ok) {
        setError(response.message);
        setRows([]);
        return;
      }
      setSourceMonth(response.data.sourceMonth);
      setRows(
        response.data.candidates.map((candidate) => ({
          ...candidate,
          checked: candidate.suggested,
          editedAmount: candidate.amount,
        })),
      );
    });
  }

  function load(nextMonth: string) {
    setMonth(nextMonth);
    setError(null);
    fetchCandidates(nextMonth);
  }

  // Nạp danh sách ngay khi mở hộp thoại.
  useEffect(() => {
    fetchCandidates(initialMonth);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ chạy một lần lúc mở
  }, []);

  function update(key: string, patch: Partial<CandidateRow>) {
    setRows((current) =>
      current?.map((row) => (row.key === key ? { ...row, ...patch } : row)) ?? null,
    );
  }

  function setAll(checked: boolean) {
    setRows((current) => current?.map((row) => ({ ...row, checked })) ?? null);
  }

  function save() {
    const picked = rows?.filter((row) => row.checked) ?? [];
    setError(null);
    startSaving(async () => {
      const response = await copyRecurringExpensesAction({
        month,
        items: picked.map((row) => ({
          expenseCategoryId: row.categoryId,
          amount: row.editedAmount,
          note: row.note ?? undefined,
          projectId: row.projectId ?? undefined,
          day: row.day,
        })),
      });
      if (!response.ok) {
        setError(response.message);
        return;
      }
      setCreated(response.data.created);
      router.refresh();
    });
  }

  if (created) {
    return (
      <div className="space-y-4 text-sm">
        <Alert variant="success" className="px-3 py-2">
          Đã ghi {created.length} khoản sang <b>{monthLabel(month)}</b> ở trạng thái{" "}
          <b>Đang chờ</b>: {created.map((item) => `${item.name} (${item.code})`).join(", ")}.
          Khi trả tiền thật, mở giao dịch chuyển sang <b>Đã hoàn tất</b>.
        </Alert>
        <div className="flex justify-end">
          <Button type="button" onClick={onDone}>
            Xong
          </Button>
        </div>
      </div>
    );
  }

  const pickedCount = rows?.filter((row) => row.checked).length ?? 0;
  const [year, monthNumber] = month.split("-");

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Chọn tháng cần ghi. Danh sách bên dưới là các khoản <b>Chi khác của tháng trước</b>
        {" "}— tick khoản nào tháng này cũng chi, sửa số nếu khác (vd tiền điện), rồi bấm ghi.
        Các khoản được ghi ở trạng thái <b>Đang chờ</b>.
      </p>

      {/* Không dùng <input type="month">: trình duyệt tiếng Anh hiện "October 2026". */}
      <div className="flex max-w-sm gap-3">
        <Label className="flex-1 space-y-1.5 text-sm font-medium text-foreground">
          <span>Ghi cho tháng</span>
          <Select
            value={monthNumber}
            disabled={loading || saving}
            onChange={(event) => load(`${year}-${event.target.value}`)}
          >
            {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")).map((m) => (
              <option key={m} value={m}>
                Tháng {Number(m)}
              </option>
            ))}
          </Select>
        </Label>
        <Label className="flex-1 space-y-1.5 text-sm font-medium text-foreground">
          <span>Năm</span>
          <Select
            value={year}
            disabled={loading || saving}
            onChange={(event) => load(`${event.target.value}-${monthNumber}`)}
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        </Label>
      </div>

      {error && (
        <Alert variant="danger" className="px-3 py-2">
          {error}
        </Alert>
      )}

      {loading || rows === null ? (
        <p className="flex items-center gap-2 py-6 text-sm text-muted">
          <LoaderCircle className="size-4 animate-spin" />
          Đang tải các khoản của tháng trước…
        </p>
      ) : rows.length === 0 ? (
        <Alert variant="info" className="px-3 py-2">
          {sourceMonth ? `${monthLabel(sourceMonth)[0].toUpperCase()}${monthLabel(sourceMonth).slice(1)}` : "Tháng trước"}{" "}
          chưa có khoản Chi khác nào, và chưa có danh mục cố định nào có số mặc định.
          Hãy nhập tay bằng &quot;Thêm giao dịch&quot; → Chi khác.
        </Alert>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="text-muted">
              Lấy từ <b>{sourceMonth && monthLabel(sourceMonth)}</b> · đã chọn {pickedCount}/
              {rows.length}
            </span>
            <div className="flex gap-1">
              <Button type="button" variant="plain" size="sm" onClick={() => setAll(true)}>
                Chọn hết
              </Button>
              <Button type="button" variant="plain" size="sm" onClick={() => setAll(false)}>
                Bỏ hết
              </Button>
            </div>
          </div>

          <TableContainer>
            <Table className="min-w-[680px]">
              <TableHeader className="text-left">
                <TableRow>
                  <TableHead className="w-10 px-3" />
                  <TableHead className="px-3">Khoản chi</TableHead>
                  <TableHead className="w-20 px-3 text-center">Ngày</TableHead>
                  <TableHead className="w-44 px-3 text-right">Số tiền</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow
                    key={row.key}
                    className={row.checked ? undefined : "opacity-60"}
                  >
                    <TableCell className="px-3">
                      <Checkbox
                        checked={row.checked}
                        aria-label={`Chọn ${row.categoryName}`}
                        onChange={(event) => update(row.key, { checked: event.target.checked })}
                      />
                    </TableCell>
                    <TableCell className="px-3">
                      <p className="font-semibold text-foreground">{row.categoryName}</p>
                      {row.note && <p className="text-xs text-muted">{row.note}</p>}
                      <div className="mt-1 flex flex-wrap gap-1">
                        {row.projectLabel && <Badge variant="info">{row.projectLabel}</Badge>}
                        {!row.fromCode && <Badge variant="info">Theo số mặc định</Badge>}
                        {row.existsInTarget && (
                          <Badge variant="warning">{monthLabel(month)} đã có khoản này</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="px-3 text-center text-sm tabular-nums">
                      {String(row.day).padStart(2, "0")}/{monthNumber}
                    </TableCell>
                    <TableCell className="px-3">
                      <MoneyInput
                        key={`${month}-${row.key}`}
                        defaultValue={row.amount}
                        onInput={(event) =>
                          update(row.key, { editedAmount: event.currentTarget.value })
                        }
                        disabled={!row.checked}
                        aria-label={`Số tiền ${row.categoryName}`}
                        className="text-right"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          <div className="flex justify-end">
            <Button type="button" onClick={save} disabled={saving || pickedCount === 0}>
              {saving && <LoaderCircle className="size-4 animate-spin" />}
              Ghi {pickedCount} khoản sang {monthLabel(month)}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
