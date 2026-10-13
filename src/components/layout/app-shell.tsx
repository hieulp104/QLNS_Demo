"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { NAV_ITEMS } from "@/config/navigation";
import { UserMenu } from "./user-menu";
import { ControlButton } from "./control-button";
import { BrandLogo, ThemeSwitcher } from "@/components/theme";
import { cn } from "@/lib/utils";
import type { PermissionCode } from "@/common/permissions/permissions";

const SIDEBAR_STORAGE_KEY = "tamnest-sidebar-collapsed";

/*
 * Trạng thái thu gọn sidebar sống trong localStorage, đọc qua
 * useSyncExternalStore: server render coi như "mở rộng", client tự đồng bộ
 * lại sau hydrate mà không lệch markup. Sự kiện "storage" không tự bắn trong
 * cùng tab nên toggle phải dispatch tay.
 */
function subscribeSidebar(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

function readSidebarCollapsed() {
  return localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true";
}

type Props = {
  /** Các quyền user đang có — server đã lọc sẵn, client chỉ dùng để hiện/ẩn menu. */
  allowedPermissions: string[];
  fullName: string;
  email: string;
  roleLabel: string;
  /** Presigned URL ảnh đại diện (HR-08) — null thì hiện chữ cái viết tắt. */
  avatarSrc?: string | null;
  /** Chuông thông báo — server component do layout dựng sẵn rồi truyền xuống. */
  notificationSlot?: React.ReactNode;
  children: React.ReactNode;
};

/**
 * Khung ứng dụng: header full-width dính trên + sidebar thu gọn được + vùng
 * nội dung cuộn riêng + bottom nav trên mobile. Bố cục tham khảo AppLayout
 * của dự án AIChatbot, màu sắc giữ tông brand/wood của NA.
 */
export function AppShell({
  allowedPermissions,
  fullName,
  email,
  roleLabel,
  avatarSrc,
  notificationSlot,
  children,
}: Props) {
  const pathname = usePathname();
  const collapsed = useSyncExternalStore(
    subscribeSidebar,
    readSidebarCollapsed,
    () => false,
  );
  const toggleSidebar = () => {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, String(!collapsed));
    window.dispatchEvent(new StorageEvent("storage", { key: SIDEBAR_STORAGE_KEY }));
  };

  const items = NAV_ITEMS.filter((item) =>
    allowedPermissions.includes(item.permission satisfies PermissionCode),
  );

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="flex h-dvh flex-col bg-background">
      {/* ── Header ── */}
      <header className="z-40 flex h-[60px] shrink-0 items-center border-b border-header-line bg-header text-header-foreground shadow-sm">
        {/* Khối thương hiệu — rộng đúng bằng sidebar, gradient màu chủ đạo */}
        <div
          className={cn(
            "brand-gradient relative hidden h-full shrink-0 items-center transition-[width] duration-200 lg:flex",
            collapsed ? "w-[72px]" : "w-60",
          )}
        >
          {collapsed ? (
            <span className="absolute left-[18px] top-3 size-9">
              <Link href="/dashboard" className="absolute inset-0">
                <BrandLogo compact inverse sidebar />
              </Link>
              <ControlButton
                onClick={toggleSidebar}
                aria-label="Mở rộng thanh bên"
                title="Mở rộng thanh bên"
                className="absolute inset-0 z-10 size-9 rounded-[10px] bg-surface-raised opacity-0 hover:bg-button-secondary-active hover:opacity-100 focus-visible:opacity-100 [&_svg]:size-[18px]"
              >
              <PanelLeftOpen className="size-4" />
              </ControlButton>
            </span>
          ) : (
            <>
              <Link
                href="/dashboard"
                className="ml-[18px] flex min-w-0 items-center"
              >
                <BrandLogo inverse sidebar />
              </Link>
              <ControlButton
                onClick={toggleSidebar}
                aria-label="Thu gọn thanh bên"
                title="Thu gọn thanh bên"
                className="ml-auto mr-3 size-9 rounded-[10px] bg-surface-raised hover:bg-button-secondary-active [&_svg]:size-[18px]"
              >
              <PanelLeftClose className="size-4" />
              </ControlButton>
            </>
          )}
        </div>

        {/* Thương hiệu bản mobile */}
        <Link
          href="/dashboard"
          className="flex min-w-0 items-center gap-2 pl-4 lg:hidden"
        >
          <BrandLogo size="sm" />
        </Link>

        <div className="flex-1" />

        <div className="flex items-center gap-1 pr-3 lg:gap-2 lg:pr-5">
          {notificationSlot}
          <ThemeSwitcher />
          <UserMenu
            fullName={fullName}
            email={email}
            roleLabel={roleLabel}
            avatarSrc={avatarSrc}
          />
        </div>
      </header>

      {/* ── Thân: sidebar + nội dung ── */}
      <div className="flex min-h-0 flex-1">
        <aside
          className={cn(
            "hidden shrink-0 flex-col border-r border-sidebar-line bg-sidebar text-sidebar-foreground transition-[width] duration-200 lg:flex",
            collapsed ? "w-[72px]" : "w-60",
          )}
        >
          <nav
            aria-label="Điều hướng chính"
            className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4"
          >
            {items.map((item) => {
              const active = isActive(item.href);
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-11 items-center overflow-hidden rounded-control border border-transparent text-sm font-medium transition-colors",
                    collapsed ? "w-12" : "w-full",
                    active
                      ? "border-brand-100 bg-sidebar-active text-brand-800 shadow-navigation-active"
                      : "text-muted hover:bg-surface-subtle hover:text-foreground",
                  )}
                >
                  <span className="flex h-11 w-12 min-w-12 shrink-0 items-center justify-center">
                    <Icon className="size-[19px] shrink-0" />
                  </span>
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate pr-3 transition-[opacity,transform] duration-150",
                      collapsed
                        ? "translate-x-1 opacity-0"
                        : "translate-x-0 opacity-100",
                    )}
                  >
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </nav>
        </aside>

        <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto bg-background">
          <div className="app-content mx-auto w-full max-w-[1520px] px-4 py-5 sm:px-6 sm:py-6 xl:px-8 xl:py-8">
            {children}
          </div>
        </main>
      </div>

      {/* ── Bottom nav trên mobile ── */}
      <nav
        aria-label="Điều hướng di động"
        className="scrollbar-hidden flex shrink-0 overflow-x-auto border-t border-sidebar-line bg-sidebar text-sidebar-foreground shadow-[0_-1px_3px_rgb(0_0_0_/_0.08)] lg:hidden"
      >
        {items.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex min-w-[72px] flex-1 flex-col items-center gap-1 border-t-2 px-1 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 text-xs font-medium transition-colors",
                active
                  ? "border-brand-600 bg-sidebar-active text-brand-800"
                  : "border-transparent text-muted hover:bg-surface-subtle hover:text-foreground",
              )}
            >
              <Icon className="size-5" />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
