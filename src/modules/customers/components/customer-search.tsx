"use client";

import { Input, Select } from "@/components/ui";

import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { CUSTOMER_SOURCE_LABEL } from "@/common/enums";
import type { CustomerSource } from "@/generated/prisma/enums";

/** Lọc danh sách khách qua query param — server đọc lại và truy vấn. */
export function CustomerSearch() {
  const router = useRouter();
  const params = useSearchParams();

  function apply(next: URLSearchParams) {
    const qs = next.toString();
    router.push(qs ? `/customers?${qs}` : "/customers");
  }

  return (
    <div className="mb-4 flex flex-col gap-2.5 sm:flex-row">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <Input
          type="search"
          defaultValue={params.get("q") ?? ""}
          placeholder="Tìm theo tên, số điện thoại, mã khách..."
          onChange={(e) => {
            const next = new URLSearchParams(params);
            if (e.target.value) next.set("q", e.target.value);
            else next.delete("q");
            // Gõ tới đâu lọc tới đó — debounce nhẹ bằng chính điều hướng của Next.
            apply(next);
          }}
          className="py-2.5 pl-9 pr-3.5"
        />
      </div>
      <Select
        defaultValue={params.get("source") ?? ""}
        onChange={(e) => {
          const next = new URLSearchParams(params);
          if (e.target.value) next.set("source", e.target.value);
          else next.delete("source");
          apply(next);
        }}
        className="px-3.5 py-2.5"
      >
        <option value="">Tất cả nguồn</option>
        {(Object.entries(CUSTOMER_SOURCE_LABEL) as [CustomerSource, string][]).map(
          ([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ),
        )}
      </Select>
    </div>
  );
}
