"use client";

import { ButtonLink, Card, Select, TabLink, Tabs, TabsList } from "@/components/ui";

import { useRouter, useSearchParams } from "next/navigation";
import { Download } from "lucide-react";

export type ReportView = "thang" | "nam" | "du-an";

const TABS: { key: ReportView; label: string }[] = [
  { key: "thang", label: "Theo tháng" },
  { key: "nam", label: "Theo năm" },
  { key: "du-an", label: "Theo dự án" },
];

/** Thanh chọn chế độ xem + năm + nút xuất Excel (RP-06). */
export function ReportToolbar({
  view,
  year,
  years,
  exportType,
}: {
  view: ReportView;
  year: number;
  years: number[];
  /** type truyền cho /api/reports/export ứng với chế độ xem hiện tại. */
  exportType: string;
}) {
  const router = useRouter();
  const params = useSearchParams();

  const exportHref = `/api/reports/export?type=${exportType}${
    view === "thang" ? `&year=${year}` : ""
  }`;

  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <Tabs>
        <TabsList>
        {TABS.map((tab) => (
          <TabLink
            key={tab.key}
            href={`/reports?xem=${tab.key}${tab.key === "thang" ? `&nam=${year}` : ""}`}
            active={view === tab.key}
          >
            {tab.label}
          </TabLink>
        ))}
        </TabsList>
      </Tabs>

      <div className="flex items-center gap-2.5">
        {view === "thang" && (
          <Select
            value={year}
            onChange={(e) => {
              const next = new URLSearchParams(params);
              next.set("xem", "thang");
              next.set("nam", e.target.value);
              router.push(`/reports?${next.toString()}`);
            }}
            aria-label="Chọn năm"
            className="px-3 py-2"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                Năm {y}
              </option>
            ))}
          </Select>
        )}

        <ButtonLink
          href={exportHref}
        >
          <Download className="size-4" />
          Xuất Excel
        </ButtonLink>
      </div>
    </div>
  );
}

/** RP-07 — cụm nút xuất danh sách dữ liệu gốc. */
export function ListExportLinks() {
  const lists = [
    { type: "list-projects", label: "Danh sách dự án" },
    { type: "list-customers", label: "Danh sách khách hàng" },
    { type: "list-transactions", label: "Danh sách giao dịch" },
  ];
  return (
    <Card className="p-5">
      <h3 className="mb-1 text-h3 font-semibold text-foreground">
        Xuất dữ liệu gốc
      </h3>
      <p className="mb-3 text-xs text-muted">
        Tải danh sách đầy đủ dạng Excel để đối chiếu hoặc lưu trữ.
      </p>
      <div className="flex flex-wrap gap-2">
        {lists.map((l) => (
          <ButtonLink
            key={l.type}
            href={`/api/reports/export?type=${l.type}`}
            variant="outline"
          >
            <Download className="size-3.5" />
            {l.label}
          </ButtonLink>
        ))}
      </div>
    </Card>
  );
}
