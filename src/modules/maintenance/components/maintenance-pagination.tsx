"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Pagination } from "@/components/ui";

/** Phân trang cho trang /maintenance — giữ nguyên các tham số lọc đang có. */
export function MaintenancePagination({
  page,
  pageCount,
}: {
  page: number;
  pageCount: number;
}) {
  const router = useRouter();
  const params = useSearchParams();

  function goToPage(next: number) {
    const search = new URLSearchParams(params);
    if (next <= 1) search.delete("page");
    else search.set("page", String(next));
    const qs = search.toString();
    router.push(qs ? `/maintenance?${qs}` : "/maintenance");
  }

  return (
    <Pagination
      page={page}
      pageCount={pageCount}
      onPageChange={goToPage}
      ariaLabel="Phân trang việc bảo hành"
    />
  );
}
