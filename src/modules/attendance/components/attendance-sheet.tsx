"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eraser,
  Info,
  LoaderCircle,
  TriangleAlert,
  Undo2,
  UsersRound,
} from "lucide-react";
import {
  Alert,
  Button,
  Card,
  Dialog,
  Input,
  Select,
} from "@/components/ui";
import {
  ATTENDANCE_MARKS,
  ATTENDANCE_MARK_LABEL,
  ATTENDANCE_MARK_SYMBOL,
} from "@/common/enums";
import { cn, formatDate } from "@/lib/utils";
import type { AttendanceMark } from "@/generated/prisma/enums";
import {
  bulkSetMarksAction,
  fillMonthAction,
  setMarkAction,
} from "@/modules/attendance/attendance.actions";
import type {
  MonthSheet,
  RosterEntry,
  SheetCell,
} from "@/modules/attendance/attendance.service";
import { RosterDialog } from "@/modules/attendance/components/roster-dialog";
import { MonthLockControl } from "@/modules/attendance/components/month-lock-control";
import type { PayrollSettings } from "@/modules/payroll/payroll.config";

/* ═══════════════════ HẰNG SỐ & TIỆN ÍCH ═══════════════════ */

/** Thứ tự bấm vòng ở chế độ mặc định: trống → X → / → N → L → trống. */
const CYCLE: (AttendanceMark | null)[] = [...ATTENDANCE_MARKS, null];

function nextMark(current: AttendanceMark | null): AttendanceMark | null {
  const idx = CYCLE.findIndex((m) => m === current);
  return CYCLE[(idx + 1) % CYCLE.length] ?? null;
}

/**
 * Màu ô theo ký hiệu. Đủ công để nhạt nhất vì nó chiếm ~90% bảng — tô đậm cả
 * bảng thì mắt không còn bắt được ngày nghỉ, thứ người ta thực sự đi tìm.
 */
const MARK_CLASS: Record<AttendanceMark, string> = {
  FULL: "text-foreground",
  HALF: "bg-surface-info text-info font-semibold",
  ABSENT: "bg-surface-warning text-warning font-semibold",
  HOLIDAY: "bg-surface-success text-success font-semibold",
  ANNUAL_LEAVE: "bg-surface-success text-success font-semibold",
};

const WEEKDAY_LABEL = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

/** Số công: bỏ ",0" thừa cho gọn — 26 chứ không phải 26,0. */
function fmtDays(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, "").replace(".", ",");
}

/** "YYYY-MM-DD" hôm nay theo giờ Việt Nam. */
function todayVN(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(
    new Date(),
  );
}

type CellKey = `${string}:${number}`;
/** "cycle" = bấm đổi vòng · một ký hiệu = tô thẳng · "erase" = tẩy. */
type PaintMode = "cycle" | AttendanceMark | "erase";

/* ═══════════════════ THÀNH PHẦN NHỎ ═══════════════════ */

/**
 * Dải quy tắc tính công. Đặt ngay đầu bảng vì đây là câu hỏi đầu tiên của bất
 * kỳ ai nhìn vào cột "Tổng": con số ấy ở đâu ra. Lấy từ cấu hình chứ không
 * viết chết, nên đổi hệ số là chữ ở đây đổi theo.
 */
function RuleStrip({ settings }: { settings: PayrollSettings }) {
  const rules = [
    { label: "Ngày thường", value: "X = 1 công · / = 0,5 công" },
    { label: "Chủ nhật đi làm", value: `1 công × ${fmtDays(settings.sundayFactor)} = ${fmtDays(settings.sundayFactor)} công` },
    { label: "Tăng ca", value: `${fmtDays(settings.overtimeHoursPerDay)} giờ = 1 công` },
    { label: "Lương ngày", value: `lương cơ bản ÷ ${settings.standardDays}` },
  ];

  return (
    <Card variant="filled" className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
      <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
        <Info className="size-3.5" />
        Cách tính công
      </span>
      {rules.map((r) => (
        <span key={r.label} className="text-xs text-muted">
          {r.label}:{" "}
          <strong className="font-medium text-foreground">{r.value}</strong>
        </span>
      ))}
    </Card>
  );
}

/** Ô số liệu tổng của cả công ty trong tháng. */
function TotalTile({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <Card className="px-4 py-3">
      <p className="text-xs text-muted">{label}</p>
      {/* Không dùng cn() ở đây: tailwind-merge coi `text-h2` là class MÀU (nó
          không biết đó là cỡ chữ tự định nghĩa) nên sẽ loại nó khi thấy
          `text-danger` — cỡ chữ biến mất mà không báo gì. */}
      <p
        className={
          accent
            ? "mt-0.5 text-h2 font-bold tabular-nums text-danger"
            : "mt-0.5 text-h2 font-bold tabular-nums text-foreground"
        }
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </Card>
  );
}

/* ═══════════════════ BẢNG CHÍNH ═══════════════════ */

export function AttendanceSheet({
  sheet,
  settings,
  canManage,
  manageableUserIds,
  roster,
  fixedSalaryIds,
  canRosterAttendance,
  canRosterPayroll,
  lock,
  canLock,
}: {
  sheet: MonthSheet;
  settings: PayrollSettings;
  canManage: boolean;
  manageableUserIds: string[];
  roster: RosterEntry[];
  fixedSalaryIds: string[];
  canRosterAttendance: boolean;
  canRosterPayroll: boolean;
  /** Tháng đã chốt bảng công — null là đang mở. */
  lock: { at: string; byName: string } | null;
  canLock: boolean;
}) {
  const [rosterOpen, setRosterOpen] = useState(false);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [overtimeFor, setOvertimeFor] = useState<string | null>(null);
  const [mode, setMode] = useState<PaintMode>("cycle");
  const [mobileUserId, setMobileUserId] = useState<string | null>(null);

  const [optimistic, setOptimistic] = useState<Record<CellKey, SheetCell | null>>({});
  const [lastFill, setLastFill] = useState<
    { userId: string; workDate: string }[] | null
  >(null);

  const painting = useRef(false);
  const buffer = useRef<Map<CellKey, { userId: string; day: number }>>(new Map());

  const canEdit = (userId: string) => manageableUserIds.includes(userId);
  const today = todayVN();

  const cellOf = useCallback(
    (userId: string, day: number): SheetCell | null => {
      const key: CellKey = `${userId}:${day}`;
      if (key in optimistic) return optimistic[key];
      return sheet.rows.find((r) => r.userId === userId)?.cells[day] ?? null;
    },
    [optimistic, sheet.rows],
  );

  const dateOf = useCallback(
    (day: number) =>
      `${sheet.year}-${String(sheet.month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    [sheet.month, sheet.year],
  );

  /* ── Ghi dữ liệu ─────────────────────────────────────── */

  const flush = useCallback(() => {
    const items = [...buffer.current.values()];
    buffer.current.clear();
    painting.current = false;
    if (items.length === 0) return;

    const mark = mode === "erase" || mode === "cycle" ? "" : mode;
    startTransition(async () => {
      const res = await bulkSetMarksAction({
        changes: items.map((i) => ({
          userId: i.userId,
          workDate: dateOf(i.day),
          mark,
          overtimeHours: cellOf(i.userId, i.day)?.overtimeHours ?? 0,
        })),
      });
      if (!res.ok) {
        setError(res.error);
        setOptimistic({});
        return;
      }
      router.refresh();
    });
  }, [cellOf, dateOf, mode, router]);

  // Thả chuột ở đâu cũng phải kết thúc lượt tô — kéo ra ngoài bảng rồi thả mà
  // không ghi thì người dùng tưởng vừa mất dữ liệu.
  useEffect(() => {
    function onUp() {
      if (painting.current) flush();
    }
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, [flush]);

  function paint(userId: string, day: number) {
    if (!canEdit(userId) || mode === "cycle") return;
    const key: CellKey = `${userId}:${day}`;
    if (buffer.current.has(key)) return;

    const current = cellOf(userId, day);
    setOptimistic((o) => ({
      ...o,
      [key]:
        mode === "erase"
          ? null
          : { mark: mode, overtimeHours: current?.overtimeHours ?? 0, note: null },
    }));
    buffer.current.set(key, { userId, day });
  }

  function cycle(userId: string, day: number) {
    if (!canEdit(userId) || pending) return;
    const current = cellOf(userId, day);
    const mark = nextMark(current?.mark ?? null);
    const key: CellKey = `${userId}:${day}`;

    setError(null);
    setOptimistic((o) => ({
      ...o,
      [key]: mark
        ? { mark, overtimeHours: current?.overtimeHours ?? 0, note: null }
        : null,
    }));

    startTransition(async () => {
      const res = await setMarkAction({
        userId,
        workDate: dateOf(day),
        mark: mark ?? "",
        overtimeHours: current?.overtimeHours ?? 0,
      });
      if (res.error) {
        setError(res.error);
        setOptimistic((o) => {
          const next = { ...o };
          delete next[key];
          return next;
        });
        return;
      }
      router.refresh();
    });
  }

  /** Bấm một ô: tùy chế độ mà đổi vòng hay tô thẳng. Dùng chung desktop + mobile. */
  function tapCell(userId: string, day: number) {
    if (mode === "cycle") {
      cycle(userId, day);
      return;
    }
    if (!canEdit(userId)) return;
    setError(null);
    paint(userId, day);
    flush();
  }

  function saveOvertime(userId: string, day: number, hours: number) {
    const current = cellOf(userId, day);
    const mark = current?.mark ?? (hours > 0 ? "FULL" : null);
    if (!mark) return;

    const key: CellKey = `${userId}:${day}`;
    setOptimistic((o) => ({ ...o, [key]: { mark, overtimeHours: hours, note: null } }));
    startTransition(async () => {
      const res = await setMarkAction({
        userId,
        workDate: dateOf(day),
        mark,
        overtimeHours: hours,
      });
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  function fillMonth() {
    setError(null);
    startTransition(async () => {
      const res = await fillMonthAction({ year: sheet.year, month: sheet.month });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setLastFill(res.filled);
      setOptimistic({});
      router.refresh();
    });
  }

  function undoFill() {
    if (!lastFill || lastFill.length === 0) return;
    setError(null);
    startTransition(async () => {
      const res = await bulkSetMarksAction({
        changes: lastFill.map((c) => ({
          userId: c.userId,
          workDate: c.workDate,
          mark: "",
        })),
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setLastFill(null);
      setOptimistic({});
      router.refresh();
    });
  }

  function clearRow(userId: string, fullName: string) {
    if (!window.confirm(`Xóa hết ký hiệu chấm công tháng này của ${fullName}?`)) return;
    setError(null);
    const changes = sheet.days
      .filter((d) => cellOf(userId, d.day))
      .map((d) => ({ userId, workDate: dateOf(d.day), mark: "" }));
    if (changes.length === 0) return;

    startTransition(async () => {
      const res = await bulkSetMarksAction({ changes });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOptimistic({});
      router.refresh();
    });
  }

  /* ── Điều hướng tháng ────────────────────────────────── */

  function goMonth(year: number, month: number) {
    const y = month === 0 ? year - 1 : month === 13 ? year + 1 : year;
    const m = month === 0 ? 12 : month === 13 ? 1 : month;
    router.push(`/cham-cong?year=${y}&month=${m}`);
  }

  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 6 }, (_, i) => thisYear - 3 + i);
  const otRow = sheet.rows.find((r) => r.userId === overtimeFor);
  const mobileRow =
    sheet.rows.find((r) => r.userId === mobileUserId) ?? sheet.rows[0] ?? null;

  /** Số công chủ nhật THÔ (chưa nhân hệ số) — để chú thích phép nhân cho minh bạch. */
  const rawSunday = (sundayDays: number) =>
    settings.sundayFactor > 0 ? sundayDays / settings.sundayFactor : 0;

  const modeButtons: { value: PaintMode; label: string; title: string }[] = useMemo(
    () => [
      { value: "cycle", label: "Bấm đổi vòng", title: "Bấm một ô để đổi X → / → N → L → trống" },
      ...ATTENDANCE_MARKS.map((m) => ({
        value: m as PaintMode,
        label: ATTENDANCE_MARK_SYMBOL[m],
        title: `Tô ${ATTENDANCE_MARK_LABEL[m]} — bấm hoặc kéo qua nhiều ô`,
      })),
      { value: "erase", label: "Tẩy", title: "Kéo qua các ô để xóa ký hiệu" },
    ],
    [],
  );

  return (
    <>
      {/* ─────────── Thanh tháng + hành động ─────────── */}
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <div className="flex items-center gap-1 rounded-control border border-line bg-surface p-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Tháng trước"
            onClick={() => goMonth(sheet.year, sheet.month - 1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Select
            value={String(sheet.month)}
            onChange={(e) => goMonth(sheet.year, Number(e.target.value))}
            className="w-[7.5rem] border-0 bg-transparent py-1.5 font-medium shadow-none"
            aria-label="Chọn tháng"
          >
            {MONTHS.map((m) => (
              <option key={m} value={m}>
                Tháng {m}
              </option>
            ))}
          </Select>
          <Select
            value={String(sheet.year)}
            onChange={(e) => goMonth(Number(e.target.value), sheet.month)}
            className="w-[6.5rem] border-0 bg-transparent py-1.5 font-medium shadow-none"
            aria-label="Chọn năm"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Tháng sau"
            onClick={() => goMonth(sheet.year, sheet.month + 1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>

        {canManage && (
          <>
            <Button
              type="button"
              variant="outline"
              className="px-3 py-2"
              disabled={pending}
              onClick={fillMonth}
            >
              {pending ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <CalendarCheck className="size-4" />
              )}
              Điền đủ công ngày thường
            </Button>

            {lastFill && lastFill.length > 0 && (
              <Button
                type="button"
                variant="dangerOutline"
                className="px-3 py-2"
                disabled={pending}
                onClick={undoFill}
                title={`Xóa lại ${lastFill.length} ô vừa điền`}
              >
                <Undo2 className="size-4" />
                Hoàn tác ({lastFill.length} ô)
              </Button>
            )}
          </>
        )}

        <MonthLockControl
          year={sheet.year}
          month={sheet.month}
          lock={lock}
          canLock={canLock}
        />

        {(canRosterAttendance || canRosterPayroll) && (
          <Button
            type="button"
            variant="ghost"
            className="px-3 py-2 sm:ml-auto"
            onClick={() => setRosterOpen(true)}
          >
            <UsersRound className="size-4" />
            Tùy chỉnh danh sách
          </Button>
        )}
      </div>

      {rosterOpen && (
        <RosterDialog
          year={sheet.year}
          month={sheet.month}
          entries={roster}
          fixedSalaryIds={fixedSalaryIds}
          canAttendance={canRosterAttendance}
          canPayroll={canRosterPayroll}
          onClose={() => setRosterOpen(false)}
        />
      )}

      <RuleStrip settings={settings} />

      {/* ─────────── Tổng của cả bảng ─────────── */}
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <TotalTile
          label="Công ngày thường"
          value={fmtDays(sheet.totals.workDays)}
          hint={`${sheet.rows.length} nhân viên`}
        />
        <TotalTile
          label="Công chủ nhật"
          value={fmtDays(sheet.totals.sundayDays)}
          hint={`${fmtDays(rawSunday(sheet.totals.sundayDays))} ngày × ${fmtDays(settings.sundayFactor)}`}
        />
        <TotalTile
          label="Công tăng ca"
          value={fmtDays(sheet.totals.overtimeDays)}
          hint={`${fmtDays(sheet.totals.overtimeHours)} giờ ÷ ${fmtDays(settings.overtimeHoursPerDay)}`}
        />
        <TotalTile
          label="Tổng công cả tháng"
          value={fmtDays(sheet.totals.totalDays)}
          hint="Số dùng để tính lương"
          accent
        />
      </div>

      {/* ─────────── Chế độ chấm ─────────── */}
      {canManage && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted">Chế độ chấm:</span>
          <div className="flex flex-wrap gap-1 rounded-control border border-line bg-surface p-1">
            {modeButtons.map((b) => (
              <Button
                key={b.value}
                type="button"
                size="sm"
                variant={mode === b.value ? "secondary" : "ghost"}
                className={cn(
                  "px-2.5 py-1",
                  b.value !== "cycle" && b.value !== "erase" && "w-9 justify-center font-semibold",
                )}
                title={b.title}
                onClick={() => setMode(b.value)}
              >
                {b.value === "erase" && <Eraser className="size-3.5" />}
                {b.label}
              </Button>
            ))}
          </div>
          <span className="text-xs text-muted">
            {mode === "cycle"
              ? "Bấm từng ô để đổi ký hiệu."
              : "Bấm hoặc giữ chuột kéo qua nhiều ô để tô một lượt."}
          </span>
        </div>
      )}

      {/* ─────────── Chú thích ký hiệu ─────────── */}
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
        {ATTENDANCE_MARKS.map((m) => (
          <span key={m} className="inline-flex items-center gap-1.5">
            <span
              className={cn(
                "inline-flex size-6 items-center justify-center rounded border border-line text-xs",
                MARK_CLASS[m],
              )}
            >
              {ATTENDANCE_MARK_SYMBOL[m]}
            </span>
            {ATTENDANCE_MARK_LABEL[m]}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-flex size-6 items-center justify-center rounded border border-dashed border-line text-muted">
            ·
          </span>
          Chưa chấm
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-flex size-6 items-center justify-center rounded border border-line bg-surface-info/60 text-[10px] font-semibold text-info">
            CN
          </span>
          Chủ nhật — ×{fmtDays(settings.sundayFactor)}
        </span>
      </div>

      {error && (
        <Alert variant="danger" className="mb-3 flex items-start gap-2 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </Alert>
      )}

      {sheet.rows.length === 0 ? (
        <Card variant="filled" className="p-6 text-sm text-muted">
          Không có nhân viên nào trong phạm vi bạn được xem.
        </Card>
      ) : (
        <>
          {/* ═══════════ BẢNG LƯỚI — màn hình rộng ═══════════ */}
          <Card className="hidden overflow-hidden lg:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1180px] table-fixed border-collapse select-none text-sm">
                <colgroup>
                  <col className="w-[210px]" />
                  {sheet.days.map((d) => (
                    <col key={d.day} className="w-[30px]" />
                  ))}
                  <col className="w-[92px]" />
                  <col className="w-[92px]" />
                  <col className="w-[80px]" />
                  <col className="w-[84px]" />
                </colgroup>

                <thead>
                  <tr className="border-b border-line bg-surface-subtle">
                    <th
                      rowSpan={2}
                      className="sticky left-0 z-20 border-r border-line bg-surface-subtle px-3 text-left text-xs font-semibold uppercase tracking-wide text-muted"
                    >
                      Nhân viên
                    </th>
                    {sheet.days.map((d) => (
                      <th
                        key={d.day}
                        className={cn(
                          "px-0 pt-1.5 text-center text-[10px] font-medium",
                          // Vạch ngăn tuần: dày hơn ở đầu mỗi tuần (thứ Hai).
                          d.date.getUTCDay() === 1 && "border-l-2 border-line-strong",
                          d.sunday ? "bg-surface-info text-info" : "text-muted",
                        )}
                      >
                        {WEEKDAY_LABEL[d.date.getUTCDay()]}
                      </th>
                    ))}
                    <th
                      colSpan={4}
                      className="border-l-2 border-line-strong px-2 pt-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-muted"
                    >
                      Tổng hợp công
                    </th>
                  </tr>
                  <tr className="border-b border-line bg-surface-subtle">
                    {sheet.days.map((d) => {
                      const isToday = dateOf(d.day) === today;
                      return (
                        <th
                          key={d.day}
                          className={cn(
                            "px-0 pb-1.5 text-center text-xs",
                            d.date.getUTCDay() === 1 && "border-l-2 border-line-strong",
                            d.sunday ? "bg-surface-info text-info" : "text-foreground",
                            isToday && "font-bold text-link",
                          )}
                          title={isToday ? "Hôm nay" : undefined}
                        >
                          {isToday ? (
                            <span className="mx-auto flex size-5 items-center justify-center rounded-full bg-link text-[10px] font-bold text-on-primary">
                              {d.day}
                            </span>
                          ) : (
                            d.day
                          )}
                        </th>
                      );
                    })}
                    <th className="border-l-2 border-line-strong px-2 pb-1.5 text-center text-[11px] font-semibold text-muted">
                      Tăng ca
                    </th>
                    <th className="px-2 pb-1.5 text-center text-[11px] font-semibold text-muted">
                      Chủ nhật
                    </th>
                    <th className="px-2 pb-1.5 text-center text-[11px] font-semibold text-muted">
                      Ngày thường
                    </th>
                    <th className="px-2 pb-1.5 text-center text-[11px] font-semibold text-foreground">
                      Tổng công
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {sheet.rows.map((row) => {
                    const editable = canEdit(row.userId);
                    return (
                      <tr
                        key={row.userId}
                        className="group border-b border-line last:border-0 hover:bg-surface-subtle/60"
                      >
                        <th className="sticky left-0 z-10 border-r border-line bg-surface px-3 py-1.5 text-left font-medium group-hover:bg-surface-subtle">
                          <span className="flex items-center gap-1.5">
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm text-foreground">
                                {row.fullName}
                              </span>
                              <span className="block truncate text-xs font-normal text-muted">
                                {row.resignedAt
                                  ? `Nghỉ từ ${formatDate(row.resignedAt)}`
                                  : (row.position ?? row.departmentName ?? "—")}
                              </span>
                            </span>
                            {editable && (
                              <Button
                                type="button"
                                variant="dangerGhost"
                                size="icon-sm"
                                className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                                aria-label={`Xóa chấm công cả tháng của ${row.fullName}`}
                                title="Xóa hết ký hiệu cả tháng của người này"
                                disabled={pending}
                                onClick={() => clearRow(row.userId, row.fullName)}
                              >
                                <Eraser className="size-3.5" />
                              </Button>
                            )}
                          </span>
                        </th>

                        {sheet.days.map((d) => {
                          const cell = cellOf(row.userId, d.day);
                          const isToday = dateOf(d.day) === today;
                          return (
                            <td
                              key={d.day}
                              className={cn(
                                "p-0 text-center",
                                d.date.getUTCDay() === 1 && "border-l-2 border-line-strong",
                                d.sunday && "bg-surface-info/40",
                                isToday && "bg-link/5",
                              )}
                            >
                              <button
                                type="button"
                                disabled={!editable}
                                onClick={() => tapCell(row.userId, d.day)}
                                onMouseDown={() => {
                                  if (mode === "cycle" || !editable) return;
                                  painting.current = true;
                                  setError(null);
                                  paint(row.userId, d.day);
                                }}
                                onMouseEnter={() => {
                                  if (painting.current) paint(row.userId, d.day);
                                }}
                                title={`${row.fullName} · ngày ${d.day}/${sheet.month}${
                                  cell ? ` — ${ATTENDANCE_MARK_LABEL[cell.mark]}` : " — chưa chấm"
                                }${cell?.overtimeHours ? ` · tăng ca ${cell.overtimeHours} giờ` : ""}`}
                                className={cn(
                                  "relative h-9 w-full text-xs transition-colors",
                                  cell ? MARK_CLASS[cell.mark] : "text-line-strong",
                                  editable && "hover:ring-2 hover:ring-inset hover:ring-primary/40",
                                  !editable && "cursor-default",
                                )}
                              >
                                {cell ? ATTENDANCE_MARK_SYMBOL[cell.mark] : "·"}
                                {cell && cell.overtimeHours > 0 && (
                                  <span className="absolute right-0 top-0 text-[9px] font-semibold leading-none text-info">
                                    {fmtDays(cell.overtimeHours)}
                                  </span>
                                )}
                              </button>
                            </td>
                          );
                        })}

                        {/* Tăng ca — hiện cả giờ lẫn công để thấy phép chia */}
                        <td className="border-l-2 border-line-strong px-2 py-1.5 text-center">
                          <button
                            type="button"
                            disabled={!editable && row.summary.overtimeHours === 0}
                            onClick={() => setOvertimeFor(row.userId)}
                            className={cn(
                              "w-full rounded px-1 py-0.5 text-center",
                              editable && "hover:bg-surface-raised",
                            )}
                            title="Nhập giờ tăng ca từng ngày"
                          >
                            {row.summary.overtimeHours > 0 ? (
                              <>
                                <span className="block text-sm font-semibold tabular-nums text-foreground">
                                  {fmtDays(row.summary.overtimeDays)}
                                </span>
                                <span className="block text-[10px] text-muted">
                                  {fmtDays(row.summary.overtimeHours)} giờ
                                </span>
                              </>
                            ) : (
                              <span className="text-xs text-muted">
                                {editable ? "+ giờ" : "—"}
                              </span>
                            )}
                          </button>
                        </td>

                        {/* Chủ nhật — hiện phép nhân 1,5 */}
                        <td className="px-2 py-1.5 text-center">
                          {row.summary.sundayDays > 0 ? (
                            <>
                              <span className="block text-sm font-semibold tabular-nums text-foreground">
                                {fmtDays(row.summary.sundayDays)}
                              </span>
                              <span className="block text-[10px] text-muted">
                                {fmtDays(rawSunday(row.summary.sundayDays))} ×{" "}
                                {fmtDays(settings.sundayFactor)}
                              </span>
                            </>
                          ) : (
                            <span className="text-xs text-muted">—</span>
                          )}
                        </td>

                        <td className="px-2 py-1.5 text-center text-sm tabular-nums text-foreground">
                          {row.summary.workDays > 0 ? fmtDays(row.summary.workDays) : "—"}
                        </td>

                        <td className="bg-surface-subtle/60 px-2 py-1.5 text-center text-base font-bold tabular-nums text-danger">
                          {row.summary.totalDays > 0 ? fmtDays(row.summary.totalDays) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>

                <tfoot>
                  <tr className="border-t-2 border-line-strong bg-surface-subtle font-semibold">
                    <th className="sticky left-0 z-10 border-r border-line bg-surface-subtle px-3 py-2 text-left text-sm">
                      Cộng
                    </th>
                    <td colSpan={sheet.days.length} />
                    <td className="border-l-2 border-line-strong px-2 py-2 text-center text-sm tabular-nums">
                      {fmtDays(sheet.totals.overtimeDays)}
                    </td>
                    <td className="px-2 py-2 text-center text-sm tabular-nums">
                      {fmtDays(sheet.totals.sundayDays)}
                    </td>
                    <td className="px-2 py-2 text-center text-sm tabular-nums">
                      {fmtDays(sheet.totals.workDays)}
                    </td>
                    <td className="px-2 py-2 text-center text-base tabular-nums text-danger">
                      {fmtDays(sheet.totals.totalDays)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>

          {/* ═══════════ LỊCH THEO NGƯỜI — điện thoại / máy tính bảng ═══════════ */}
          {mobileRow && (
            <div className="space-y-3 lg:hidden">
              <Select
                value={mobileRow.userId}
                onChange={(e) => setMobileUserId(e.target.value)}
                aria-label="Chọn nhân viên"
              >
                {sheet.rows.map((r) => (
                  <option key={r.userId} value={r.userId}>
                    {r.fullName}
                    {r.resignedAt
                      ? ` — nghỉ từ ${formatDate(r.resignedAt)}`
                      : r.position
                        ? ` — ${r.position}`
                        : ""}
                  </option>
                ))}
              </Select>

              <Card className="p-4">
                <div className="mb-3 grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-muted">
                  {WEEKDAY_LABEL.slice(1).concat(WEEKDAY_LABEL[0]).map((w) => (
                    <span key={w} className={cn(w === "CN" && "text-info")}>
                      {w}
                    </span>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-1">
                  {/* Ô đệm để ngày 1 rơi đúng cột thứ của nó (tuần bắt đầu từ T2) */}
                  {Array.from({
                    length: (sheet.days[0].date.getUTCDay() + 6) % 7,
                  }).map((_, i) => (
                    <span key={`pad-${i}`} />
                  ))}

                  {sheet.days.map((d) => {
                    const cell = cellOf(mobileRow.userId, d.day);
                    const editable = canEdit(mobileRow.userId);
                    const isToday = dateOf(d.day) === today;
                    return (
                      <button
                        key={d.day}
                        type="button"
                        disabled={!editable}
                        onClick={() => tapCell(mobileRow.userId, d.day)}
                        className={cn(
                          "flex aspect-square flex-col items-center justify-center rounded-control border text-sm",
                          d.sunday ? "border-info/30 bg-surface-info/50" : "border-line",
                          cell ? MARK_CLASS[cell.mark] : "text-line-strong",
                          isToday && "ring-2 ring-link",
                          !editable && "opacity-70",
                        )}
                      >
                        <span className="text-[10px] leading-none text-muted">{d.day}</span>
                        <span className="text-base font-semibold leading-tight">
                          {cell ? ATTENDANCE_MARK_SYMBOL[cell.mark] : "·"}
                        </span>
                        {cell && cell.overtimeHours > 0 && (
                          <span className="text-[9px] leading-none text-info">
                            {fmtDays(cell.overtimeHours)}h
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-3 text-sm">
                  <div>
                    <dt className="text-xs text-muted">Công ngày thường</dt>
                    <dd className="font-semibold tabular-nums text-foreground">
                      {fmtDays(mobileRow.summary.workDays)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">
                      Công chủ nhật (×{fmtDays(settings.sundayFactor)})
                    </dt>
                    <dd className="font-semibold tabular-nums text-foreground">
                      {fmtDays(mobileRow.summary.sundayDays)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">
                      Tăng ca ({fmtDays(mobileRow.summary.overtimeHours)} giờ ÷{" "}
                      {fmtDays(settings.overtimeHoursPerDay)})
                    </dt>
                    <dd className="font-semibold tabular-nums text-foreground">
                      {fmtDays(mobileRow.summary.overtimeDays)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Tổng công</dt>
                    <dd className="text-h3 font-bold tabular-nums text-danger">
                      {fmtDays(mobileRow.summary.totalDays)}
                    </dd>
                  </div>
                </dl>

                {canEdit(mobileRow.userId) && (
                  <div className="mt-3 flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="px-2.5 py-1.5"
                      onClick={() => setOvertimeFor(mobileRow.userId)}
                    >
                      <Clock className="size-3.5" />
                      Giờ tăng ca
                    </Button>
                    <Button
                      type="button"
                      variant="dangerOutline"
                      size="sm"
                      className="px-2.5 py-1.5"
                      disabled={pending}
                      onClick={() => clearRow(mobileRow.userId, mobileRow.fullName)}
                    >
                      <Eraser className="size-3.5" />
                      Xóa cả tháng
                    </Button>
                  </div>
                )}
              </Card>
            </div>
          )}
        </>
      )}

      {/* ─────────── Nhập giờ tăng ca ─────────── */}
      {otRow && (
        <Dialog
          title={`Giờ tăng ca — ${otRow.fullName}`}
          onClose={() => setOvertimeFor(null)}
        >
          <div className="border-b border-line bg-surface-subtle px-5 py-3">
            <p className="text-sm text-foreground">
              Tháng {sheet.month}/{sheet.year}:{" "}
              <strong className="tabular-nums">
                {fmtDays(otRow.summary.overtimeHours)} giờ
              </strong>{" "}
              ÷ {fmtDays(settings.overtimeHoursPerDay)} ={" "}
              <strong className="tabular-nums text-danger">
                {fmtDays(otRow.summary.overtimeDays)} công
              </strong>
            </p>
            <p className="mt-0.5 text-xs text-muted">
              Chỉ hiện những ngày người này có mặt. Nhập giờ rồi bấm ra ngoài ô để lưu.
            </p>
          </div>

          <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {sheet.days
                .filter((d) => {
                  const cell = cellOf(otRow.userId, d.day);
                  // Ngày chưa chấm hoặc đã chấm nghỉ thì không có gì để tăng ca.
                  return (
                    (cell && cell.mark !== "ABSENT") || (cell?.overtimeHours ?? 0) > 0
                  );
                })
                .map((d) => {
                  const cell = cellOf(otRow.userId, d.day);
                  return (
                    <label
                      key={d.day}
                      className="flex items-center gap-2 text-sm text-foreground"
                    >
                      <span
                        className={cn(
                          "w-20 shrink-0 text-xs",
                          d.sunday ? "text-info" : "text-muted",
                        )}
                      >
                        {WEEKDAY_LABEL[d.date.getUTCDay()]} {d.day}/{sheet.month}
                      </span>
                      <Input
                        type="number"
                        min={0}
                        max={16}
                        step={0.5}
                        defaultValue={cell?.overtimeHours || ""}
                        disabled={!canEdit(otRow.userId)}
                        onBlur={(e) => {
                          const hours = Number(e.target.value || 0);
                          if (hours === (cell?.overtimeHours ?? 0)) return;
                          saveOvertime(otRow.userId, d.day, hours);
                        }}
                        className="py-1.5"
                      />
                    </label>
                  );
                })}
            </div>

            {sheet.days.every((d) => {
              const cell = cellOf(otRow.userId, d.day);
              return !cell || cell.mark === "ABSENT";
            }) && (
              <p className="py-6 text-center text-sm text-muted">
                Chưa chấm ngày công nào cho người này trong tháng, nên chưa nhập được
                giờ tăng ca.
              </p>
            )}
          </div>
        </Dialog>
      )}
    </>
  );
}
