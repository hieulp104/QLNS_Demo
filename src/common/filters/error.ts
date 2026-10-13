/**
 * Xử lý lỗi thống nhất cho toàn hệ thống.
 * Tương đương exception filter bên NestJS — mọi server action trả về cùng một hình dạng.
 *
 * @example
 *   if (!can(user, "project.update", ctx)) return fail("PERMISSION_DENIED");
 *   return ok(project);
 */

export const ERROR_CODE = {
  UNAUTHENTICATED: "UNAUTHENTICATED",
  PERMISSION_DENIED: "PERMISSION_DENIED",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCode = (typeof ERROR_CODE)[keyof typeof ERROR_CODE];

/** Thông báo mặc định bằng tiếng Việt cho từng mã lỗi. */
const DEFAULT_MESSAGE: Record<ErrorCode, string> = {
  UNAUTHENTICATED: "Bạn cần đăng nhập để thực hiện thao tác này.",
  PERMISSION_DENIED: "Bạn không có quyền thực hiện thao tác này.",
  VALIDATION_ERROR: "Dữ liệu nhập vào không hợp lệ.",
  NOT_FOUND: "Không tìm thấy dữ liệu.",
  CONFLICT: "Dữ liệu đã tồn tại hoặc đang bị trùng.",
  INTERNAL_ERROR: "Có lỗi xảy ra, vui lòng thử lại.",
};

export type ActionSuccess<T> = { ok: true; data: T };
export type ActionFailure = { ok: false; code: ErrorCode; message: string };
export type ActionResult<T> = ActionSuccess<T> | ActionFailure;

/** Trả về kết quả thành công. */
export function ok<T>(data: T): ActionSuccess<T> {
  return { ok: true, data };
}

/** Trả về lỗi. Không truyền message thì lấy câu mặc định tiếng Việt. */
export function fail(code: ErrorCode, message?: string): ActionFailure {
  return { ok: false, code, message: message ?? DEFAULT_MESSAGE[code] };
}
