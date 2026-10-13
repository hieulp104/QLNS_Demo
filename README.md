# NA — bản demo

Hệ thống quản lý nội bộ cho công ty thiết kế & thi công nội thất: CRM, dự án 9 giai đoạn,
hợp đồng, thu/chi, vật tư, báo cáo, nhân sự, chấm công, nghỉ phép, bảng lương, bảo hành.

> Đây là **bản demo** tách ra từ dự án chính (`QLNS`). Toàn bộ dữ liệu là dữ liệu mẫu
> do `prisma/seed.ts` sinh ra — tên người, khách hàng, số tiền đều là giả.
> **Không** nạp dữ liệu từ hệ thống đang vận hành vào đây.

## Tech stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4
PostgreSQL 15 + Prisma 7 · Auth.js v5 · MinIO · Docker Compose · Caddy

## Chạy trên máy dev

```bash
cp .env.example .env
npm install             # tự chạy prisma generate
npm run db:up           # Postgres :5434 · MinIO :9102/:9103 (lệch khỏi QLNS để chạy song song)
npm run db:migrate
npm run db:seed
npm run dev             # http://localhost:3000
```

## Tài khoản demo — mật khẩu tất cả: `Demo@2026`

| Email | Vai trò |
|---|---|
| `director@na.vn` | Giám đốc (toàn quyền) |
| `tp.kinhdoanh@na.vn` | TP Kinh doanh |
| `tp.ketoan@na.vn` | TP Kế toán |
| `tp.thietke@na.vn` | TP Thiết kế |
| `tp.thicong@na.vn` | TP Thi công |
| `nv.kinhdoanh1@na.vn` … `nv.thicong2@na.vn` | 7 nhân viên |

## Deploy lên VPS demo

Yêu cầu: VPS Ubuntu có Docker + Docker Compose plugin, cổng 80/443 mở, hai bản ghi DNS A
(app + storage) trỏ về IP VPS.

```bash
# 1. Đưa code lên VPS (git clone repo demo, hoặc scp thư mục này) vào ~/qlns-demo
cd ~/qlns-demo

# 2. Tạo .env — sinh MỚI mọi mật khẩu/khóa, không dùng lại của hệ thống thật
cp .env.example .env
nano .env    # sửa theo mục "CHỈ PRODUCTION" ở cuối file

# 3. Build + bật DB/MinIO + migration
docker compose -f docker-compose.prod.yml build app migrate
docker compose -f docker-compose.prod.yml up -d postgres minio
docker compose -f docker-compose.prod.yml run --rm migrate

# 4. Nạp DỮ LIỆU MẪU (db:seed, KHÔNG phải seed:prod)
docker compose -f docker-compose.prod.yml run --rm migrate npm run db:seed

# 5. Bật app + Caddy (tự xin HTTPS)
docker compose -f docker-compose.prod.yml up -d
```

Làm mới dữ liệu demo sau khi khách bấm lung tung:

```bash
docker compose -f docker-compose.prod.yml run --rm migrate npx prisma migrate reset --force
docker compose -f docker-compose.prod.yml run --rm migrate npm run db:seed
```
