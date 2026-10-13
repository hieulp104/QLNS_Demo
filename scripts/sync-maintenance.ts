/**
 * Sinh lịch kiểm tra bảo hành định kỳ cho các dự án ĐÃ BÀN GIAO từ trước khi
 * có tính năng này (hoặc sau khi Giám đốc đổi danh sách mốc).
 *
 *   npm run maintenance:sync             # chạy thật
 *   npm run maintenance:sync -- --dry    # chỉ liệt kê, không ghi gì
 *   npm run maintenance:sync -- --grace 0   # sinh cả mốc đã quá hạn ở trạng thái Chờ xử lý
 *
 * Mốc quá hạn quá GRACE ngày (mặc định 60) được tạo thẳng ở trạng thái "Bỏ qua"
 * kèm lý do, để dự án bàn giao từ nhiều năm trước không dội một loạt việc quá
 * hạn lên Dashboard ngay ngày bật tính năng.
 *
 * Hàm idempotent: chạy lại nhiều lần không sinh trùng mốc.
 */

// Chạy ngoài Next nên phải tự nạp .env (giống prisma/seed.ts) — import này
// PHẢI đứng trước prisma.service, vì client đọc DATABASE_URL ngay lúc khởi tạo.
import "dotenv/config";
import { prisma } from "../src/shared/prisma/prisma.service";
import {
  getMilestoneMonths,
  syncScheduledChecks,
} from "../src/modules/maintenance/maintenance.service";

const DEFAULT_GRACE_DAYS = 60;

function parseGrace(argv: string[]): number {
  const i = argv.indexOf("--grace");
  if (i === -1) return DEFAULT_GRACE_DAYS;
  const value = Number(argv[i + 1]);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error("--grace phải là số nguyên >= 0");
  }
  return value;
}

async function main() {
  const argv = process.argv.slice(2);
  const dry = argv.includes("--dry");
  const grace = parseGrace(argv);

  const months = await getMilestoneMonths();
  console.log(
    `Mốc đang cấu hình: ${months.join(" · ")} tháng sau ngày bàn giao`,
  );
  console.log(
    `Mốc quá hạn hơn ${grace} ngày sẽ được ghi ở trạng thái "Bỏ qua".\n`,
  );

  // Dự án đã bàn giao và có ngày bàn giao — điều kiện để tính được mốc.
  const projects = await prisma.project.findMany({
    where: {
      deletedAt: null,
      actualEndDate: { not: null },
      OR: [
        { currentStage: { in: ["HANDOVER", "WARRANTY"] } },
        { status: "COMPLETED" },
      ],
    },
    select: { id: true, code: true, name: true, actualEndDate: true },
    orderBy: { code: "asc" },
  });

  if (projects.length === 0) {
    console.log("Không có dự án nào đã bàn giao kèm ngày bàn giao.");
    return;
  }

  let created = 0;
  let shifted = 0;
  let cancelled = 0;

  for (const p of projects) {
    if (dry) {
      const existing = await prisma.maintenanceTask.count({
        where: { projectId: p.id, milestoneMonths: { not: null } },
      });
      console.log(
        `${p.code} · ${p.name} — bàn giao ${p.actualEndDate?.toISOString().slice(0, 10)} · đã có ${existing}/${months.length} mốc`,
      );
      continue;
    }

    const r = await syncScheduledChecks(prisma, p.id, {
      cancelOverdueBeyondDays: grace,
    });
    created += r.created;
    shifted += r.shifted;
    cancelled += r.cancelled;

    if (r.created || r.shifted) {
      console.log(
        `${p.code} · ${p.name} — tạo ${r.created} (bỏ qua ${r.cancelled}) · dời hạn ${r.shifted}`,
      );
    }
  }

  console.log(
    dry
      ? `\n[--dry] ${projects.length} dự án đã bàn giao, chưa ghi gì.`
      : `\nXong: ${projects.length} dự án · tạo ${created} mốc (trong đó ${cancelled} đánh dấu Bỏ qua) · dời hạn ${shifted} mốc.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
