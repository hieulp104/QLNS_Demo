import ExcelJS from "exceljs";
import JSZip from "jszip";

import {
  materialInputForUser,
  materialInputSchema,
  type MaterialInput,
} from "./materials.schema";

export const MATERIAL_IMPORT_SHEET = "ProjectMaterials";
export const MATERIAL_IMPORT_HEADERS = [
  "ngay_thang",
  "ten_vat_tu",
  "don_vi_tinh",
  "so_luong",
  "don_gia",
  "chi_phi_them",
  "ghi_chu",
] as const;
/**
 * Cột bắt buộc để nhận ra dòng header. Người không có `finance.view` không nhập
 * được đơn giá nên file của họ không cần cột `don_gia`.
 */
function requiredHeaders(keepMoney: boolean) {
  return keepMoney ? (["ten_vat_tu", "don_gia"] as const) : (["ten_vat_tu"] as const);
}
export const MATERIAL_IMPORT_MAX_BYTES = 900 * 1024;
export const MATERIAL_IMPORT_MAX_LABEL = "900 KB";
export const MATERIAL_IMPORT_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

type ParseResult =
  | { ok: true; data: MaterialInput[] }
  | { ok: false; errors: string[] };

function textValue(value: ExcelJS.CellValue) {
  return typeof value === "string" ? value : "";
}

function numericValue(value: ExcelJS.CellValue) {
  return typeof value === "number" || typeof value === "string"
    ? String(value)
    : "__INVALID_TYPE__";
}

function dateValue(value: ExcelJS.CellValue) {
  if (value === null || value === undefined || value === "") return undefined;
  return value instanceof Date ||
    typeof value === "number" ||
    typeof value === "string"
    ? value
    : "__INVALID_TYPE__";
}

function isBlank(value: ExcelJS.CellValue) {
  return value === null ||
    value === undefined ||
    (typeof value === "string" && value.trim() === "");
}

function withPeriod(message: string) {
  return /[.!?]$/.test(message) ? message : `${message}.`;
}

const INPUT_FIELD_HEADER: Record<string, (typeof MATERIAL_IMPORT_HEADERS)[number]> = {
  materialDate: "ngay_thang",
  name: "ten_vat_tu",
  unit: "don_vi_tinh",
  quantity: "so_luong",
  unitPrice: "don_gia",
  additionalCost: "chi_phi_them",
  note: "ghi_chu",
};

type MaterialHeader = (typeof MATERIAL_IMPORT_HEADERS)[number];
type HeaderLocation = {
  sheet: ExcelJS.Worksheet;
  rowNumber: number;
  columns: Map<MaterialHeader, number>;
};

function findHeader(
  workbook: ExcelJS.Workbook,
  keepMoney: boolean,
): HeaderLocation | null {
  const validHeaders = new Set<string>(MATERIAL_IMPORT_HEADERS);
  const required = requiredHeaders(keepMoney);
  for (const sheet of workbook.worksheets) {
    for (let rowNumber = 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const row = sheet.getRow(rowNumber);
      const columns = new Map<MaterialHeader, number>();
      for (let column = 1; column <= row.cellCount; column += 1) {
        const value = row.getCell(column).value;
        if (typeof value !== "string") continue;
        const header = value.trim();
        if (validHeaders.has(header) && !columns.has(header as MaterialHeader)) {
          columns.set(header as MaterialHeader, column);
        }
      }
      if (required.every((header) => columns.has(header))) {
        return { sheet, rowNumber, columns };
      }
    }
  }
  return null;
}

export async function parseMaterialWorkbook(
  bytes: Buffer,
  projectId: string,
  keepMoney: boolean,
): Promise<ParseResult> {
  const workbook = await loadWorkbook(bytes);
  if (!workbook) {
    return {
      ok: false,
      errors: ["File Excel không đọc được hoặc không đúng định dạng yêu cầu."],
    };
  }

  if (!workbook.worksheets.some((worksheet) => worksheet.actualRowCount > 0)) {
    return {
      ok: false,
      errors: ["File Excel không có sheet chứa dữ liệu."],
    };
  }

  const header = findHeader(workbook, keepMoney);
  if (!header) {
    return {
      ok: false,
      errors: [
        keepMoney
          ? "Không tìm thấy dòng header có đủ cột `ten_vat_tu` và `don_gia`."
          : "Không tìm thấy dòng header có cột `ten_vat_tu`.",
      ],
    };
  }

  const { sheet, rowNumber: headerRowNumber, columns } = header;
  const valueOf = (row: ExcelJS.Row, name: MaterialHeader) => {
    const column = columns.get(name);
    return column ? row.getCell(column).value : undefined;
  };
  const data: MaterialInput[] = [];
  const errors: string[] = [];
  for (
    let rowNumber = headerRowNumber + 1;
    rowNumber <= sheet.rowCount;
    rowNumber += 1
  ) {
    const row = sheet.getRow(rowNumber);
    const values = Object.fromEntries(
      MATERIAL_IMPORT_HEADERS.map((name) => [name, valueOf(row, name)]),
    ) as Record<MaterialHeader, ExcelJS.CellValue>;
    if (MATERIAL_IMPORT_HEADERS.every((name) => isBlank(values[name]))) {
      continue;
    }

    const typeErrors: string[] = [];
    if (!isBlank(values.ten_vat_tu) && typeof values.ten_vat_tu !== "string") {
      typeErrors.push(`Dòng ${rowNumber}, cột \`ten_vat_tu\`: Tên vật tư không hợp lệ.`);
    }
    if (!isBlank(values.don_vi_tinh) && typeof values.don_vi_tinh !== "string") {
      typeErrors.push(`Dòng ${rowNumber}, cột \`don_vi_tinh\`: Đơn vị tính không hợp lệ.`);
    }
    if (
      !isBlank(values.ghi_chu) &&
      typeof values.ghi_chu !== "string"
    ) {
      typeErrors.push(`Dòng ${rowNumber}, cột \`ghi_chu\`: Ghi chú không hợp lệ.`);
    }
    if (typeErrors.length > 0) {
      errors.push(...typeErrors);
      continue;
    }

    const parsed = materialInputSchema.safeParse(
      materialInputForUser(
        {
          projectId,
          materialDate: dateValue(values.ngay_thang),
          name: textValue(values.ten_vat_tu),
          unit: textValue(values.don_vi_tinh),
          quantity: isBlank(values.so_luong)
            ? undefined
            : numericValue(values.so_luong),
          unitPrice: isBlank(values.don_gia)
            ? undefined
            : numericValue(values.don_gia),
          additionalCost: isBlank(values.chi_phi_them)
            ? undefined
            : numericValue(values.chi_phi_them),
          note: isBlank(values.ghi_chu)
            ? undefined
            : textValue(values.ghi_chu),
        },
        keepMoney,
      ),
    );
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const header = INPUT_FIELD_HEADER[String(issue.path[0] ?? "")];
        errors.push(
          header
            ? `Dòng ${rowNumber}, cột \`${header}\`: ${withPeriod(issue.message)}`
            : `Dòng ${rowNumber}: ${withPeriod(issue.message)}`,
        );
      }
      continue;
    }
    data.push(parsed.data);
  }

  if (errors.length > 0) return { ok: false, errors };
  if (data.length === 0) {
    return { ok: false, errors: ["File không có dòng dữ liệu vật tư."] };
  }
  return { ok: true, data };
}

async function loadWorkbook(bytes: Buffer) {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(bytes as never);
    return workbook;
  } catch {
    // Một số trình tạo OOXML hợp lệ dùng prefix `x:` cho các element SpreadsheetML.
    // Excel đọc được nhưng ExcelJS 4.4 không namespace-aware ở các xform này.
    const normalized = await normalizeSpreadsheetNamespaces(bytes);
    if (!normalized) return null;
    try {
      const compatibleWorkbook = new ExcelJS.Workbook();
      await compatibleWorkbook.xlsx.load(normalized as never);
      return compatibleWorkbook;
    } catch {
      return null;
    }
  }
}

async function normalizeSpreadsheetNamespaces(bytes: Buffer) {
  try {
    const archive = await JSZip.loadAsync(bytes);
    let changed = false;
    for (const [name, entry] of Object.entries(archive.files)) {
      if (entry.dir || !name.toLocaleLowerCase("en").endsWith(".xml")) continue;
      const xml = await entry.async("string");
      if (
        !xml.includes(
          'xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"',
        )
      ) {
        continue;
      }
      const compatibleXml = xml
        .replaceAll("<x:", "<")
        .replaceAll("</x:", "</")
        .replace(
          'xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"',
          'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"',
        );
      archive.file(name, compatibleXml);
      changed = true;
    }
    return changed
      ? archive.generateAsync({ type: "nodebuffer" })
      : null;
  } catch {
    return null;
  }
}
