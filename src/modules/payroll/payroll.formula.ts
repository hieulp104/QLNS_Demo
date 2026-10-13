/**
 * Công thức tiền của một dòng lương — hàm thuần, KHÔNG import Prisma, để hộp
 * sửa dòng lương phía client tính thử thực nhận bằng ĐÚNG công thức server dùng.
 * `payroll.config.ts` re-export lại nên các chỗ import cũ không phải đổi.
 */

export type PayrollAmounts = {
  roundedSalary: number;
  advanceAmount: number;
  /** Trừ vào lương: lấy ván, vật tư… — lý do ở `deductionNote` của dòng. */
  materialDeduction: number;
  insuranceDeduction: number;
  bonusSales: number;
  bonusResponsibility: number;
  bonusAttendance: number;
  bonusPunctuality: number;
  /** Thưởng Tết, thưởng bù tháng trước… — lý do ghi ở ghi chú dòng lương. */
  bonusOther: number;
  /** Trừ sau thưởng: quỹ văn phòng… */
  otherDeduction: number;
};

/** Tổng thưởng — 4 khoản cố định, đúng cột "Tổng thưởng" của Excel. */
export function totalBonusOf(a: PayrollAmounts): number {
  return (
    a.bonusSales + a.bonusResponsibility + a.bonusAttendance + a.bonusPunctuality
  );
}

/** Tổng lương = lương làm tròn − ứng − trừ lương − BHXH. */
export function totalSalaryOf(a: PayrollAmounts): number {
  return (
    a.roundedSalary - a.advanceAmount - a.materialDeduction - a.insuranceDeduction
  );
}

/** Lương thực nhận = tổng lương + tổng thưởng + thưởng khác − trừ khác. */
export function netSalaryOf(a: PayrollAmounts): number {
  return totalSalaryOf(a) + totalBonusOf(a) + a.bonusOther - a.otherDeduction;
}

/** Số tiền chi ra thật: kế toán gõ thì lấy số đó, bỏ trống thì bằng thực nhận. */
export function actualPaidOf(actualPaid: number | null, netSalary: number): number {
  return actualPaid ?? netSalary;
}
