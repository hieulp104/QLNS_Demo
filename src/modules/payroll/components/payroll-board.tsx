"use client";

import { useActionState, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Banknote,
  Calculator,
  CalendarRange,
  ChevronDown,
  CircleMinus,
  Gift,
  HandCoins,
  Lock,
  LockOpen,
  LoaderCircle,
  Pencil,
  Settings2,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import {
  Alert,
  Badge,
  Button,
  ButtonAnchor,
  Card,
  Dialog,
  FormCard,
  FormField,
  Input,
  Select,
  Textarea,
  TextLink,
  MoneyInput,
} from "@/components/ui";
import { PAYROLL_STATUS_LABEL, TXN_TYPE_LABEL } from "@/common/enums";

import { cn, formatVnd, roundDays as days } from "@/lib/utils";
import type { PayrollStatus, TxnType } from "@/generated/prisma/enums";
import {
  recalcPeriodAction,
  setPeriodCutoffAction,
  setPeriodStatusAction,
  updateLineAction,
  updatePayrollSettingsAction,
  type ActionState,
} from "@/modules/payroll/payroll.actions";
import type {
  PayrollLineView,
  PayrollTotals,
  WorkRange,
} from "@/modules/payroll/payroll.service";
import type { PayrollSettings } from "@/modules/payroll/payroll.config";
import {
  actualPaidOf,
  netSalaryOf,
  totalBonusOf,
  type PayrollAmounts,
} from "@/modules/payroll/payroll.formula";
import {
  AdvancePanel,
  type AdvanceRow,
} from "@/modules/payroll/components/advance-panel";

const initialState: ActionState = { error: null };
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

/** Ô số chỉ hiện khi khác 0 — bảng lương của công ty để trống thay vì ghi 0. */
function Money({ value, bold }: { value: number; bold?: boolean }) {
  if (!value) return <span className="text-muted">—</span>;
  return (
    <span className={bold ? "font-semibold text-foreground" : "text-foreground"}>
      {formatVnd(value)}
    </span>
  );
}

export type BoardWorkRange = WorkRange & {
  daysInMonth: number;
  /** Kỳ tháng sau đã chốt → không đổi ngày chốt công được nữa. */
  nextLocked: boolean;
};

/** "26/02" — ngày `@db.Date` lưu 00:00 UTC nên đọc thẳng phần UTC. */
function dayMonth(date: Date): string {
  const d = new Date(date);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Ngày liền trước — cận trên của khoảng là "không gồm". */
function dayBefore(date: Date): Date {
  return new Date(new Date(date).getTime() - 86_400_000);
}

const nextMonthOf = (month: number) => (month === 12 ? 1 : month + 1);

/** Chênh lệch chi thực tế so với thực nhận, kiểu "+30.000" / "−5.000". */
function signedVnd(value: number): string {
  return `${value > 0 ? "+" : "−"}${formatVnd(Math.abs(value)).replace(/\s*₫$/, "")}`;
}

/**
 * Dải "kỳ công" ngay trên bảng lương: kỳ này lấy công từ ngày nào tới ngày nào,
 * và phần nào chuyển sang / chuyển từ tháng khác. Không có dải này thì kế toán
 * nhìn tổng công tháng 3 lớn bất thường mà không biết vì sao.
 */
function WorkRangeStrip({
  year,
  month,
  range,
  canEdit,
  onEdit,
}: {
  year: number;
  month: number;
  range: BoardWorkRange;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const ownFrom = new Date(Date.UTC(year, month - 1, 1));
  const ownTo = dayBefore(range.to);
  const tailFrom = range.cutoffDay
    ? new Date(Date.UTC(year, month - 1, range.cutoffDay + 1))
    : null;
  const lastDay = new Date(Date.UTC(year, month - 1, range.daysInMonth));
  const special = Boolean(range.carryFrom || range.cutoffDay);

  return (
    <Card
      variant={special ? "default" : "filled"}
      className={cn(
        "mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 text-sm",
        special && "border-wood-300",
      )}
    >
      <span className="flex items-center gap-2 font-medium text-foreground">
        <CalendarRange className="size-4 text-primary" />
        Kỳ công
      </span>

      <span className="flex flex-wrap items-center gap-1.5 tabular-nums">
        {range.carryFrom && (
          <>
            <Badge variant="warning" title={`Công cuối tháng ${month === 1 ? 12 : month - 1} tính vào kỳ này`}>
              {dayMonth(range.carryFrom)} – {dayMonth(dayBefore(ownFrom))}
            </Badge>
            <span className="text-muted">+</span>
          </>
        )}
        <Badge variant="success">
          {dayMonth(ownFrom)} – {dayMonth(ownTo)}
        </Badge>
        {tailFrom && (
          <span className="flex items-center gap-1.5 text-muted">
            <ArrowRight className="size-3.5" />
            <span className="tabular-nums">
              {dayMonth(tailFrom)} – {dayMonth(lastDay)}
            </span>
            tính vào lương tháng {nextMonthOf(month)}
          </span>
        )}
      </span>

      {range.carryFrom && (
        <span className="text-xs text-muted">
          Công cuối tháng trước tính theo mức lương tháng {month}.
        </span>
      )}

      {canEdit && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-auto px-2.5 py-1"
          onClick={onEdit}
        >
          <Pencil className="size-3.5" />
          Ngày chốt công
        </Button>
      )}
    </Card>
  );
}

/**
 * Chọn ngày chốt công. Thanh ngày bên dưới tô màu đúng phần nào thuộc kỳ nào để
 * kế toán nhìn là hiểu, không phải đọc giải thích.
 */
function CutoffDialog({
  year,
  month,
  range,
  onClose,
}: {
  year: number;
  month: number;
  range: BoardWorkRange;
  onClose: () => void;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"full" | "cut">(range.cutoffDay ? "cut" : "full");
  const [day, setDay] = useState<number>(
    range.cutoffDay ?? Math.max(1, range.daysInMonth - 3),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const cutoff = mode === "cut" ? day : null;
  const next = nextMonthOf(month);
  const allDays = Array.from({ length: range.daysInMonth }, (_, i) => i + 1);

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await setPeriodCutoffAction({ year, month, cutoffDay: cutoff });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
      onClose();
    });
  }

  return (
    <Dialog
      title={`Ngày chốt công — lương tháng ${month}/${year}`}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2 px-5 py-3">
          <Button type="button" variant="outline" className="px-4 py-2" disabled={pending} onClick={onClose}>
            Hủy
          </Button>
          <Button
            type="button"
            className="px-4 py-2"
            disabled={pending || range.nextLocked || cutoff === range.cutoffDay}
            onClick={save}
          >
            {pending && <LoaderCircle className="size-4 animate-spin" />}
            Lưu và tính lại
          </Button>
        </div>
      }
    >
      <div className="space-y-4 px-5 py-4">
        <p className="text-sm text-muted">
          Dùng khi trả lương sớm (vd. trước Tết): các ngày sau ngày chốt sẽ chuyển
          sang bảng lương tháng {next} và tính theo mức lương tháng {next}.
        </p>

        <div className="grid gap-2 sm:grid-cols-2">
          <ModeOption
            active={mode === "full"}
            onClick={() => setMode("full")}
            title="Tính hết tháng"
            detail={`Công 01 – ${range.daysInMonth}/${String(month).padStart(2, "0")} vào lương tháng ${month}`}
          />
          <ModeOption
            active={mode === "cut"}
            onClick={() => setMode("cut")}
            title="Chốt công sớm"
            detail="Phần cuối tháng chuyển sang kỳ sau"
          />
        </div>

        {mode === "cut" && (
          <FormField label="Chốt công đến hết ngày" htmlFor="cutoffDay">
            <Select
              id="cutoffDay"
              value={String(day)}
              onChange={(e) => setDay(Number(e.target.value))}
              className="w-[11rem]"
            >
              {allDays.slice(0, -1).map((d) => (
                <option key={d} value={d}>
                  Ngày {d}/{month}
                </option>
              ))}
            </Select>
          </FormField>
        )}

        {/* Thanh ngày: xanh = kỳ này, gỗ = chuyển sang tháng sau */}
        <div>
          <div className="grid grid-cols-[repeat(16,minmax(0,1fr))] gap-1 sm:grid-cols-[repeat(31,minmax(0,1fr))]">
            {allDays.map((d) => {
              const carried = cutoff !== null && d > cutoff;
              return (
                <span
                  key={d}
                  title={`${d}/${month} → lương tháng ${carried ? next : month}`}
                  className={cn(
                    "flex h-7 items-center justify-center rounded text-[10px] font-semibold tabular-nums transition-colors",
                    carried ? "bg-wood-400 text-white" : "bg-brand-100 text-brand-800",
                  )}
                >
                  {d}
                </span>
              );
            })}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-brand-100 ring-1 ring-brand-300" />
              Lương tháng {month}
              {cutoff ? ` · 01 – ${String(cutoff).padStart(2, "0")}/${String(month).padStart(2, "0")}` : ""}
            </span>
            {cutoff && (
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-wood-400" />
                Lương tháng {next} · {String(cutoff + 1).padStart(2, "0")} – {range.daysInMonth}/
                {String(month).padStart(2, "0")} ({range.daysInMonth - cutoff} ngày)
              </span>
            )}
          </div>
        </div>

        {range.nextLocked ? (
          <Alert variant="danger" className="flex items-start gap-2 text-xs">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
            <span>
              Bảng lương tháng {next} đã chốt. Đổi ngày chốt công lúc này sẽ làm
              lệch số đã trả — mở lại kỳ tháng {next} trước.
            </span>
          </Alert>
        ) : (
          <Alert variant="info" className="text-xs">
            Lưu xong hệ thống tự tính lại bảng lương tháng {month}
            {` và tháng ${next} (nếu đã lập)`}. Các ô đã gõ tay được giữ nguyên.
          </Alert>
        )}

        {error && (
          <Alert variant="danger" className="flex items-start gap-2 text-xs">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
            <span>{error}</span>
          </Alert>
        )}
      </div>
    </Dialog>
  );
}

function ModeOption({
  active,
  onClick,
  title,
  detail,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  detail: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-card border px-3 py-2.5 text-left transition-colors",
        active
          ? "border-primary bg-brand-50 ring-1 ring-primary"
          : "border-line hover:border-line-strong",
      )}
    >
      <span className="block text-sm font-medium text-foreground">{title}</span>
      <span className="mt-0.5 block text-xs text-muted">{detail}</span>
    </button>
  );
}

/** Số tiền từ ô MoneyInput ("1.250.000" → 1250000). Ô trống → 0. */
function moneyOf(form: FormData, name: string): number {
  return Number(String(form.get(name) ?? "").replace(/\D/g, "") || 0);
}

/**
 * Một mục thu gọn được của hộp sửa dòng lương. Đóng thì chỉ còn một dòng: tên
 * mục + con số tổng bên phải, nên cả hộp vừa một màn hình; bấm vào mới mở chi
 * tiết. Dùng `<details>` nên ô bên trong vẫn nằm trong form và được gửi đi kể
 * cả khi mục đang đóng.
 */
function LineSection({
  icon,
  title,
  hint,
  amount,
  tone = "neutral",
  defaultOpen,
  children,
}: {
  icon: ReactNode;
  title: string;
  hint: string;
  amount: number;
  tone?: "neutral" | "minus" | "plus";
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const sign = tone === "minus" && amount ? "−" : tone === "plus" && amount ? "+" : "";
  return (
    <details
      open={defaultOpen}
      className="group rounded-card border border-line bg-surface transition-colors open:border-line-strong open:bg-surface-raised"
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 px-3.5 py-3 select-none [&::-webkit-details-marker]:hidden">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-subtle text-primary">
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-foreground">{title}</span>
          <span className="block truncate text-xs text-muted">{hint}</span>
        </span>
        <span
          className={cn(
            "shrink-0 text-sm font-semibold tabular-nums",
            tone === "minus" && amount ? "text-money-expense" : "",
            tone === "plus" && amount ? "text-money-income" : "",
            !amount && "text-muted",
          )}
        >
          {amount ? `${sign}${formatVnd(amount)}` : "—"}
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-3 border-t border-line px-3.5 pt-3 pb-4">{children}</div>
    </details>
  );
}

/** Ô chỉ đọc (lấy từ nơi khác) — trông khác hẳn ô nhập để không ai gõ thử. */
function ReadOnlyMoney({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="rounded-md bg-surface-subtle px-3 py-2">
      <p className="text-xs text-muted">{label}</p>
      <p className="text-sm font-semibold tabular-nums text-foreground">
        {value ? formatVnd(value) : "—"}
      </p>
      <p className="mt-0.5 text-[11px] text-muted">{hint}</p>
    </div>
  );
}

function EditLineDialog({
  line,
  onClose,
}: {
  line: PayrollLineView;
  onClose: () => void;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    updateLineAction,
    initialState,
  );

  // Số đang gõ trên form — để tổng từng mục và thực nhận ở chân hộp đổi ngay
  // khi gõ, kế toán không phải bấm Lưu mới biết mình gõ ra bao nhiêu.
  const [draft, setDraft] = useState(() => ({
    roundedSalary: line.roundedSalary,
    materialDeduction: line.materialDeduction,
    otherDeduction: line.otherDeduction,
    bonusSales: line.bonusSales,
    bonusResponsibility: line.bonusResponsibility,
    bonusAttendance: line.bonusAttendance,
    bonusPunctuality: line.bonusPunctuality,
    bonusOther: line.bonusOther,
    actualPaid: line.actualPaid,
  }));

  function readForm(form: HTMLFormElement) {
    const data = new FormData(form);
    const paidRaw = String(data.get("actualPaid") ?? "").replace(/\D/g, "");
    setDraft({
      roundedSalary: moneyOf(data, "roundedSalary"),
      materialDeduction: moneyOf(data, "materialDeduction"),
      otherDeduction: moneyOf(data, "otherDeduction"),
      bonusSales: moneyOf(data, "bonusSales"),
      bonusResponsibility: moneyOf(data, "bonusResponsibility"),
      bonusAttendance: moneyOf(data, "bonusAttendance"),
      bonusPunctuality: moneyOf(data, "bonusPunctuality"),
      bonusOther: moneyOf(data, "bonusOther"),
      actualPaid: paidRaw === "" ? null : Number(paidRaw),
    });
  }

  const amounts: PayrollAmounts = {
    ...draft,
    advanceAmount: line.advanceAmount,
    insuranceDeduction: line.insuranceDeduction,
  };
  const deductions =
    line.advanceAmount + line.insuranceDeduction + draft.materialDeduction + draft.otherDeduction;
  const bonuses = totalBonusOf(amounts) + draft.bonusOther;
  const net = netSalaryOf(amounts);
  const paid = actualPaidOf(draft.actualPaid, net);

  if (state.ok) {
    // Lưu xong thì đóng và nạp lại số liệu mới.
    setTimeout(() => {
      router.refresh();
      onClose();
    }, 0);
  }

  const formId = `edit-line-${line.id}`;

  return (
    <Dialog
      title={
        <span className="block">
          {line.fullName}
          <span className="block text-xs font-normal text-muted">
            {line.position ?? line.departmentName ?? "Sửa dòng lương"}
            {line.isFixedSalary ? " · lương khoán" : ""}
          </span>
        </span>
      }
      onClose={onClose}
      footer={
        <div className="flex flex-wrap items-center gap-3 px-5 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted">
              {draft.actualPaid !== null && paid !== net
                ? `Thực nhận ${formatVnd(net)} · làm tròn ${signedVnd(paid - net)}`
                : "Lương thực nhận"}
            </p>
            <p className="text-lg font-bold tabular-nums text-money-income">
              {formatVnd(paid)}
            </p>
          </div>
          <Button type="button" variant="outline" className="px-4 py-2" onClick={onClose}>
            Đóng
          </Button>
          <Button type="submit" form={formId} disabled={pending} className="px-4 py-2">
            {pending && <LoaderCircle className="size-4 animate-spin" />}
            Lưu
          </Button>
        </div>
      }
    >
      <form
        id={formId}
        action={formAction}
        onInput={(e) => readForm(e.currentTarget)}
        className="space-y-2.5 px-5 py-4"
      >
        <Input type="hidden" name="id" value={line.id} />

        <LineSection
          icon={<Banknote className="size-4" />}
          title="Lương"
          hint={`${days(line.totalDays)} công · thực tế ${formatVnd(line.grossSalary)}`}
          amount={draft.roundedSalary}
        >
          <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-md bg-surface-subtle px-3 py-2 text-xs text-muted tabular-nums">
            <span>Lương cơ bản <strong className="text-foreground">{formatVnd(line.baseSalary)}</strong></span>
            <span>
              Công {days(line.workDays)} HC + {days(line.sundayDays + line.overtimeDays)} CN/TC
              {line.carriedDays > 0 && <> + {days(line.carriedDays)} tháng trước</>} ={" "}
              <strong className="text-foreground">{days(line.totalDays)}</strong>
            </span>
          </div>
          <FormField
            label="Lương làm tròn"
            htmlFor="roundedSalary"
            hint={
              line.isFixedSalary
                ? "Lương khoán — gõ thẳng số tiền cả tháng."
                : `Lương thực tế ${formatVnd(line.grossSalary)}. Hệ thống không tự làm tròn.`
            }
          >
            <MoneyInput id="roundedSalary" name="roundedSalary" defaultValue={line.roundedSalary || ""} />
          </FormField>
        </LineSection>

        <LineSection
          icon={<CircleMinus className="size-4" />}
          title="Khoản trừ"
          hint="Ứng lương · BHXH · trừ lương · quỹ"
          amount={deductions}
          tone="minus"
        >
          <div className="grid gap-2 sm:grid-cols-2">
            <ReadOnlyMoney label="Đã ứng trong tháng" value={line.advanceAmount} hint="Sửa ở tab Ứng lương" />
            <ReadOnlyMoney label="BHXH" value={line.insuranceDeduction} hint="Theo mức đóng trong Lịch sử lương" />
          </div>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <FormField label="Trừ lương" htmlFor="materialDeduction">
              <MoneyInput
                id="materialDeduction"
                name="materialDeduction"
                defaultValue={line.materialDeduction || ""}
              />
            </FormField>
            <FormField label="Lý do trừ" htmlFor="deductionNote">
              <Input
                id="deductionNote"
                name="deductionNote"
                maxLength={200}
                placeholder="Vd: Lấy 3 tấm ván MDF, vật tư sửa nhà"
                defaultValue={line.deductionNote ?? ""}
              />
            </FormField>
          </div>
          <FormField label="Trừ quỹ / khoản khác" htmlFor="otherDeduction" hint="Trừ sau thưởng, vd quỹ văn phòng">
            <MoneyInput id="otherDeduction" name="otherDeduction" defaultValue={line.otherDeduction || ""} />
          </FormField>
        </LineSection>

        <LineSection
          icon={<Gift className="size-4" />}
          title="Thưởng"
          hint="Doanh số · trách nhiệm · chuyên cần · đúng giờ · thưởng khác"
          amount={bonuses}
          tone="plus"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Doanh số" htmlFor="bonusSales">
              <MoneyInput id="bonusSales" name="bonusSales" defaultValue={line.bonusSales || ""} />
            </FormField>
            <FormField label="Trách nhiệm" htmlFor="bonusResponsibility">
              <MoneyInput
                id="bonusResponsibility"
                name="bonusResponsibility"
                defaultValue={line.bonusResponsibility || ""}
              />
            </FormField>
            <FormField label="Chuyên cần" htmlFor="bonusAttendance">
              <MoneyInput id="bonusAttendance" name="bonusAttendance" defaultValue={line.bonusAttendance || ""} />
            </FormField>
            <FormField label="Đúng giờ" htmlFor="bonusPunctuality">
              <MoneyInput id="bonusPunctuality" name="bonusPunctuality" defaultValue={line.bonusPunctuality || ""} />
            </FormField>
          </div>
          <FormField
            label="Thưởng khác"
            htmlFor="bonusOther"
            hint="Thưởng Tết, chuyên cần tháng trước trả bù… — ghi lý do ở mục Chi trả"
          >
            <MoneyInput id="bonusOther" name="bonusOther" defaultValue={line.bonusOther || ""} />
          </FormField>
        </LineSection>

        <LineSection
          icon={<HandCoins className="size-4" />}
          title="Chi trả"
          hint={draft.actualPaid !== null ? "Đã gõ chi thực tế" : "Chi đúng bằng thực nhận"}
          amount={paid}
        >
          <FormField
            label="Chi thực tế"
            htmlFor="actualPaid"
            hint={`Số tiền thật sự đưa cho nhân viên sau khi làm tròn. Bỏ trống = bằng thực nhận (${formatVnd(net)}). Tài chính ghi theo số này.`}
          >
            <MoneyInput
              id="actualPaid"
              name="actualPaid"
              placeholder="Bằng thực nhận"
              defaultValue={line.actualPaid ?? ""}
            />
          </FormField>
          <FormField label="Ghi chú" htmlFor="note">
            <Textarea
              id="note"
              name="note"
              rows={2}
              maxLength={200}
              placeholder="Vd: Thưởng Tết 2025 · CC+ĐG tháng 1"
              defaultValue={line.note ?? ""}
            />
          </FormField>
        </LineSection>

        {state.error && (
          <Alert variant="danger" className="flex items-start gap-2 text-xs">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
            <span>{state.error}</span>
          </Alert>
        )}
      </form>
    </Dialog>
  );
}

/**
 * Chốt / mở lại kỳ lương ghi thẳng sang Tài chính, nên phải cho kế toán nhìn rõ
 * từng con số sẽ được ghi trước khi bấm. Trước đây dùng window.confirm: chữ trần,
 * không canh được cột tiền, lạc hẳn khỏi giao diện còn lại của app.
 */
function LockPeriodDialog({
  year,
  month,
  locked,
  totals,
  pending,
  onConfirm,
  onClose,
}: {
  year: number;
  month: number;
  locked: boolean;
  totals: PayrollTotals;
  pending: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const insuranceTotal = totals.insuranceDeduction + totals.employerInsurance;
  const label = `tháng ${month}/${year}`;

  return (
    <Dialog
      title={locked ? `Mở lại kỳ lương ${label}` : `Chốt bảng lương ${label}`}
      size="sm"
      variant={locked ? "danger" : "default"}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2 px-5 py-3">
          <Button
            type="button"
            variant="outline"
            className="px-4 py-2"
            disabled={pending}
            onClick={onClose}
          >
            Hủy
          </Button>
          <Button
            type="button"
            variant={locked ? "danger" : "secondary"}
            className="px-4 py-2"
            disabled={pending}
            onClick={onConfirm}
          >
            {pending && <LoaderCircle className="size-4 animate-spin" />}
            {locked ? "Mở lại kỳ" : "Chốt kỳ lương"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 px-5 py-4">
        {locked ? (
          <>
            <p className="text-sm text-foreground">
              Hai giao dịch dưới đây sẽ bị gỡ khỏi Tài chính cho tới khi anh chị
              chốt lại kỳ này.
            </p>
            <Card variant="filled" className="divide-y divide-line">
              <SummaryRow label="Chi lương (chi thực tế)" value={totals.paid} />
              <SummaryRow label="Bảo hiểm" value={insuranceTotal} />
            </Card>
            <Alert variant="warning" className="text-xs">
              Các khoản tạm ứng vẫn giữ nguyên — tiền đó đã ra khỏi quỹ thật rồi.
            </Alert>
          </>
        ) : (
          <>
            <p className="text-sm text-foreground">
              Sẽ ghi vào Tài chính, đề ngày cuối {label}:
            </p>
            <Card variant="filled" className="divide-y divide-line">
              <SummaryRow
                label="Chi lương (chi thực tế)"
                value={totals.paid}
                detail={
                  totals.paid !== totals.netSalary ? (
                    <>
                      Thực nhận {formatVnd(totals.netSalary)} · làm tròn khi chi{" "}
                      {signedVnd(totals.paid - totals.netSalary)}
                    </>
                  ) : undefined
                }
              />
              <SummaryRow
                label="Bảo hiểm"
                value={insuranceTotal}
                detail={
                  <>
                    Trừ lương nhân viên {formatVnd(totals.insuranceDeduction)} ·
                    công ty đóng {formatVnd(totals.employerInsurance)}
                  </>
                }
              />
            </Card>
            <Alert variant="warning" className="text-xs">
              Tạm ứng {formatVnd(totals.advanceAmount)} đã được ghi riêng theo từng
              ngày ứng, không cộng lại ở đây.
            </Alert>
          </>
        )}
      </div>
    </Dialog>
  );
}

/** Một dòng "nhãn — số tiền" trong hộp xác nhận chốt kỳ. */
function SummaryRow({
  label,
  value,
  detail,
}: {
  label: string;
  value: number;
  detail?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-sm text-foreground">{label}</p>
        {detail && <p className="mt-0.5 text-xs text-muted">{detail}</p>}
      </div>
      <span className="shrink-0 font-semibold tabular-nums text-foreground">
        {formatVnd(value)}
      </span>
    </div>
  );
}

function SettingsDialog({
  settings,
  onClose,
}: {
  settings: PayrollSettings;
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    updatePayrollSettingsAction,
    initialState,
  );

  return (
    <Dialog title="Quy tắc tính công & lương" onClose={onClose}>
      <FormCard action={formAction} className="space-y-3 border-0 p-5 shadow-none">
        <FormField
          label="Hệ số công ngày chủ nhật"
          htmlFor="sundayFactor"
          hint="Đang dùng 1.5 — đúng bảng chấm công hiện tại của công ty"
        >
          <Input
            id="sundayFactor"
            name="sundayFactor"
            inputMode="decimal"
            defaultValue={settings.sundayFactor}
          />
        </FormField>
        <FormField
          label="Số giờ tăng ca đổi được 1 công"
          htmlFor="overtimeHoursPerDay"
          hint="Đang dùng 4 giờ = 1 công (tương đương 8 giờ × 200%)"
        >
          <Input
            id="overtimeHoursPerDay"
            name="overtimeHoursPerDay"
            inputMode="decimal"
            defaultValue={settings.overtimeHoursPerDay}
          />
        </FormField>
        <FormField
          label="Số ngày công chuẩn của tháng"
          htmlFor="standardDays"
          hint="Lương ngày = lương cơ bản ÷ số này. Đang dùng 26."
        >
          <Input
            id="standardDays"
            name="standardDays"
            inputMode="numeric"
            defaultValue={settings.standardDays}
          />
        </FormField>
        <FormField
          label="Bảo hiểm — nhân viên đóng (%)"
          htmlFor="insurancePercent"
          hint="Đang dùng 10.5%, trừ vào lương. Tính trên mức đóng khai ở từng hồ sơ nhân viên"
        >
          <Input
            id="insurancePercent"
            name="insurancePercent"
            inputMode="decimal"
            defaultValue={settings.insuranceRate * 100}
          />
        </FormField>
        <FormField
          label="Bảo hiểm — công ty đóng (%)"
          htmlFor="employerInsurancePercent"
          hint="Mặc định 21.5% (BHXH 17.5 + BHYT 3 + BHTN 1). Không trừ vào lương, chỉ ghi vào chi phí"
        >
          <Input
            id="employerInsurancePercent"
            name="employerInsurancePercent"
            inputMode="decimal"
            defaultValue={settings.employerInsuranceRate * 100}
          />
        </FormField>

        {state.error && (
          <Alert variant="danger" className="flex items-start gap-2 text-xs">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
            <span>{state.error}</span>
          </Alert>
        )}
        {state.ok && !state.error && (
          <Alert variant="success" className="text-xs">
            Đã lưu. Bấm &quot;Tính lại&quot; để áp dụng cho kỳ lương đang mở.
          </Alert>
        )}

        <div className="flex gap-2">
          <Button type="submit" disabled={pending} className="px-4 py-2">
            {pending && <LoaderCircle className="size-4 animate-spin" />}
            Lưu cấu hình
          </Button>
          <Button type="button" variant="outline" className="px-4 py-2" onClick={onClose}>
            Đóng
          </Button>
        </div>
        <p className="text-xs text-muted">
          Đổi cấu hình chỉ ảnh hưởng các lần tính lại về sau. Kỳ lương đã chốt giữ
          nguyên số cũ.
        </p>
      </FormCard>
    </Dialog>
  );
}

export function PayrollBoard({
  year,
  month,
  status,
  periodId,
  lockedBy,
  lockedAt,
  lines,
  totals,
  canManage,
  canManageSettings,
  settings,
  employees,
  advances,
  financeCodes,
  canSeeFinance,
  staleAdvanceNames,
  missingSalaryNames,
  workRange,
}: {
  year: number;
  month: number;
  status: PayrollStatus | null;
  periodId: string | null;
  lockedBy: string | null;
  lockedAt: Date | null;
  lines: PayrollLineView[];
  totals: PayrollTotals;
  canManage: boolean;
  canManageSettings: boolean;
  settings: PayrollSettings;
  employees: { id: string; fullName: string }[];
  advances: AdvanceRow[];
  advancedUserIds: string[];
  /** Giao dịch "Chi lương" / "BHXH" bên Tài chính của kỳ đã chốt. */
  financeCodes: { code: string; type: TxnType }[];
  canSeeFinance: boolean;
  /** Người có số "đã ứng" trên bảng lương lệch sổ ứng — phải tính lại trước khi chốt. */
  staleAdvanceNames: string[];
  /** Người có công / có ứng nhưng chưa khai mốc lương cho tháng này. */
  missingSalaryNames: string[];
  /** Kỳ công: khoảng ngày lấy công, có thể lệch tháng khi có ngày chốt công. */
  workRange: BoardWorkRange;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"luong" | "ung">("luong");
  const [editing, setEditing] = useState<PayrollLineView | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showCutoff, setShowCutoff] = useState(false);

  // Cột phụ chỉ hiện khi tháng đó có dùng — giống file Excel mỗi tháng một kiểu,
  // tháng thường không bị kéo dài bảng bởi ba cột trống.
  const showCarried = Boolean(workRange.carryFrom) || totals.carriedDays > 0;
  const showOther = totals.bonusOther > 0 || totals.otherDeduction > 0;
  const showPaid = lines.some((l) => l.actualPaid !== null);
  const carriedLabel = workRange.carryFrom
    ? `Công ${dayMonth(workRange.carryFrom)}–${dayMonth(dayBefore(new Date(Date.UTC(year, month - 1, 1))))}`
    : "Công tháng trước";
  const [confirmingLock, setConfirmingLock] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const locked = status === "LOCKED";

  function goMonth(y: number, m: number) {
    router.push(`/bang-luong?year=${y}&month=${m}`);
  }

  function recalc() {
    setError(null);
    startTransition(async () => {
      const res = await recalcPeriodAction({ year, month });
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  // Chot / mo ky ghi thang sang Tai chinh, nen xac nhan qua Dialog rieng co bay
  // du tung con so se ghi - xem LockPeriodDialog.
  function confirmLock() {
    if (!periodId) return;
    setError(null);
    startTransition(async () => {
      const res = await setPeriodStatusAction(periodId, locked ? "DRAFT" : "LOCKED");
      if (!res.ok) setError(res.error);
      else router.refresh();
      setConfirmingLock(false);
    });
  }

  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 6 }, (_, i) => thisYear - 3 + i);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <Select
          value={String(month)}
          onChange={(e) => goMonth(year, Number(e.target.value))}
          className="w-[9rem]"
        >
          {MONTHS.map((m) => (
            <option key={m} value={m}>
              Tháng {m}
            </option>
          ))}
        </Select>
        <Select
          value={String(year)}
          onChange={(e) => goMonth(Number(e.target.value), month)}
          className="w-[7.5rem]"
        >
          {years.map((y) => (
            <option key={y} value={y}>
              Năm {y}
            </option>
          ))}
        </Select>

        {status && (
          <Badge variant={locked ? "success" : "warning"}>
            {PAYROLL_STATUS_LABEL[status]}
            {locked && lockedBy ? ` · ${lockedBy}` : ""}
          </Badge>
        )}

        <div className="ml-auto flex flex-wrap gap-2">
          {canManage && !locked && (
            <Button
              type="button"
              variant="outline"
              className="px-3 py-2"
              disabled={pending}
              onClick={recalc}
            >
              {pending ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Calculator className="size-4" />
              )}
              Tính lại từ bảng chấm công
            </Button>
          )}
          {canManage && periodId && (
            <Button
              type="button"
              variant={locked ? "outline" : "secondary"}
              className="px-3 py-2"
              disabled={pending}
              onClick={() => setConfirmingLock(true)}
            >
              {locked ? <LockOpen className="size-4" /> : <Lock className="size-4" />}
              {locked ? "Mở lại kỳ" : "Chốt kỳ lương"}
            </Button>
          )}
          {periodId && (
            <ButtonAnchor
              href={`/api/payroll/export?year=${year}&month=${month}`}
              variant="outline"
              className="px-3 py-2"
            >
              Xuất Excel
            </ButtonAnchor>
          )}
          {canManageSettings && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Quy tắc tính lương"
              title="Quy tắc tính lương"
              onClick={() => setShowSettings(true)}
            >
              <Settings2 className="size-4" />
            </Button>
          )}
        </div>
      </div>

      <WorkRangeStrip
        year={year}
        month={month}
        range={workRange}
        canEdit={canManage && !locked}
        onEdit={() => setShowCutoff(true)}
      />

      {error && (
        <Alert variant="danger" className="mb-3 flex items-start gap-2 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </Alert>
      )}
      {locked && (
        <Alert variant="success" className="mb-3 text-sm">
          Kỳ lương đã chốt{lockedAt ? ` ngày ${new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }).format(lockedAt)}` : ""}.
          Muốn sửa thì mở lại kỳ.
          {financeCodes.length > 0 && (
            <span className="mt-1 block">
              Đã ghi sang Tài chính:{" "}
              {financeCodes.map((t, i) => (
                <span key={t.code}>
                  {i > 0 && " · "}
                  {canSeeFinance ? (
                    <TextLink href={`/finance?q=${t.code}`} className="font-semibold">
                      {t.code}
                    </TextLink>
                  ) : (
                    <strong>{t.code}</strong>
                  )}{" "}
                  ({TXN_TYPE_LABEL[t.type]})
                </span>
              ))}
            </span>
          )}
        </Alert>
      )}
      {missingSalaryNames.length > 0 && (
        <Alert variant="warning" className="mb-3 flex items-start gap-2 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>
            <strong>{missingSalaryNames.length} người chưa khai lương cho tháng này</strong>{" "}
            ({missingSalaryNames.join(", ")}) nên không có dòng trong bảng. Vào hồ
            sơ từng người, mục <strong>Lịch sử lương</strong>, thêm mốc áp dụng từ
            tháng này hoặc sớm hơn, rồi bấm <strong>Tính lại</strong>.
          </span>
        </Alert>
      )}
      {!locked && staleAdvanceNames.length > 0 && (
        <Alert variant="warning" className="mb-3 flex items-start gap-2 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>
            Sổ ứng lương đã thay đổi sau lần tính lại gần nhất ({staleAdvanceNames.join(", ")}).
            Bấm <strong>Tính lại từ bảng chấm công</strong> trước khi chốt, nếu không số
            gửi sang Tài chính sẽ lệch.
          </span>
        </Alert>
      )}

      <div className="mb-4 flex gap-2">
        <Button
          type="button"
          variant={tab === "luong" ? "secondary" : "ghost"}
          size="sm"
          className="px-3 py-1.5"
          onClick={() => setTab("luong")}
        >
          Bảng lương
        </Button>
        <Button
          type="button"
          variant={tab === "ung" ? "secondary" : "ghost"}
          size="sm"
          className="px-3 py-1.5"
          onClick={() => setTab("ung")}
        >
          <Wallet className="size-3.5" />
          Ứng lương ({advances.length})
        </Button>
      </div>

      {tab === "ung" ? (
        <AdvancePanel
          year={year}
          month={month}
          rows={advances}
          employees={employees}
          canManage={canManage}
          locked={locked}
        />
      ) : lines.length === 0 ? (
        <Card variant="filled" className="p-6 text-sm text-muted">
          Chưa có dòng lương nào cho tháng này.
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1400px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line bg-surface-subtle text-xs">
                  <th className="sticky left-0 z-10 bg-surface-subtle px-3 py-2 text-left font-semibold">
                    Nhân viên
                  </th>
                  <th className="px-2 py-2 text-right font-semibold">Lương cơ bản</th>
                  <th className="px-2 py-2 text-center font-semibold">Công HC</th>
                  <th className="px-2 py-2 text-center font-semibold">TC + CN</th>
                  {showCarried && (
                    <th
                      className="bg-wood-100 px-2 py-2 text-center font-semibold text-wood-800"
                      title="Công + tăng ca cuối tháng trước, sau ngày chốt công — tính theo mức lương tháng này"
                    >
                      {carriedLabel}
                    </th>
                  )}
                  <th className="px-2 py-2 text-center font-semibold">Tổng công</th>
                  <th className="px-2 py-2 text-right font-semibold">Lương thực tế</th>
                  <th className="px-2 py-2 text-right font-semibold">Làm tròn</th>
                  <th className="px-2 py-2 text-right font-semibold">Ứng</th>
                  <th className="px-2 py-2 text-right font-semibold">Trừ lương</th>
                  <th className="px-2 py-2 text-right font-semibold">BHXH</th>
                  <th className="px-2 py-2 text-right font-semibold">Tổng lương</th>
                  <th className="px-2 py-2 text-right font-semibold">Thưởng</th>
                  {showOther && (
                    <>
                      <th className="px-2 py-2 text-right font-semibold">Thưởng khác</th>
                      <th className="px-2 py-2 text-right font-semibold">Trừ khác</th>
                    </>
                  )}
                  <th className="px-2 py-2 text-right font-semibold">Thực nhận</th>
                  {showPaid && (
                    <th className="bg-brand-50 px-2 py-2 text-right font-semibold text-brand-800">
                      Chi thực tế
                    </th>
                  )}
                  {canManage && !locked && <th className="w-10" />}
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.id} className="border-b border-line last:border-0">
                    <th className="sticky left-0 z-10 max-w-[220px] bg-surface px-3 py-2 text-left font-medium">
                      <span className="block truncate text-foreground">{l.fullName}</span>
                      <span className="block truncate text-xs font-normal text-muted">
                        {l.position ?? l.departmentName ?? "—"}
                        {l.isFixedSalary ? " · lương khoán" : ""}
                      </span>
                    </th>
                    <td className="px-2 py-2 text-right tabular-nums">
                      <Money value={l.baseSalary} />
                    </td>
                    <td className="px-2 py-2 text-center tabular-nums text-foreground">
                      {days(l.workDays) || "—"}
                    </td>
                    <td className="px-2 py-2 text-center tabular-nums text-foreground">
                      {days(l.sundayDays + l.overtimeDays) || "—"}
                    </td>
                    {showCarried && (
                      <td className="bg-wood-50 px-2 py-2 text-center tabular-nums text-foreground">
                        {days(l.carriedDays) || "—"}
                      </td>
                    )}
                    <td className="px-2 py-2 text-center font-semibold tabular-nums text-foreground">
                      {days(l.totalDays) || "—"}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      <Money value={l.grossSalary} />
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      <Money value={l.roundedSalary} />
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      <Money value={l.advanceAmount} />
                    </td>
                    <td className="max-w-[160px] px-2 py-2 text-right tabular-nums">
                      <Money value={l.materialDeduction} />
                      {l.materialDeduction > 0 && l.deductionNote && (
                        <span
                          className="block truncate text-[11px] text-muted"
                          title={l.deductionNote}
                        >
                          {l.deductionNote}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      <Money value={l.insuranceDeduction} />
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      <Money value={l.totalSalary} />
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      <Money value={l.totalBonus} />
                    </td>
                    {showOther && (
                      <>
                        <td className="px-2 py-2 text-right tabular-nums" title={l.note ?? undefined}>
                          <Money value={l.bonusOther} />
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          <Money value={l.otherDeduction} />
                        </td>
                      </>
                    )}
                    <td className="px-2 py-2 text-right tabular-nums">
                      <Money value={l.netSalary} bold={!showPaid} />
                    </td>
                    {showPaid && (
                      <td className="bg-brand-50/60 px-2 py-2 text-right tabular-nums">
                        <Money value={l.paid} bold />
                        {l.actualPaid !== null && l.actualPaid !== l.netSalary && (
                          <span className="block text-[11px] text-muted">
                            {signedVnd(l.actualPaid - l.netSalary)}
                          </span>
                        )}
                      </td>
                    )}
                    {canManage && !locked && (
                      <td className="px-1 py-2 text-center">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Sửa dòng lương ${l.fullName}`}
                          onClick={() => setEditing(l)}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-surface-subtle font-semibold">
                  <th className="sticky left-0 z-10 bg-surface-subtle px-3 py-2 text-left">
                    Cộng
                  </th>
                  <td className="px-2 py-2 text-right tabular-nums">
                    <Money value={totals.baseSalary} />
                  </td>
                  <td className="px-2 py-2 text-center tabular-nums">{days(totals.workDays)}</td>
                  <td className="px-2 py-2 text-center tabular-nums">{days(totals.bonusDays)}</td>
                  {showCarried && (
                    <td className="bg-wood-100 px-2 py-2 text-center tabular-nums">
                      {days(totals.carriedDays)}
                    </td>
                  )}
                  <td className="px-2 py-2 text-center tabular-nums">{days(totals.totalDays)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    <Money value={totals.grossSalary} />
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    <Money value={totals.roundedSalary} />
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    <Money value={totals.advanceAmount} />
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    <Money value={totals.materialDeduction} />
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    <Money value={totals.insuranceDeduction} />
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    <Money value={totals.totalSalary} />
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    <Money value={totals.totalBonus} />
                  </td>
                  {showOther && (
                    <>
                      <td className="px-2 py-2 text-right tabular-nums">
                        <Money value={totals.bonusOther} />
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        <Money value={totals.otherDeduction} />
                      </td>
                    </>
                  )}
                  <td className="px-2 py-2 text-right tabular-nums">
                    <Money value={totals.netSalary} bold={!showPaid} />
                  </td>
                  {showPaid && (
                    <td className="bg-brand-50 px-2 py-2 text-right tabular-nums">
                      <Money value={totals.paid} bold />
                    </td>
                  )}
                  {canManage && !locked && <td />}
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}

      {editing && (
        <EditLineDialog line={editing} onClose={() => setEditing(null)} />
      )}
      {showSettings && (
        <SettingsDialog settings={settings} onClose={() => setShowSettings(false)} />
      )}
      {showCutoff && (
        <CutoffDialog
          year={year}
          month={month}
          range={workRange}
          onClose={() => setShowCutoff(false)}
        />
      )}
      {confirmingLock && (
        <LockPeriodDialog
          year={year}
          month={month}
          locked={locked}
          totals={totals}
          pending={pending}
          onConfirm={confirmLock}
          onClose={() => setConfirmingLock(false)}
        />
      )}
    </>
  );
}
