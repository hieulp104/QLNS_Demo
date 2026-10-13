import { Badge, Card, DescriptionRow } from "@/components/ui";
import { formatVnd } from "@/lib/utils";
import type { PayrollLineView } from "@/modules/payroll/payroll.service";

/**
 * Phiếu lương cá nhân — thứ nhân viên (quyền `payroll.view` phạm vi SELF) nhìn thấy.
 * Chỉ nhận đúng dòng của chính mình; service đã lọc từ trước.
 */
export function Payslip({
  year,
  month,
  line,
  locked,
}: {
  year: number;
  month: number;
  line: PayrollLineView | null;
  locked: boolean;
}) {
  if (!line) {
    return (
      <Card variant="filled" className="p-6 text-sm text-muted">
        Kế toán chưa lập bảng lương tháng {month}/{year}.
      </Card>
    );
  }

  return (
    <Card className="max-w-2xl p-6">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h2 className="text-h3 font-semibold text-foreground">{line.fullName}</h2>
        {line.position && <Badge variant="info">{line.position}</Badge>}
        <Badge variant={locked ? "success" : "warning"}>
          {locked ? "Đã chốt" : "Đang làm — số liệu còn thay đổi"}
        </Badge>
      </div>

      <dl>
        <DescriptionRow label="Công hành chính" value={line.workDays} />
        <DescriptionRow label="Công chủ nhật (đã nhân hệ số)" value={line.sundayDays} />
        <DescriptionRow label="Công tăng ca" value={line.overtimeDays} />
        {line.carriedDays > 0 && (
          <DescriptionRow
            label="Công cuối tháng trước chuyển sang"
            value={line.carriedDays}
          />
        )}
        <DescriptionRow label="Tổng công thực tế" value={line.totalDays} />
        <DescriptionRow label="Lương thực tế" value={formatVnd(line.grossSalary)} />
        <DescriptionRow label="Lương làm tròn" value={formatVnd(line.roundedSalary)} />
        <DescriptionRow label="Đã ứng trong tháng" value={formatVnd(line.advanceAmount)} />
        <DescriptionRow
          label="Trừ lương"
          value={
            line.deductionNote && line.materialDeduction > 0 ? (
              <>
                {formatVnd(line.materialDeduction)}
                <span className="block text-xs text-muted">{line.deductionNote}</span>
              </>
            ) : (
              formatVnd(line.materialDeduction)
            )
          }
        />
        <DescriptionRow label="Trừ BHXH" value={formatVnd(line.insuranceDeduction)} />
        <DescriptionRow label="Tổng lương" value={formatVnd(line.totalSalary)} />
        <DescriptionRow label="Tổng thưởng" value={formatVnd(line.totalBonus)} />
        {line.bonusOther > 0 && (
          <DescriptionRow label="Thưởng khác" value={formatVnd(line.bonusOther)} />
        )}
        {line.otherDeduction > 0 && (
          <DescriptionRow label="Trừ khác" value={formatVnd(line.otherDeduction)} />
        )}
        <DescriptionRow
          label="Lương thực nhận"
          value={
            line.paid !== line.netSalary ? (
              formatVnd(line.netSalary)
            ) : (
              <span className="text-h3 font-bold text-money-income">
                {formatVnd(line.netSalary)}
              </span>
            )
          }
        />
        {line.paid !== line.netSalary && (
          <DescriptionRow
            label="Chi thực tế"
            value={
              <span className="text-h3 font-bold text-money-income">
                {formatVnd(line.paid)}
              </span>
            }
          />
        )}
        {line.note && <DescriptionRow label="Ghi chú" value={line.note} />}
      </dl>

      <p className="mt-4 text-xs text-muted">
        Có sai sót xin báo Kế toán. Bảng lương chưa chốt thì số liệu còn được cập
        nhật theo bảng chấm công.
      </p>
    </Card>
  );
}
