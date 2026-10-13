"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input, Select } from "@/components/ui";
import {
  MAINTENANCE_KIND_LABEL,
  MAINTENANCE_STATUS_LABEL,
} from "@/common/enums";
import type {
  MaintenanceKind,
  MaintenanceStatus,
} from "@/generated/prisma/enums";

type Option = { id: string; label: string };

/** Lọc danh sách việc bảo hành qua query param — giữ trang render phía server. */
export function MaintenanceFilters({
  projects,
  users,
}: {
  projects: Option[];
  users: Option[];
}) {
  const router = useRouter();
  const params = useSearchParams();

  function set(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    // Đổi bộ lọc thì về trang 1, nếu không sẽ rơi vào trang trống.
    next.delete("page");
    const qs = next.toString();
    router.push(qs ? `/maintenance?${qs}` : "/maintenance");
  }

  return (
    <div className="mb-4 flex flex-col gap-2.5 lg:flex-row lg:flex-wrap">
      <div className="relative flex-1 lg:min-w-[240px]">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <Input
          type="search"
          defaultValue={params.get("q") ?? ""}
          placeholder="Tìm theo nội dung hoặc mã dự án..."
          onChange={(e) => set("q", e.target.value)}
          className="py-2.5 pl-9 pr-3.5"
        />
      </div>

      <Select
        defaultValue={params.get("kind") ?? ""}
        onChange={(e) => set("kind", e.target.value)}
      >
        <option value="">Tất cả loại việc</option>
        {(
          Object.entries(MAINTENANCE_KIND_LABEL) as [MaintenanceKind, string][]
        ).map(([code, label]) => (
          <option key={code} value={code}>
            {label}
          </option>
        ))}
      </Select>

      <Select
        defaultValue={params.get("status") ?? (params.get("open") ? "" : "")}
        onChange={(e) => set("status", e.target.value)}
      >
        <option value="">Tất cả trạng thái</option>
        {(
          Object.entries(MAINTENANCE_STATUS_LABEL) as [
            MaintenanceStatus,
            string,
          ][]
        ).map(([code, label]) => (
          <option key={code} value={code}>
            {label}
          </option>
        ))}
      </Select>

      <Select
        defaultValue={params.get("projectId") ?? ""}
        onChange={(e) => set("projectId", e.target.value)}
        className="lg:w-[16rem]"
      >
        <option value="">Tất cả dự án</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </Select>

      <Select
        defaultValue={params.get("assigneeId") ?? ""}
        onChange={(e) => set("assigneeId", e.target.value)}
        className="lg:w-[13rem]"
      >
        <option value="">Mọi người phụ trách</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.label}
          </option>
        ))}
      </Select>

      <Select
        defaultValue={params.get("open") ?? ""}
        onChange={(e) => set("open", e.target.value)}
        className="lg:w-[12rem]"
      >
        <option value="">Cả việc đã xong</option>
        <option value="1">Chỉ việc chưa xong</option>
      </Select>
    </div>
  );
}
