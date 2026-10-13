import { z } from "zod";

const requiredText = (label: string, max: number) =>
  z.string().trim().min(1, `${label} không được để trống`).max(max, `${label} tối đa ${max} ký tự`);

const optionalText = (label: string, max: number) =>
  z.string().trim().max(max, `${label} tối đa ${max} ký tự`).optional().transform((value) => value || undefined);

const id = (label: string) => z.string().trim().min(1, `Thiếu ${label}`);

const quantity = z
  .string()
  .trim()
  .optional()
  .transform((value) => value || "1")
  .transform((value) => value.replace(",", "."))
  .refine((value) => /^\d+(\.\d{1,2})?$/.test(value), "Số lượng không hợp lệ")
  .refine((value) => Number(value) > 0, "Số lượng phải lớn hơn 0");

const money = (label: string) => z
  .string()
  .trim()
  .optional()
  .transform((value) => value || undefined)
  .refine(
    (value) =>
      value === undefined ||
      /^\d+$/.test(value) ||
      /^\d{1,3}([.,\s]\d{3})+$/.test(value),
    `${label} không hợp lệ`,
  )
  .transform((value) => value?.replace(/[.,\s]/g, ""))
  .refine(
    (value) => value === undefined || value.length <= 15,
    `${label} tối đa 15 chữ số`,
  );

const unitPrice = money("Đơn giá")
  .refine((value) => value !== undefined, "Đơn giá không được để trống")
  .transform((value) => value as string);

const additionalCost = money("Chi phí thêm").transform(
  (value) => value ?? "0",
);

function parseDateText(value: string) {
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const viMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  const parts = isoMatch
    ? [Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3])]
    : viMatch
      ? [Number(viMatch[3]), Number(viMatch[2]), Number(viMatch[1])]
      : null;
  if (!parts) return value;
  const [year, month, day] = parts;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? date
    : value;
}

/** Serial nhỏ hơn mốc này gần như luôn là số bị gõ nhầm vào ô ngày (vd `2026`), không phải ngày Excel. */
const MIN_EXCEL_DATE_SERIAL = 20_000; // ~ 24/10/1954

function parseExcelDateSerial(value: number) {
  if (
    !Number.isFinite(value) ||
    value < MIN_EXCEL_DATE_SERIAL ||
    Math.trunc(value) === 60
  ) {
    return value;
  }
  const wholeDays = Math.trunc(value);
  const fraction = value - wholeDays;
  const epoch = Date.UTC(1899, 11, 30);
  return new Date(epoch + wholeDays * 86_400_000 + fraction * 86_400_000);
}

/** Công ty chưa có dữ liệu trước mốc này; năm nhỏ hơn chắc chắn là gõ thiếu số. */
const MIN_MATERIAL_YEAR = 2020;

/**
 * Chặn ngày vô lý. Trước đây không có ràng buộc nào nên gõ nhầm năm là hệ
 * thống nhận luôn, và vì bảng vật tư không hiện cột này nên không ai soi ra
 * được. Đã gặp cả hai đầu trên dữ liệu thật: một dòng ghi năm 226, bốn dòng
 * ghi tháng 12 của năm sau — bốn dòng đó kéo 294 triệu sang sai tháng.
 *
 * Nới 1 ngày ở đầu trên để người nhập lúc quá nửa đêm giờ VN (đã sang ngày
 * mới nhưng UTC còn hôm qua) không bị chặn oan.
 */
function withinBusinessRange(value: Date | undefined) {
  if (!value) return true;
  if (value.getUTCFullYear() < MIN_MATERIAL_YEAR) return false;
  return value.getTime() <= Date.now() + 86_400_000;
}

const optionalMaterialDate = z.preprocess(
  (value) => {
    if (value instanceof Date) return value;
    if (typeof value === "number") return parseExcelDateSerial(value);
    if (typeof value !== "string") return value;
    const text = value.trim();
    return text ? parseDateText(text) : undefined;
  },
  z
    .date({ error: "Ngày vật tư không hợp lệ" })
    .optional()
    .refine(
      withinBusinessRange,
      `Ngày vật tư phải từ năm ${MIN_MATERIAL_YEAR} trở đi và không được ở tương lai`,
    ),
);

const materialFields = {
  name: requiredText("Tên vật tư", 200),
  unit: optionalText("Đơn vị tính", 30).transform((value) => value ?? ""),
  quantity,
  unitPrice,
  additionalCost,
  note: optionalText("Ghi chú", 1000),
};

export const materialInputSchema = z.object({
  projectId: id("dự án"),
  ...materialFields,
  materialDate: optionalMaterialDate.transform((value) => value ?? new Date()),
});

export const updateMaterialSchema = z.object({
  id: id("mã vật tư"),
  ...materialFields,
  materialDate: optionalMaterialDate,
});

/**
 * Người không có `finance.view` không nhìn thấy tiền nên input của họ không được
 * dùng để ghi tiền: thay bằng giá trị trung tính trước khi validate.
 * Tầng service vẫn bỏ qua hẳn các trường này khi `keepMoney = false`.
 */
export function materialInputForUser(input: unknown, keepMoney: boolean) {
  return !keepMoney && typeof input === "object" && input !== null
    ? { ...input, unitPrice: "0", additionalCost: "0" }
    : input;
}

export const idSchema = z.object({ id: id("mã vật tư") });

export const materialFilterSchema = z.object({
  q: z.string().trim().max(200).optional(),
  projectId: z.string().trim().optional(),
});

export const materialProjectFilterSchema = z.object({
  q: z.string().trim().max(200).optional().transform((value) => value || undefined),
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2000).max(9999).optional(),
  sort: z
    .enum([
      "latest-desc",
      "latest-asc",
      "total-desc",
      "total-asc",
      "count-desc",
      "count-asc",
      "name-asc",
      "name-desc",
    ])
    .catch("latest-desc"),
  page: z.coerce.number().int().min(1).catch(1),
});

export type MaterialInput = z.infer<typeof materialInputSchema>;
export type UpdateMaterialInput = z.infer<typeof updateMaterialSchema>;
export type MaterialFilter = z.infer<typeof materialFilterSchema>;
export type MaterialProjectFilter = z.infer<typeof materialProjectFilterSchema>;
