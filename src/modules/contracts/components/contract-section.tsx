"use client";

import { Alert, Badge, Button, ButtonAnchor, Card, Dialog, EmptyStatePanel, FormCard, IconTile, Input, MoneyInput, Progress, Select, Textarea, Label } from "@/components/ui";
import {
  DocumentUploadPattern,
  type DocumentUploadOption,
} from "@/components/patterns/document-upload";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  Download,
  FileSignature,
  File as FileIcon,
  LoaderCircle,
  Pencil,
  Plus,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import {
  createContractAction,
  deleteContractAction,
  deleteContractFileAction,
  registerContractFileAction,
  requestContractUploadTicketAction,
  updateContractAction,
  type ContractActionState,
} from "@/modules/contracts/contracts.actions";
import {
  CONTRACT_STATUS_LABEL,
  CONTRACT_TYPE_LABEL,
  FILE_KIND_LABEL,
} from "@/common/enums";
import { cn, formatDate, formatVnd } from "@/lib/utils";
import { deleteTransactionAction } from "@/modules/finance/finance.actions";
import {
  CompactTransactionTable,
  TransactionDetailDialog,
} from "@/modules/finance/components/finance-workspace";
import { TransactionForm } from "@/modules/finance/components/transaction-form";
import type {
  ContractOption,
  ProjectOption,
} from "@/modules/finance/components/finance.types";
import type { FinanceTransactionItem } from "@/modules/finance/finance.service";
import type {
  ContractStatus,
  ContractType,
  FileKind,
  TxnStatus,
} from "@/generated/prisma/enums";

const initialState: ContractActionState = { error: null };

const STATUS_VARIANT: Record<
  ContractStatus,
  "warning" | "success" | "info" | "danger"
> = {
  DRAFT: "warning",
  SIGNED: "success",
  LIQUIDATED: "info",
  CANCELLED: "danger",
};

/** Loại file đính kèm hợp đồng (CT-06). */
const CONTRACT_FILE_KINDS: FileKind[] = ["CONTRACT_DOC", "QUOTATION", "BOQ", "OTHER"];
const CONTRACT_FILE_OPTIONS = CONTRACT_FILE_KINDS.map((kind) => ({
  value: kind,
  label: FILE_KIND_LABEL[kind],
})) satisfies readonly DocumentUploadOption[];

export type ContractFileItem = {
  id: string;
  fileName: string;
  /** `null` khi không ký được URL tải (MinIO lỗi) — UI tắt nút thay vì sập trang. */
  url: string | null;
  kind: FileKind;
  sizeBytes: string;
  createdAt: Date;
  uploadedBy: { fullName: string } | null;
};

export type ContractView = {
  id: string;
  code: string;
  type: ContractType;
  status: ContractStatus;
  /** null khi người xem không có quyền thấy tiền. */
  value: string | null;
  depositAmount: string | null;
  paidAmount: string | null;
  signedDate: Date | null;
  note: string | null;
  transactions: FinanceTransactionItem[];
  files: ContractFileItem[];
};

function ErrorLine({ message }: { message: string }) {
  return (
    <Alert variant="danger" className="flex items-start gap-1.5 text-xs">
      <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
      {message}
    </Alert>
  );
}

// ═══════════════════ FORM THÊM / SỬA ═══════════════════

function ContractForm({
  projectId,
  showMoney,
  contract,
  onClose,
}: {
  projectId: string;
  showMoney: boolean;
  /** Có contract → chế độ sửa. */
  contract?: ContractView;
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    contract ? updateContractAction : createContractAction,
    initialState,
  );
  const [depositStatus, setDepositStatus] = useState<TxnStatus>(
    "COMPLETED",
  );

  useEffect(() => {
    if (state.ok) onClose();
  }, [state.ok, onClose]);

  return (
    <FormCard
      action={formAction}
      variant="highlight"
      className="space-y-4 p-5"
    >
      {contract ? (
        <Input type="hidden" name="id" value={contract.id} />
      ) : (
        <Input type="hidden" name="projectId" value={projectId} />
      )}

      <h4 className="text-h3 font-semibold text-foreground">
        {contract ? `Sửa hợp đồng ${contract.code}` : "Thêm hợp đồng"}
      </h4>

      {state.error && <ErrorLine message={state.error} />}

      <div className="space-y-3">
        <h5 className="text-sm font-semibold text-foreground">
          Thông tin hợp đồng
        </h5>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="block text-sm font-medium text-foreground">
              Loại hợp đồng
            </Label>
            <Select
              name="type"
              required
              defaultValue={contract?.type ?? "DESIGN"}
            >
              {(
                Object.entries(CONTRACT_TYPE_LABEL) as [ContractType, string][]
              ).map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </Select>
          </div>

          {contract && (
            <div className="space-y-1.5">
              <Label className="block text-sm font-medium text-foreground">
                Trạng thái
              </Label>
              <Select name="status" required defaultValue={contract.status}>
                {(
                  Object.entries(CONTRACT_STATUS_LABEL) as [ContractStatus, string][]
                ).map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>
          )}

          {showMoney && (
            <div className="space-y-1.5">
              <Label className="block text-sm font-medium text-foreground">
                Giá trị hợp đồng (VND)
              </Label>
              <MoneyInput
                name="value"
                defaultValue={contract?.value ?? ""}
                placeholder="VD: 250.000.000"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="block text-sm font-medium text-foreground">
              Ngày ký
            </Label>
            <Input
              name="signedDate"
              type="date"
              defaultValue={
                contract?.signedDate
                  ? new Date(contract.signedDate).toISOString().slice(0, 10)
                  : ""
              }
            />
          </div>
        </div>
      </div>

      {showMoney && !contract && (
        <div className="space-y-3 border-t border-line pt-4">
          <h5 className="text-sm font-semibold text-foreground">Tiền cọc</h5>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="block text-sm font-medium text-foreground">
                Tiền cọc (VND)
              </Label>
              <MoneyInput
                name="depositAmount"
                placeholder="VD: 75.000.000"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="block text-sm font-medium text-foreground">
                Trạng thái cọc
              </Label>
              <Select
                name="depositStatus"
                value={depositStatus}
                onChange={(event) =>
                  setDepositStatus(event.target.value as TxnStatus)
                }
              >
                <option value="COMPLETED">Đã đóng</option>
                <option value="PENDING">Chưa đóng</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="block text-sm font-medium text-foreground">
                Ngày đóng cọc (có thể bỏ qua)
              </Label>
              <Input
                name="depositPaidDate"
                type="date"
                disabled={depositStatus === "PENDING"}
              />
              <p className="text-xs text-muted">
                {depositStatus === "COMPLETED"
                  ? "Bỏ trống để sử dụng ngày ký hợp đồng."
                  : "Ngày đóng cọc sẽ được ghi nhận trong Finance khi thanh toán."}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3 border-t border-line pt-4">
        <h5 className="text-sm font-semibold text-foreground">Ghi chú</h5>
        <Textarea
          name="note"
          rows={2}
          maxLength={1000}
          defaultValue={contract?.note ?? ""}
        />
      </div>

      {!showMoney && (
        <Alert variant="warning" className="text-xs">
          Giá trị và tiền cọc do Kế toán / Giám đốc nhập — bạn không có quyền xem
          số tiền.
        </Alert>
      )}

      <div className="flex gap-2.5">
        <Button
          type="submit"
          disabled={pending}
          className="px-4 py-2 disabled:cursor-not-allowed"
        >
          {pending && <LoaderCircle className="size-4 animate-spin" />}
          {contract ? "Lưu thay đổi" : "Thêm hợp đồng"}
        </Button>
        <Button
          type="button"
          onClick={onClose}
          variant="outline" className="px-4 py-2"
        >
          Hủy
        </Button>
      </div>
    </FormCard>
  );
}

// ═══════════════════ FILE ĐÍNH KÈM (CT-06) ═══════════════════

function ContractFileUploader({ contractId }: { contractId: string }) {
  const router = useRouter();
  const [kind, setKind] = useState<FileKind>("CONTRACT_DOC");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload(file: File | null) {
    setError(null);
    if (!file) {
      setError("Vui lòng chọn một file.");
      return false;
    }

    setBusy(true);
    const ticket = await requestContractUploadTicketAction({
      contractId,
      fileName: file.name,
      kind,
    });
    if (!ticket.ok) {
      setBusy(false);
      setError(ticket.message);
      return false;
    }
    if (file.size > ticket.data.maxSizeBytes) {
      setBusy(false);
      setError(
        `File vượt quá dung lượng cho phép (${Math.round(ticket.data.maxSizeBytes / 1024 / 1024)}MB).`,
      );
      return false;
    }

    try {
      const put = await fetch(ticket.data.uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "application/octet-stream" },
      });
      if (!put.ok) throw new Error(String(put.status));
    } catch {
      setBusy(false);
      setError("Tải file lên thất bại. Vui lòng thử lại.");
      return false;
    }

    const saved = await registerContractFileAction({
      contractId,
      objectKey: ticket.data.objectKey,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      kind,
    });
    setBusy(false);
    if (!saved.ok) {
      setError(saved.message);
      return false;
    }

    router.refresh();
    return true;
  }

  return (
    <div className="space-y-2">
      {error && <ErrorLine message={error} />}
      <DocumentUploadPattern
        options={CONTRACT_FILE_OPTIONS}
        value={kind}
        onChange={(value) => setKind(value as FileKind)}
        onUpload={handleUpload}
        loading={busy}
        placeholder="Chọn loại tài liệu hợp đồng"
      />
    </div>
  );
}

function DeleteContractFileButton({ fileId }: { fileId: string }) {
  const [, formAction, pending] = useActionState(
    deleteContractFileAction,
    initialState,
  );
  return (
    <form action={formAction}>
      <Input type="hidden" name="fileId" value={fileId} />
      <Button
        type="submit"
        disabled={pending}
        aria-label="Xóa file"
        variant="dangerGhost" size="icon-sm" className="p-1"
      >
        {pending ? (
          <LoaderCircle className="size-3.5 animate-spin" />
        ) : (
          <Trash2 className="size-3.5" />
        )}
      </Button>
    </form>
  );
}

// ═══════════════════ THẺ HỢP ĐỒNG ═══════════════════

function DeleteContractButton({ contractId }: { contractId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [state, formAction, pending] = useActionState(
    deleteContractAction,
    initialState,
  );

  if (!confirming) {
    return (
      <Button
        type="button"
        onClick={() => setConfirming(true)}
        aria-label="Xóa hợp đồng"
        variant="dangerGhost" size="icon-sm" className="p-1.5"
      >
        <Trash2 className="size-4" />
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {state.error && <ErrorLine message={state.error} />}
      <form action={formAction}>
        <Input type="hidden" name="id" value={contractId} />
        <Button
          type="submit"
          disabled={pending}
          variant="danger" size="sm" className="px-2.5 py-1"
        >
          {pending ? "Đang xóa..." : "Xác nhận xóa"}
        </Button>
      </form>
      <Button
        type="button"
        onClick={() => setConfirming(false)}
        aria-label="Hủy"
        variant="ghost" size="icon-sm" className="p-1"
      >
        <X className="size-4" />
      </Button>
    </div>
  );
}

function humanSize(bytes: string): string {
  const n = Number(bytes);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

type TransactionEditor =
  | { kind: "create" }
  | { kind: "edit"; transaction: FinanceTransactionItem }
  | { kind: "detail"; transaction: FinanceTransactionItem }
  | null;

function ContractTransactions({
  contract,
  project,
  contracts,
  canManage,
}: {
  contract: ContractView;
  project: ProjectOption;
  contracts: ContractOption[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [editor, setEditor] = useState<TransactionEditor>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function remove(transaction: FinanceTransactionItem) {
    if (
      !window.confirm(
        `Xóa giao dịch ${transaction.code}? Giao dịch sẽ được xóa mềm và loại khỏi báo cáo.`,
      )
    ) {
      return;
    }

    setDeletingId(transaction.id);
    setError(null);
    const result = await deleteTransactionAction({ id: transaction.id });
    setDeletingId(null);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    router.refresh();
  }

  return (
    <div className="overflow-hidden rounded-control border border-line">
      <Button
        type="button"
        variant="plain"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between rounded-none px-4 py-3 text-left"
      >
        <span className="text-sm font-semibold text-foreground">
          Giao dịch hợp đồng ({contract.transactions.length})
        </span>
        <ChevronDown
          className={cn(
            "size-4 text-muted transition-transform",
            expanded && "rotate-180",
          )}
        />
      </Button>

      {expanded && (
        <div className="border-t border-line">
          {error && (
            <div className="px-5 pt-4">
              <ErrorLine message={error} />
            </div>
          )}
          <CompactTransactionTable
            title="Danh sách giao dịch"
            transactions={contract.transactions}
            canManage={canManage}
            emptyMessage="Hợp đồng này chưa có giao dịch."
            onCreate={() => setEditor({ kind: "create" })}
            onDetail={(transaction) =>
              setEditor({ kind: "detail", transaction })
            }
            onEdit={(transaction) => setEditor({ kind: "edit", transaction })}
            onRemove={remove}
            deletingId={deletingId}
          />
        </div>
      )}

      {editor?.kind === "create" && (
        <Dialog
          title="Thêm giao dịch thu / chi"
          onClose={() => setEditor(null)}
          size="lg"
        >
          <TransactionForm
            projects={[project]}
            contracts={contracts}
            initialProjectId={project.id}
            initialContractId={contract.id}
            onDone={() => setEditor(null)}
          />
        </Dialog>
      )}

      {editor?.kind === "edit" && (
        <Dialog
          title={`Sửa giao dịch ${editor.transaction.code}`}
          onClose={() => setEditor(null)}
          size="lg"
        >
          <TransactionForm
            transaction={editor.transaction}
            projects={[project]}
            contracts={contracts}
            onDone={() => setEditor(null)}
          />
        </Dialog>
      )}

      {editor?.kind === "detail" && (
        <Dialog
          title="Chi tiết giao dịch"
          onClose={() => setEditor(null)}
          size="xl"
          titleClassName="text-h2 font-bold"
        >
          <TransactionDetailDialog
            transaction={editor.transaction}
            canManage={canManage}
            onEdit={() =>
              setEditor({ kind: "edit", transaction: editor.transaction })
            }
          />
        </Dialog>
      )}
    </div>
  );
}

function ContractCard({
  contract,
  project,
  financeContracts,
  showMoney,
  canManage,
  canManageFinance,
  onEdit,
}: {
  contract: ContractView;
  project: ProjectOption;
  financeContracts: ContractOption[];
  showMoney: boolean;
  canManage: boolean;
  canManageFinance: boolean;
  onEdit: () => void;
}) {
  // CT-05 — tình trạng thanh toán: đã thu / giá trị, tính từ Transaction COMPLETED.
  const value = contract.value ? Number(contract.value) : 0;
  const paid = contract.paidAmount ? Number(contract.paidAmount) : 0;
  const percent = value > 0 ? Math.min(100, Math.round((paid / value) * 100)) : 0;

  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <IconTile tone="success">
            <FileSignature className="size-4" />
          </IconTile>
          <div>
            <p className="font-medium text-foreground">{contract.code}</p>
            <p className="text-xs text-muted">
              {CONTRACT_TYPE_LABEL[contract.type]}
              {contract.signedDate && ` · Ký ngày ${formatDate(contract.signedDate)}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={STATUS_VARIANT[contract.status]}>
            {CONTRACT_STATUS_LABEL[contract.status]}
          </Badge>
          {canManage && (
            <>
              <Button
                type="button"
                onClick={onEdit}
                aria-label="Sửa hợp đồng"
                variant="ghost" size="icon-sm" className="p-1.5"
              >
                <Pencil className="size-4" />
              </Button>
              <DeleteContractButton contractId={contract.id} />
            </>
          )}
        </div>
      </div>

      {/* CT-04 / CT-05 — giá trị, cọc, đã thu. Ẩn hoàn toàn với người không thấy tiền. */
      showMoney && (
        <Card variant="filled" className="p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted">Giá trị hợp đồng</p>
              <p className="font-medium text-foreground">{formatVnd(contract.value)}</p>
            </div>
            <div>
              <p className="text-xs text-muted">Tiền cọc</p>
              <p className="font-medium text-foreground">
                {formatVnd(contract.depositAmount)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted">Đã thanh toán</p>
              <p className="font-medium text-foreground">
                {formatVnd(contract.paidAmount)}
              </p>
            </div>
          </div>
          <div className="mt-3">
            <Progress value={percent} />
            <p className="mt-1 text-right text-xs text-muted">
              {percent}% giá trị hợp đồng
            </p>
          </div>
        </Card>
      )}

      {contract.note && (
        <p className="text-sm text-muted">{contract.note}</p>
      )}

      {showMoney && (
        <ContractTransactions
          contract={contract}
          project={project}
          contracts={financeContracts}
          canManage={canManageFinance}
        />
      )}

      {/* CT-06 — file đính kèm */}
      <div className="space-y-2.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          File đính kèm ({contract.files.length})
        </p>
        {contract.files.length > 0 && (
          <Card as="ul" variant="list">
            {contract.files.map((f) => (
              <li key={f.id} className="flex items-center gap-2.5 px-3 py-2">
                <FileIcon className="size-4 shrink-0 text-muted" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-foreground">{f.fileName}</p>
                  <p className="text-xs text-muted">
                    {FILE_KIND_LABEL[f.kind]} · {humanSize(f.sizeBytes)}
                  </p>
                </div>
                {f.url ? (
                  <ButtonAnchor
                    href={f.url}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Tải xuống"
                    variant="ghost"
                    size="icon-sm"
                  >
                    <Download className="size-4" />
                  </ButtonAnchor>
                ) : (
                  <span
                    className="px-2 text-xs text-muted"
                    title="Không tạo được liên kết tải. Kiểm tra kho file (MinIO)."
                  >
                    Lỗi tải
                  </span>
                )}
                {canManage && <DeleteContractFileButton fileId={f.id} />}
              </li>
            ))}
          </Card>
        )}
        {canManage && <ContractFileUploader contractId={contract.id} />}
      </div>
    </Card>
  );
}

// ═══════════════════ KHU HỢP ĐỒNG CỦA DỰ ÁN (CT-01) ═══════════════════

export function ContractSection({
  projectId,
  project,
  contracts,
  showMoney,
  canManage,
  canManageFinance,
}: {
  projectId: string;
  project: ProjectOption;
  contracts: ContractView[];
  showMoney: boolean;
  canManage: boolean;
  canManageFinance: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const financeContracts: ContractOption[] = contracts.map((contract) => ({
    id: contract.id,
    code: contract.code,
    projectId,
    type: contract.type,
  }));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-h3 font-semibold text-foreground">
          Hợp đồng ({contracts.length})
        </h3>
        {canManage && !adding && (
          <Button
            type="button"
            onClick={() => {
              setAdding(true);
              setEditingId(null);
            }}
            className="px-4 py-2"
          >
            <Plus className="size-4" />
            Thêm hợp đồng
          </Button>
        )}
      </div>

      {adding && (
        <ContractForm
          projectId={projectId}
          showMoney={showMoney}
          onClose={() => setAdding(false)}
        />
      )}

      {contracts.length === 0 && !adding ? (
        <EmptyStatePanel >
          <IconTile shape="circle" size="xl">
            <FileSignature className="size-5" />
          </IconTile>
          <p className="text-sm text-muted">Dự án chưa có hợp đồng nào.</p>
        </EmptyStatePanel>
      ) : (
        contracts.map((c) =>
          editingId === c.id ? (
            <ContractForm
              key={c.id}
              projectId={projectId}
              showMoney={showMoney}
              contract={c}
              onClose={() => setEditingId(null)}
            />
          ) : (
            <ContractCard
              key={c.id}
              contract={c}
              project={project}
              financeContracts={financeContracts}
              showMoney={showMoney}
              canManage={canManage}
              canManageFinance={canManageFinance}
              onEdit={() => {
                setEditingId(c.id);
                setAdding(false);
              }}
            />
          ),
        )
      )}
    </div>
  );
}
