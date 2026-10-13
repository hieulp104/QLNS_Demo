/**
 * Nhắc việc hằng ngày qua thông báo trong hệ thống.
 *
 *   npm run notify:daily          # gửi thật
 *   npm run notify:daily -- --dry # chỉ liệt kê, không ghi gì
 *
 * Ba loại nhắc:
 *   1. Lịch bảo trì tới hạn (đã quá hạn hoặc còn ≤ 7 ngày)
 *   2. Dự án quá hạn hoàn thành dự kiến
 *   3. Hợp đồng đã ký chưa thu đủ — CHỈ gửi cho người có finance.manage
 *
 * Dùng notifyOnce nên chạy lại mỗi ngày KHÔNG gửi trùng: mỗi người chỉ nhận
 * lại lời nhắc về cùng một việc sau chu kỳ lặp bên dưới.
 *
 * NGUYÊN TẮC CHỌN NGƯỜI NHẬN: chỉ gửi cho NGƯỜI PHẢI LÀM — người được giao
 * việc, hoặc thành viên dự án. Nhóm quản lý (Giám đốc, trưởng phòng) KHÔNG
 * nhận, vì ba loại nhắc này đã hiện sẵn ở mục "Việc cần chú ý" trên trang Tổng
 * quan — gửi thêm chỉ làm chuông kêu mà không ai xử lý thêm được gì.
 * Ngoại lệ duy nhất: dự án không có thành viên nào thì mới rơi về nhóm quản lý,
 * để lời nhắc không rơi vào khoảng không.
 *
 * Không tự chạy. Khi deploy thì hẹn giờ mỗi sáng bằng Task Scheduler.
 */

// Chạy ngoài Next nên phải tự nạp .env — import này PHẢI đứng trước
// prisma.service, vì client đọc DATABASE_URL ngay lúc khởi tạo.
import "dotenv/config";
import { prisma } from "../src/shared/prisma/prisma.service";
import {
  notifyOnce,
  projectRecipients,
  usersWithPermission,
} from "../src/modules/notifications/notifications.service";
import { checksDueSoon } from "../src/modules/maintenance/maintenance.service";
import {
  overdueProjects,
  underpaidContracts,
} from "../src/modules/dashboard/dashboard.service";
import { formatDate } from "../src/lib/utils";

/** Nhắc lại cùng một việc sau bao nhiêu ngày. */
const REPEAT_DAYS = {
  maintenance: 7,
  overdue: 7,
  contract: 14,
};

/** Nhắc lịch bảo trì trước hạn bao nhiêu ngày. */
const MAINTENANCE_LEAD_DAYS = 7;

/**
 * Người phải làm. Không xác định được ai (dự án chưa gán thành viên) thì mới
 * rơi về nhóm quản lý — thà làm phiền còn hơn để việc quá hạn không ai biết.
 */
function responsibleOr(primary: string[], fallback: string[]): string[] {
  return primary.length > 0 ? primary : fallback;
}

async function main() {
  const dry = process.argv.includes("--dry");
  const now = new Date();
  let sent = 0;

  // ── 1. Lịch bảo trì tới hạn ────────────────────────────────
  const dueChecks = await checksDueSoon(now, MAINTENANCE_LEAD_DAYS);
  // Chỉ dùng làm phương án dự phòng khi dự án chưa có thành viên nào.
  const maintenanceManagers = await usersWithPermission(
    prisma,
    "maintenance.manage",
    { scope: "ALL" },
  );

  for (const t of dueChecks) {
    // Đã giao người thì chỉ nhắc đúng người đó; chưa giao thì nhắc thành viên
    // dự án để có người nhận việc.
    const recipients = t.assigneeName
      ? await assigneeIdOf(t.id)
      : responsibleOr(
          await projectRecipients(prisma, t.projectId),
          maintenanceManagers,
        );

    const late = t.daysLeft !== null && t.daysLeft < 0;
    const line = `${t.title} · ${
      late
        ? `quá hạn ${-t.daysLeft!} ngày`
        : `còn ${t.daysLeft} ngày`
    } (${formatDate(t.dueDate)})`;

    if (dry) {
      console.log(`[bảo trì] ${t.projectCode} → ${recipients.length} người · ${line}`);
      continue;
    }
    sent += await notifyOnce(
      prisma,
      {
        recipientIds: recipients,
        actorId: null,
        type: "MAINTENANCE_DUE",
        title: `Tới hạn kiểm tra bảo hành — ${t.projectCode}`,
        body: line,
        href: `/projects/${t.projectId}?tab=bao-hanh`,
        entity: "MaintenanceTask",
        entityId: t.id,
      },
      { withinDays: REPEAT_DAYS.maintenance },
    );
  }

  // ── 2. Dự án quá hạn ───────────────────────────────────────
  const overdue = await overdueProjects(now);
  // Chỉ dùng làm phương án dự phòng khi dự án chưa có thành viên nào.
  const projectManagers = await usersWithPermission(prisma, "project.update", {
    scope: "ALL",
  });

  for (const p of overdue) {
    const recipients = responsibleOr(
      await projectRecipients(prisma, p.id),
      projectManagers,
    );
    if (dry) {
      console.log(`[quá hạn] ${p.code} → ${recipients.length} người · trễ ${p.daysLate} ngày`);
      continue;
    }
    sent += await notifyOnce(
      prisma,
      {
        recipientIds: recipients,
        actorId: null,
        type: "PROJECT_OVERDUE",
        title: `Dự án quá hạn — ${p.code}`,
        body: `${p.name} · trễ ${p.daysLate} ngày so với hạn dự kiến ${formatDate(p.expectedEndDate)}`,
        href: `/projects/${p.id}`,
        entity: "Project",
        entityId: p.id,
      },
      { withinDays: REPEAT_DAYS.overdue },
    );
  }

  // ── 3. Hợp đồng chưa thu đủ — chỉ người ĐI THU TIỀN ──────
  // finance.manage chứ không phải finance.view: người chỉ được xem tài chính
  // (vd xem báo cáo) không phải người đi đòi nợ. finance.manage luôn là tập con
  // của finance.view nên nguyên tắc ẩn tiền vẫn được giữ.
  const financeUsers = await usersWithPermission(prisma, "finance.manage");
  const underpaid = financeUsers.length > 0 ? await underpaidContracts() : [];

  for (const c of underpaid) {
    if (dry) {
      console.log(`[hợp đồng] ${c.code} → ${financeUsers.length} người có finance.manage`);
      continue;
    }
    sent += await notifyOnce(
      prisma,
      {
        recipientIds: financeUsers,
        actorId: null,
        type: "CONTRACT_UNDERPAID",
        title: `Hợp đồng đã ký chưa thu đủ — ${c.code}`,
        // KHÔNG ghi số tiền vào thông báo: số liệu nằm ở trang có kiểm quyền.
        body: `${c.projectName} — mở tab Tài chính của dự án để xem chi tiết`,
        href: `/projects/${c.projectId}?tab=tai-chinh`,
        entity: "Contract",
        entityId: c.id,
      },
      { withinDays: REPEAT_DAYS.contract },
    );
  }

  console.log(
    dry
      ? `\n[--dry] ${dueChecks.length} lịch bảo trì · ${overdue.length} dự án quá hạn · ${underpaid.length} hợp đồng chưa thu đủ. Chưa gửi gì.`
      : `\nĐã gửi ${sent} thông báo (${dueChecks.length} lịch bảo trì · ${overdue.length} dự án quá hạn · ${underpaid.length} hợp đồng chưa thu đủ).`,
  );
}

/** Người đang được giao một việc bảo hành. */
async function assigneeIdOf(taskId: string): Promise<string[]> {
  const t = await prisma.maintenanceTask.findUnique({
    where: { id: taskId },
    select: { assigneeId: true },
  });
  return t?.assigneeId ? [t.assigneeId] : [];
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
