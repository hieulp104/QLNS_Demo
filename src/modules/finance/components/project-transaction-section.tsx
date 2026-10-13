"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui";
import { deleteTransactionAction } from "@/modules/finance/finance.actions";
import {
  CompactTransactionTable,
  TransactionDetailDialog,
} from "@/modules/finance/components/finance-workspace";
import { TransactionForm } from "@/modules/finance/components/transaction-form";
import type { ProjectOption } from "@/modules/finance/components/finance.types";
import type { FinanceTransactionItem } from "@/modules/finance/finance.service";

type Editor =
  | { kind: "create" }
  | { kind: "edit"; transaction: FinanceTransactionItem }
  | { kind: "detail"; transaction: FinanceTransactionItem }
  | null;

export function ProjectTransactionSection({
  project,
  transactions,
  canManage,
}: {
  project: ProjectOption;
  transactions: FinanceTransactionItem[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [editor, setEditor] = useState<Editor>(null);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function remove(transaction: FinanceTransactionItem) {
    if (!window.confirm(`Xóa giao dịch ${transaction.code}?`)) return;
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
      {error && (
        <p className="border-b border-line bg-surface-danger px-5 py-3 text-sm text-danger">
          {error}
        </p>
      )}
      <CompactTransactionTable
        title={`Giao dịch khác của dự án (${transactions.length})`}
        transactions={transactions}
        canManage={canManage}
        showDirectionColumn
        emptyMessage="Chưa có giao dịch khác cho dự án này."
        onCreate={() => setEditor({ kind: "create" })}
        onDetail={(transaction) => setEditor({ kind: "detail", transaction })}
        onEdit={(transaction) => setEditor({ kind: "edit", transaction })}
        onRemove={remove}
        deletingId={deletingId}
      />

      {editor?.kind === "create" && (
        <Dialog title="Thêm giao dịch thu / chi" onClose={() => setEditor(null)} size="lg">
          <TransactionForm
            projects={[project]}
            contracts={[]}
            fixedProjectId={project.id}
            fixedContractId={null}
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
            contracts={[]}
            fixedProjectId={project.id}
            fixedContractId={null}
            onDone={() => setEditor(null)}
          />
        </Dialog>
      )}

      {editor?.kind === "detail" && (
        <Dialog title="Chi tiết giao dịch" onClose={() => setEditor(null)} size="xl">
          <TransactionDetailDialog
            transaction={editor.transaction}
            canManage={canManage}
            onEdit={() => setEditor({ kind: "edit", transaction: editor.transaction })}
          />
        </Dialog>
      )}
    </div>
  );
}
