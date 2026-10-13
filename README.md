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

Kiểu deploy: **pull-and-build trên server** — `git pull` code mới rồi Docker Compose
build lại ảnh ngay trên VPS. Mỗi lần `up`, service `migrate` tự chạy migration + nạp
dữ liệu demo (`db:seed`, kèm avatar) rồi mới bật app.

Yêu cầu: VPS có Docker + Docker Compose plugin, cổng 80/443 mở, hai bản ghi DNS A
(app + storage) trỏ về IP VPS.

### Lần đầu

```bash
git clone https://github.com/hieulp104/QLNS_Demo.git /opt/demo/qlns-demo
cd /opt/demo/qlns-demo
cp .env.example .env
nano .env    # sửa theo mục "CHỈ PRODUCTION" ở cuối file — sinh MỚI mọi mật khẩu/khóa
docker compose -f docker-compose.prod.yml up -d --build
```

### Các lần sau

```bash
ssh root@<IP-VPS>
cd /opt/demo/qlns-demo
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

Seed idempotent: dữ liệu khách tạo thêm được giữ, chỉ bản ghi mẫu (tên, phòng ban…)
được đưa về đúng `prisma/seed.ts`. Xem log seed: `docker compose -f docker-compose.prod.yml logs migrate`.

Làm mới hoàn toàn dữ liệu demo sau khi khách bấm lung tung:

```bash
docker compose -f docker-compose.prod.yml run --rm migrate npx prisma migrate reset --force
docker compose -f docker-compose.prod.yml run --rm migrate
```
