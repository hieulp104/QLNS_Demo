import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Làm tròn số công về 2 chữ số. Số công luôn là bội của 0.25 (nửa công, và công
 * tăng ca = giờ ÷ 4), nhưng cộng bằng số thực trong JS cho ra 10.379999999999999
 * — ghi thẳng ra bảng hoặc ô Excel là kế toán thấy nguyên chuỗi đó.
 *
 * Để ở đây chứ KHÔNG ở `payroll.config.ts`: file đó import `prisma`, nên bảng
 * lương (client component) import vào là kéo cả module server sang bundle client
 * và build vỡ. `tsc` không bắt được, chỉ `next build` mới báo.
 */
export function roundDays(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Gộp class Tailwind, class sau ghi đè class trước khi trùng nhóm. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Định dạng tiền VND: 1500000 → "1.500.000 ₫" */
export function formatVnd(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(n);
}

/** Định dạng ngày theo giờ Việt Nam: "20/07/2026" */
export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(d);
}

/** Định dạng ngày giờ: "20/07/2026 14:30" */
export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(d);
}

/** Chữ cái đầu của tên, dùng cho avatar: "Nguyễn Bá Thông" → "NT" */
export function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Khoảng thời gian tương đối, tiếng Việt: "5 phút trước", "3 ngày trước".
 * Quá 7 ngày thì trả về ngày cụ thể — "60 ngày trước" không giúp ai cả.
 */
export function formatRelativeTime(value: Date | string): string {
  const d = typeof value === "string" ? new Date(value) : value;
  const diffMs = Date.now() - d.getTime();
  const minutes = Math.floor(diffMs / 60000);

  if (minutes < 1) return "vừa xong";
  if (minutes < 60) return `${minutes} phút trước`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;

  const days = Math.floor(hours / 24);
  if (days <= 7) return `${days} ngày trước`;

  return formatDate(d);
}

/**
 * SĐT về đúng dạng lưu trong DB (chỉ chữ số, vd 0912345678).
 * SĐT cũng là tên đăng nhập, nên form hồ sơ và form đăng nhập phải dùng
 * chung một cách chuẩn hóa — lệch nhau là người dùng không đăng nhập được.
 */
export function normalizePhone(raw: string): string {
  return raw.replace(/[\s.\-()]/g, "");
}

/** SĐT VN sau khi chuẩn hóa: 10–11 chữ số, bắt đầu bằng 0. */
export const PHONE_PATTERN = /^0\d{9,10}$/;
