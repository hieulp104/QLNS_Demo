@AGENTS.md

# CLAUDE.md — NA (bản demo)

Bản demo tách từ dự án chính `E:\APROJECT\QLNS`, đổi thương hiệu thành **NA**, chạy trên
VPS riêng để khách tiềm năng dùng thử. Hướng dẫn chạy + deploy: xem `README.md`.

## Quy tắc riêng của bản demo

- **Chỉ dữ liệu mẫu** từ `prisma/seed.ts`. Tuyệt đối không dump/nhập DB của hệ thống
  đang vận hành vào đây — trong đó có lương, doanh thu, tên nhân viên thật.
- Không có lịch sử git của dự án chính (copy bằng `git archive`) — tài liệu khách,
  script kiểm thử dựng từ bảng lương thật và file Excel của khách đã bị loại bỏ.
- Cổng dev lệch khỏi QLNS để chạy song song: Postgres `5434`, MinIO `9102`/`9103`.
- Tên class/biến nội bộ (`tamnest-*`, `canUseTamNestAi`, thư mục theme `tamnest/`) còn
  giữ nguyên — người dùng không thấy, đổi chỉ tăng rủi ro vỡ code.
- Muốn đưa tính năng mới từ QLNS sang: copy từng file/thư mục liên quan, rồi dò lại
  chuỗi "Tâm Nest" / `tamnest.vn` trong phần vừa copy.

## Convention (giữ như dự án chính)

- Mọi kiểm tra quyền qua `can()` trong `src/common/permissions/permissions.ts`.
- Server Action: session → quyền → Zod → ghi DB + AuditLog trong transaction; trả `ok()`/`fail()`.
- Tiền là `Decimal(15,0)`; ẩn tiền ở tầng server bằng `canSeeMoney(user)`.
- Next.js 16: `proxy.ts` thay `middleware.ts`. Prisma 7 bắt buộc `@prisma/adapter-pg`.
