-- "Chi khác" có danh mục tự đặt tên (khách yêu cầu 09/10/2026, dựng theo sổ quỹ
-- "Thu chi 2026"): thuê xưởng, điện xưởng, quỹ VP, xe ô tô, thưởng doanh số…
-- là chi phí chung ngoài vật tư và lương. Trước đây chỉ có loại "Khác" chung
-- chung nên mọi khoản này dồn vào một dòng, không biết điện xưởng hết bao nhiêu.

ALTER TYPE "TxnType" ADD VALUE 'OPERATING_COST';

CREATE TABLE "expense_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_recurring" BOOLEAN NOT NULL DEFAULT false,
    "default_amount" DECIMAL(15,0),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "expense_categories_name_key" ON "expense_categories"("name");

ALTER TABLE "transactions" ADD COLUMN "expense_category_id" TEXT;

CREATE INDEX "transactions_expense_category_id_txn_date_idx"
  ON "transactions"("expense_category_id", "txn_date");

ALTER TABLE "transactions" ADD CONSTRAINT "transactions_expense_category_id_fkey"
  FOREIGN KEY ("expense_category_id") REFERENCES "expense_categories"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Chi khác PHẢI có danh mục, loại khác KHÔNG được có — thiếu ràng buộc này thì
-- một dòng "Chi khác" mất danh mục sẽ rơi khỏi mọi dòng của Cơ cấu chi phí.
-- So qua ::text vì PostgreSQL không cho dùng giá trị enum vừa thêm trong cùng
-- transaction với lệnh ADD VALUE. Prisma không biểu diễn được CHECK.
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_operating_cost_category_check"
  CHECK (("type"::text = 'OPERATING_COST') = ("expense_category_id" IS NOT NULL));

-- Danh mục khởi đầu lấy từ chính sổ quỹ tháng 1–2/2026. Kế toán đổi tên, thêm,
-- ngưng dùng tự do ở màn Tài chính → "Danh mục chi khác".
INSERT INTO "expense_categories" ("id", "name", "is_recurring", "default_amount", "sort_order", "updated_at") VALUES
  ('ec_' || md5('thue-xuong'),        'Thuê xưởng',                        true,  4000000, 10, CURRENT_TIMESTAMP),
  ('ec_' || md5('dien-xuong'),        'Điện xưởng',                        true,  NULL,    20, CURRENT_TIMESTAMP),
  ('ec_' || md5('quy-van-phong'),     'Quỹ văn phòng hàng tháng',          true,  1000000, 30, CURRENT_TIMESTAMP),
  ('ec_' || md5('thue-van-phong'),    'Thuê văn phòng',                    false, NULL,    40, CURRENT_TIMESTAMP),
  ('ec_' || md5('xe-o-to'),           'Xe ô tô (dầu, bảo dưỡng, sửa chữa)', false, NULL,    50, CURRENT_TIMESTAMP),
  ('ec_' || md5('thuong-doanh-so'),   'Thưởng doanh số',                   false, NULL,    60, CURRENT_TIMESTAMP),
  ('ec_' || md5('thuong-le-phuc-loi'),'Thưởng lễ, Tết, phúc lợi',          false, NULL,    70, CURRENT_TIMESTAMP),
  ('ec_' || md5('van-phong-khac'),    'Chi phí văn phòng (hoa, mực in, VPP)', false, NULL, 80, CURRENT_TIMESTAMP),
  ('ec_' || md5('giao-te'),           'Giao tế, quà tặng',                 false, NULL,    90, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;
