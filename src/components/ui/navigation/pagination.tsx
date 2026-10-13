"use client";

import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";

import { Button } from "@/components/ui/actions";

type PaginationItem = number | "start-ellipsis" | "end-ellipsis";

function paginationItems(page: number, pageCount: number): PaginationItem[] {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }

  const items: PaginationItem[] = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(pageCount - 1, page + 1);

  if (start > 2) items.push("start-ellipsis");
  for (let pageNumber = start; pageNumber <= end; pageNumber += 1) {
    items.push(pageNumber);
  }
  if (end < pageCount - 1) items.push("end-ellipsis");
  items.push(pageCount);

  return items;
}

export function Pagination({
  page,
  pageCount,
  onPageChange,
  ariaLabel = "Phân trang",
}: {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  ariaLabel?: string;
}) {
  if (pageCount <= 1) return null;

  return (
    <nav
      aria-label={ariaLabel}
      className="flex flex-wrap items-center justify-center gap-1"
    >
      <Button
        type="button"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        variant="outline"
        size="icon-sm"
        aria-label="Trang trước"
      >
        <ChevronLeft className="size-4" />
      </Button>

      {paginationItems(page, pageCount).map((item) =>
        typeof item === "number" ? (
          <Button
            key={item}
            type="button"
            onClick={() => onPageChange(item)}
            aria-label={`Trang ${item}`}
            aria-current={page === item ? "page" : undefined}
            variant={page === item ? "primary" : "ghost"}
            size="icon-sm"
          >
            {item}
          </Button>
        ) : (
          <span
            key={item}
            aria-hidden="true"
            className="flex size-8 items-center justify-center text-muted"
          >
            <MoreHorizontal className="size-4" />
          </span>
        ),
      )}

      <Button
        type="button"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= pageCount}
        variant="outline"
        size="icon-sm"
        aria-label="Trang sau"
      >
        <ChevronRight className="size-4" />
      </Button>
    </nav>
  );
}
