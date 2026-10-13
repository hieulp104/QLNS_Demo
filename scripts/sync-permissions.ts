/**
 * Đồng bộ DANH MỤC QUYỀN sau khi nâng cấp phiên bản.
 *
 *   npm run permissions:sync           # ghi thật
 *   npm run permissions:sync -- --dry  # chỉ liệt kê, không ghi gì
 *
 * VÌ SAO CẦN SCRIPT NÀY
 * Quyền sống ở hai nơi: danh mục cố định trong code (PERMISSIONS) và bảng
 * `permissions` / `role_permissions` trong DB — nguồn chân lý lúc chạy.
 * `prisma migrate deploy` chỉ đổi CẤU TRÚC bảng, không thêm dòng dữ liệu nào.
 * Nên sau khi deploy một phiên bản có quyền mới, DB vẫn thiếu các quyền đó và
 * KHÔNG AI thấy được tính năng mới — kể cả Giám đốc.
 *
 * VÌ SAO KHÔNG DÙNG `npm run seed:prod`
 * Seed đặt lại scope của TẤT CẢ quyền mặc định (`update: { scope }`), nên nó
 * xóa sạch mọi tùy chỉnh Giám đốc đã làm trong màn `/permissions`. Đúng cho
 * lần cài đầu, sai cho lần nâng cấp.
 *
 * NGUYÊN TẮC CỦA SCRIPT NÀY
 *  · Thêm các mã quyền MỚI vào bảng `permissions`.
 *  · Chỉ gán quyền mặc định cho những mã VỪA XUẤT HIỆN lần đầu.
 *  · TUYỆT ĐỐI không đụng tới quyền đã có trong DB — Giám đốc đã bật/tắt/đổi
 *    scope thế nào thì giữ nguyên thế ấy.
 */

// Chạy ngoài Next nên phải tự nạp .env — import này PHẢI đứng trước
// prisma.service, vì client đọc DATABASE_URL ngay lúc khởi tạo.
import "dotenv/config";
import { prisma } from "../src/shared/prisma/prisma.service";
import {
  DEFAULT_ROLE_GRANTS,
  PERMISSIONS,
  ROLE_CODES,
  ROLE_LABEL,
  type PermissionCode,
} from "../src/common/permissions/permissions";

async function main() {
  const dry = process.argv.includes("--dry");

  // ── 1. Mã quyền nào đã có sẵn trong DB ──────────────────────
  const existing = await prisma.permission.findMany({ select: { code: true } });
  const known = new Set(existing.map((p) => p.code));

  const newOnes = PERMISSIONS.filter((p) => !known.has(p.code));
  const orphans = [...known].filter(
    (code) => !PERMISSIONS.some((p) => p.code === code),
  );

  console.log(`Danh mục trong code: ${PERMISSIONS.length} quyền`);
  console.log(`Đang có trong DB   : ${known.size} quyền`);
  console.log(
    newOnes.length === 0
      ? "→ Không có quyền mới nào cần thêm.\n"
      : `→ Cần thêm ${newOnes.length} quyền mới: ${newOnes.map((p) => p.code).join(", ")}\n`,
  );

  if (orphans.length > 0) {
    // Không tự xóa: có thể là quyền của phiên bản mới hơn, hoặc do người khác
    // thêm tay. Xóa nhầm là mất luôn cấu hình phân quyền.
    console.log(
      `⚠ ${orphans.length} quyền có trong DB nhưng không còn trong code (giữ nguyên, không xóa): ${orphans.join(", ")}\n`,
    );
  }

  if (newOnes.length === 0) {
    console.log("Không có gì để làm.");
    return;
  }

  // ── 2. Ai sẽ được cấp quyền mới ─────────────────────────────
  const plan: { role: string; grants: [string, string][] }[] = [];
  for (const roleCode of ROLE_CODES) {
    const grants = Object.entries(DEFAULT_ROLE_GRANTS[roleCode]).filter(
      ([code]) => newOnes.some((p) => p.code === code),
    ) as [PermissionCode, string][];
    if (grants.length > 0) plan.push({ role: roleCode, grants });
  }

  for (const p of plan) {
    console.log(
      `${ROLE_LABEL[p.role as keyof typeof ROLE_LABEL] ?? p.role}: ${p.grants
        .map(([code, scope]) => `${code} (${scope})`)
        .join(" · ")}`,
    );
  }

  if (dry) {
    console.log("\n[--dry] Chưa ghi gì vào cơ sở dữ liệu.");
    return;
  }

  // ── 3. Ghi ──────────────────────────────────────────────────
  await prisma.$transaction(async (tx) => {
    for (const p of newOnes) {
      await tx.permission.create({
        data: { code: p.code, module: p.module, name: p.name },
      });
    }

    const permissionByCode = new Map(
      (await tx.permission.findMany({ select: { id: true, code: true } })).map(
        (p) => [p.code, p.id],
      ),
    );

    let granted = 0;
    for (const item of plan) {
      const role = await tx.role.findUnique({
        where: { code: item.role },
        select: { id: true },
      });
      if (!role) continue;

      for (const [code, scope] of item.grants) {
        const permissionId = permissionByCode.get(code);
        if (!permissionId) continue;
        // createMany + skipDuplicates: nếu dòng đã tồn tại (chạy lại script)
        // thì bỏ qua, KHÔNG ghi đè scope người dùng đã chỉnh.
        const r = await tx.rolePermission.createMany({
          data: [{ roleId: role.id, permissionId, scope: scope as never }],
          skipDuplicates: true,
        });
        granted += r.count;
      }
    }

    await tx.auditLog.create({
      data: {
        actorId: null,
        action: "PERMISSION_SYNC",
        entity: "Permission",
        after: {
          added: newOnes.map((p) => p.code),
          grants: granted,
        },
      },
    });

    console.log(
      `\n✔ Đã thêm ${newOnes.length} quyền và ${granted} dòng phân quyền mặc định.`,
    );
  });

  console.log(
    "Quyền có hiệu lực với người đang đăng nhập trong vòng 5 phút (chu kỳ nạp lại session).",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
