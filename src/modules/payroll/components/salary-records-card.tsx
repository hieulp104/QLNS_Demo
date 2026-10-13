"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Pencil, Plus, Trash2, TriangleAlert } from "lucide-react";

import {
  Alert,
  Button,
  Card,
  CardHeader,
  Checkbox,
  Dialog,
  FormCard,
  FormField,
  Input,
  MoneyInput,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui";
import { formatVnd } from "@/lib/utils";
import {
  deleteSalaryRecordAction,
  upsertSalaryRecordAction,
} from "@/modules/payroll/payroll.actions";

export type SalaryRecordView = {
  id: string;
  /** Ngày 1 của tháng bắt đầu hiệu lực. */
  effectiveFrom: string;
  baseSalary: number | null;
  insuranceBase: number | null;
  isFixedSalary: boolean;
  note: string | null;
};

const initialState: { error: string | null; ok?: boolean } = { error: null };

/** "2026-05-01" → "05/2026" để đọc cho giống cách kế toán nói. */
function monthLabel(iso: string): string {
  const [year, month] = iso.slice(0, 7).split("-");
  return `${month}/${year}`;
}

/** "2026-05-01" → { year: 2026, month: 5 } cho hai ô chọn. */
function monthParts(iso: string): { year: number; month: number } {
  const [year, month] = iso.slice(0, 7).split("-");
  return { year: Number(year), month: Number(month) };
}

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

/** Dải năm chọn được: lùi 5 năm, tiến 2 năm so với hiện tại. */
function yearRange(include: number): number[] {
  const now = new Date().getFullYear();
  const years = new Set<number>();
  for (let y = now - 5; y <= now + 2; y += 1) years.add(y);
  years.add(include);
  return [...years].sort((a, b) => b - a);
}

/**
 * Lịch sử lương của một người — các mốc "có hiệu lực từ tháng…".
 *
 * Mốc áp dụng vô thời hạn về sau cho tới khi gặp mốc kế tiếp, nên tăng lương chỉ
 * cần thêm một mốc mới; tháng cũ vẫn tính theo mốc cũ. Đây là điểm khác cốt lõi
 * so với cách cũ (một ô lương duy nhất trên hồ sơ): tính lại tháng 1 không còn
 * lấy nhầm mức lương của tháng 10.
 */
export function SalaryRecordsCard({
  userId,
  employeeName,
  records,
  canManage,
}: {
  userId: string;
  employeeName: string;
  records: SalaryRecordView[];
  canManage: boolean;
}) {
  const [editing, setEditing] = useState<SalaryRecordView | "new" | null>(null);

  return (
    <>
      <Card as="section" className="mb-8 max-w-3xl overflow-hidden">
        <CardHeader className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
          <div>
            <h2 className="text-h3 font-semibold text-foreground">Lịch sử lương</h2>
            <p className="mt-0.5 text-xs text-muted">
              Mỗi mốc áp dụng từ tháng ghi ở đây cho tới khi có mốc mới.
            </p>
          </div>
          {canManage && (
            <Button
              type="button"
              className="px-3 py-2"
              onClick={() => setEditing("new")}
            >
              <Plus className="size-4" />
              Thêm mốc
            </Button>
          )}
        </CardHeader>

        {records.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-muted">
            Chưa khai mốc lương nào. Bảng lương sẽ bỏ qua người này cho tới khi có
            mốc đầu tiên.
          </div>
        ) : (
          <TableContainer variant="bare">
            <Table className="min-w-[640px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Áp dụng từ</TableHead>
                  <TableHead className="text-right">Lương cơ bản</TableHead>
                  <TableHead className="text-right">Mức đóng BHXH</TableHead>
                  <TableHead>Hình thức</TableHead>
                  {canManage && <TableHead className="text-center">Sửa</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap font-semibold text-foreground">
                      Tháng {monthLabel(r.effectiveFrom)}
                      {r.note && (
                        <p className="mt-0.5 text-xs font-normal text-muted">
                          {r.note}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.baseSalary === null ? (
                        <span className="text-muted">—</span>
                      ) : (
                        formatVnd(r.baseSalary)
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.insuranceBase === null ? (
                        <span className="text-muted">Không đóng</span>
                      ) : (
                        formatVnd(r.insuranceBase)
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {r.isFixedSalary ? "Lương khoán" : "Theo công"}
                    </TableCell>
                    {canManage && (
                      <TableCell className="text-center">
                        <RowActions record={r} onEdit={() => setEditing(r)} />
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Card>

      {editing && (
        <SalaryRecordDialog
          userId={userId}
          employeeName={employeeName}
          record={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function RowActions({
  record,
  onEdit,
}: {
  record: SalaryRecordView;
  onEdit: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="flex items-center justify-center gap-1">
      <Button type="button" variant="ghost" size="icon-sm" onClick={onEdit}>
        <Pencil className="size-4" />
      </Button>
      <Button
        type="button"
        variant="dangerGhost"
        size="icon-sm"
        disabled={pending}
        onClick={() => setConfirming(true)}
      >
        <Trash2 className="size-4" />
      </Button>

      {confirming && (
        <Dialog
          title={`Xóa mốc lương tháng ${monthLabel(record.effectiveFrom)}?`}
          size="sm"
          variant="danger"
          onClose={() => setConfirming(false)}
          footer={
            <div className="flex justify-end gap-2 px-5 py-3">
              <Button
                type="button"
                variant="outline"
                className="px-4 py-2"
                onClick={() => setConfirming(false)}
              >
                Hủy
              </Button>
              <Button
                type="button"
                variant="danger"
                className="px-4 py-2"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    await deleteSalaryRecordAction({ id: record.id });
                    setConfirming(false);
                    router.refresh();
                  })
                }
              >
                {pending && <LoaderCircle className="size-4 animate-spin" />}
                Xóa mốc
              </Button>
            </div>
          }
        >
          <div className="space-y-3 px-5 py-4">
            <p className="text-sm text-foreground">
              Những tháng đang áp mốc này sẽ chuyển sang mốc cũ hơn ở lần Tính lại
              kế tiếp. Nếu không còn mốc nào trước đó, các tháng đó sẽ bị coi là
              chưa khai lương.
            </p>
            <Alert variant="warning" className="text-xs">
              Kỳ lương đã chốt giữ nguyên số đã trả — số liệu đã được đóng băng.
            </Alert>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function SalaryRecordDialog({
  userId,
  employeeName,
  record,
  onClose,
}: {
  userId: string;
  employeeName: string;
  record: SalaryRecordView | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const now = new Date();
  const initial = record
    ? monthParts(record.effectiveFrom)
    : { year: now.getFullYear(), month: now.getMonth() + 1 };
  const [state, formAction, pending] = useActionState(
    upsertSalaryRecordAction,
    initialState,
  );

  if (state.ok) {
    setTimeout(() => {
      router.refresh();
      onClose();
    }, 0);
  }

  return (
    <Dialog
      title={
        record
          ? `Sửa mốc lương tháng ${monthLabel(record.effectiveFrom)}`
          : `Thêm mốc lương — ${employeeName}`
      }
      size="sm"
      onClose={onClose}
    >
      <FormCard action={formAction} className="space-y-3 border-0 p-5 shadow-none">
        <input type="hidden" name="userId" value={userId} />

        {/* Hai ô chọn thay cho input type="month": bộ chọn mặc định của trình
            duyệt hiện tháng bằng CHỮ theo ngôn ngữ máy ("Tháng Mười 2026"), lạc
            hẳn khỏi cách bảng lương và bảng chấm công đang hiện tháng bằng số. */}
        <FormField
          label="Áp dụng từ tháng"
          htmlFor="effectiveMonth"
          hint="Mốc có hiệu lực từ tháng này trở đi, cho tới khi có mốc mới"
        >
          <div className="flex gap-2">
            <Select
              id="effectiveMonth"
              name="effectiveMonth"
              defaultValue={String(initial.month)}
              disabled={Boolean(record)}
              className="w-[9rem]"
            >
              {MONTHS.map((m) => (
                <option key={m} value={m}>
                  Tháng {m}
                </option>
              ))}
            </Select>
            <Select
              name="effectiveYear"
              defaultValue={String(initial.year)}
              disabled={Boolean(record)}
              className="w-[7.5rem]"
            >
              {yearRange(initial.year).map((y) => (
                <option key={y} value={y}>
                  Năm {y}
                </option>
              ))}
            </Select>
          </div>
        </FormField>
        {/* Ô bị disabled không gửi lên, nên khi SỬA mốc phải kèm giá trị ẩn —
            tháng của mốc cũ là khóa định danh, đổi nó là tạo mốc khác. */}
        {record && (
          <>
            <input type="hidden" name="effectiveMonth" value={initial.month} />
            <input type="hidden" name="effectiveYear" value={initial.year} />
          </>
        )}

        <FormField
          label="Lương cơ bản (VND)"
          htmlFor="baseSalary"
          hint="Với lương khoán, đây chính là số tiền trả cố định mỗi tháng"
        >
          <MoneyInput
            id="baseSalary"
            name="baseSalary"
            defaultValue={record?.baseSalary ?? ""}
          />
        </FormField>

        <FormField
          label="Mức đóng BHXH (VND)"
          htmlFor="insuranceBase"
          hint="Để trống nếu từ tháng này KHÔNG đóng bảo hiểm. Đây là mức đóng riêng, không phải lương cơ bản"
        >
          <MoneyInput
            id="insuranceBase"
            name="insuranceBase"
            defaultValue={record?.insuranceBase ?? ""}
          />
        </FormField>

        <FormField label="Hình thức trả lương" htmlFor="isFixedSalary">
          <label className="flex h-10 items-center gap-2 text-sm text-foreground">
            <Checkbox
              id="isFixedSalary"
              name="isFixedSalary"
              defaultChecked={record?.isFixedSalary ?? false}
            />
            Lương khoán — trả cố định theo tháng, không phụ thuộc số công
          </label>
        </FormField>

        <FormField label="Ghi chú" htmlFor="note">
          <Input
            id="note"
            name="note"
            maxLength={200}
            placeholder="VD: tăng lương sau thử việc"
            defaultValue={record?.note ?? ""}
          />
        </FormField>

        {state.error && (
          <Alert variant="danger" className="flex items-start gap-2 text-xs">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
            <span>{state.error}</span>
          </Alert>
        )}

        <Alert variant="warning" className="text-xs">
          Mốc mới chỉ ảnh hưởng các lần Tính lại về sau. Kỳ lương đã chốt giữ
          nguyên số đã trả.
        </Alert>

        <div className="flex gap-2">
          <Button type="submit" disabled={pending} className="px-4 py-2">
            {pending && <LoaderCircle className="size-4 animate-spin" />}
            {record ? "Lưu mốc" : "Thêm mốc"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="px-4 py-2"
            onClick={onClose}
          >
            Đóng
          </Button>
        </div>
      </FormCard>
    </Dialog>
  );
}
