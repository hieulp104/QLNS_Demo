-- Khách chốt: TP Kế toán tự thêm nhân viên (anh em thợ) để chấm công.
-- Bảng role_permissions là nguồn chân lý lúc chạy, nên cấp thẳng ở đây thay vì
-- chờ ai đó chạy lại seed. Không có role.manage nên kế toán chỉ gán được vai
-- trò nằm trọn trong quyền của mình (xem listAssignableRoles trong hr.service).
-- ON CONFLICT DO NOTHING: Giám đốc đã tự bật ở /permissions thì giữ nguyên.
INSERT INTO "role_permissions" ("role_id", "permission_id", "scope")
SELECT r."id", p."id", 'ALL'
FROM "roles" r, "permissions" p
WHERE r."code" = 'HEAD_ACCOUNT' AND p."code" = 'user.create'
ON CONFLICT DO NOTHING;
