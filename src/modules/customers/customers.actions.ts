"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/modules/auth/auth.service";
import { can } from "@/common/permissions/permissions";
import {
  createCustomer,
  deleteCustomer,
  updateCustomer,
} from "@/modules/customers/customers.service";
import {
  createCustomerSchema,
  updateCustomerSchema,
} from "@/modules/customers/customers.schema";
import type { CustomerSource } from "@/generated/prisma/enums";

export type CustomerFormState = { error: string | null };

function firstIssue(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? "Dữ liệu nhập vào không hợp lệ.";
}

function readFields(formData: FormData) {
  return {
    name: formData.get("name") ?? "",
    phone: formData.get("phone") ?? "",
    email: formData.get("email") ?? "",
    address: formData.get("address") ?? "",
    source: ((formData.get("source") as string) || "OTHER") as CustomerSource,
    sourceDetail: formData.get("sourceDetail") ?? "",
    note: formData.get("note") ?? "",
  };
}

export async function createCustomerAction(
  _prev: CustomerFormState,
  formData: FormData,
): Promise<CustomerFormState> {
  const user = await requireUser();
  if (!can(user, "customer.create")) {
    return { error: "Bạn không có quyền thêm khách hàng." };
  }

  const parsed = createCustomerSchema.safeParse(readFields(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const customer = await createCustomer(user.id, parsed.data);

  revalidatePath("/customers");
  redirect(`/customers/${customer.id}`);
}

export type CreateCustomerInlineResult =
  | { ok: true; customer: { id: string; code: string; name: string } }
  | { ok: false; error: string };

/**
 * Tạo khách hàng và TRẢ VỀ khách vừa tạo (không redirect) — dùng cho modal
 * "Thêm khách hàng" ngay trên trang tạo dự án. Vẫn gác quyền `customer.create`.
 */
export async function createCustomerInlineAction(input: {
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
  source?: string;
  sourceDetail?: string;
  note?: string;
}): Promise<CreateCustomerInlineResult> {
  const user = await requireUser();
  if (!can(user, "customer.create")) {
    return { ok: false, error: "Bạn không có quyền thêm khách hàng." };
  }

  const parsed = createCustomerSchema.safeParse({
    name: input.name ?? "",
    phone: input.phone ?? "",
    email: input.email ?? "",
    address: input.address ?? "",
    source: (input.source || "OTHER") as CustomerSource,
    sourceDetail: input.sourceDetail ?? "",
    note: input.note ?? "",
  });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const customer = await createCustomer(user.id, parsed.data);
  revalidatePath("/customers");
  return {
    ok: true,
    customer: { id: customer.id, code: customer.code, name: parsed.data.name },
  };
}

export async function updateCustomerAction(
  _prev: CustomerFormState,
  formData: FormData,
): Promise<CustomerFormState> {
  const user = await requireUser();
  if (!can(user, "customer.update")) {
    return { error: "Bạn không có quyền sửa khách hàng." };
  }

  const id = String(formData.get("id") ?? "");
  const parsed = updateCustomerSchema.safeParse({ id, ...readFields(formData) });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const result = await updateCustomer(user.id, parsed.data);
  if (!result.ok) return { error: "Không tìm thấy khách hàng." };

  revalidatePath("/customers");
  revalidatePath(`/customers/${id}`);
  redirect(`/customers/${id}`);
}

export async function deleteCustomerAction(
  _prev: CustomerFormState,
  formData: FormData,
): Promise<CustomerFormState> {
  const user = await requireUser();
  if (!can(user, "customer.delete")) {
    return { error: "Bạn không có quyền xóa khách hàng." };
  }

  const id = String(formData.get("id") ?? "");
  const result = await deleteCustomer(user.id, id);
  if (!result.ok) {
    return {
      error:
        result.reason === "HAS_PROJECTS"
          ? "Không xóa được: khách hàng còn dự án đang hoạt động."
          : "Không tìm thấy khách hàng.",
    };
  }

  revalidatePath("/customers");
  redirect("/customers");
}
