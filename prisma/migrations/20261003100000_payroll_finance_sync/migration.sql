-- Bảng lương → Tài chính (giống vật tư: hệ thống tự sinh, chỉ đọc bên Tài chính).
--
--   · Mỗi phiếu ứng lương  → một dòng chi "Chi lương", đúng NGÀY ỨNG.
--   · Mỗi kỳ lương ĐÃ CHỐT → một dòng "Chi lương" (tổng thực nhận) + một dòng
--                            "BHXH" (tổng trừ BHXH), ngày cuối tháng.
--
-- Thực nhận đã trừ tạm ứng, nên tạm ứng + thực nhận + BHXH = toàn bộ chi phí
-- lương của tháng, không đếm trùng đồng nào.

ALTER TYPE "TxnSource" ADD VALUE 'PAYROLL_SYNC';
ALTER TYPE "TxnType" ADD VALUE 'SALARY_COST';
ALTER TYPE "TxnType" ADD VALUE 'INSURANCE_COST';

ALTER TABLE "transactions"
  ADD COLUMN "payroll_period_id" TEXT,
  ADD COLUMN "salary_advance_id" TEXT;

CREATE UNIQUE INDEX "transactions_salary_advance_id_key" ON "transactions"("salary_advance_id");
CREATE INDEX "transactions_payroll_period_id_idx" ON "transactions"("payroll_period_id");

ALTER TABLE "transactions" ADD CONSTRAINT "transactions_payroll_period_id_fkey"
  FOREIGN KEY ("payroll_period_id") REFERENCES "payroll_periods"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_salary_advance_id_fkey"
  FOREIGN KEY ("salary_advance_id") REFERENCES "salary_advances"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Mỗi kỳ × mỗi loại (Chi lương / BHXH) chỉ một dòng ĐANG HOẠT ĐỘNG. Dòng đã xóa
-- mềm (mở lại kỳ) không tính, để chốt lại kỳ dùng lại được đúng mã GD cũ.
-- Prisma schema không biểu diễn được partial unique index.
CREATE UNIQUE INDEX "transactions_active_payroll_period_type_key"
ON "transactions" ("payroll_period_id", "type")
WHERE "payroll_period_id" IS NOT NULL AND "deleted_at" IS NULL;
