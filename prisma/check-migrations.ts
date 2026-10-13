/**
 * Chốt chặn: seed chỉ chạy khi DB đã ở đúng schema mới nhất.
 *
 * VÌ SAO CẦN
 * Kéo code mới về máy khác rồi chạy thẳng `npm run db:seed` là tình huống rất
 * hay gặp: code seed đã biết các cột mới, nhưng DB trên máy đó vẫn là schema cũ
 * nên Prisma ném P2022 kèm stack dài — nhìn như "pull về là lỗi", trong khi
 * thực ra chỉ thiếu một lệnh migrate.
 *
 * Hàm này so thư mục `prisma/migrations` với bảng `_prisma_migrations` trong DB
 * và dừng sớm với hướng dẫn cụ thể.
 */

import fs from "node:fs";
import path from "node:path";

/** Chỉ cần đúng phần chạy raw query — nhận cả PrismaClient lẫn client trong transaction. */
type RawClient = {
  $queryRawUnsafe: <T = unknown>(query: string) => Promise<T>;
};

/** Tên các migration có trong mã nguồn, theo thứ tự thời gian. */
function migrationsInRepo(): string[] {
  const dir = path.join(process.cwd(), "prisma", "migrations");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

/** Migration đã áp thành công trong DB. DB trắng / chưa có bảng → mảng rỗng. */
async function migrationsInDb(prisma: RawClient): Promise<string[]> {
  try {
    const rows = await prisma.$queryRawUnsafe<{ migration_name: string }[]>(
      `SELECT migration_name FROM "_prisma_migrations"
       WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
    );
    return rows.map((r) => r.migration_name);
  } catch {
    // Bảng _prisma_migrations chưa tồn tại = chưa migrate lần nào.
    return [];
  }
}

/**
 * Ném lỗi kèm hướng dẫn nếu DB còn thiếu migration.
 *
 * @param context "dev" dùng lệnh npm, "prod" dùng lệnh docker compose.
 */
export async function assertMigrated(
  prisma: RawClient,
  context: "dev" | "prod" = "dev",
): Promise<void> {
  const repo = migrationsInRepo();
  if (repo.length === 0) return;

  const applied = new Set(await migrationsInDb(prisma));
  const pending = repo.filter((m) => !applied.has(m));
  if (pending.length === 0) return;

  const command =
    context === "prod"
      ? "docker compose -f docker-compose.prod.yml run --rm migrate"
      : "npm run db:migrate";

  const fresh = applied.size === 0;

  throw new Error(
    [
      "",
      "═".repeat(64),
      fresh
        ? "  CƠ SỞ DỮ LIỆU CHƯA ĐƯỢC TẠO BẢNG"
        : `  CƠ SỞ DỮ LIỆU ĐANG Ở SCHEMA CŨ — thiếu ${pending.length} migration`,
      "═".repeat(64),
      "",
      fresh
        ? "  Chưa có migration nào được áp vào DB này."
        : `  Đã áp ${applied.size}/${repo.length} migration. Còn thiếu:`,
      ...(fresh ? [] : pending.map((m) => `    · ${m}`)),
      "",
      "  Seed sẽ ghi vào các cột mà DB chưa có, nên dừng ở đây cho an toàn.",
      "",
      `  Chạy trước:  ${command}`,
      `  Rồi seed lại: ${context === "prod" ? "... npm run seed:prod" : "npm run db:seed"}`,
      "",
      context === "dev"
        ? "  (Muốn làm sạch hẳn dữ liệu cũ trên máy này: npm run db:reset)"
        : "  (Production: TUYỆT ĐỐI không dùng db:reset — nó xóa sạch dữ liệu thật)",
      "═".repeat(64),
      "",
    ].join("\n"),
  );
}
