import {
  Boxes,
  Bot,
  CalendarCheck,
  CalendarDays,
  LifeBuoy,
  Receipt,
  ChartColumn,
  FileText,
  LayoutDashboard,
  ScrollText,
  ShieldCheck,
  Users,
  UsersRound,
  Wallet,
} from "lucide-react";
import type { PermissionCode } from "@/common/permissions/permissions";

export type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  /** Quyền tối thiểu để thấy mục này. Không có quyền → ẩn khỏi sidebar. */
  permission: PermissionCode;
};

/** 7 module chính trên sidebar — thứ tự theo Dev Brief mục 2. */
export const NAV_ITEMS: NavItem[] = [
  {
    href: "/dashboard",
    label: "Tổng quan",
    icon: LayoutDashboard,
    permission: "project.view",
  },
  {
    href: "/projects",
    label: "Dự án",
    icon: FileText,
    permission: "project.view",
  },
  {
    href: "/customers",
    label: "Khách hàng",
    icon: Users,
    permission: "customer.view",
  },
  {
    href: "/materials",
    label: "Vật tư",
    icon: Boxes,
    permission: "material.view",
  },
  {
    href: "/finance",
    label: "Tài chính",
    icon: Wallet,
    permission: "finance.view",
  },
  {
    href: "/reports",
    label: "Báo cáo",
    icon: ChartColumn,
    // RP-08: báo cáo tài chính chỉ Director + Kế toán. Báo cáo vận hành cho
    // mọi người nằm ở Dashboard (report.operational giữ cho mục đó).
    permission: "report.financial",
  },
  {
    href: "/chatbot",
    label: "NA AI",
    icon: Bot,
    permission: "ai.chat.use",
  },
  {
    href: "/maintenance",
    label: "Bảo hành",
    icon: LifeBuoy,
    permission: "maintenance.view",
  },
  {
    href: "/hr",
    label: "Nhân sự",
    icon: UsersRound,
    permission: "user.view",
  },
  {
    href: "/cham-cong",
    label: "Chấm công",
    icon: CalendarCheck,
    permission: "attendance.view",
  },
  {
    href: "/nghi-phep",
    label: "Nghỉ phép",
    icon: CalendarDays,
    // Ai cũng xin nghỉ được nên mục này mở cho mọi người; quyền duyệt kiểm riêng.
    permission: "project.view",
  },
  {
    href: "/bang-luong",
    label: "Bảng lương",
    icon: Receipt,
    permission: "payroll.view",
  },
  // ── Hệ thống (SY) — chỉ hiện với người có quyền tương ứng ──
  {
    href: "/audit-log",
    label: "Nhật ký",
    icon: ScrollText,
    permission: "audit.view",
  },
  {
    href: "/permissions",
    label: "Phân quyền",
    icon: ShieldCheck,
    permission: "role.manage",
  },
];
