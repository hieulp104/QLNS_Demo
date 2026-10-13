"use client";

import { Button, FormCard, Input, Select, Label } from "@/components/ui";

import { useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Filter, LoaderCircle, Search } from "lucide-react";
import type {
  TxnDirection,
  TxnStatus,
  TxnType,
} from "@/generated/prisma/enums";
import {
  TXN_DIRECTION_LABEL,
  TXN_STATUS_LABEL,
  TXN_TYPE_LABEL,
} from "@/common/enums";
import type { TransactionFilter } from "@/modules/finance/finance.schema";
import type {
  ContractOption,
  ExpenseCategoryOption,
  FinanceViewMode,
  ProjectOption,
} from "@/modules/finance/components/finance.types";

export function FinanceFilters({
  projects,
  contracts,
  expenseCategories,
  filter,
  view,
}: {
  projects: ProjectOption[];
  contracts: ContractOption[];
  expenseCategories: ExpenseCategoryOption[];
  filter: TransactionFilter;
  view: FinanceViewMode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const next = new URLSearchParams();
    if (view !== "transactions") next.set("view", view);
    for (const key of [
      "q",
      "direction",
      "status",
      "from",
      "to",
    ]) {
      const value = String(form.get(key) ?? "").trim();
      if (value) next.set(key, value);
    }
    // Ô loại giao dịch mang cả danh mục chi khác dưới dạng "cat:<id>".
    const type = String(form.get("type") ?? "");
    if (type.startsWith("cat:")) {
      next.set("type", "OPERATING_COST");
      next.set("expenseCategoryId", type.slice(4));
    } else if (type) {
      next.set("type", type);
    }

    const project = String(form.get("project") ?? "");
    if (project === "__unassigned") next.set("projectRelation", "UNASSIGNED");
    else if (project) next.set("projectId", project);

    const contract = String(form.get("contract") ?? "");
    if (contract === "__unassigned") next.set("contractRelation", "UNASSIGNED");
    else if (contract) next.set("contractId", contract);
    startTransition(() => {
      const query = next.toString();
      router.push(query ? `/finance?${query}` : "/finance");
    });
  }

  return (
    <FormCard
      onSubmit={submit}
      className="space-y-3 p-4"
    >
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Label className="relative block md:col-span-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input
            name="q"
            type="search"
            defaultValue={filter.q ?? ""}
            placeholder="Tìm mã, dự án, hợp đồng, ghi chú..."
            className="pl-9"
          />
        </Label>

        <Select
          name="project"
          defaultValue={
            filter.projectRelation === "UNASSIGNED"
              ? "__unassigned"
              : (filter.projectId ?? "")
          }
          aria-label="Lọc theo dự án"
        >
          <option value="">Tất cả dự án</option>
          {view === "transactions" && (
            <option value="__unassigned">Không thuộc dự án</option>
          )}
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.code} — {project.name}
            </option>
          ))}
        </Select>

        <Select
          name="contract"
          defaultValue={
            filter.contractRelation === "UNASSIGNED"
              ? "__unassigned"
              : (filter.contractId ?? "")
          }
          aria-label="Lọc theo hợp đồng"
        >
          <option value="">Tất cả hợp đồng</option>
          {view === "transactions" && (
            <option value="__unassigned">Không gắn hợp đồng</option>
          )}
          {contracts.map((contract) => (
            <option key={contract.id} value={contract.id}>
              {contract.code}
            </option>
          ))}
        </Select>

        <Select
          name="status"
          defaultValue={filter.status ?? ""}
          aria-label="Lọc theo trạng thái"
        >
          <option value="">Tất cả trạng thái</option>
          {(
            Object.entries(TXN_STATUS_LABEL) as [TxnStatus, string][]
          ).map(([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </Select>

        <Select
          name="direction"
          defaultValue={filter.direction ?? ""}
          aria-label="Lọc theo chiều giao dịch"
        >
          <option value="">Tất cả thu/chi</option>
          {(
            Object.entries(TXN_DIRECTION_LABEL) as [TxnDirection, string][]
          ).map(([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </Select>

        <Select
          name="type"
          defaultValue={
            filter.expenseCategoryId
              ? `cat:${filter.expenseCategoryId}`
              : (filter.type ?? "")
          }
          aria-label="Lọc theo loại giao dịch"
        >
          <option value="">Tất cả loại giao dịch</option>
          {(Object.entries(TXN_TYPE_LABEL) as [TxnType, string][]).map(
            ([code, label]) => (
              <option key={code} value={code}>
                {code === "OPERATING_COST" ? "Chi khác — tất cả danh mục" : label}
              </option>
            ),
          )}
          {expenseCategories.length > 0 && (
            <optgroup label="Chi khác theo danh mục">
              {expenseCategories.map((category) => (
                <option key={category.id} value={`cat:${category.id}`}>
                  {category.name}
                  {category.isActive ? "" : " (đã ngưng)"}
                </option>
              ))}
            </optgroup>
          )}
        </Select>

        <Label className="flex items-center gap-2">
          <span className="shrink-0 text-xs text-muted">Từ</span>
          <Input
            name="from"
            type="date"
            defaultValue={filter.from ?? ""}
          />
        </Label>
        <Label className="flex items-center gap-2">
          <span className="shrink-0 text-xs text-muted">Đến</span>
          <Input
            name="to"
            type="date"
            defaultValue={filter.to ?? ""}
          />
        </Label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="submit"
          disabled={pending}
          className="px-4 py-2"
        >
          {pending ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <Filter className="size-4" />
          )}
          Áp dụng bộ lọc
        </Button>
        <Button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(() =>
              router.push(
                view === "transactions" ? "/finance" : `/finance?view=${view}`,
              ),
            )
          }
          variant="outline" className="px-4 py-2"
        >
          Xóa bộ lọc
        </Button>
      </div>
    </FormCard>
  );
}
