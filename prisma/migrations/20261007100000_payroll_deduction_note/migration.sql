-- "Lấy ván + vật tư" thành khoản trừ lương chung, kèm lý do trừ.
ALTER TABLE "payroll_lines" ADD COLUMN "deduction_note" TEXT;
