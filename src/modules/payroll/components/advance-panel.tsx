"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Plus, Trash2, TriangleAlert } from "lucide-react";
import {
  Alert,
  Button,
  Card,
  FormCard,
  FormField,
  Input,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  MoneyInput,
} from "@/components/ui";
import { ADVANCE_METHOD_LABEL } from "@/common/enums";
import { formatDate, formatVnd } from "@/lib/utils";
import type { AdvanceMethod } from "@/generated/prisma/enums";
import {
  createAdvanceAction,
  deleteAdvanceAction,
  type ActionState,
} from "@/modules/payroll/payroll.actions";

const initialState: ActionState = { error: null };

export type AdvanceRow = {
  id: string;
  userId: string;
  userName: string;
  advanceDate: Date;
  amount: number;
  method: AdvanceMethod;
  note: string | null;
};

/**
 * Sổ ứng lương của tháng — dựng lại file "ỨNG LƯƠNG CỦA CNV".
 * Mỗi phiếu ghi ngay một khoản "Chi lương" bên Tài chính (đúng ngày ứng); tổng
 * ứng của mỗi người trừ vào bảng lương ở lần tính lại kế tiếp.
 * Tháng đã chốt lương thì sổ ứng khóa — server cũng chặn.
 */
export function AdvancePanel({
  year,
  month,
  rows,
  employees,
  canManage: canManageRaw,
  locked,
}: {
  year: number;
  month: number;
  rows: AdvanceRow[];
  employees: { id: string; fullName: string }[];
  canManage: boolean;
  locked: boolean;
}) {
  const canManage = canManageRaw && !locked;
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();
  const [state, formAction, pending] = useActionState(
    createAdvanceAction,
    initialState,
  );

  const total = rows.reduce((sum, r) => sum + r.amount, 0);

  function remove(id: string) {
    if (!window.confirm("Xóa phiếu ứng lương này?")) return;
    setRowError(null);
    startTransition(async () => {
      const res = await deleteAdvanceAction(id);
      if (!res.ok) setRowError(res.error);
      else router.refresh();
    });
  }

  return (
    <>
      {canManageRaw && locked && (
        <Alert variant="neutral" className="mb-3 text-sm">
          Bảng lương tháng {month}/{year} đã chốt nên sổ ứng tháng này đã khóa. Mở
          lại kỳ lương nếu cần thêm hoặc xóa phiếu.
        </Alert>
      )}

      {canManage && (
        <div className="mb-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="px-2.5 py-1.5"
            onClick={() => setAdding((v) => !v)}
          >
            <Plus className="size-3.5" />
            Ghi phiếu ứng lương
          </Button>
        </div>
      )}

      {canManage && adding && (
        <FormCard action={formAction} variant="filled" className="mb-4 space-y-3 p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <FormField label="Nhân viên" htmlFor="userId">
              <Select id="userId" name="userId" required defaultValue="">
                <option value="" disabled>
                  — Chọn nhân viên —
                </option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.fullName}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Ngày ứng" htmlFor="advanceDate">
              <Input
                id="advanceDate"
                name="advanceDate"
                type="date"
                required
                defaultValue={`${year}-${String(month).padStart(2, "0")}-01`}
              />
            </FormField>
            <FormField label="Số tiền" htmlFor="amount">
              <MoneyInput id="amount" name="amount" required />
            </FormField>
            <FormField label="Hình thức" htmlFor="method">
              <Select id="method" name="method" defaultValue="CASH">
                {(
                  Object.entries(ADVANCE_METHOD_LABEL) as [AdvanceMethod, string][]
                ).map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>

          <FormField label="Ghi chú" htmlFor="note">
            <Input id="note" name="note" maxLength={200} placeholder="Ứng lương" />
          </FormField>

          {state.error && (
            <Alert variant="danger" className="flex items-start gap-2 text-xs">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              <span>{state.error}</span>
            </Alert>
          )}

          <div className="flex gap-2">
            <Button type="submit" disabled={pending} className="px-4 py-2">
              {pending && <LoaderCircle className="size-4 animate-spin" />}
              Lưu phiếu
            </Button>
            <Button
              type="button"
              variant="outline"
              className="px-4 py-2"
              onClick={() => setAdding(false)}
            >
              Đóng
            </Button>
          </div>
          <p className="text-xs text-muted">
            Lưu phiếu là ghi ngay khoản chi vào Tài chính theo ngày ứng. Tiền ứng
            trừ vào bảng lương của tháng chứa ngày ứng khi bấm &quot;Tính lại&quot;.
          </p>
        </FormCard>
      )}

      {rowError && (
        <Alert variant="danger" className="mb-3 flex items-start gap-2 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>{rowError}</span>
        </Alert>
      )}

      {rows.length === 0 ? (
        <Card variant="filled" className="p-6 text-sm text-muted">
          Tháng {month}/{year} chưa có ai ứng lương.
        </Card>
      ) : (
        <TableContainer>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ngày</TableHead>
                <TableHead>Nhân viên</TableHead>
                <TableHead className="text-right">Số tiền</TableHead>
                <TableHead>Hình thức</TableHead>
                <TableHead>Ghi chú</TableHead>
                {canManage && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{formatDate(r.advanceDate)}</TableCell>
                  <TableCell className="font-medium text-foreground">
                    {r.userName}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-foreground">
                    {formatVnd(r.amount)}
                  </TableCell>
                  <TableCell>{ADVANCE_METHOD_LABEL[r.method]}</TableCell>
                  <TableCell className="text-muted">{r.note ?? "—"}</TableCell>
                  {canManage && (
                    <TableCell>
                      <Button
                        type="button"
                        variant="dangerGhost"
                        size="icon-sm"
                        aria-label="Xóa phiếu ứng lương"
                        disabled={busy}
                        onClick={() => remove(r.id)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              <TableRow>
                <TableCell colSpan={2} className="font-semibold text-foreground">
                  Cộng
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums text-foreground">
                  {formatVnd(total)}
                </TableCell>
                <TableCell colSpan={canManage ? 3 : 2} />
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </>
  );
}
