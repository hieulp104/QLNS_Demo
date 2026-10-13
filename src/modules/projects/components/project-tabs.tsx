"use client";

import { TabLink, Tabs, TabsList } from "@/components/ui";
import { usePathname, useSearchParams } from "next/navigation";

export type TabKey =
  | "tong-quan"
  | "tien-do"
  | "file"
  | "anh"
  | "vat-tu"
  | "tai-chinh"
  | "bao-hanh";

const TABS: { key: TabKey; label: string }[] = [
  { key: "tong-quan", label: "Tổng quan" },
  { key: "tien-do", label: "Tiến độ" },
  { key: "file", label: "File" },
  { key: "anh", label: "Ảnh" },
  { key: "vat-tu", label: "Vật tư" },
  { key: "tai-chinh", label: "Tài chính" },
  { key: "bao-hanh", label: "Bảo hành" },
];

/** PJ-04 — điều hướng 7 tab qua query param, giữ nguyên khả năng render server. */
export function ProjectTabs({ active }: { active: TabKey }) {
  const pathname = usePathname();
  const params = useSearchParams();

  return (
    <Tabs className="mb-6">
      <TabsList>
        {TABS.map((tab) => {
          const isActive = tab.key === active;
          const next = new URLSearchParams(params);
          next.set("tab", tab.key);
          return (
            <TabLink
              key={tab.key}
              href={`${pathname}?${next.toString()}`}
              active={isActive}
            >
              {tab.label}
            </TabLink>
          );
        })}
      </TabsList>
    </Tabs>
  );
}
