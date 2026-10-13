-- ════════════════════════════════════════════════════════════════════════════
-- Lịch sử lương theo tháng (phản hồi kế toán 04/10/2026).
--
-- Lương cơ bản và mức đóng BHXH đổi theo thời gian thật: vào làm ăn 80% lương,
-- vài tháng sau mới được đóng bảo hiểm, rồi tăng lương. Trước đây mỗi người chỉ
-- có MỘT giá trị trên `users`, nên tính lại tháng cũ lấy nhầm lương hiện tại —
-- kế toán phát hiện lương tháng 1 bị tính theo mức tháng 10.
--
-- Thứ tự ở đây là bắt buộc: tạo bảng → BACKFILL → rồi mới đổi tên cột cũ.
-- Đảo thứ tự là backfill đọc phải cột không còn tồn tại.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE "salary_records" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "effective_from" DATE NOT NULL,
    "base_salary" DECIMAL(15,0),
    "insurance_base" DECIMAL(15,0),
    "is_fixed_salary" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "salary_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "salary_records_user_id_effective_from_key"
    ON "salary_records" ("user_id", "effective_from");
CREATE INDEX "salary_records_user_id_effective_from_idx"
    ON "salary_records" ("user_id", "effective_from");

ALTER TABLE "salary_records"
    ADD CONSTRAINT "salary_records_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Backfill: mỗi người đang có lương được một mốc đầu tiên ──
-- Mốc lấy THÁNG SỚM NHẤT người đó có chấm công, vì đó là tháng sớm nhất hệ thống
-- cần tính lương cho họ. Ai chưa có công thì lấy tháng hiện tại.
-- Người không khai gì (tài khoản kỹ thuật) thì không sinh mốc — đúng chủ ý, họ
-- sẽ nằm trong danh sách "chưa khai lương" nếu có ai đó chấm công cho họ.
INSERT INTO "salary_records" (
    "id", "user_id", "effective_from",
    "base_salary", "insurance_base", "is_fixed_salary",
    "note", "created_at", "updated_at"
)
SELECT
    'salrec-' || MD5(u."id"),
    u."id",
    COALESCE(
        (SELECT DATE_TRUNC('month', MIN(a."work_date"))::date
           FROM "attendance_days" a WHERE a."user_id" = u."id"),
        DATE_TRUNC('month', CURRENT_DATE)::date
    ),
    u."base_salary",
    u."insurance_base",
    u."is_fixed_salary",
    'Mốc khởi tạo từ dữ liệu lương cũ',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "users" u
WHERE u."user_type" = 'HUMAN'
  AND (
        u."base_salary" IS NOT NULL
     OR u."insurance_base" IS NOT NULL
     OR u."is_fixed_salary" = true
  );

-- ── Chụp lại mức đóng BHXH vào từng dòng lương đã có ──
-- Kỳ đã chốt giữ nguyên số tiền đã trừ; cột này chỉ bổ sung thông tin đối chiếu.
ALTER TABLE "payroll_lines" ADD COLUMN "insurance_base" DECIMAL(15,0);

UPDATE "payroll_lines" l
SET "insurance_base" = u."insurance_base"
FROM "users" u
WHERE u."id" = l."user_id" AND u."insurance_base" IS NOT NULL;

-- ── Cuối cùng mới đổi tên cột cũ ──
-- KHÔNG xóa: đây là dữ liệu lương thật, giữ lại để đối chiếu sau khi chuyển đổi.
-- Đổi tên để mọi chỗ code lỡ còn đọc sẽ vỡ ngay ở `tsc` thay vì âm thầm lấy số cũ.
-- Xóa hẳn ở đợt sau, khi kế toán đã chạy trọn một kỳ bằng mốc mới và xác nhận khớp.
ALTER TABLE "users" RENAME COLUMN "base_salary" TO "legacy_base_salary";
ALTER TABLE "users" RENAME COLUMN "insurance_base" TO "legacy_insurance_base";
ALTER TABLE "users" RENAME COLUMN "is_fixed_salary" TO "legacy_is_fixed_salary";
