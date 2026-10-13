"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatVnd } from "@/lib/utils";
import { Card, ChartDot } from "@/components/ui";
import type { MonthlyRow } from "@/modules/reports/reports.service";

/**
 * Màu series ĐÃ CHẠY QUA validator dataviz (CVD ΔE 8.2, đạt target):
 *   xanh brand-400  = tiền THỰC (COMPLETED)
 *   gỗ   wood-600   = tiền GHI NHẬN (PENDING)
 * Đường xu hướng dùng brand-800 — bước đậm cùng hue, là số dẫn xuất chứ không
 * phải series mới. WARN contrast của brand-400 được bù bằng bảng số liệu đầy đủ
 * đặt cạnh biểu đồ (quy định của validator).
 */
const COLOR_ACTUAL = "var(--money-income)";
const COLOR_PENDING = "var(--money-income-muted)";
const COLOR_TREND = "var(--money-neutral)";

/** Trục tiền gọn: 1.200.000.000 → "1,2 tỷ", 350.000.000 → "350 tr". */
function shortVnd(value: number): string {
  if (value === 0) return "0";
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} tỷ`;
  }
  if (abs >= 1_000_000) {
    return `${Math.round(value / 1_000_000).toLocaleString("vi-VN")} tr`;
  }
  return value.toLocaleString("vi-VN");
}

const axisTick = { fill: "var(--color-muted)", fontSize: "var(--text-xs)" } as const;

function VndTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: {
    name?: string;
    value?: number | string;
    color?: string;
    dataKey?: string;
  }[];
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;
  return (
    <Card className="px-3.5 py-2.5 text-sm">
      <p className="mb-1.5 font-medium text-foreground">Tháng {label}</p>
      {payload.map((entry) => (
        <p key={entry.name} className="flex items-center gap-2 text-muted">
          <ChartDot color={entry.color} />
          {entry.name}:{" "}
          <span
            className={
              entry.dataKey === "thuPending"
                ? "font-medium text-money-income-muted"
                : "font-medium text-money-income"
            }
          >
            {entry.dataKey === "thuPending" ? "" : "+"}
            {formatVnd(Math.abs(Number(entry.value)))}
          </span>
        </p>
      ))}
    </Card>
  );
}

/** Trung bình trượt 3 tháng — đường xu hướng cho RP-04. */
function withTrend(months: MonthlyRow[]) {
  return months.map((m, i) => {
    const window = months.slice(Math.max(0, i - 2), i + 1);
    const trend =
      window.reduce((sum, w) => sum + w.thuCompleted, 0) / window.length;
    return { ...m, trend: Math.round(trend) };
  });
}

/**
 * RP-04 — biểu đồ doanh thu: cột doanh thu thực theo tháng + đường xu hướng
 * (trung bình trượt 3 tháng).
 */
export function RevenueChart({ months }: { months: MonthlyRow[] }) {
  const data = withTrend(months);

  return (
    <Card className="p-5">
      <h3 className="mb-4 text-h3 font-semibold text-foreground">
        Thu thực theo tháng
      </h3>
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--color-line)"
            vertical={false}
          />
          <XAxis
            dataKey="month"
            tickLine={false}
            axisLine={false}
            tick={axisTick}
            tickFormatter={(m: number) => `T${m}`}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={axisTick}
            tickFormatter={shortVnd}
            width={62}
          />
          <Tooltip content={<VndTooltip />} cursor={{ fill: "var(--color-line)", opacity: 0.35 }} />
          <Legend
            wrapperStyle={{ fontSize: "var(--text-xs)" }}
            formatter={(value: string) => (
              <span style={{ color: "var(--color-muted)" }}>{value}</span>
            )}
          />
          <Bar
            dataKey="thuCompleted"
            name="Thu thực"
            fill={COLOR_ACTUAL}
            maxBarSize={26}
            radius={[4, 4, 0, 0]}
          />
          <Line
            dataKey="trend"
            name="Xu hướng thu (TB 3 tháng)"
            stroke={COLOR_TREND}
            strokeWidth={2}
            strokeDasharray="6 3"
            dot={false}
            activeDot={{ r: 4 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </Card>
  );
}

/**
 * RP-05 — tách tiền ghi nhận / tiền thực: hai đường riêng cho PENDING và
 * COMPLETED (phía thu) theo tháng.
 */
export function PendingVsCompletedChart({ months }: { months: MonthlyRow[] }) {
  return (
    <Card className="p-5">
      <h3 className="mb-4 text-h3 font-semibold text-foreground">
        Thu thực và thu dự kiến
      </h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={months} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--color-line)"
            vertical={false}
          />
          <XAxis
            dataKey="month"
            tickLine={false}
            axisLine={false}
            tick={axisTick}
            tickFormatter={(m: number) => `T${m}`}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={axisTick}
            tickFormatter={shortVnd}
            width={62}
          />
          <Tooltip content={<VndTooltip />} cursor={{ stroke: "var(--color-line)" }} />
          <Legend
            wrapperStyle={{ fontSize: "var(--text-xs)" }}
            formatter={(value: string) => (
              <span style={{ color: "var(--color-muted)" }}>{value}</span>
            )}
          />
          <Line
            dataKey="thuCompleted"
            name="Đã thu"
            stroke={COLOR_ACTUAL}
            strokeWidth={2}
            dot={{ r: 4, fill: COLOR_ACTUAL, strokeWidth: 0 }}
            activeDot={{ r: 5 }}
          />
          <Line
            dataKey="thuPending"
            name="Chờ thu"
            stroke={COLOR_PENDING}
            strokeWidth={1.5}
            opacity={0.78}
            dot={{ r: 3, fill: COLOR_PENDING, strokeWidth: 0 }}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}
