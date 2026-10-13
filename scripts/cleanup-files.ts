/**
 * Dọn thùng rác file — xóa HẲN khỏi MinIO những file đã nằm trong thùng rác
 * quá hạn giữ (mặc định 90 ngày, xem TRASH_RETENTION_DAYS).
 *
 *   npm run files:cleanup           # dọn thật
 *   npm run files:cleanup -- --dry  # chỉ liệt kê, không xóa gì
 *   npm run files:cleanup -- --days 30
 *
 * Thao tác KHÔNG hoàn tác được. Nên chạy định kỳ hàng tháng bằng Task Scheduler
 * của Windows, hoặc chạy tay sau khi đã sao lưu.
 */

// Chạy ngoài Next nên phải tự nạp .env (giống prisma/seed.ts) — import này
// PHẢI đứng trước prisma.service, vì client đọc DATABASE_URL ngay lúc khởi tạo.
import "dotenv/config";
import { prisma } from "../src/shared/prisma/prisma.service";
import {
  purgeTrashedFiles,
  TRASH_RETENTION_DAYS,
} from "../src/shared/minio/file.service";

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function parseDays(argv: string[]): number {
  const i = argv.indexOf("--days");
  if (i === -1) return TRASH_RETENTION_DAYS;
  const value = Number(argv[i + 1]);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("--days phải là số ngày không âm");
  }
  return value;
}

async function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry");
  const days = parseDays(argv);
  const cutoff = new Date(Date.now() - days * 86_400_000);

  console.log(`Dọn file đã xóa trước ${cutoff.toLocaleString("vi-VN")} (giữ ${days} ngày)`);

  const expired = await prisma.fileAsset.findMany({
    where: { deletedAt: { not: null, lt: cutoff } },
    orderBy: { deletedAt: "asc" },
    select: { fileName: true, sizeBytes: true, deletedAt: true },
  });

  if (expired.length === 0) {
    console.log("Không có file nào quá hạn. Không làm gì cả.");
    return;
  }

  const totalBytes = expired.reduce((sum, f) => sum + Number(f.sizeBytes), 0);
  console.log(`\nTìm thấy ${expired.length} file (${humanSize(totalBytes)}):`);
  for (const f of expired) {
    console.log(
      `  · ${f.fileName} — ${humanSize(Number(f.sizeBytes))} — xóa ngày ${f.deletedAt?.toLocaleDateString("vi-VN")}`,
    );
  }

  if (dryRun) {
    console.log("\n[--dry] Chỉ liệt kê, chưa xóa gì. Bỏ --dry để dọn thật.");
    return;
  }

  const result = await purgeTrashedFiles(days);
  console.log(
    `\nĐã dọn ${result.purged} file, giải phóng ${humanSize(result.freedBytes)}.`,
  );

  if (result.failed.length > 0) {
    console.error(`\n${result.failed.length} file KHÔNG xóa được (giữ lại để lần sau thử lại):`);
    for (const f of result.failed) console.error(`  · ${f.objectKey}: ${f.error}`);
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error("Dọn rác thất bại:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
