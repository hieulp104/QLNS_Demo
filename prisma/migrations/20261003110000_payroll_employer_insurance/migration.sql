-- Bảo hiểm phần CÔNG TY đóng. Khách chốt 03/10/2026: "bảo hiểm thưởng vào chi phí cả".
-- Cột này KHÔNG trừ vào lương người lao động — chỉ là chi phí của công ty.
-- Mặc định 0: kỳ lương cũ giữ nguyên số đã chốt, chỉ kỳ tính lại mới có giá trị.
ALTER TABLE "payroll_lines"
ADD COLUMN "employer_insurance" DECIMAL(15,0) NOT NULL DEFAULT 0;
