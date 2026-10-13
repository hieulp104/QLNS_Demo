/**
 * Nhãn hiển thị tiếng Việt cho toàn bộ enum của Prisma.
 * Mọi chỗ cần đổi mã enum sang chữ cho người dùng đọc đều lấy từ đây.
 */

import type {
  ContractStatus,
  ContractType,
  CustomerSource,
  DepartmentCode,
  AdvanceMethod,
  AttendanceMark,
  FileKind,
  LeaveStatus,
  LeaveType,
  MaintenanceKind,
  MaintenancePriority,
  MaintenanceStatus,
  MemberArea,
  PayrollStatus,
  ProjectStage,
  ProjectStatus,
  ProjectType,
  TxnDirection,
  TxnStatus,
  TxnType,
} from "@/generated/prisma/enums";

/** Quy trình SOP 9 giai đoạn — thứ tự dùng cho thanh tiến độ và kiểm tra bước chuyển. */
export const STAGE_ORDER: ProjectStage[] = [
  "INTAKE",
  "SURVEY_3D",
  "REVISE_QUOTE",
  "CONTRACT",
  "TECH_DRAWING",
  "PROCUREMENT",
  "CONSTRUCTION",
  "HANDOVER",
  "WARRANTY",
];

export const STAGE_LABEL: Record<ProjectStage, string> = {
  INTAKE: "Tiếp nhận khách hàng",
  SURVEY_3D: "Khảo sát – Tư vấn – Thiết kế 3D",
  REVISE_QUOTE: "Chỉnh sửa 3D – Bóc tách – Báo giá",
  CONTRACT: "Ký hợp đồng và đặt cọc",
  TECH_DRAWING: "Bản vẽ kỹ thuật – Chốt kích thước – CNC",
  PROCUREMENT: "Đặt vật tư – Gia công xưởng",
  CONSTRUCTION: "Thi công – Lắp đặt – Hoàn thiện",
  HANDOVER: "Nghiệm thu – Bàn giao – Đề nghị thanh toán",
  WARRANTY: "Bảo hành 5 năm – Chăm sóc khách hàng",
};

/** Mô tả ngắn hiển thị dưới tên giai đoạn ở trang chi tiết dự án. */
export const STAGE_HINT: Record<ProjectStage, string> = {
  INTAKE: "Ghi nhận nhu cầu, thông tin liên hệ ban đầu",
  SURVEY_3D: "Đo đạc hiện trạng, dựng 3D, thu cọc thiết kế 30%",
  REVISE_QUOTE: "Sửa 3D theo góp ý, bóc tách khối lượng, gửi báo giá",
  CONTRACT: "Ký hợp đồng thiết kế/thi công và thu tiền cọc",
  TECH_DRAWING: "Triển khai AutoCAD, chốt kích thước, xuất file CNC",
  PROCUREMENT: "Đặt vật tư, đưa vào sản xuất tại xưởng",
  CONSTRUCTION: "Vận chuyển, lắp đặt tại công trình, hoàn thiện",
  HANDOVER: "Nghiệm thu cùng khách, bàn giao, đề nghị thanh toán",
  WARRANTY: "Theo dõi bảo hành 5 năm và chăm sóc khách hàng",
};

export const DEPARTMENT_LABEL: Record<DepartmentCode, string> = {
  SALES: "Kinh doanh",
  ACCOUNTING: "Kế toán",
  DESIGN: "Thiết kế",
  CONSTRUCTION: "Thi công",
};

export const PROJECT_TYPE_LABEL: Record<ProjectType, string> = {
  INTERIOR: "Thiết kế nội thất",
  ARCHITECTURE: "Thiết kế kiến trúc",
};

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  ACTIVE: "Đang chạy",
  ON_HOLD: "Tạm dừng",
  WARRANTY: "Bảo hành",
  COMPLETED: "Hoàn thành",
  CANCELLED: "Đã hủy",
};

/** Loại hình công trình gợi ý — người dùng vẫn nhập tự do được. */
export const PROPERTY_TYPE_SUGGESTIONS = [
  "Nhà phố",
  "Chung cư",
  "Biệt thự",
  "Văn phòng",
  "Showroom",
];

export const MEMBER_AREA_LABEL: Record<MemberArea, string> = {
  SALES: "Kinh doanh",
  DESIGN: "Thiết kế",
  CONSTRUCTION: "Thi công",
};

export const CONTRACT_TYPE_LABEL: Record<ContractType, string> = {
  DESIGN: "Hợp đồng thiết kế",
  CONSTRUCTION: "Hợp đồng thi công",
  COMBINED: "Hợp đồng trọn gói",
  ANNEX: "Phụ lục hợp đồng",
};

export const CONTRACT_STATUS_LABEL: Record<ContractStatus, string> = {
  DRAFT: "Nháp",
  SIGNED: "Đã ký",
  LIQUIDATED: "Đã thanh lý",
  CANCELLED: "Đã hủy",
};

export const FILE_KIND_LABEL: Record<FileKind, string> = {
  MODEL_3D: "File 3D",
  CAD_DRAWING: "Bản vẽ CAD",
  CONTRACT_DOC: "Hợp đồng",
  QUOTATION: "Báo giá",
  BOQ: "Bóc tách khối lượng (BOQ)",
  RENDER_IMAGE: "Ảnh render",
  SITE_PHOTO: "Ảnh thi công",
  MATERIAL_DOC: "Tài liệu vật tư",
  AVATAR: "Ảnh đại diện",
  OTHER: "Tài liệu khác",
};

/** Loại file người dùng chọn được khi upload theo dự án (PJ-18). */
export const PROJECT_FILE_KINDS: FileKind[] = [
  "MODEL_3D",
  "CAD_DRAWING",
  "CONTRACT_DOC",
  "QUOTATION",
  "BOQ",
  "OTHER",
];

/** Loại ảnh cho gallery (PJ-17). */
export const PROJECT_IMAGE_KINDS: FileKind[] = ["RENDER_IMAGE", "SITE_PHOTO"];

export const CUSTOMER_SOURCE_LABEL: Record<CustomerSource, string> = {
  REFERRAL: "Giới thiệu",
  FACEBOOK: "Facebook",
  ZALO: "Zalo",
  WEBSITE: "Website",
  WALK_IN: "Khách vãng lai",
  OTHER: "Khác",
};

export const TXN_DIRECTION_LABEL: Record<TxnDirection, string> = {
  INCOME: "Thu",
  EXPENSE: "Chi",
};

export const TXN_TYPE_LABEL: Record<TxnType, string> = {
  DESIGN_DEPOSIT: "Cọc thiết kế",
  CONTRACT_DEPOSIT: "Cọc hợp đồng",
  PROGRESS_PAYMENT: "Thanh toán tiến độ",
  FINAL_PAYMENT: "Thanh toán cuối",
  MATERIAL_COST: "Chi phí vật tư",
  FACTORY_COST: "Gia công xưởng",
  SUBCONTRACTOR_COST: "Nhân công thầu phụ",
  TRANSPORT_COST: "Vận chuyển",
  // "Khác" trần dễ nhầm với "Chi khác" — loại này là khoản chưa phân loại.
  OTHER: "Khác (chưa phân loại)",
  SALARY_COST: "Chi lương",
  INSURANCE_COST: "BHXH",
  OPERATING_COST: "Chi khác",
};

export const TXN_STATUS_LABEL: Record<TxnStatus, string> = {
  PENDING: "Đang chờ",
  COMPLETED: "Đã hoàn tất",
};

// ═══════════════════ BẢO HÀNH SAU BÀN GIAO ═══════════════════

export const MAINTENANCE_KIND_LABEL: Record<MaintenanceKind, string> = {
  SCHEDULED_CHECK: "Kiểm tra định kỳ",
  CUSTOMER_REQUEST: "Khách đề nghị bảo hành",
};

export const MAINTENANCE_STATUS_LABEL: Record<MaintenanceStatus, string> = {
  PENDING: "Chờ xử lý",
  IN_PROGRESS: "Đang xử lý",
  DONE: "Đã xử lý",
  CANCELLED: "Bỏ qua",
};

export const MAINTENANCE_PRIORITY_LABEL: Record<MaintenancePriority, string> = {
  NORMAL: "Bình thường",
  URGENT: "Gấp",
};

/** Trạng thái còn phải làm — dùng ở Dashboard và bộ lọc "việc chưa xong". */
export const MAINTENANCE_OPEN_STATUSES: MaintenanceStatus[] = [
  "PENDING",
  "IN_PROGRESS",
];

// ═══════════════════ CHẤM CÔNG · NGHỈ PHÉP · LƯƠNG ═══════════════════

/// Ký hiệu viết trong ô chấm công — giữ nguyên bộ ký hiệu công ty đang dùng.
export const ATTENDANCE_MARK_SYMBOL: Record<AttendanceMark, string> = {
  FULL: "X",
  HALF: "/",
  ABSENT: "N",
  HOLIDAY: "L",
  ANNUAL_LEAVE: "P",
};

export const ATTENDANCE_MARK_LABEL: Record<AttendanceMark, string> = {
  FULL: "Đủ công",
  HALF: "Nửa công",
  ABSENT: "Nghỉ không lương",
  HOLIDAY: "Nghỉ lễ có lương",
  ANNUAL_LEAVE: "Phép năm có lương",
};

/**
 * Ký hiệu người dùng chọn được khi chấm công.
 * ANNUAL_LEAVE nằm ngoài danh sách này vì công ty chưa áp dụng phép năm —
 * bật lại bằng cách thêm vào đây (dữ liệu và cách tính đã sẵn sàng).
 */
export const ATTENDANCE_MARKS: AttendanceMark[] = [
  "FULL",
  "HALF",
  "ABSENT",
  "HOLIDAY",
];

export const LEAVE_TYPE_LABEL: Record<LeaveType, string> = {
  UNPAID: "Nghỉ không lương",
  HOLIDAY: "Nghỉ lễ có lương",
  ANNUAL: "Phép năm có lương",
  SICK: "Nghỉ ốm",
  OTHER: "Lý do khác",
};

/// Loại nghỉ nhân viên chọn được khi nộp đơn (khớp thực tế công ty đang dùng).
export const LEAVE_TYPES: LeaveType[] = ["UNPAID", "HOLIDAY", "SICK", "OTHER"];

export const LEAVE_STATUS_LABEL: Record<LeaveStatus, string> = {
  PENDING: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  REJECTED: "Từ chối",
  CANCELLED: "Đã hủy",
};

export const ADVANCE_METHOD_LABEL: Record<AdvanceMethod, string> = {
  CASH: "Tiền mặt",
  TRANSFER: "Chuyển khoản",
};

export const PAYROLL_STATUS_LABEL: Record<PayrollStatus, string> = {
  DRAFT: "Đang làm",
  LOCKED: "Đã chốt",
};
