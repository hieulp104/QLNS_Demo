import ExcelJS from "exceljs";

import { can } from "@/common/permissions/permissions";
import { getCurrentUser } from "@/modules/auth/auth.service";
import {
  MATERIAL_IMPORT_HEADERS,
  MATERIAL_IMPORT_MIME,
  MATERIAL_IMPORT_SHEET,
} from "@/modules/materials/materials.excel";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response("Chưa đăng nhập", { status: 401 });
  if (!can(user, "material.view")) {
    return new Response("Không có quyền xem vật tư", { status: 403 });
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "NA";
  const sheet = workbook.addWorksheet(MATERIAL_IMPORT_SHEET);
  sheet.addRow([...MATERIAL_IMPORT_HEADERS]);
  sheet.addRows([
    [
      new Date(Date.UTC(2026, 2, 20)),
      "Gạch ốp tường 300x600",
      "m²",
      24,
      185000,
      500000,
      "Ốp tường khu bếp",
    ],
    [
      new Date(Date.UTC(2026, 2, 25)),
      "Sơn PU 2 thành phần",
      "kg",
      3,
      450000,
      100000,
      null,
    ],
    [
      new Date(Date.UTC(2026, 3, 26)),
      "Bản lề giảm chấn Hafele",
      "cái",
      12,
      150000,
      null,
      "Dùng cho tủ bếp trên",
    ],
    [null, "Phí vận chuyển", null, null, 800000, null, null],
  ]);
  sheet.columns = [
    { width: 16 },
    { width: 32 },
    { width: 18 },
    { width: 14 },
    { width: 20 },
    { width: 20 },
    { width: 36 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).height = 22;
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = "A1:G1";
  sheet.getColumn(1).numFmt = "dd/mm/yyyy";
  sheet.getColumn(4).numFmt = "0.00";
  sheet.getColumn(5).numFmt = '#,##0" ₫"';
  sheet.getColumn(6).numFmt = '#,##0" ₫"';

  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(buffer, {
    headers: {
      "Content-Type": MATERIAL_IMPORT_MIME,
      "Content-Disposition": 'attachment; filename="mau-nhap-vat-tu-du-an.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
