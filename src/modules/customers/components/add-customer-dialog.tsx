"use client";

import { useState, useTransition } from "react";
import { LoaderCircle, TriangleAlert } from "lucide-react";
import { Dialog } from "@/components/ui/feedback/dialog";
import { Alert, Button, FormField, Input, Select, Textarea } from "@/components/ui";
import { CUSTOMER_SOURCE_LABEL } from "@/common/enums";
import type { CustomerSource } from "@/generated/prisma/enums";
import { createCustomerInlineAction } from "@/modules/customers/customers.actions";

export type NewCustomer = { id: string; code: string; name: string };

/**
 * Modal thêm nhanh khách hàng — dùng trên trang tạo dự án. Tạo xong gọi
 * `onCreated` để nơi gọi tự chọn khách vừa tạo. Không rời trang hiện tại.
 */
export function AddCustomerDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (customer: NewCustomer) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [source, setSource] = useState<CustomerSource>("OTHER");
  const isOther = source === "OTHER";

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = await createCustomerInlineAction({
        name: String(fd.get("name") ?? ""),
        phone: String(fd.get("phone") ?? ""),
        email: String(fd.get("email") ?? ""),
        address: String(fd.get("address") ?? ""),
        source: String(fd.get("source") ?? "OTHER"),
        sourceDetail: String(fd.get("sourceDetail") ?? ""),
        note: String(fd.get("note") ?? ""),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onCreated(result.customer);
    });
  }

  return (
    <Dialog title="Thêm khách hàng" onClose={onClose} size="lg">
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <Alert
            variant="danger"
            className="flex items-start gap-2.5 px-3.5 py-3"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </Alert>
        )}

        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label="Tên khách hàng" htmlFor="new-cust-name" required>
            <Input
              id="new-cust-name"
              name="name"
              required
              maxLength={150}
              autoFocus
              placeholder="VD: Nguyễn Văn A"
            />
          </FormField>

          <FormField label="Nguồn khách" htmlFor="new-cust-source">
            <Select
              id="new-cust-source"
              name="source"
              value={source}
              onChange={(e) => setSource(e.target.value as CustomerSource)}
            >
              {(
                Object.entries(CUSTOMER_SOURCE_LABEL) as [CustomerSource, string][]
              ).map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </Select>
          </FormField>

          {isOther && (
            <FormField label="Nguồn khác là gì?" htmlFor="new-cust-source-detail">
              <Input
                id="new-cust-source-detail"
                name="sourceDetail"
                required
                maxLength={255}
                placeholder="VD: Đối tác giới thiệu, sự kiện triển lãm..."
              />
            </FormField>
          )}

          <FormField label="Số điện thoại" htmlFor="new-cust-phone">
            <Input id="new-cust-phone" name="phone" inputMode="tel" />
          </FormField>

          <FormField label="Email" htmlFor="new-cust-email">
            <Input id="new-cust-email" name="email" type="email" />
          </FormField>
        </div>

        <FormField label="Địa chỉ" htmlFor="new-cust-address">
          <Input id="new-cust-address" name="address" maxLength={255} />
        </FormField>

        <FormField label="Ghi chú" htmlFor="new-cust-note">
          <Textarea id="new-cust-note" name="note" rows={3} maxLength={1000} />
        </FormField>

        <div className="flex justify-end gap-2.5">
          <Button type="button" variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button
            type="submit"
            disabled={pending}
            className="disabled:cursor-not-allowed"
          >
            {pending && <LoaderCircle className="size-4 animate-spin" />}
            {pending ? "Đang lưu..." : "Thêm khách hàng"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
