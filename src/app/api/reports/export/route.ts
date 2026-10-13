/**
 * RP-06 / RP-07 — xuất Excel báo cáo và danh sách.
 *
 * GET /api/reports/export?type=<loại>&year=<năm>
 *   type: monthly | yearly | projects-report | list-projects | list-customers | list-transactions
 *
 * Route Handler đúng quy ước CLAUDE.md (chỉ dùng cho xuất Excel / presigned URL /
 * health check). Quyền: `report.financial` — chỉ Director + Kế toán (RP-08),
 * kể cả các file danh sách vì đều dính số tiền.
 */

import ExcelJS from "exceljs";
import { getCurrentUser } from "@/modules/auth/auth.service";
import { can } from "@/common/permissions/permissions";
import {
  expenseBreakdown,
  listCustomersForExport,
  listProjectsForExport,
  listTransactionsForExport,
  monthlyReport,
  projectReport,
  yearlyReport,
} from "@/modules/reports/reports.service";
import {
  CUSTOMER_SOURCE_LABEL,
  PROJECT_STATUS_LABEL,
  PROJECT_TYPE_LABEL,
  STAGE_LABEL,
  TXN_DIRECTION_LABEL,
  TXN_STATUS_LABEL,
  TXN_TYPE_LABEL,
} from "@/common/enums";

/** Định dạng tiền VND trong ô Excel — có dấu phân cách nghìn, không phần lẻ. */
const VND_FORMAT = '#,##0" ₫"';

const MONTH_NAMES = Array.from({ length: 12 }, (_, i) => `Tháng ${i + 1}`);

type Sheet = ExcelJS.Worksheet;

function styleHeader(sheet: Sheet) {
  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.alignment = { vertical: "middle" };
  header.height = 20;
}

/** Cột tiền: canh phải + định dạng VND. */
function moneyColumns(sheet: Sheet, keys: string[]) {
  for (const key of keys) {
    const col = sheet.getColumn(key);
    col.numFmt = VND_FORMAT;
    col.alignment = { horizontal: "right" };
  }
}

async function buildMonthly(wb: ExcelJS.Workbook, year: number) {
  const report = await monthlyReport(year);
  const sheet = wb.addWorksheet(`Theo tháng ${year}`);

  sheet.columns = [
    { header: "Tháng", key: "month", width: 12 },
    { header: "Thu đã thực (COMPLETED)", key: "thuCompleted", width: 24 },
    { header: "Thu ghi nhận (PENDING)", key: "thuPending", width: 24 },
    { header: "Chi đã thực (COMPLETED)", key: "chiCompleted", width: 24 },
    { header: "Chi ghi nhận (PENDING)", key: "chiPending", width: 24 },
    { header: "Chênh lệch (thực)", key: "net", width: 20 },
  ];

  for (const m of report.months) {
    sheet.addRow({ ...m, month: MONTH_NAMES[m.month - 1] });
  }
  const totalRow = sheet.addRow({ month: "Cả năm", ...report.totals });
  totalRow.font = { bold: true };

  styleHeader(sheet);
  moneyColumns(sheet, ["thuCompleted", "thuPending", "chiCompleted", "chiPending", "net"]);

  await buildExpenseBreakdown(wb, year);
  return `bao-cao-thang-${year}`;
}

/** Sheet thứ hai của báo cáo tháng: chi thực theo loại × tháng (gồm Chi lương, BHXH). */
async function buildExpenseBreakdown(wb: ExcelJS.Workbook, year: number) {
  const breakdown = await expenseBreakdown(year);
  const sheet = wb.addWorksheet(`Cơ cấu chi phí ${year}`);
  const monthKeys = MONTH_NAMES.map((_, i) => `m${i + 1}`);

  sheet.columns = [
    { header: "Loại chi", key: "type", width: 40 },
    ...MONTH_NAMES.map((name, i) => ({ header: name, key: monthKeys[i], width: 16 })),
    { header: "Cả năm (thực)", key: "completed", width: 20 },
    { header: "Chi ghi nhận (PENDING)", key: "pending", width: 22 },
    { header: "Tỉ trọng chi thực (%)", key: "share", width: 20 },
  ];

  for (const r of breakdown.rows) {
    sheet.addRow({
      type: TXN_TYPE_LABEL[r.type],
      ...Object.fromEntries(r.months.map((v, i) => [monthKeys[i], v])),
      completed: r.completed,
      pending: r.pending,
      share: r.share,
    });
    // "Chi khác" tách tiếp theo danh mục. Dòng con in nghiêng, thụt lề — KHÔNG
    // cộng vào "Tổng chi" bên dưới vì đã nằm trong dòng Chi khác.
    if (r.type !== "OPERATING_COST") continue;
    for (const c of breakdown.categories) {
      const row = sheet.addRow({
        type: `    ${c.name}${c.isActive ? "" : " (đã ngưng)"}`,
        ...Object.fromEntries(c.months.map((v, i) => [monthKeys[i], v])),
        completed: c.completed,
        pending: c.pending,
        share: c.share,
      });
      row.font = { italic: true };
    }
  }
  const totalRow = sheet.addRow({
    type: "Tổng chi",
    ...Object.fromEntries(
      monthKeys.map((key, i) => [key, breakdown.rows.reduce((sum, r) => sum + r.months[i], 0)]),
    ),
    completed: breakdown.totalCompleted,
    pending: breakdown.totalPending,
  });
  totalRow.font = { bold: true };

  styleHeader(sheet);
  moneyColumns(sheet, [...monthKeys, "completed", "pending"]);
}

async function buildYearly(wb: ExcelJS.Workbook) {
  const rows = await yearlyReport();
  const sheet = wb.addWorksheet("Theo năm");

  sheet.columns = [
    { header: "Năm", key: "year", width: 10 },
    { header: "Thu đã thực (COMPLETED)", key: "thuCompleted", width: 24 },
    { header: "Thu ghi nhận (PENDING)", key: "thuPending", width: 24 },
    { header: "Chi đã thực (COMPLETED)", key: "chiCompleted", width: 24 },
    { header: "Chi ghi nhận (PENDING)", key: "chiPending", width: 24 },
    { header: "Chênh lệch (thực)", key: "net", width: 20 },
  ];
  for (const r of rows) sheet.addRow(r);

  styleHeader(sheet);
  moneyColumns(sheet, ["thuCompleted", "thuPending", "chiCompleted", "chiPending", "net"]);
  return "bao-cao-nam";
}

async function buildProjectsReport(wb: ExcelJS.Workbook) {
  const rows = await projectReport();
  const sheet = wb.addWorksheet("Theo dự án");

  sheet.columns = [
    { header: "Mã dự án", key: "code", width: 14 },
    { header: "Tên dự án", key: "name", width: 34 },
    { header: "Khách hàng", key: "customerName", width: 24 },
    { header: "Trạng thái", key: "status", width: 14 },
    { header: "Giá trị hợp đồng", key: "contractValue", width: 20 },
    { header: "Đã thực thu", key: "thuCompleted", width: 18 },
    { header: "Thu ghi nhận", key: "thuPending", width: 18 },
    { header: "Đã thực chi", key: "chiCompleted", width: 18 },
    { header: "Chênh lệch", key: "net", width: 18 },
    { header: "% đã thu / HĐ", key: "collectedPercent", width: 14 },
  ];
  for (const r of rows) {
    sheet.addRow({
      ...r,
      status: PROJECT_STATUS_LABEL[r.status as keyof typeof PROJECT_STATUS_LABEL] ?? r.status,
      collectedPercent: `${r.collectedPercent}%`,
    });
  }

  styleHeader(sheet);
  moneyColumns(sheet, ["contractValue", "thuCompleted", "thuPending", "chiCompleted", "net"]);
  return "bao-cao-du-an";
}

async function buildProjectList(wb: ExcelJS.Workbook) {
  const rows = await listProjectsForExport();
  const sheet = wb.addWorksheet("Dự án");

  sheet.columns = [
    { header: "Mã", key: "code", width: 14 },
    { header: "Tên dự án", key: "name", width: 34 },
    { header: "Khách hàng", key: "customer", width: 24 },
    { header: "Loại", key: "type", width: 18 },
    { header: "Loại hình", key: "propertyType", width: 14 },
    { header: "Giai đoạn", key: "stage", width: 34 },
    { header: "Trạng thái", key: "status", width: 14 },
    { header: "Giá trị dự kiến", key: "estimatedValue", width: 18 },
    { header: "Ngày tạo", key: "createdAt", width: 14 },
  ];
  for (const p of rows) {
    sheet.addRow({
      code: p.code,
      name: p.name,
      customer: p.customer.name,
      type: PROJECT_TYPE_LABEL[p.type],
      propertyType: p.propertyType ?? "",
      stage: STAGE_LABEL[p.currentStage],
      status: PROJECT_STATUS_LABEL[p.status],
      estimatedValue: Number(p.estimatedValue ?? 0),
      createdAt: p.createdAt,
    });
  }

  styleHeader(sheet);
  moneyColumns(sheet, ["estimatedValue"]);
  sheet.getColumn("createdAt").numFmt = "dd/mm/yyyy";
  return "danh-sach-du-an";
}

async function buildCustomerList(wb: ExcelJS.Workbook) {
  const rows = await listCustomersForExport();
  const sheet = wb.addWorksheet("Khách hàng");

  sheet.columns = [
    { header: "Mã", key: "code", width: 14 },
    { header: "Tên khách hàng", key: "name", width: 28 },
    { header: "Điện thoại", key: "phone", width: 14 },
    { header: "Email", key: "email", width: 24 },
    { header: "Địa chỉ", key: "address", width: 32 },
    { header: "Nguồn", key: "source", width: 14 },
    { header: "Số dự án", key: "projects", width: 10 },
    { header: "Ngày tạo", key: "createdAt", width: 14 },
  ];
  for (const c of rows) {
    sheet.addRow({
      code: c.code,
      name: c.name,
      phone: c.phone ?? "",
      email: c.email ?? "",
      address: c.address ?? "",
      source: CUSTOMER_SOURCE_LABEL[c.source],
      projects: c._count.projects,
      createdAt: c.createdAt,
    });
  }

  styleHeader(sheet);
  sheet.getColumn("createdAt").numFmt = "dd/mm/yyyy";
  return "danh-sach-khach-hang";
}

async function buildTransactionList(wb: ExcelJS.Workbook) {
  const rows = await listTransactionsForExport();
  const sheet = wb.addWorksheet("Giao dịch");

  sheet.columns = [
    { header: "Mã", key: "code", width: 14 },
    { header: "Ngày", key: "txnDate", width: 12 },
    { header: "Thu/Chi", key: "direction", width: 8 },
    { header: "Loại", key: "type", width: 22 },
    { header: "Trạng thái", key: "status", width: 14 },
    { header: "Số tiền", key: "amount", width: 18 },
    { header: "Dự án", key: "project", width: 30 },
    { header: "Hợp đồng", key: "contract", width: 14 },
    { header: "Hình thức", key: "paymentMethod", width: 14 },
    { header: "Người tạo", key: "createdBy", width: 20 },
    { header: "Ghi chú", key: "note", width: 30 },
  ];
  for (const t of rows) {
    sheet.addRow({
      code: t.code,
      txnDate: t.txnDate,
      direction: TXN_DIRECTION_LABEL[t.direction],
      type: t.expenseCategory
        ? `${TXN_TYPE_LABEL[t.type]} · ${t.expenseCategory.name}`
        : TXN_TYPE_LABEL[t.type],
      status: TXN_STATUS_LABEL[t.status],
      amount: Number(t.amount),
      project: t.project ? `${t.project.code} — ${t.project.name}` : "",
      contract: t.contract?.code ?? "",
      paymentMethod: t.paymentMethod ?? "",
      createdBy: t.createdBy?.fullName ?? "",
      note: t.note ?? "",
    });
  }

  styleHeader(sheet);
  moneyColumns(sheet, ["amount"]);
  sheet.getColumn("txnDate").numFmt = "dd/mm/yyyy";
  return "danh-sach-giao-dich";
}

export async function GET(request: Request) {
  // 1. Session + 2. Quyền — RP-08: chỉ Director + Kế toán.
  const user = await getCurrentUser();
  if (!user) return new Response("Chưa đăng nhập", { status: 401 });
  if (!can(user, "report.financial")) {
    return new Response("Không có quyền xuất báo cáo tài chính", { status: 403 });
  }

  const url = new URL(request.url);
  const type = url.searchParams.get("type") ?? "monthly";
  const year = Number(url.searchParams.get("year")) || new Date().getFullYear();

  const wb = new ExcelJS.Workbook();
  wb.creator = "NA";
  wb.created = new Date();

  let fileName: string;
  switch (type) {
    case "monthly":
      fileName = await buildMonthly(wb, year);
      break;
    case "yearly":
      fileName = await buildYearly(wb);
      break;
    case "projects-report":
      fileName = await buildProjectsReport(wb);
      break;
    case "list-projects":
      fileName = await buildProjectList(wb);
      break;
    case "list-customers":
      fileName = await buildCustomerList(wb);
      break;
    case "list-transactions":
      fileName = await buildTransactionList(wb);
      break;
    default:
      return new Response("Loại báo cáo không hợp lệ", { status: 400 });
  }

  const buffer = await wb.xlsx.writeBuffer();

  return new Response(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
