-- Cho phép nhân viên không có email, đăng nhập bằng số điện thoại.
-- Khách phản ánh: nhiều anh em thợ lớn tuổi không dùng Gmail.

-- 1. Chuẩn hóa SĐT cũ về dạng chỉ chữ số, để tra cứu lúc đăng nhập khớp được.
UPDATE "users"
SET "phone" = NULLIF(regexp_replace("phone", '[[:space:].()-]', '', 'g'), '')
WHERE "phone" IS NOT NULL;

-- 2. SĐT giờ là tên đăng nhập → không được trùng. Nếu dữ liệu cũ đang trùng
--    thì dừng và báo tên người, để sửa tay — không tự xóa số của ai.
DO $$
DECLARE dup text;
BEGIN
  SELECT string_agg(phone || ' (' || names || ')', '; ') INTO dup
  FROM (
    SELECT "phone", string_agg("full_name", ', ') AS names
    FROM "users"
    WHERE "phone" IS NOT NULL AND "deleted_at" IS NULL
    GROUP BY "phone"
    HAVING count(*) > 1
  ) d;
  IF dup IS NOT NULL THEN
    RAISE EXCEPTION 'Số điện thoại bị trùng, sửa trong hồ sơ nhân sự rồi chạy lại migration: %', dup;
  END IF;
END $$;

-- 3. Email không còn bắt buộc (unique vẫn giữ — Postgres cho nhiều NULL).
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;

-- 4. Phải có ít nhất một cách đăng nhập.
ALTER TABLE "users"
ADD CONSTRAINT "users_email_or_phone_check"
CHECK ("email" IS NOT NULL OR "phone" IS NOT NULL);

-- 5. Chỉ chặn trùng giữa người còn làm: thợ đã nghỉ thì số của họ có thể được
--    người mới dùng lại. Prisma schema không biểu diễn được partial index.
CREATE UNIQUE INDEX "users_active_phone_key"
ON "users" ("phone")
WHERE "phone" IS NOT NULL AND "deleted_at" IS NULL;
