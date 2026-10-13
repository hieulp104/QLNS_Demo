-- Khách hỏi 07/10/2026: tháng 2 trả lương sớm trước Tết theo mức cũ, ba ngày
-- 26–28/2 làm lương cùng tháng 3 theo mức mới; thưởng Tết điền vào đâu.
--
--   · Kỳ lương có ngày chốt công: công sau ngày chốt chuyển sang kỳ tháng sau.
--   · Dòng lương: công chuyển từ kỳ trước · thưởng khác · trừ khác · chi thực tế.
--
-- Mọi cột đều có mặc định / cho phép NULL nên kỳ lương cũ giữ nguyên số đã chốt.

ALTER TABLE "payroll_periods" ADD COLUMN "cutoff_day" INTEGER;

ALTER TABLE "payroll_lines"
  ADD COLUMN "carried_days" DECIMAL(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN "bonus_other" DECIMAL(15,0) NOT NULL DEFAULT 0,
  ADD COLUMN "other_deduction" DECIMAL(15,0) NOT NULL DEFAULT 0,
  ADD COLUMN "actual_paid" DECIMAL(15,0);
