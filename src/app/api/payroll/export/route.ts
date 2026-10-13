/**
 * Xuất Excel bảng lương + bảng chấm công của một tháng.
 *
 * GET /api/payroll/export?year=<năm>&month=<tháng>
 *
 * Route Handler đúng quy ước CLAUDE.md (chỉ dùng cho xuất Excel / presigned URL
 * / health check). File gồm 3 sheet, bám đúng bố cục các file Excel công ty
 * đang dùng để kế toán in ra ký là được: Bảng lương · Chấm công · Ứng lương.
 *
 * ⚠ Quyền: `payroll.view` phạm vi ALL. Người chỉ có phạm vi SELF (nhân viên)
 * KHÔNG tải được file này — cả file là bảng lương toàn công ty, không có cách
 * nào cắt phần của riêng họ ra cho an toàn.
 */

import ExcelJS from "exceljs";
import { getCurrentUser } from "@/modules/auth/auth.service";
import { can } from "@/common/permissions/permissions";
import {
  ATTENDANCE_MARK_SYMBOL,
  ADVANCE_METHOD_LABEL,
} from "@/common/enums";
import { monthSheet } from "@/modules/attendance/attendance.service";
import {
  findPeriod,
  listAdvances,
  periodLines,
  sumLines,
  workRangeOf,
} from "@/modules/payroll/payroll.service";
import { roundDays as days } from "@/lib/utils";

const VND_FORMAT = '#,##0" ₫"';

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Chưa đăng nhập", { status: 401 });
  // Phạm vi SELF không đủ: file này là dữ liệu lương của cả công ty.
  if (!can(user, "payroll.view")) {
    return new Response("Không có quyền xuất bảng lương", { status: 403 });
  }

  const url = new URL(request.url);
  const year = Number(url.searchParams.get("year"));
  const month = Number(url.searchParams.get("month"));
  if (
    !Number.isInteger(year) ||
    year < 2020 ||
    year > 2100 ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    return new Response("Tháng không hợp lệ", { status: 400 });
  }

  const period = await findPeriod(year, month);
  const [lines, sheet, advances, range] = await Promise.all([
    period ? periodLines(user, period.id) : Promise.resolve([]),
    monthSheet(user, year, month),
    listAdvances(year, month),
    workRangeOf(year, month),
  ]);

  // Cột phụ chỉ xuất khi tháng đó có dùng — giống bảng trên web.
  const totals = sumLines(lines);
  const showCarried = Boolean(range.carryFrom) || totals.carriedDays > 0;
  const showOther = totals.bonusOther > 0 || totals.otherDeduction > 0;
  const showPaid = lines.some((l) => l.actualPaid !== null);
  const showDeductionNote = lines.some((l) => l.materialDeduction > 0 && l.deductionNote);
  const dm = (d: Date) =>
    `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
  const carriedHeader = range.carryFrom
    ? `Công + T.CA từ ${dm(range.carryFrom)}–${dm(new Date(Date.UTC(year, month - 1, 0)))}`
    : "Công tháng trước";

  const wb = new ExcelJS.Workbook();
  wb.creator = "NA";
  wb.created = new Date();

  // ── Sheet 1: Bảng lương ──────────────────────────────────
  const salary = wb.addWorksheet(`Lương T${month}`);
  salary.columns = [
    { header: "TT", key: "tt", width: 5 },
    { header: "Tên nhân viên", key: "name", width: 22 },
    { header: "Chức vụ", key: "position", width: 16 },
    { header: "Lương cơ bản", key: "base", width: 15 },
    { header: "Công HC", key: "workDays", width: 9 },
    { header: "Tăng ca + CN", key: "bonusDays", width: 12 },
    ...(showCarried ? [{ header: carriedHeader, key: "carried", width: 16 }] : []),
    { header: "Tổng công", key: "totalDays", width: 10 },
    { header: "Lương thực tế", key: "gross", width: 15 },
    { header: "Lương làm tròn", key: "rounded", width: 15 },
    { header: "Ứng lương", key: "advance", width: 13 },
    { header: "Trừ lương", key: "material", width: 15 },
    ...(showDeductionNote ? [{ header: "Lý do trừ", key: "deductionNote", width: 22 }] : []),
    { header: "BHXH", key: "insurance", width: 12 },
    { header: "Tổng lương", key: "total", width: 15 },
    { header: "Thưởng doanh số", key: "bSales", width: 14 },
    { header: "Thưởng trách nhiệm", key: "bResp", width: 15 },
    { header: "Thưởng chuyên cần", key: "bAtt", width: 15 },
    { header: "Thưởng đúng giờ", key: "bPunc", width: 14 },
    { header: "Tổng thưởng", key: "bonus", width: 13 },
    ...(showOther
      ? [
          { header: "Thưởng khác", key: "bOther", width: 14 },
          { header: "Trừ khác", key: "dOther", width: 13 },
        ]
      : []),
    { header: "Lương thực nhận", key: "net", width: 16 },
    ...(showPaid ? [{ header: "Chi thực tế", key: "paid", width: 16 }] : []),
    { header: "Ghi chú", key: "note", width: 22 },
    { header: "Ký tên", key: "sign", width: 14 },
  ];

  lines.forEach((l, i) => {
    salary.addRow({
      tt: i + 1,
      name: l.fullName,
      position: l.position ?? l.departmentName ?? "",
      base: l.baseSalary || null,
      workDays: days(l.workDays) || null,
      bonusDays: days(l.sundayDays + l.overtimeDays) || null,
      carried: days(l.carriedDays) || null,
      totalDays: days(l.totalDays) || null,
      gross: l.grossSalary || null,
      rounded: l.roundedSalary || null,
      advance: l.advanceAmount || null,
      material: l.materialDeduction || null,
      deductionNote: l.materialDeduction > 0 ? (l.deductionNote ?? "") : "",
      insurance: l.insuranceDeduction || null,
      total: l.totalSalary || null,
      bSales: l.bonusSales || null,
      bResp: l.bonusResponsibility || null,
      bAtt: l.bonusAttendance || null,
      bPunc: l.bonusPunctuality || null,
      bonus: l.totalBonus || null,
      bOther: l.bonusOther || null,
      dOther: l.otherDeduction || null,
      net: l.netSalary || null,
      paid: l.paid || null,
      note: l.note ?? "",
      sign: "",
    });
  });

  const totalRow = salary.addRow({
    name: "CỘNG",
    base: totals.baseSalary,
    workDays: days(totals.workDays),
    bonusDays: days(totals.bonusDays),
    carried: days(totals.carriedDays),
    totalDays: days(totals.totalDays),
    gross: totals.grossSalary,
    rounded: totals.roundedSalary,
    advance: totals.advanceAmount,
    material: totals.materialDeduction,
    insurance: totals.insuranceDeduction,
    total: totals.totalSalary,
    bonus: totals.totalBonus,
    bOther: totals.bonusOther,
    dOther: totals.otherDeduction,
    net: totals.netSalary,
    paid: totals.paid,
  });
  totalRow.font = { bold: true };

  const optionalMoneyKeys = [
    ...(showOther ? ["bOther", "dOther"] : []),
    ...(showPaid ? ["paid"] : []),
  ];
  for (const key of [
    ...optionalMoneyKeys,
    "base",
    "gross",
    "rounded",
    "advance",
    "material",
    "insurance",
    "total",
    "bSales",
    "bResp",
    "bAtt",
    "bPunc",
    "bonus",
    "net",
  ]) {
    const col = salary.getColumn(key);
    col.numFmt = VND_FORMAT;
    col.alignment = { horizontal: "right" };
  }
  salary.getRow(1).font = { bold: true };

  // ── Sheet 2: Bảng chấm công ──────────────────────────────
  const att = wb.addWorksheet(`Chấm công T${month}`);
  att.columns = [
    { header: "TT", key: "tt", width: 5 },
    { header: "Nhân viên", key: "name", width: 22 },
    { header: "Chức vụ", key: "position", width: 16 },
    ...sheet.days.map((d) => ({
      header: String(d.day),
      key: `d${d.day}`,
      width: 4,
    })),
    { header: "T.CA", key: "ot", width: 7 },
    { header: "Chủ nhật", key: "sun", width: 9 },
    { header: "Công", key: "work", width: 8 },
    { header: "Tổng công", key: "total", width: 10 },
  ];

  sheet.rows.forEach((row, i) => {
    const record: Record<string, string | number | null> = {
      tt: i + 1,
      name: row.fullName,
      position: row.position ?? row.departmentName ?? "",
      ot: days(row.summary.overtimeDays) || null,
      sun: days(row.summary.sundayDays) || null,
      work: days(row.summary.workDays) || null,
      total: days(row.summary.totalDays) || null,
    };
    for (const d of sheet.days) {
      const cell = row.cells[d.day];
      record[`d${d.day}`] = cell ? ATTENDANCE_MARK_SYMBOL[cell.mark] : "";
    }
    att.addRow(record);
  });
  att.getRow(1).font = { bold: true };
  att.views = [{ state: "frozen", xSplit: 3, ySplit: 1 }];

  // ── Sheet 3: Ứng lương ───────────────────────────────────
  const adv = wb.addWorksheet(`Ứng lương T${month}`);
  adv.columns = [
    { header: "TT", key: "tt", width: 5 },
    { header: "Ngày tháng", key: "date", width: 14 },
    { header: "Nhân viên", key: "name", width: 22 },
    { header: "Số tiền", key: "amount", width: 15 },
    { header: "Hình thức", key: "method", width: 15 },
    { header: "Ghi chú", key: "note", width: 24 },
  ];
  advances.forEach((a, i) => {
    adv.addRow({
      tt: i + 1,
      date: a.advanceDate,
      name: a.user.fullName,
      amount: Number(a.amount),
      method: ADVANCE_METHOD_LABEL[a.method],
      note: a.note ?? "",
    });
  });
  const advTotal = adv.addRow({
    name: "CỘNG",
    amount: advances.reduce((s, a) => s + Number(a.amount), 0),
  });
  advTotal.font = { bold: true };
  adv.getColumn("amount").numFmt = VND_FORMAT;
  adv.getColumn("date").numFmt = "dd/mm/yyyy";
  adv.getRow(1).font = { bold: true };

  const buffer = await wb.xlsx.writeBuffer();
  const fileName = `Bang-luong-T${String(month).padStart(2, "0")}-${year}`;

  return new Response(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
