"use client";

import { Alert, Button, ButtonLink, FormField, Input, MoneyInput, Select, Textarea } from "@/components/ui";

import { useActionState, useState } from "react";
import { LoaderCircle, TriangleAlert, UserPlus } from "lucide-react";
import {
  createProjectAction,
  updateProjectAction,
  type ProjectFormState,
} from "@/modules/projects/projects.actions";
import {
  AddCustomerDialog,
  type NewCustomer,
} from "@/modules/customers/components/add-customer-dialog";
import {
  PROJECT_STATUS_LABEL,
  PROJECT_TYPE_LABEL,
  PROPERTY_TYPE_SUGGESTIONS,
} from "@/common/enums";
import type { ProjectStatus, ProjectType } from "@/generated/prisma/enums";

const initialState: ProjectFormState = { error: null };

type Props = {
  mode: "create" | "edit";
  /** Người xem được tiền mới thấy & sửa ô giá trị dự kiến. */
  canSeeMoney: boolean;
  customers: { id: string; code: string; name: string }[];
  /** Có quyền `customer.create` mới thấy nút thêm nhanh khách hàng. */
  canCreateCustomer?: boolean;
  project?: {
    id: string;
    name: string;
    type: ProjectType;
    propertyType: string;
    estimatedValue: string | null;
    address: string | null;
    description: string | null;
    status: ProjectStatus;
    startDate: Date | null;
    expectedEndDate: Date | null;
    actualEndDate: Date | null;
  };
};

function toDateInput(value: Date | null | undefined): string {
  return value ? new Date(value).toISOString().slice(0, 10) : "";
}

export function ProjectForm({
  mode,
  canSeeMoney,
  customers,
  canCreateCustomer = false,
  project,
}: Props) {
  const [state, formAction, pending] = useActionState(
    mode === "create" ? createProjectAction : updateProjectAction,
    initialState,
  );

  // Danh sách + lựa chọn khách hàng giữ ở state để thêm nhanh khách mới xong
  // là chèn vào ô chọn và tự chọn luôn.
  const [customerList, setCustomerList] = useState(customers);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [showAddCustomer, setShowAddCustomer] = useState(false);

  function handleCustomerCreated(customer: NewCustomer) {
    setCustomerList((prev) => [customer, ...prev]);
    setSelectedCustomerId(customer.id);
    setShowAddCustomer(false);
  }

  return (
    <>
    <form action={formAction} className="space-y-5">
      {mode === "edit" && project && (
        <Input type="hidden" name="id" value={project.id} />
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

      <FormField label="Tên dự án" htmlFor="name" required>
        <Input
          id="name"
          name="name"
          required
          maxLength={200}
          defaultValue={project?.name}
          placeholder="VD: Nội thất căn hộ Vinhomes Central Park"
        />
      </FormField>

      <div className="grid gap-5 sm:grid-cols-2">
        {mode === "create" ? (
          <FormField label="Khách hàng" htmlFor="customerId" required>
            <div className="flex gap-2">
              <Select
                id="customerId"
                name="customerId"
                required
                value={selectedCustomerId}
                onChange={(e) => setSelectedCustomerId(e.target.value)}
                className="flex-1"
              >
                <option value="">— Chọn khách hàng —</option>
                {customerList.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.code})
                  </option>
                ))}
              </Select>
              {canCreateCustomer && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowAddCustomer(true)}
                  className="shrink-0"
                  title="Thêm khách hàng mới"
                >
                  <UserPlus className="size-4" />
                  Thêm
                </Button>
              )}
            </div>
          </FormField>
        ) : null}

        {mode === "create" ? (
          <FormField label="Loại dự án" htmlFor="type" required>
            <Select id="type" name="type" required>
              {(Object.entries(PROJECT_TYPE_LABEL) as [ProjectType, string][]).map(
                ([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ),
              )}
            </Select>
          </FormField>
        ) : null}

        <FormField label="Loại hình công trình" htmlFor="propertyType" required>
          <Input
            id="propertyType"
            name="propertyType"
            required
            list="property-types"
            maxLength={50}
            defaultValue={project?.propertyType}
            placeholder="VD: Chung cư"
          />
          <datalist id="property-types">
            {PROPERTY_TYPE_SUGGESTIONS.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </FormField>

        {canSeeMoney && (
          <FormField label="Giá trị dự kiến (VND)" htmlFor="estimatedValue">
            <MoneyInput
              id="estimatedValue"
              name="estimatedValue"
              defaultValue={project?.estimatedValue ?? ""}
              placeholder="VD: 350.000.000"
            />
          </FormField>
        )}

        {mode === "edit" && project ? (
          <FormField label="Trạng thái" htmlFor="status">
            <Select
              id="status"
              name="status"
              defaultValue={project.status}
            >
              {(Object.entries(PROJECT_STATUS_LABEL) as [ProjectStatus, string][]).map(
                ([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ),
              )}
            </Select>
          </FormField>
        ) : null}

        {mode === "edit" && (
          <FormField label="Ngày bắt đầu" htmlFor="startDate">
            <Input
              id="startDate"
              name="startDate"
              type="date"
              defaultValue={toDateInput(project?.startDate)}
            />
          </FormField>
        )}

        <FormField label="Thời gian dự kiến hoàn thành" htmlFor="expectedEndDate">
          <Input
            id="expectedEndDate"
            name="expectedEndDate"
            type="date"
            defaultValue={toDateInput(project?.expectedEndDate)}
          />
        </FormField>

        {/* Ngày bàn giao là gốc tính bảo hành 5 năm và lịch kiểm tra định kỳ.
            Hệ thống tự điền khi dự án chuyển sang giai đoạn Bảo hành; ô này để
            sửa lại cho đúng, hoặc điền cho dự án cũ nhập sau. */}
        {mode === "edit" && (
          <FormField
            label="Ngày bàn giao thực tế"
            htmlFor="actualEndDate"
            hint="Mốc tính bảo hành 5 năm và lịch kiểm tra định kỳ"
          >
            <Input
              id="actualEndDate"
              name="actualEndDate"
              type="date"
              defaultValue={toDateInput(project?.actualEndDate)}
            />
          </FormField>
        )}
      </div>

      <FormField label="Địa chỉ công trình" htmlFor="address">
        <Input
          id="address"
          name="address"
          maxLength={255}
          defaultValue={project?.address ?? ""}
        />
      </FormField>

      <FormField label="Mô tả" htmlFor="description">
        <Textarea
          id="description"
          name="description"
          rows={4}
          maxLength={2000}
          defaultValue={project?.description ?? ""}
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
              ? "Tạo dự án"
              : "Lưu thay đổi"}
        </Button>
        <ButtonLink
          href={mode === "edit" && project ? `/projects/${project.id}` : "/projects"}
          variant="outline"
        >
          Hủy
        </ButtonLink>
      </div>
    </form>

      {showAddCustomer && (
        <AddCustomerDialog
          onClose={() => setShowAddCustomer(false)}
          onCreated={handleCustomerCreated}
        />
      )}
    </>
  );
}
