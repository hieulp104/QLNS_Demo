-- Trước đây: mỗi Project có tối đa MỘT giao dịch MATERIAL_SYNC, ngày lấy bằng
-- MAX(material_date) của cả dự án. Một giao dịch chỉ đeo được một ngày, nên
-- toàn bộ chi phí vật tư của mọi tháng bị dồn vào tháng của dòng vật tư mới
-- nhất. Hậu quả đã đo được trên dữ liệu thật: 85.265.000đ chi phí vật tư năm
-- 2025 bị tính vào báo cáo năm 2026.
--
-- Từ nay: mỗi Project × mỗi THÁNG (giờ VN) có tối đa một giao dịch MATERIAL_SYNC.

DROP INDEX "transactions_active_material_sync_project_key";

-- Prisma schema không biểu diễn được partial unique index trên biểu thức.
-- `timezone(text, timestamp)` là IMMUTABLE nên dùng được trong index.
-- Phải đổi sang giờ VN trước khi cắt tháng: cột lưu UTC, bản ghi 0–7h sáng
-- giờ VN sẽ rơi sang tháng trước nếu cắt thẳng trên UTC.
CREATE UNIQUE INDEX "transactions_active_material_sync_project_month_key"
ON "transactions" (
  "project_id",
  (date_trunc('month', "txn_date" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh'))
)
WHERE "source" = 'MATERIAL_SYNC' AND "deleted_at" IS NULL;

-- Index cũ bảo đảm mỗi dự án chỉ có 1 dòng active, nên index mới không thể
-- đụng dữ liệu hiện hữu. Việc tách 1 dòng gộp thành nhiều dòng theo tháng do
-- `npm run finance:resync-materials` làm, chạy SAU migration này.
