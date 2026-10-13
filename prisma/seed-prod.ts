/**
 * Seed TỐI THIỂU cho PRODUCTION.
 *
 * Chỉ tạo: bộ quyền + vai trò (kèm quyền mặc định) + phòng ban + 1 tài khoản
 * Giám đốc. KHÔNG tạo dữ liệu mẫu (khách hàng / dự án / giao dịch) như
 * prisma/seed.ts — production bắt đầu với dữ liệu sạch.
 *
 * Chạy 1 lần sau khi deploy lần đầu:
 *   docker compose -f docker-compose.prod.yml run --rm app npm run seed:prod
 *
 * Tài khoản Giám đốc lấy từ .env: SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD.
 * Bật sẵn mustChangePassword → Giám đốc buộc đổi mật khẩu ở lần đăng nhập đầu.
 * Idempotent — chạy lại không nhân đôi.
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import type { DepartmentCode } from "../src/generated/prisma/enums";
import {
  DEFAULT_ROLE_GRANTS,
  PERMISSIONS,
  ROLE_CODES,
  ROLE_LABEL,
} from "../src/common/permissions/permissions";
import { assertMigrated } from "./check-migrations";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const DEPARTMENTS: { code: DepartmentCode; name: string }[] = [
  { code: "SALES", name: "Phòng Kinh doanh" },
  { code: "ACCOUNTING", name: "Phòng Kế toán" },
  { code: "DESIGN", name: "Phòng Thiết kế" },
  { code: "CONSTRUCTION", name: "Phòng Thi công" },
];

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error(
      "Thiếu SEED_ADMIN_EMAIL hoặc SEED_ADMIN_PASSWORD trong .env — không tạo được tài khoản Giám đốc.",
    );
  }

  await assertMigrated(prisma, "prod");

  console.log("🌱 Seed production (quyền + vai trò + phòng ban + Giám đốc)...\n");

  // ── 1. Quyền ────────────────────────────────────────────────
  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: p.code },
      update: { module: p.module, name: p.name },
      create: { code: p.code, module: p.module, name: p.name },
    });
  }
  console.log(`✔ ${PERMISSIONS.length} quyền`);

  // ── 2. Vai trò + quyền mặc định ─────────────────────────────
  const permissionByCode = new Map(
    (await prisma.permission.findMany()).map((p) => [p.code, p.id]),
  );
  for (const code of ROLE_CODES) {
    const role = await prisma.role.upsert({
      where: { code },
      update: { name: ROLE_LABEL[code] },
      create: { code, name: ROLE_LABEL[code], isSystem: true },
    });
    const grants = DEFAULT_ROLE_GRANTS[code];
    for (const [permCode, scope] of Object.entries(grants)) {
      const permissionId = permissionByCode.get(permCode);
      if (!permissionId || !scope) continue;
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId } },
        update: { scope },
        create: { roleId: role.id, permissionId, scope },
      });
    }
  }
  console.log(`✔ ${ROLE_CODES.length} vai trò + quyền mặc định`);

  // ── 3. Phòng ban ────────────────────────────────────────────
  for (const d of DEPARTMENTS) {
    await prisma.department.upsert({
      where: { code: d.code },
      update: { name: d.name },
      create: { code: d.code, name: d.name },
    });
  }
  console.log(`✔ ${DEPARTMENTS.length} phòng ban`);

  // ── 4. Tài khoản Giám đốc ───────────────────────────────────
  const directorRole = await prisma.role.findUniqueOrThrow({
    where: { code: "DIRECTOR" },
  });
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.upsert({
    where: { email },
    update: {}, // đã tồn tại thì không đụng mật khẩu / hồ sơ
    create: {
      employeeCode: "TN001",
      email,
      passwordHash,
      fullName: "Giám đốc",
      position: "Giám đốc",
      departmentId: null,
      joinedAt: new Date(),
      mustChangePassword: true,
    },
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: directorRole.id } },
    update: {},
    create: { userId: user.id, roleId: directorRole.id },
  });
  console.log(`✔ Tài khoản Giám đốc: ${email} (ép đổi mật khẩu lần đầu)`);
  console.log("\n✅ Seed production xong.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error("❌ Seed production lỗi:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
