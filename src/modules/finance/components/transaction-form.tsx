"use client";

import { Button, Input, MoneyInput, Textarea, Select, Alert, Label } from "@/components/ui";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { formatVnd } from "@/lib/utils";
import type {
  TxnDirection,
  TxnStatus,
  TxnType,
} from "@/generated/prisma/enums";
import {
  CONTRACT_TYPE_LABEL,
  TXN_STATUS_LABEL,
  TXN_TYPE_LABEL,
} from "@/common/enums";
import {
  createTransactionAction,
  updateTransactionAction,
} from "@/modules/finance/finance.actions";
import type { FinanceTransactionItem } from "@/modules/finance/finance.service";
import type {
  ContractOption,
  ExpenseCategoryOption,
  ProjectOption,
} from "@/modules/finance/components/finance.types";

const INCOME_TYPES: TxnType[] = [
  "DESIGN_DEPOSIT",
  "CONTRACT_DEPOSIT",
  "PROGRESS_PAYMENT",
  "FINAL_PAYMENT",
  "OTHER",
];

const EXPENSE_TYPES: TxnType[] = [
  "MATERIAL_COST",
  "FACTORY_COST",
  "SUBCONTRACTOR_COST",
  "TRANSPORT_COST",
  "OPERATING_COST",
  "OTHER",
];

function todayInVietnam(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function dateInput(value: Date | string): string {
  return new Date(value).toISOString().slice(0, 10);
}

export function TransactionForm({
  transaction,
  projects,
  contracts,
  initialProjectId,
  initialContractId,
  fixedProjectId,
  fixedContractId,
  expenseCategories,
  onDone,
}: {
  transaction?: FinanceTransactionItem;
  projects: ProjectOption[];
  contracts: ContractOption[];
  initialProjectId?: string;
  initialContractId?: string;
  fixedProjectId?: string;
  fixedContractId?: string | null;
  /**
   * Danh mục Chi khác. Không truyền (tab dự án / hợp đồng) thì không tạo mới
   * được Chi khác ở đó — nhưng sửa một dòng Chi khác có sẵn vẫn giữ đúng danh mục.
   */
  expenseCategories?: ExpenseCategoryOption[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [projectId, setProjectId] = useState(
    fixedProjectId ?? transaction?.projectId ?? initialProjectId ?? "",
  );
  const [contractId, setContractId] = useState(
    fixedContractId !== undefined
      ? (fixedContractId ?? "")
      : (transaction?.contractId ?? initialContractId ?? ""),
  );
  const [direction, setDirection] = useState<TxnDirection>(
    transaction?.direction ?? "INCOME",
  );
  const [type, setType] = useState<TxnType>(
    transaction?.type ?? "DESIGN_DEPOSIT",
  );

  const [expenseCategoryId, setExpenseCategoryId] = useState(
    transaction?.expenseCategory?.id ?? "",
  );

  // Chọn danh mục có số mặc định (thuê xưởng 4tr…) thì tự điền ô Số tiền.
  // MoneyInput tự giữ state nên đổi `key` để nạp lại giá trị. Chỉ điền khi ô
  // đang trống hoặc vẫn là số vừa tự điền — đã gõ tay thì không ghi đè.
  const amountRef = useRef<HTMLInputElement>(null);
  // Số tiền + ngày đang gõ — để báo "số mặc định của danh mục sẽ đổi" ngay khi
  // gõ. Chỉ khi THÊM MỚI (sửa giao dịch cũ không đổi số mặc định).
  const [amountDigits, setAmountDigits] = useState(String(transaction?.amount ?? ""));
  const [txnMonth, setTxnMonth] = useState<string | null>(null);
  const autoFilled = useRef<string | null>(null);
  const [amountSeed, setAmountSeed] = useState<{ n: number; value: string | number }>({
    n: 0,
    value: transaction?.amount ?? "",
  });

  // Chỉ báo khi thêm mới Chi khác, danh mục có số mặc định và số gõ khác số đó.
  const selectedCategory = (expenseCategories ?? []).find((c) => c.id === expenseCategoryId);
  const monthSource = txnMonth ?? (transaction ? null : todayInVietnam());
  const defaultChange =
    !transaction &&
    type === "OPERATING_COST" &&
    selectedCategory?.defaultAmount != null &&
    amountDigits !== "" &&
    Number(amountDigits) !== selectedCategory.defaultAmount &&
    monthSource
      ? {
          name: selectedCategory.name,
          current: selectedCategory.defaultAmount,
          next: Number(amountDigits),
          month: `${Number(monthSource.slice(5, 7))}/${monthSource.slice(0, 4)}`,
        }
      : null;

  function changeCategory(id: string) {
    setExpenseCategoryId(id);
    const amount = (expenseCategories ?? []).find((c) => c.id === id)?.defaultAmount;
    if (amount == null) return;
    const current = (amountRef.current?.value ?? "").replace(/\D/g, "");
    if (current !== "" && current !== autoFilled.current) return;
    autoFilled.current = String(amount);
    setAmountDigits(String(amount));
    setAmountSeed((s) => ({ n: s.n + 1, value: amount }));
  }

  // Danh mục chọn được: đang dùng + danh mục (có thể đã ngưng) của chính dòng này.
  const currentCategory = transaction?.expenseCategory ?? null;
  const categoryChoices = (expenseCategories ?? []).filter(
    (category) => category.isActive || category.id === currentCategory?.id,
  );
  if (currentCategory && !categoryChoices.some((c) => c.id === currentCategory.id)) {
    categoryChoices.push({ ...currentCategory, isActive: false });
  }
  const canUseOperatingCost = categoryChoices.length > 0;

  function typesFor(next: TxnDirection) {
    if (next === "INCOME") return INCOME_TYPES;
    return canUseOperatingCost
      ? EXPENSE_TYPES
      : EXPENSE_TYPES.filter((value) => value !== "OPERATING_COST");
  }

  const availableTypes = typesFor(direction);
  const availableContracts = projectId
    ? contracts.filter((contract) => contract.projectId === projectId)
    : contracts;

  function changeDirection(next: TxnDirection) {
    setDirection(next);
    if (!typesFor(next).includes(type)) {
      setType(next === "INCOME" ? "DESIGN_DEPOSIT" : "MATERIAL_COST");
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const input = {
      ...(transaction ? { id: transaction.id } : {}),
      projectId: fixedProjectId ?? (projectId || undefined),
      contractId:
        fixedContractId !== undefined
          ? (fixedContractId ?? undefined)
          : (contractId || undefined),
      direction,
      type,
      status: form.get("status"),
      amount: form.get("amount"),
      txnDate: form.get("txnDate"),
      paymentMethod: form.get("paymentMethod"),
      note: form.get("note"),
      expenseCategoryId:
        type === "OPERATING_COST" ? expenseCategoryId || undefined : undefined,
    };

    startTransition(async () => {
      const result = transaction
        ? await updateTransactionAction(input)
        : await createTransactionAction(input);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      onDone();
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {error && (
        <Alert
          variant="danger"
          className="px-3 py-2"
        >
          {error}
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Label className="space-y-1.5 text-sm font-medium text-foreground">
          <span>Loại giao dịch *</span>
          <Select
            value={direction}
            onChange={(event) =>
              changeDirection(event.target.value as TxnDirection)
            }
          >
            <option value="INCOME">Thu</option>
            <option value="EXPENSE">Chi</option>
          </Select>
        </Label>

        <Label className="space-y-1.5 text-sm font-medium text-foreground">
          <span>Danh mục giao dịch *</span>
          <Select
            value={type}
            onChange={(event) => setType(event.target.value as TxnType)}
          >
            {availableTypes.map((value) => (
              <option key={value} value={value}>
                {TXN_TYPE_LABEL[value]}
              </option>
            ))}
          </Select>
        </Label>

        {type === "OPERATING_COST" && (
          <Label className="space-y-1.5 text-sm font-medium text-foreground">
            <span>Danh mục chi khác *</span>
            <Select
              value={expenseCategoryId}
              required
              onChange={(event) => changeCategory(event.target.value)}
            >
              <option value="">— Chọn danh mục —</option>
              {categoryChoices.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                  {category.isActive ? "" : " (đã ngưng)"}
                </option>
              ))}
            </Select>
          </Label>
        )}

        <Label className="space-y-1.5 text-sm font-medium text-foreground">
          <span>Trạng thái *</span>
          <Select
            name="status"
            defaultValue={transaction?.status ?? "PENDING"}
          >
            {(Object.entries(TXN_STATUS_LABEL) as [TxnStatus, string][]).map(
              ([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ),
            )}
          </Select>
        </Label>

        {fixedProjectId === undefined && (
          <Label className="space-y-1.5 text-sm font-medium text-foreground">
            <span>Dự án (không bắt buộc)</span>
            <Select
              value={projectId}
              onChange={(event) => {
                setProjectId(event.target.value);
                setContractId("");
              }}
            >
              <option value="">Không thuộc dự án</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.code} — {project.name}
                </option>
              ))}
            </Select>
          </Label>
        )}

        {fixedContractId === undefined && (
          <Label className="space-y-1.5 text-sm font-medium text-foreground">
            <span>Hợp đồng (không bắt buộc)</span>
            <Select
              value={contractId}
              onChange={(event) => {
                const nextContractId = event.target.value;
                setContractId(nextContractId);
                const contract = contracts.find(
                  (option) => option.id === nextContractId,
                );
                if (contract) setProjectId(contract.projectId);
              }}
            >
              <option value="">Không gắn hợp đồng</option>
              {availableContracts.map((contract) => (
                <option key={contract.id} value={contract.id}>
                  {contract.code} — {CONTRACT_TYPE_LABEL[contract.type]}
                </option>
              ))}
            </Select>
          </Label>
        )}

        <Label className="space-y-1.5 text-sm font-medium text-foreground">
          <span>Số tiền (VND) *</span>
          <MoneyInput
            key={amountSeed.n}
            ref={amountRef}
            name="amount"
            required
            maxLength={30}
            defaultValue={amountSeed.value}
            placeholder="VD: 150.000.000"
            onInput={(event) =>
              setAmountDigits(event.currentTarget.value.replace(/\D/g, ""))
            }
          />
        </Label>

        <Label className="space-y-1.5 text-sm font-medium text-foreground">
          <span>Ngày giao dịch *</span>
          <Input
            name="txnDate"
            required
            type="date"
            defaultValue={
              transaction ? dateInput(transaction.txnDate) : todayInVietnam()
            }
            onChange={(event) => setTxnMonth(event.target.value || null)}
          />
        </Label>

        {defaultChange && (
          <Alert variant="warning" className="px-3.5 py-2.5 text-sm sm:col-span-2">
            Số tiền bạn nhập là <strong>{formatVnd(defaultChange.next)}</strong> — số tiền{" "}
            <strong>{formatVnd(defaultChange.current)}</strong> ở danh mục chi khác{" "}
            <strong>{defaultChange.name}</strong> tháng {defaultChange.month} sẽ bị thay đổi.
          </Alert>
        )}

        <Label className="space-y-1.5 text-sm font-medium text-foreground">
          <span>Phương thức thanh toán</span>
          <Input
            name="paymentMethod"
            list="payment-methods"
            maxLength={100}
            defaultValue={transaction?.paymentMethod ?? ""}
            placeholder="Chuyển khoản, tiền mặt..."
          />
          <datalist id="payment-methods">
            <option value="Chuyển khoản" />
            <option value="Tiền mặt" />
            <option value="Thẻ ngân hàng" />
          </datalist>
        </Label>
      </div>

      <Label className="block space-y-1.5 text-sm font-medium text-foreground">
        <span>Nội dung giao dịch</span>
        <Textarea
          name="note"
          rows={3}
          maxLength={1000}
          defaultValue={transaction?.note ?? ""}
          placeholder="Nội dung thanh toán, số hóa đơn hoặc thông tin đối soát..."
        />
      </Label>

      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={pending}
          size="lg" className="px-4 py-2.5 disabled:cursor-not-allowed"
        >
          {pending && <LoaderCircle className="size-4 animate-spin" />}
          {transaction ? "Lưu thay đổi" : "Thêm giao dịch"}
        </Button>
      </div>
    </form>
  );
}
