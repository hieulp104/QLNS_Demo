"use client";

import { Alert, Button, ButtonLink, FormField, Input, Select, Textarea } from "@/components/ui";

import { useActionState, useState } from "react";
import { LoaderCircle, TriangleAlert } from "lucide-react";
import {
  createCustomerAction,
  updateCustomerAction,
  type CustomerFormState,
} from "@/modules/customers/customers.actions";
import { CUSTOMER_SOURCE_LABEL } from "@/common/enums";
import type { CustomerSource } from "@/generated/prisma/enums";

const initialState: CustomerFormState = { error: null };

type Props = {
  mode: "create" | "edit";
  customer?: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    source: CustomerSource;
    sourceDetail: string | null;
    note: string | null;
  };
};

export function CustomerForm({ mode, customer }: Props) {
  const [state, formAction, pending] = useActionState(
    mode === "create" ? createCustomerAction : updateCustomerAction,
    initialState,
  );
  const [source, setSource] = useState<CustomerSource>(customer?.source ?? "OTHER");
  const isOther = source === "OTHER";

  return (
    <form action={formAction} className="space-y-5">
      {mode === "edit" && customer && (
        <Input type="hidden" name="id" value={customer.id} />
      )}

      {state.error && (
        <Alert
          variant="danger"
          className="flex items-start gap-2.5 px-3.5 py-3"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>{state.error}</span>
        </Alert>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="Tên khách hàng" htmlFor="name">
          <Input
            id="name"
            name="name"
            required
            maxLength={150}
            defaultValue={customer?.name}
          />
        </FormField>

        <FormField label="Nguồn khách" htmlFor="source">
          <Select
            id="source"
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
          <FormField label="Nguồn khác là gì?" htmlFor="sourceDetail">
            <Input
              id="sourceDetail"
              name="sourceDetail"
              required
              maxLength={255}
              defaultValue={customer?.sourceDetail ?? ""}
              placeholder="VD: Đối tác giới thiệu, sự kiện triển lãm..."
            />
          </FormField>
        )}

        <FormField label="Số điện thoại" htmlFor="phone">
          <Input
            id="phone"
            name="phone"
            inputMode="tel"
            defaultValue={customer?.phone ?? ""}
          />
        </FormField>

        <FormField label="Email" htmlFor="email">
          <Input
            id="email"
            name="email"
            type="email"
            defaultValue={customer?.email ?? ""}
          />
        </FormField>
      </div>

      <FormField label="Địa chỉ" htmlFor="address">
        <Input
          id="address"
          name="address"
          maxLength={255}
          defaultValue={customer?.address ?? ""}
        />
      </FormField>

      <FormField label="Ghi chú" htmlFor="note">
        <Textarea
          id="note"
          name="note"
          rows={3}
          maxLength={1000}
          defaultValue={customer?.note ?? ""}
        />
      </FormField>

      <div className="flex gap-2.5">
        <Button
          type="submit"
          disabled={pending}
          size="lg" className="px-4 py-2.5 disabled:cursor-not-allowed"
        >
          {pending && <LoaderCircle className="size-4 animate-spin" />}
          {pending
            ? "Đang lưu..."
            : mode === "create"
              ? "Thêm khách hàng"
              : "Lưu thay đổi"}
        </Button>
        <ButtonLink
          href={mode === "edit" && customer ? `/customers/${customer.id}` : "/customers"}
          variant="outline"
        >
          Hủy
        </ButtonLink>
      </div>
    </form>
  );
}
