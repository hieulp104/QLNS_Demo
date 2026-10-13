"use client";

import { Input, Select } from "@/components/ui";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import {
  PROJECT_STATUS_LABEL,
  PROJECT_TYPE_LABEL,
  STAGE_LABEL,
  STAGE_ORDER,
} from "@/common/enums";
import type { ProjectStatus, ProjectType } from "@/generated/prisma/enums";

type CustomerOption = { id: string; name: string };

/** PJ-01 — lọc theo giai đoạn · loại · trạng thái · khách hàng, qua query param. */
export function ProjectFilter({ customers }: { customers: CustomerOption[] }) {
  const router = useRouter();
  const params = useSearchParams();

  function set(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    const qs = next.toString();
    router.push(qs ? `/projects?${qs}` : "/projects");
  }

  // Lọc theo tháng bắt đầu = 2 dropdown gọn (Tháng 1–12 + Năm) → "YYYY-MM".
  const [my, setMy] = useState(() => {
    const m = params.get("month") ?? "";
    return /^\d{4}-\d{2}$/.test(m)
      ? { year: m.slice(0, 4), month: String(Number(m.slice(5, 7))) }
      : { year: "", month: "" };
  });
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 7 }, (_, i) => thisYear - 5 + i);

  function applyMonth(nextMy: { year: string; month: string }) {
    setMy(nextMy);
    set(
      "month",
      nextMy.year && nextMy.month
        ? `${nextMy.year}-${nextMy.month.padStart(2, "0")}`
        : "",
    );
  }

  return (
    <div className="mb-4 flex flex-col gap-2.5 lg:flex-row lg:flex-wrap">
      <div className="relative flex-1 lg:min-w-[240px]">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <Input
          type="search"
          defaultValue={params.get("q") ?? ""}
          placeholder="Tìm theo tên hoặc mã dự án..."
          onChange={(e) => set("q", e.target.value)}
          className="py-2.5 pl-9 pr-3.5"
        />
      </div>

      <Select
        defaultValue={params.get("stage") ?? ""}
        onChange={(e) => set("stage", e.target.value)}
      >
        <option value="">Tất cả giai đoạn</option>
        {STAGE_ORDER.map((s, i) => (
          <option key={s} value={s}>
            {i + 1}. {STAGE_LABEL[s]}
          </option>
        ))}
      </Select>

      <Select
        defaultValue={params.get("type") ?? ""}
        onChange={(e) => set("type", e.target.value)}
        className="lg:flex-none lg:w-[11rem]"
      >
        <option value="">Tất cả loại</option>
        {(Object.entries(PROJECT_TYPE_LABEL) as [ProjectType, string][]).map(
          ([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ),
        )}
      </Select>

      <Select
        defaultValue={params.get("status") ?? ""}
        onChange={(e) => set("status", e.target.value)}
      >
        <option value="">Tất cả trạng thái</option>
        {(Object.entries(PROJECT_STATUS_LABEL) as [ProjectStatus, string][]).map(
          ([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ),
        )}
      </Select>

      <Select
        defaultValue={params.get("customerId") ?? ""}
        onChange={(e) => set("customerId", e.target.value)}
      >
        <option value="">Tất cả khách hàng</option>
        {customers.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>

      <div className="flex gap-2">
        <Select
          aria-label="Lọc theo tháng (hạn dự kiến)"
          value={my.month}
          onChange={(e) => {
            const month = e.target.value;
            applyMonth({
              month,
              year: month && !my.year ? String(thisYear) : my.year,
            });
          }}
          className="min-w-0 flex-1 lg:flex-none lg:w-[8.5rem]"
        >
          <option value="">Tháng</option>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
            <option key={m} value={m}>
              Tháng {m}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Lọc theo năm (hạn dự kiến)"
          value={my.year}
          onChange={(e) => applyMonth({ ...my, year: e.target.value })}
          className="min-w-0 flex-1 lg:flex-none lg:w-[6.5rem]"
        >
          <option value="">Năm</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}
