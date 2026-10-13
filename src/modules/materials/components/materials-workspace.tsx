"use client";

import {
  Alert,
  Button,
  ButtonAnchor,
  Card,
  CardFooter,
  CardHeader,
  Dialog,
  DescriptionRow,
  DividerSection,
  EmptyState,
  FormCard,
  IconTile,
  Input,
  Label,
  Pagination,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  TabButton,
  Tabs,
  TabsList,
  TextLink,
  Textarea,
  MoneyInput,
} from "@/components/ui";
import {
  DocumentUploadPattern,
  type DocumentUploadOption,
} from "@/components/patterns/document-upload";

import { Fragment, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Boxes,
  ChevronDown,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Filter,
  LoaderCircle,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import type { FileKind } from "@/generated/prisma/enums";
import type {
  MaterialProjectPage,
  MaterialView,
} from "../materials.service";
import type { MaterialProjectFilter } from "../materials.schema";
import {
  createMaterialAction,
  deleteMaterialAction,
  deleteMaterialFileAction,
  importMaterialsAction,
  registerMaterialFileAction,
  requestMaterialUploadTicketAction,
  updateMaterialAction,
} from "../materials.actions";
import {
  MATERIAL_IMPORT_MAX_BYTES,
  MATERIAL_IMPORT_MAX_LABEL,
  MATERIAL_IMPORT_HEADERS,
} from "../materials.excel";
import { materialTotal } from "../materials.utils";
import { cn, formatDate, formatDateTime, formatVnd } from "@/lib/utils";

type ProjectOption = { id: string; code: string; name: string };
type MaterialSort =
  | "total-desc"
  | "total-asc"
  | "unit-price-desc"
  | "unit-price-asc"
  | "material-date-desc"
  | "material-date-asc"
  | "created-desc"
  | "created-asc"
  | "name-asc"
  | "name-desc";
type MaterialsViewMode = "projects" | "materials";
type Editor =
  | { kind: "material"; value?: MaterialView; projectId?: string }
  | { kind: "detail"; value: MaterialView }
  | null;

const MATERIAL_FILE_OPTIONS = [
  { value: "MATERIAL_DOC", label: "Tài liệu vật tư" },
  { value: "RENDER_IMAGE", label: "Ảnh render" },
  { value: "SITE_PHOTO", label: "Ảnh thi công" },
  { value: "OTHER", label: "Khác" },
] satisfies readonly DocumentUploadOption[];

function compareMaterials(
  left: MaterialView,
  right: MaterialView,
  sort: MaterialSort,
) {
  const leftUnitPrice = Number(left.unitPrice ?? 0);
  const rightUnitPrice = Number(right.unitPrice ?? 0);
  const leftTotal = materialTotal(left);
  const rightTotal = materialTotal(right);
  const leftCreatedAt = new Date(left.createdAt).getTime();
  const rightCreatedAt = new Date(right.createdAt).getTime();
  const leftMaterialDate = new Date(left.materialDate).getTime();
  const rightMaterialDate = new Date(right.materialDate).getTime();

  switch (sort) {
    case "total-desc":
      return rightTotal - leftTotal;
    case "total-asc":
      return leftTotal - rightTotal;
    case "unit-price-desc":
      return rightUnitPrice - leftUnitPrice;
    case "unit-price-asc":
      return leftUnitPrice - rightUnitPrice;
    case "material-date-desc":
      return rightMaterialDate - leftMaterialDate;
    case "material-date-asc":
      return leftMaterialDate - rightMaterialDate;
    case "created-desc":
      return rightCreatedAt - leftCreatedAt;
    case "created-asc":
      return leftCreatedAt - rightCreatedAt;
    case "name-desc":
      return right.name.localeCompare(left.name, "vi");
    case "name-asc":
      return left.name.localeCompare(right.name, "vi");
  }
}

function materialMonthKey(value: Date | string) {
  const parts = new Intl.DateTimeFormat("vi-VN", {
    year: "numeric",
    month: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh",
  }).formatToParts(new Date(value));
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return year && month ? `${year}-${month}` : "";
}

function dateInputInVietnam(value: Date | string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh",
  }).formatToParts(new Date(value));
  const fields = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${fields.year}-${fields.month}-${fields.day}`;
}

function Message({ value }: { value: string | null }) {
  return value ? (
    <Alert variant="danger" className="whitespace-pre-line">
      {value}
    </Alert>
  ) : null;
}

function fileKindLabel(kind: FileKind) {
  return (
    MATERIAL_FILE_OPTIONS.find((option) => option.value === kind)?.label ??
    "Tài liệu"
  );
}

function MaterialForm({
  material,
  projectId,
  showMoney,
  onDone,
}: {
  material?: MaterialView;
  projectId?: string;
  showMoney: boolean;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!material && !projectId) {
          setError("Vui lòng chọn dự án.");
          return;
        }
        const data = new FormData(event.currentTarget);
        startTransition(async () => {
          const base = {
            name: data.get("name"),
            unit: data.get("unit"),
            quantity: data.get("quantity"),
            unitPrice: showMoney ? data.get("unitPrice") : undefined,
            additionalCost: showMoney ? data.get("additionalCost") : undefined,
            materialDate: data.get("materialDate"),
            note: data.get("note"),
          };
          const result = material
            ? await updateMaterialAction({ id: material.id, ...base })
            : await createMaterialAction({
                projectId,
                ...base,
              });
          if (!result.ok) return setError(result.message);
          onDone();
        });
      }}
    >
      <Message value={error} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Label className="space-y-1.5">
          <span>Tên vật tư *</span>
          <Input
            name="name"
            required
            maxLength={200}
            defaultValue={material?.name}
          />
        </Label>
        <Label className="space-y-1.5">
          <span>Đơn vị tính</span>
          <Input
            name="unit"
            maxLength={30}
            defaultValue={material?.unit}
          />
        </Label>
        <Label className="space-y-1.5">
          <span>Số lượng</span>
          <Input
            name="quantity"
            inputMode="decimal"
            placeholder="1"
            defaultValue={material?.quantity ?? ""}
          />
        </Label>
        {showMoney && (
          <>
            <Label className="space-y-1.5">
              <span>Đơn giá (VND) *</span>
              <MoneyInput
                name="unitPrice"
                required
                defaultValue={material?.unitPrice ?? ""}
              />
            </Label>
            <Label className="space-y-1.5">
              <span>Chi phí thêm (VND)</span>
              <MoneyInput
                name="additionalCost"
                placeholder="0"
                defaultValue={material?.additionalCost ?? ""}
              />
            </Label>
          </>
        )}
        <Label className="space-y-1.5">
          <span>Ngày vật tư</span>
          <Input
            name="materialDate"
            type="date"
            defaultValue={
              material ? dateInputInVietnam(material.materialDate) : ""
            }
          />
          {!material && (
            <span className="block text-xs font-normal text-muted">
              Bỏ trống để sử dụng ngày hiện tại.
            </span>
          )}
        </Label>
      </div>

      <Label className="block space-y-1.5">
        <span>Ghi chú</span>
        <Textarea
          name="note"
          rows={3}
          maxLength={1000}
          defaultValue={material?.note ?? ""}
        />
      </Label>

      {!showMoney && (
        <Alert variant="warning" className="text-xs">
          Đơn giá được ẩn và không gửi về trình duyệt vì bạn không có quyền xem
          tài chính.
        </Alert>
      )}

      <Button disabled={pending} size="lg" className="px-4 py-2.5">
        {pending && <LoaderCircle className="size-4 animate-spin" />}
        {material ? "Lưu thay đổi" : "Thêm vật tư"}
      </Button>
    </form>
  );
}

function MaterialImportForm({
  projectId,
  showMoney,
  onDone,
}: {
  projectId: string;
  showMoney: boolean;
  onDone: (count: number) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!file) return setError("Vui lòng chọn file Excel .xlsx.");
        if (file.size > MATERIAL_IMPORT_MAX_BYTES) {
          return setError(
            `File Excel vượt quá dung lượng ${MATERIAL_IMPORT_MAX_LABEL}.`,
          );
        }
        const formData = new FormData();
        formData.set("projectId", projectId);
        formData.set("file", file);
        startTransition(async () => {
          setError(null);
          const result = await importMaterialsAction(formData);
          if (!result.ok) return setError(result.message);
          onDone(result.data.count);
        });
      }}
    >
      <Message value={error} />
      <Label className="block space-y-1.5">
        <span>File Excel (.xlsx)</span>
        <Input
          type="file"
          accept="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xlsx"
          required
          onChange={(event) => {
            setError(null);
            setFile(event.target.files?.[0] ?? null);
          }}
        />
      </Label>
      <p className="text-xs leading-relaxed text-muted">
        Tối đa {MATERIAL_IMPORT_MAX_LABEL}.{" "}
        {showMoney ? "Tên vật tư và đơn giá là bắt buộc" : "Tên vật tư là bắt buộc"};
        các cột còn lại có thể để trống. Nếu bất kỳ dòng nào sai, hệ thống sẽ
        không nhập dòng nào.
      </p>
      {!showMoney && (
        <Alert variant="warning" className="text-xs">
          Bạn không có quyền xem tài chính nên đơn giá và chi phí thêm trong file
          sẽ không được lưu.
        </Alert>
      )}
      <Button disabled={pending || !projectId} size="lg" className="px-4 py-2.5">
        {pending ? (
          <LoaderCircle className="size-4 animate-spin" />
        ) : (
          <FileSpreadsheet className="size-4" />
        )}
        {pending ? "Đang kiểm tra và nhập..." : "Nhập vật tư"}
      </Button>

      <div className="rounded-control border border-line bg-surface-subtle p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-foreground">
            Hướng dẫn nhập từ Excel
          </h3>
          <ButtonAnchor
            href="/api/materials/template"
            variant="outline"
            className="px-3 py-2"
          >
            <Download className="size-4" />
            Tải file mẫu
          </ButtonAnchor>
        </div>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-muted">
          <li>File .xlsx phải đúng cấu trúc yêu cầu.</li>
          <li>
            <span>
              Header có thể nằm sau các dòng tiêu đề; chỉ {" "}
              <code className="font-mono">ten_vat_tu</code>
              {showMoney && (
                <>
                  {" "}và <code className="font-mono">don_gia</code>
                </>
              )}{" "}
              là bắt buộc:
            </span>
            <div className="mt-2 flex flex-wrap gap-2">
              {MATERIAL_IMPORT_HEADERS.map((header) => (
                <code
                  key={header}
                  className="rounded-control border border-line bg-surface px-2 py-1 font-mono text-xs leading-5 text-foreground"
                >
                  {header}
                </code>
              ))}
            </div>
          </li>
          <li>
            Nếu có bất kỳ dòng dữ liệu không hợp lệ, hệ thống sẽ không nhập dữ
            liệu và sẽ báo vị trí lỗi.
          </li>
          <li>File mẫu chỉ dùng để tham khảo cấu trúc.</li>
        </ul>
      </div>
    </form>
  );
}

function CreateMaterialContent({
  initialProjectId,
  projects,
  showMoney,
  onDone,
}: {
  initialProjectId?: string;
  projects: ProjectOption[];
  showMoney: boolean;
  onDone: (message?: string) => void;
}) {
  const [mode, setMode] = useState<"manual" | "excel">("manual");
  const [projectId, setProjectId] = useState(initialProjectId ?? "");
  const fixedProject = initialProjectId
    ? projects.find((project) => project.id === initialProjectId)
    : undefined;

  return (
    <div className="space-y-5">
      <Tabs>
        <TabsList>
          <TabButton active={mode === "manual"} onClick={() => setMode("manual")}>
            Nhập thủ công
          </TabButton>
          <TabButton active={mode === "excel"} onClick={() => setMode("excel")}>
            Nhập từ Excel
          </TabButton>
        </TabsList>
      </Tabs>

      <Label className="block space-y-1.5">
        <span>Dự án *</span>
        {fixedProject ? (
          <Select value={fixedProject.id} disabled aria-label="Dự án đã chọn">
            <option value={fixedProject.id}>
              {fixedProject.code} — {fixedProject.name}
            </option>
          </Select>
        ) : (
          <Select
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
            required
          >
            <option value="">Chọn dự án</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.code} — {project.name}
              </option>
            ))}
          </Select>
        )}
      </Label>

      {mode === "manual" ? (
        <MaterialForm
          projectId={projectId}
          showMoney={showMoney}
          onDone={() => onDone()}
        />
      ) : (
        <MaterialImportForm
          projectId={projectId}
          showMoney={showMoney}
          onDone={(count) => onDone(`Đã nhập thành công ${count} vật tư.`)}
        />
      )}
    </div>
  );
}

function MaterialDocuments({
  material,
  canManage,
}: {
  material: MaterialView;
  canManage: boolean;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<FileKind>("MATERIAL_DOC");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File | null) {
    if (!file) {
      setError("Vui lòng chọn file.");
      return false;
    }

    setBusy(true);
    setError(null);
    const ticket = await requestMaterialUploadTicketAction({
      materialId: material.id,
      fileName: file.name,
      mimeType: file.type,
      kind,
    });
    if (!ticket.ok) {
      setBusy(false);
      setError(ticket.message);
      return false;
    }
    if (file.size > ticket.data.maxSizeBytes) {
      setBusy(false);
      setError("File vượt quá dung lượng cho phép.");
      return false;
    }

    try {
      const response = await fetch(ticket.data.uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "application/octet-stream" },
      });
      if (!response.ok) throw new Error();
    } catch {
      setBusy(false);
      setError("Tải file lên thất bại.");
      return false;
    }

    const saved = await registerMaterialFileAction({
      materialId: material.id,
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
    <div className="space-y-5">
      {material.files.length === 0 ? (
        <EmptyState
          icon={<FileText />}
          title="Chưa có tài liệu"
          description={
            canManage
              ? "Tải tài liệu, ảnh render hoặc ảnh thi công cho vật tư này."
              : "Vật tư này chưa có tài liệu đính kèm."
          }
          className="min-h-32 py-7"
        />
      ) : (
        <div className="divide-y divide-line rounded-card border border-line bg-surface">
          {material.files.map((file) => {
            const isImage = file.mimeType.startsWith("image/");

            return (
              <div
                key={file.id}
                className="flex items-center gap-3 px-4 py-3"
              >
                {isImage && file.url ? (
                  <a
                    href={file.url}
                    target="_blank"
                    rel="noreferrer"
                    className="size-12 shrink-0 overflow-hidden rounded-control border border-line bg-surface-subtle"
                    aria-label={`Xem trước ${file.fileName}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={file.url}
                      alt={file.fileName}
                      className="size-full object-cover transition-transform hover:scale-105"
                    />
                  </a>
                ) : (
                  <IconTile size="lg">
                    <FileText className="size-5" />
                  </IconTile>
                )}

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {file.fileName}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {fileKindLabel(file.kind)}
                    {file.uploadedBy?.fullName
                      ? ` · ${file.uploadedBy.fullName}`
                      : ""}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  {file.url ? (
                    <ButtonAnchor
                      href={file.url}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Tải ${file.fileName}`}
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
                  {canManage && (
                    <Button
                      type="button"
                      aria-label={`Xóa ${file.fileName}`}
                      onClick={async () => {
                        const result = await deleteMaterialFileAction({
                          id: file.id,
                        });
                        if (!result.ok) setError(result.message);
                        else router.refresh();
                      }}
                      variant="dangerGhost"
                      size="icon-sm"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {canManage && (
        <div className="space-y-3 border-t border-line pt-5">
          <div>
            <h3 className="text-h3 font-semibold text-foreground">
              Tải tài liệu lên
            </h3>
            <p className="mt-1 text-xs text-muted">
              Chọn đúng loại để tài liệu được phân loại chính xác.
            </p>
          </div>
          <DocumentUploadPattern
            options={MATERIAL_FILE_OPTIONS}
            value={kind}
            onChange={(value) => setKind(value as FileKind)}
            onUpload={upload}
            loading={busy}
            placeholder="Chọn loại tài liệu vật tư"
          />
        </div>
      )}

      <Message value={error} />
    </div>
  );
}

function MaterialDetailDialog({
  material,
  canManage,
  showMoney,
}: {
  material: MaterialView;
  canManage: boolean;
  showMoney: boolean;
}) {
  const total = material.unitPrice
    ? formatVnd(materialTotal(material))
    : "—";

  return (
    <div className="space-y-8">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5 sm:p-6">
          <h3 className="text-h3 font-semibold leading-tight text-foreground">Thông tin vật tư</h3>
          <DividerSection className="mt-4" />
          <dl className="pt-1">
            <DescriptionRow
              label="Tên vật tư"
              value={<span className="font-semibold">{material.name}</span>}
            />
            <DescriptionRow
              label="Dự án"
              value={
                <Link
                  href={`/projects/${material.project.id}`}
                  className="cursor-pointer font-semibold text-foreground underline-offset-2 transition-colors duration-150 visited:text-foreground hover:text-link hover:underline"
                >
                  {material.project.code} — {material.project.name}
                </Link>
              }
            />
            <DescriptionRow
              label="Số lượng"
              value={
                <span className="font-semibold tabular-nums">
                  {material.quantity} {material.unit}
                </span>
              }
            />
            <DescriptionRow
              label="Ngày vật tư"
              value={formatDate(material.materialDate)}
            />
            <DescriptionRow
              label="Ngày thêm"
              value={formatDateTime(material.createdAt)}
            />
          </dl>
        </Card>

        <Card className="p-5 sm:p-6">
          <h3 className="text-h3 font-semibold leading-tight text-foreground">Giá trị</h3>
          <DividerSection className="mt-4" />
          <dl className="pt-1">
            <DescriptionRow
              label="Đơn giá"
              value={
                <span className="font-semibold tabular-nums text-foreground">
                  {showMoney ? formatVnd(material.unitPrice) : "—"}
                </span>
              }
            />
            <DescriptionRow
              label="Chi phí thêm"
              value={
                <span className="font-semibold tabular-nums text-foreground">
                  {showMoney ? formatVnd(material.additionalCost) : "—"}
                </span>
              }
            />
            <DescriptionRow
              label="Thành tiền"
              value={
                <span
                  className={
                    showMoney
                      ? "text-sm font-semibold text-money-income tabular-nums"
                      : "text-sm font-semibold text-note tabular-nums"
                  }
                >
                  {showMoney ? total : "—"}
                </span>
              }
            />
          </dl>
        </Card>
      </div>

      <Card variant="filled" className="p-5 sm:p-6">
        <h3 className="text-h3 font-semibold leading-tight text-foreground">Ghi chú</h3>
        <DividerSection className="my-4" />
        <p
          className={cn(
            "whitespace-pre-line text-sm font-medium leading-relaxed",
            material.note?.trim() ? "text-foreground" : "text-muted",
          )}
        >
          {material.note?.trim() || "Không có ghi chú."}
        </p>
      </Card>

      <Card className="p-5 sm:p-6">
        <h3 className="text-h3 font-semibold leading-tight text-foreground">Tài liệu</h3>
        <DividerSection className="my-4" />
        <MaterialDocuments material={material} canManage={canManage} />
      </Card>
    </div>
  );
}

function MaterialActions({
  material,
  onEdit,
  onRemove,
}: {
  material: MaterialView;
  onEdit: (material: MaterialView) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="flex items-center justify-center gap-1">
      <Button
        type="button"
        onClick={() => onEdit(material)}
        variant="ghost"
        size="icon-sm"
        aria-label={`Sửa ${material.name}`}
      >
        <Pencil className="size-4" />
      </Button>
      <Button
        type="button"
        onClick={() => onRemove(material.id)}
        variant="dangerGhost"
        size="icon-sm"
        aria-label={`Xóa ${material.name}`}
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}

function ProjectViewFilters({
  filter,
  total,
  years,
  showMoney,
}: {
  filter: MaterialProjectFilter;
  total: number;
  years: number[];
  showMoney: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState(filter.q ?? "");
  const [month, setMonth] = useState(filter.month ? String(filter.month) : "");
  const [year, setYear] = useState(filter.year ? String(filter.year) : "");
  const [sort, setSort] = useState(filter.sort);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    },
    [],
  );

  function navigate(overrides: Partial<Record<"q" | "month" | "year" | "sort", string>>) {
    const values = {
      q: search.trim(),
      month,
      year,
      sort,
      ...overrides,
    };
    const params = new URLSearchParams({ view: "projects" });
    for (const [key, value] of Object.entries(values)) {
      if (value && !(key === "sort" && value === "latest-desc")) {
        params.set(key, value);
      }
    }
    startTransition(() => router.push(`/materials?${params.toString()}`));
  }

  return (
    <FormCard
      className="space-y-3 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (searchTimer.current) clearTimeout(searchTimer.current);
        navigate({ q: search.trim() });
      }}
    >
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <Label className="relative block md:col-span-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input
            type="search"
            value={search}
            placeholder="Tìm mã hoặc tên dự án..."
            className="pl-9"
            onChange={(event) => {
              const value = event.target.value;
              setSearch(value);
              if (searchTimer.current) clearTimeout(searchTimer.current);
              searchTimer.current = setTimeout(
                () => navigate({ q: value.trim() }),
                350,
              );
            }}
          />
        </Label>
        <Select
          value={month}
          aria-label="Lọc theo tháng thêm mới nhất"
          onChange={(event) => {
            const value = event.target.value;
            if (searchTimer.current) clearTimeout(searchTimer.current);
            setMonth(value);
            navigate({ month: value });
          }}
        >
          <option value="">Tất cả tháng</option>
          {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
            <option key={month} value={month}>
              Tháng {month}
            </option>
          ))}
        </Select>
        <Select
          value={year}
          aria-label="Lọc theo năm thêm mới nhất"
          onChange={(event) => {
            const value = event.target.value;
            if (searchTimer.current) clearTimeout(searchTimer.current);
            setYear(value);
            navigate({ year: value });
          }}
        >
          <option value="">Tất cả năm</option>
          {years.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </Select>
        <Select
          value={sort}
          aria-label="Sắp xếp theo"
          onChange={(event) => {
            const value = event.target.value;
            if (searchTimer.current) clearTimeout(searchTimer.current);
            setSort(value as MaterialProjectFilter["sort"]);
            navigate({ sort: value });
          }}
        >
          <option value="latest-desc">Thêm mới nhất: mới → cũ</option>
          <option value="latest-asc">Thêm mới nhất: cũ → mới</option>
          {showMoney && (
            <>
              <option value="total-desc">Tổng giá trị: cao → thấp</option>
              <option value="total-asc">Tổng giá trị: thấp → cao</option>
            </>
          )}
          <option value="count-desc">Số loại vật tư: nhiều → ít</option>
          <option value="count-asc">Số loại vật tư: ít → nhiều</option>
          <option value="name-asc">Tên dự án: A → Z</option>
          <option value="name-desc">Tên dự án: Z → A</option>
        </Select>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted">
          {total} dự án có vật tư khớp bộ lọc hiện tại
        </p>
        <Button
          type="button"
          disabled={
            pending ||
            (!filter.q &&
              !filter.month &&
              !filter.year &&
              filter.sort === "latest-desc")
          }
          onClick={() => {
            if (searchTimer.current) clearTimeout(searchTimer.current);
            setSearch("");
            setMonth("");
            setYear("");
            setSort("latest-desc");
            startTransition(() => router.push("/materials?view=projects"));
          }}
          variant="outline"
          className="px-4 py-2"
        >
          Xóa bộ lọc
        </Button>
      </div>
    </FormCard>
  );
}

function ProjectMaterialsTable({
  data,
  filter,
  showMoney,
  manageable,
  onCreate,
  onDetail,
  onEdit,
  onRemove,
}: {
  data: MaterialProjectPage;
  filter: MaterialProjectFilter;
  showMoney: boolean;
  manageable: Set<string>;
  onCreate: (projectId: string) => void;
  onDetail: (material: MaterialView) => void;
  onEdit: (material: MaterialView) => void;
  onRemove: (id: string) => void;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(projectId: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  }

  function goToPage(page: number) {
    const params = new URLSearchParams({ view: "projects" });
    if (filter.q) params.set("q", filter.q);
    if (filter.month) params.set("month", String(filter.month));
    if (filter.year) params.set("year", String(filter.year));
    if (filter.sort !== "latest-desc") params.set("sort", filter.sort);
    if (page > 1) params.set("page", String(page));
    router.push(`/materials?${params.toString()}`);
  }

  if (data.items.length === 0) {
    return (
      <div className="p-4">
        <EmptyState
          icon={<Boxes />}
          title="Chưa có dự án phù hợp"
          description="Không có dự án nào có vật tư khớp bộ lọc hiện tại."
          variant="plain"
          className="min-h-36 py-8"
        />
      </div>
    );
  }

  return (
    <>
      <TableContainer variant="bare">
        <Table className="min-w-[900px] table-fixed">
          <colgroup>
            <col className={showMoney ? "w-[34%]" : "w-[44%]"} />
            <col className={showMoney ? "w-[16%]" : "w-[18%]"} />
            {showMoney && <col className="w-[22%]" />}
            <col className={showMoney ? "w-[18%]" : "w-[26%]"} />
            <col className={showMoney ? "w-[10%]" : "w-[12%]"} />
          </colgroup>
          <TableHeader>
            <TableRow>
              <TableHead>Dự án</TableHead>
              <TableHead className="text-right">Số loại vật tư</TableHead>
              {showMoney && (
                <TableHead className="text-right">Tổng giá trị</TableHead>
              )}
              <TableHead>Vật tư mới nhất</TableHead>
              <TableHead className="text-center">Mở rộng</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((project) => {
              const isExpanded = expanded.has(project.id);
              const canManage = manageable.has(project.id);
              return (
                <Fragment key={project.id}>
                  <TableRow variant="summary">
                    <TableCell>
                      <TextLink
                        href={`/projects/${project.id}`}
                        className="block font-semibold text-foreground hover:text-link"
                      >
                        {project.code}
                      </TextLink>
                      <p className="mt-0.5 truncate text-xs text-note">
                        {project.name}
                      </p>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {project.materialCount}
                    </TableCell>
                    {showMoney && (
                      <TableCell className="text-right font-semibold tabular-nums">
                        {formatVnd(project.totalValue)}
                      </TableCell>
                    )}
                    <TableCell className="whitespace-nowrap text-muted tabular-nums">
                      {formatDate(project.latestMaterialDate)}
                    </TableCell>
                    <TableCell className="text-center">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => toggle(project.id)}
                        aria-expanded={isExpanded}
                        aria-label={`${isExpanded ? "Thu gọn" : "Mở rộng"} ${project.code}`}
                      >
                        <ChevronDown
                          className={cn(
                            "size-4 transition-transform",
                            isExpanded && "rotate-180",
                          )}
                        />
                      </Button>
                    </TableCell>
                  </TableRow>
                  {isExpanded && (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={showMoney ? 5 : 4} className="p-0">
                        <div className="space-y-3 bg-surface-subtle/50 px-5 py-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-foreground">
                              Vật tư của {project.code}
                            </p>
                            {canManage && (
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => onCreate(project.id)}
                              >
                                <Plus className="size-4" />
                                Thêm vật tư
                              </Button>
                            )}
                          </div>
                          <TableContainer className="rounded-control border border-line bg-surface">
                            <Table className="min-w-[1080px] table-fixed text-xs">
                              <colgroup>
                                <col className="w-[22%]" />
                                <col className="w-[11%]" />
                                <col className="w-[10%]" />
                                <col className="w-[14%]" />
                                <col className="w-[16%]" />
                                <col className="w-[13%]" />
                                <col className="w-[7%]" />
                                {canManage && <col className="w-[7%]" />}
                              </colgroup>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Tên vật tư</TableHead>
                                  <TableHead>Đơn vị tính</TableHead>
                                  <TableHead className="text-right">Số lượng</TableHead>
                                  <TableHead className="text-right">Đơn giá</TableHead>
                                  <TableHead className="text-right">Thành tiền</TableHead>
                                  <TableHead>Ngày vật tư</TableHead>
                                  <TableHead className="text-center">Chi tiết</TableHead>
                                  {canManage && (
                                    <TableHead className="text-center">Thao tác</TableHead>
                                  )}
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {project.materials.map((material) => {
                                  const total = material.unitPrice
                                    ? formatVnd(materialTotal(material))
                                    : "—";
                                  return (
                                    <TableRow key={material.id}>
                                      <TableCell className="font-semibold">
                                        {material.name}
                                      </TableCell>
                                      <TableCell>{material.unit}</TableCell>
                                      <TableCell className="text-right tabular-nums">
                                        {material.quantity}
                                      </TableCell>
                                      <TableCell className="text-right tabular-nums">
                                        {showMoney ? formatVnd(material.unitPrice) : "—"}
                                      </TableCell>
                                      <TableCell className="text-right font-semibold tabular-nums">
                                        {showMoney ? total : "—"}
                                      </TableCell>
                                      <TableCell className="whitespace-nowrap text-muted tabular-nums">
                                        {formatDate(material.materialDate)}
                                      </TableCell>
                                      <TableCell className="text-center">
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon-sm"
                                          onClick={() => onDetail(material)}
                                          aria-label={`Xem chi tiết ${material.name}`}
                                        >
                                          <Eye className="size-4" />
                                        </Button>
                                      </TableCell>
                                      {canManage && (
                                        <TableCell>
                                          <MaterialActions
                                            material={material}
                                            onEdit={onEdit}
                                            onRemove={onRemove}
                                          />
                                        </TableCell>
                                      )}
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
                          </TableContainer>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
      {data.pageCount > 1 && (
        <CardFooter className="flex flex-col gap-3 px-5 py-4 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="text-muted">
            Hiển thị {(data.page - 1) * data.pageSize + 1}–
            {Math.min(data.page * data.pageSize, data.total)} trong {data.total} dự án
          </p>
          <Pagination
            page={data.page}
            pageCount={data.pageCount}
            onPageChange={goToPage}
            ariaLabel="Phân trang dự án có vật tư"
          />
        </CardFooter>
      )}
    </>
  );
}

export function MaterialsWorkspace({
  projects,
  materials,
  view = "materials",
  projectData = null,
  projectViewFilter = {
    q: undefined,
    month: undefined,
    year: undefined,
    sort: "latest-desc",
    page: 1,
  },
  showMoney,
  manageableProjectIds,
  fixedProjectId,
}: {
  projects: ProjectOption[];
  materials: MaterialView[];
  view?: MaterialsViewMode;
  projectData?: MaterialProjectPage | null;
  projectViewFilter?: MaterialProjectFilter;
  showMoney: boolean;
  manageableProjectIds: string[];
  fixedProjectId?: string;
}) {
  const router = useRouter();
  const [viewPending, startViewTransition] = useTransition();
  const [editor, setEditor] = useState<Editor>(null);
  const [query, setQuery] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const [materialSort, setMaterialSort] =
    useState<MaterialSort>("material-date-desc");
  const [projectSort, setProjectSort] = useState<MaterialSort>(
    showMoney ? "total-desc" : "material-date-desc",
  );
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const manageable = new Set(manageableProjectIds);
  const hasActiveFilter =
    Boolean(query) || (!fixedProjectId && Boolean(monthFilter));
  const filtered = materials.filter(
    (material) => {
      const searchableText = fixedProjectId
        ? material.name
        : `${material.name} ${material.project.code} ${material.project.name}`;
      return (
        (!fixedProjectId || material.projectId === fixedProjectId) &&
        (fixedProjectId ||
          !monthFilter ||
          materialMonthKey(material.materialDate) === monthFilter) &&
        searchableText
          .toLocaleLowerCase("vi")
          .includes(query.toLocaleLowerCase("vi"))
      );
    },
  );
  const months = [
    ...new Set(materials.map((material) => materialMonthKey(material.materialDate))),
  ]
    .filter(Boolean)
    .sort((a, b) => b.localeCompare(a));
  const filteredTotalValue = filtered.reduce(
    (sum, material) => sum + materialTotal(material),
    0,
  );
  const sortedMaterials = [...filtered].sort((left, right) =>
    compareMaterials(
      left,
      right,
      fixedProjectId ? projectSort : materialSort,
    ),
  );
  const pageSize = 15;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visibleMaterials = sortedMaterials.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );
  const projectMaterials = projectData?.items.flatMap((project) => project.materials) ?? [];
  const detailMaterial =
    editor?.kind === "detail"
      ? [...materials, ...projectMaterials].find(
          (material) => material.id === editor.value.id,
        ) ??
        editor.value
      : null;

  function clearFilters() {
    setQuery("");
    setMonthFilter("");
    setPage(1);
  }

  async function remove(id: string) {
    if (!window.confirm("Xóa dòng vật tư này? Thao tác không thể hoàn tác.")) {
      return;
    }
    const result = await deleteMaterialAction({ id });
    if (!result.ok) setError(result.message);
    else router.refresh();
  }

  return (
    <div className="space-y-6">
      {!fixedProjectId && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted">Chế độ xem</p>
          <Tabs className="w-fit max-w-full rounded-t-control border border-line bg-surface px-1 pt-1">
            <TabsList>
              <TabButton
                active={view === "projects"}
                disabled={viewPending}
                onClick={() =>
                  startViewTransition(() =>
                    router.push("/materials?view=projects"),
                  )
                }
              >
                Theo dự án
              </TabButton>
              <TabButton
                active={view === "materials"}
                disabled={viewPending}
                onClick={() =>
                  startViewTransition(() =>
                    router.push("/materials?view=materials"),
                  )
                }
              >
                Theo vật tư
              </TabButton>
            </TabsList>
          </Tabs>
        </div>
      )}

      {view === "projects" && projectData ? (
        <ProjectViewFilters
          key={JSON.stringify(projectViewFilter)}
          filter={projectViewFilter}
          total={projectData.total}
          years={projectData.years}
          showMoney={showMoney}
        />
      ) : (
        <FormCard
          onSubmit={(event) => event.preventDefault()}
          className="space-y-3 p-4"
        >
          <div
            className={cn(
              "grid gap-3",
              fixedProjectId
                ? "md:grid-cols-4"
                : "md:grid-cols-2 xl:grid-cols-4",
            )}
          >
            <Label
              className={cn(
                "relative block",
                fixedProjectId ? "md:col-span-3" : "md:col-span-2",
              )}
            >
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
              <Input
                type="search"
                aria-label="Tìm vật tư"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(1);
                }}
                placeholder={
                  fixedProjectId
                    ? "Tìm theo tên vật tư..."
                    : "Tìm tên vật tư..."
                }
                className="pl-9"
              />
            </Label>

            {fixedProjectId && (
              <Select
                aria-label="Sắp xếp theo"
                value={projectSort}
                onChange={(event) => {
                  setProjectSort(event.target.value as MaterialSort);
                  setPage(1);
                }}
              >
                {showMoney && (
                  <>
                    <option value="total-desc">Thành tiền: cao → thấp</option>
                    <option value="total-asc">Thành tiền: thấp → cao</option>
                    <option value="unit-price-desc">Đơn giá: cao → thấp</option>
                    <option value="unit-price-asc">Đơn giá: thấp → cao</option>
                  </>
                )}
                <option value="material-date-desc">Ngày vật tư: mới nhất</option>
                <option value="material-date-asc">Ngày vật tư: cũ nhất</option>
                <option value="created-desc">Ngày thêm: mới nhất</option>
                <option value="created-asc">Ngày thêm: cũ nhất</option>
                <option value="name-asc">Tên vật tư: A → Z</option>
                <option value="name-desc">Tên vật tư: Z → A</option>
              </Select>
            )}

            {!fixedProjectId && (
              <>
                <Select
                  aria-label="Lọc theo tháng vật tư"
                  value={monthFilter}
                  onChange={(event) => {
                    setMonthFilter(event.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">Tất cả thời gian</option>
                  {months.map((monthKey) => {
                    const [year, month] = monthKey.split("-");
                    return (
                      <option key={monthKey} value={monthKey}>
                        Tháng {Number(month)}/{year}
                      </option>
                    );
                  })}
                </Select>
                <Select
                  aria-label="Sắp xếp theo"
                  value={materialSort}
                  onChange={(event) => {
                    setMaterialSort(event.target.value as MaterialSort);
                    setPage(1);
                  }}
                >
                  <option value="material-date-desc">Ngày vật tư: mới nhất</option>
                  <option value="material-date-asc">Ngày vật tư: cũ nhất</option>
                  <option value="created-desc">Ngày thêm: mới nhất</option>
                  <option value="created-asc">Ngày thêm: cũ nhất</option>
                  {showMoney && (
                    <>
                      <option value="total-desc">Thành tiền: cao → thấp</option>
                      <option value="total-asc">Thành tiền: thấp → cao</option>
                    </>
                  )}
                  <option value="name-asc">Tên vật tư: A → Z</option>
                  <option value="name-desc">Tên vật tư: Z → A</option>
                </Select>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            {fixedProjectId ? (
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
                <span>
                  <strong className="font-semibold text-foreground tabular-nums">
                    {filtered.length}
                  </strong>{" "}
                  loại vật tư
                </span>
                {showMoney && (
                  <>
                    <span aria-hidden="true" className="text-note">·</span>
                    <span>
                      Tổng giá trị{" "}
                      <strong className="font-semibold text-foreground tabular-nums">
                        {formatVnd(filteredTotalValue)}
                      </strong>
                    </span>
                  </>
                )}
              </p>
            ) : (
              <p className="text-xs text-muted">
                {filtered.length} vật tư khớp bộ lọc hiện tại
              </p>
            )}
            {!fixedProjectId && (
              <Button
                type="button"
                onClick={clearFilters}
                disabled={!hasActiveFilter}
                variant="outline"
                className="px-4 py-2"
              >
                <Filter className="size-4" />
                Xóa bộ lọc
              </Button>
            )}
          </div>
        </FormCard>
      )}

      <Card as="section" className="overflow-hidden">
        <CardHeader className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-h2 font-bold text-foreground">
              {fixedProjectId
                ? "Vật tư của dự án"
                : view === "projects"
                  ? "Vật tư theo dự án"
                  : "Danh sách vật tư"}
            </h2>
            <p className="text-xs text-muted">
              Số lượng, đơn giá và tài liệu sử dụng thực tế.
            </p>
          </div>
          {view === "projects" && manageableProjectIds.length > 0 && (
            <Button
              type="button"
              onClick={() => setEditor({ kind: "material" })}
              className="px-4 py-2"
            >
              <Plus className="size-4" />
              Thêm vật tư vào dự án
            </Button>
          )}
          {view === "materials" && manageableProjectIds.length > 0 && (
            <Button
              type="button"
              onClick={() => setEditor({ kind: "material" })}
              className="px-4 py-2"
            >
              <Plus className="size-4" />
              Thêm vật tư
            </Button>
          )}
        </CardHeader>

        {error && (
          <div className="p-4">
            <Message value={error} />
          </div>
        )}
        {success && (
          <div className="p-4">
            <Alert variant="success">{success}</Alert>
          </div>
        )}

        {view === "projects" && projectData ? (
          <ProjectMaterialsTable
            data={projectData}
            filter={projectViewFilter}
            showMoney={showMoney}
            manageable={manageable}
            onCreate={(projectId) =>
              setEditor({ kind: "material", projectId })
            }
            onDetail={(material) =>
              setEditor({ kind: "detail", value: material })
            }
            onEdit={(material) =>
              setEditor({ kind: "material", value: material })
            }
            onRemove={remove}
          />
        ) : filtered.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={<Boxes />}
              title="Chưa có vật tư phù hợp"
              description={
                hasActiveFilter
                  ? "Thử xóa bộ lọc để xem toàn bộ danh sách vật tư."
                  : "Thêm vật tư đầu tiên để bắt đầu quản lý theo dự án."
              }
              variant="plain"
              className="min-h-36 py-8"
            />
          </div>
        ) : (
          <TableContainer variant="bare">
            <Table
              className={cn(
                "table-fixed",
                fixedProjectId ? "min-w-[1080px]" : "min-w-[920px]",
              )}
            >
              <colgroup>
                {fixedProjectId ? (
                  <>
                    <col className="w-[21%]" />
                    <col className="w-[10%]" />
                    <col className="w-[10%]" />
                    <col className="w-[14%]" />
                    <col className="w-[16%]" />
                    <col className="w-[14%]" />
                    <col className="w-[7%]" />
                    {manageableProjectIds.length > 0 && (
                      <col className="w-[8%]" />
                    )}
                  </>
                ) : (
                  <>
                    <col className="w-[22%]" />
                    <col className="w-[32%]" />
                    <col className="w-[14%]" />
                    <col className="w-[16%]" />
                    <col className="w-[7%]" />
                    {manageableProjectIds.length > 0 && (
                      <col className="w-[9%]" />
                    )}
                  </>
                )}
              </colgroup>
              <TableHeader className="text-left">
                <TableRow>
                  <TableHead className="px-5">Tên vật tư</TableHead>
                  {fixedProjectId ? (
                    <>
                      <TableHead className="px-3">Đơn vị tính</TableHead>
                      <TableHead className="px-3 text-right">Số lượng</TableHead>
                      <TableHead className="px-3 text-right">Đơn giá</TableHead>
                      <TableHead className="pl-3 pr-5 text-right">Thành tiền</TableHead>
                      <TableHead className="pl-5 pr-3">Ngày vật tư</TableHead>
                    </>
                  ) : (
                    <>
                      <TableHead className="px-5">Dự án</TableHead>
                      <TableHead className="px-5">Ngày vật tư</TableHead>
                      <TableHead className="px-5 text-right">Thành tiền</TableHead>
                    </>
                  )}
                  <TableHead className="px-3 text-center">Chi tiết</TableHead>
                  {manageableProjectIds.length > 0 && (
                    <TableHead className="px-3 text-center">
                      Thao tác
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleMaterials.map((material) => {
                  const canManage = manageable.has(material.projectId);
                  const total = material.unitPrice
                    ? formatVnd(materialTotal(material))
                    : "—";

                  return (
                    <TableRow key={material.id} className="align-middle">
                      <TableCell className="px-5">
                        <p className="truncate font-semibold text-foreground">
                          {material.name}
                        </p>
                      </TableCell>
                      {fixedProjectId ? (
                        <>
                          <TableCell className="px-3">{material.unit}</TableCell>
                          <TableCell className="px-3 text-right tabular-nums">
                            {material.quantity}
                          </TableCell>
                          <TableCell className="whitespace-nowrap px-3 text-right tabular-nums">
                            {showMoney ? formatVnd(material.unitPrice) : "—"}
                          </TableCell>
                          <TableCell
                            emphasis
                            className="whitespace-nowrap pl-3 pr-5 text-right tabular-nums"
                          >
                            {showMoney ? total : "—"}
                          </TableCell>
                          <TableCell className="whitespace-nowrap pl-5 pr-3 text-muted tabular-nums">
                            {formatDate(material.materialDate)}
                          </TableCell>
                        </>
                      ) : (
                        <>
                          <TableCell className="px-5">
                            <TextLink
                              href={`/projects/${material.project.id}`}
                              className="block truncate font-semibold text-foreground hover:text-link"
                            >
                              {material.project.code} — {material.project.name}
                            </TextLink>
                          </TableCell>
                          <TableCell className="whitespace-nowrap px-5 text-muted tabular-nums">
                            {formatDate(material.materialDate)}
                          </TableCell>
                          <TableCell
                            emphasis
                            className="whitespace-nowrap px-5 text-right tabular-nums"
                          >
                            {showMoney ? total : "—"}
                          </TableCell>
                        </>
                      )}
                      <TableCell className="px-3 text-center">
                        <Button
                          type="button"
                          onClick={() => setEditor({ kind: "detail", value: material })}
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Xem chi tiết ${material.name}`}
                        >
                          <Eye className="size-4" />
                        </Button>
                      </TableCell>
                      {manageableProjectIds.length > 0 && (
                        <TableCell className="px-3">
                          {canManage ? (
                            <MaterialActions
                              material={material}
                              onEdit={(value) =>
                                setEditor({ kind: "material", value })
                              }
                              onRemove={remove}
                            />
                          ) : (
                            <span className="block text-right text-muted">—</span>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {view === "materials" && filtered.length > pageSize && (
          <CardFooter className="flex flex-col gap-3 px-5 py-4 text-sm sm:flex-row sm:items-center sm:justify-between">
            <p className="text-muted">
              Hiển thị {(currentPage - 1) * pageSize + 1}–
              {Math.min(currentPage * pageSize, filtered.length)} trong{" "}
              {filtered.length} vật tư
            </p>
            <Pagination
              page={currentPage}
              pageCount={pageCount}
              onPageChange={setPage}
              ariaLabel="Phân trang danh sách vật tư"
            />
          </CardFooter>
        )}
      </Card>

      {editor?.kind === "material" && (
        <Dialog
          title={editor.value ? "Sửa vật tư" : "Thêm vật tư"}
          onClose={() => setEditor(null)}
          size="md"
        >
          {editor.value ? (
            <MaterialForm
              material={editor.value}
              showMoney={showMoney}
              onDone={() => {
                setEditor(null);
                router.refresh();
              }}
            />
          ) : (
            <CreateMaterialContent
              initialProjectId={editor.projectId ?? fixedProjectId}
              projects={projects.filter((project) => manageable.has(project.id))}
              showMoney={showMoney}
              onDone={(message) => {
                setSuccess(message ?? null);
                setEditor(null);
                router.refresh();
              }}
            />
          )}
        </Dialog>
      )}

      {detailMaterial && (
        <Dialog
          title="Chi tiết vật tư"
          onClose={() => setEditor(null)}
          size="xl"
          titleClassName="text-h2 font-bold"
        >
          <MaterialDetailDialog
            material={detailMaterial}
            canManage={manageable.has(detailMaterial.projectId)}
            showMoney={showMoney}
          />
        </Dialog>
      )}
    </div>
  );
}
