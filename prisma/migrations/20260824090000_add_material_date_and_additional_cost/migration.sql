-- AlterTable: thêm ngày nghiệp vụ ở trạng thái nullable để backfill an toàn.
ALTER TABLE "materials"
ADD COLUMN "material_date" TIMESTAMP(3),
ADD COLUMN "additional_cost" DECIMAL(15,0) NOT NULL DEFAULT 0;

-- Dữ liệu cũ dùng timestamp tạo record làm ngày nghiệp vụ gần đúng nhất.
UPDATE "materials"
SET "material_date" = "created_at"
WHERE "material_date" IS NULL;

ALTER TABLE "materials"
ALTER COLUMN "material_date" SET NOT NULL,
ALTER COLUMN "material_date" SET DEFAULT CURRENT_TIMESTAMP;
