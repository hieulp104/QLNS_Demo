-- CreateEnum: phân biệt giao dịch người dùng nhập với giao dịch hệ thống đồng bộ từ Material.
CREATE TYPE "TxnSource" AS ENUM ('MANUAL', 'MATERIAL_SYNC');

-- AlterTable: DEFAULT MANUAL vừa backfill an toàn toàn bộ dữ liệu hiện hữu,
-- vừa giữ nguyên semantic cho mọi giao dịch được tạo thủ công về sau.
ALTER TABLE "transactions"
ADD COLUMN "source" "TxnSource" NOT NULL DEFAULT 'MANUAL';

-- Prisma schema chưa biểu diễn được partial unique index này. PostgreSQL bảo đảm
-- mỗi Project có tối đa một giao dịch MATERIAL_SYNC chưa bị xóa mềm.
CREATE UNIQUE INDEX "transactions_active_material_sync_project_key"
ON "transactions" ("project_id")
WHERE "source" = 'MATERIAL_SYNC' AND "deleted_at" IS NULL;

-- Backfill aggregate cho các Project đã có Material. Giao dịch cũ vẫn là MANUAL;
-- các dòng dưới đây là giao dịch MATERIAL_SYNC mới, tách biệt hoàn toàn.
WITH material_totals AS (
  SELECT
    "project_id",
    ROUND(SUM("quantity" * COALESCE("unit_price", 0) + "additional_cost"), 0) AS "amount",
    MAX("material_date") AS "txn_date"
  FROM "materials"
  GROUP BY "project_id"
  HAVING ROUND(SUM("quantity" * COALESCE("unit_price", 0) + "additional_cost"), 0) > 0
), code_context AS (
  SELECT
    EXTRACT(YEAR FROM CURRENT_DATE)::int AS "year",
    COALESCE(MAX(
      CASE
        WHEN "code" ~ ('^GD-' || EXTRACT(YEAR FROM CURRENT_DATE)::int || '-[0-9]+$')
        THEN SUBSTRING("code" FROM '[0-9]+$')::int
      END
    ), 0) AS "last_number"
  FROM "transactions"
), numbered AS (
  SELECT
    material_totals.*,
    ROW_NUMBER() OVER (ORDER BY "project_id") AS "row_number"
  FROM material_totals
)
INSERT INTO "transactions" (
  "id",
  "code",
  "project_id",
  "contract_id",
  "direction",
  "type",
  "status",
  "source",
  "amount",
  "txn_date",
  "payment_method",
  "note",
  "created_by_id",
  "deleted_at",
  "created_at",
  "updated_at"
)
SELECT
  'material-sync-' || MD5(numbered."project_id"),
  'GD-' || code_context."year" || '-' || LPAD(
    (code_context."last_number" + numbered."row_number")::text,
    4,
    '0'
  ),
  numbered."project_id",
  NULL,
  'EXPENSE',
  'MATERIAL_COST',
  'COMPLETED',
  'MATERIAL_SYNC',
  numbered."amount",
  numbered."txn_date",
  NULL,
  'Tự động đồng bộ tổng chi phí vật tư dự án',
  NULL,
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM numbered
CROSS JOIN code_context;
