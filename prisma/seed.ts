/**
 * Seed dữ liệu khởi tạo cho NA.
 * Chạy: npm run db:seed   (hoặc npm run db:reset để xóa sạch rồi seed lại)
 *
 * Idempotent — chạy nhiều lần không tạo trùng.
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import type {
  ContractStatus,
  ContractType,
  DepartmentCode,
  MemberArea,
  ProjectStage,
  ProjectStatus,
  ProjectType,
  TxnDirection,
  TxnStatus,
  TxnType,
} from "../src/generated/prisma/enums";
import {
  DEFAULT_ROLE_GRANTS,
  PERMISSIONS,
  ROLE_CODES,
  ROLE_LABEL,
  type RoleCode,
} from "../src/common/permissions/permissions";
import { syncScheduledChecks } from "../src/modules/maintenance/maintenance.service";
import { fillWorkdays, setMark } from "../src/modules/attendance/attendance.service";
import { recalcPeriod } from "../src/modules/payroll/payroll.service";
import { assertMigrated } from "./check-migrations";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const DEFAULT_PASSWORD = process.env.SEED_DEFAULT_PASSWORD ?? "Demo@2026";

type SeedUser = {
  employeeCode: string;
  email: string;
  fullName: string;
  phone: string;
  position: string;
  department: DepartmentCode | null;
  role: RoleCode;
  isDeptManager?: boolean;
};

const SEED_USERS: SeedUser[] = [
  // --- Giám đốc ---
  {
    employeeCode: "TN001",
    email: "director@na.vn",
    fullName: "Nguyễn Bá Thông",
    phone: "0901000001",
    position: "Giám đốc",
    department: null,
    role: "DIRECTOR",
  },

  // --- 4 trưởng phòng ---
  {
    employeeCode: "TN002",
    email: "tp.kinhdoanh@na.vn",
    fullName: "Trần Minh Khoa",
    phone: "0901000002",
    position: "Trưởng phòng Kinh doanh",
    department: "SALES",
    role: "HEAD_SALES",
    isDeptManager: true,
  },
  {
    employeeCode: "TN003",
    email: "tp.ketoan@na.vn",
    fullName: "Lê Thị Hồng Vân",
    phone: "0901000003",
    position: "Trưởng phòng Kế toán",
    department: "ACCOUNTING",
    role: "HEAD_ACCOUNT",
    isDeptManager: true,
  },
  {
    employeeCode: "TN004",
    email: "tp.thietke@na.vn",
    fullName: "Phạm Quốc Duy",
    phone: "0901000004",
    position: "Trưởng phòng Thiết kế",
    department: "DESIGN",
    role: "HEAD_DESIGN",
    isDeptManager: true,
  },
  {
    employeeCode: "TN005",
    email: "tp.thicong@na.vn",
    fullName: "Võ Thanh Tùng",
    phone: "0901000005",
    position: "Trưởng phòng Thi công",
    department: "CONSTRUCTION",
    role: "HEAD_CONSTRUCT",
    isDeptManager: true,
  },

  // --- Nhân viên ---
  {
    employeeCode: "TN006",
    email: "nv.kinhdoanh1@na.vn",
    fullName: "Đỗ Thị Mai Anh",
    phone: "0901000006",
    position: "Nhân viên kinh doanh",
    department: "SALES",
    role: "STAFF_SALES",
  },
  {
    employeeCode: "TN007",
    email: "nv.kinhdoanh2@na.vn",
    fullName: "Bùi Văn Nam",
    phone: "0901000007",
    position: "Nhân viên kinh doanh",
    department: "SALES",
    role: "STAFF_SALES",
  },
  {
    employeeCode: "TN008",
    email: "nv.ketoan@na.vn",
    fullName: "Ngô Thị Thu Hà",
    phone: "0901000008",
    position: "Kế toán viên",
    department: "ACCOUNTING",
    role: "STAFF_ACCOUNT",
  },
  {
    employeeCode: "TN009",
    email: "nv.thietke1@na.vn",
    fullName: "Hoàng Gia Bảo",
    phone: "0901000009",
    position: "Kiến trúc sư",
    department: "DESIGN",
    role: "STAFF_DESIGN",
  },
  {
    employeeCode: "TN010",
    email: "nv.thietke2@na.vn",
    fullName: "Lý Thu Trang",
    phone: "0901000010",
    position: "Họa viên 3D",
    department: "DESIGN",
    role: "STAFF_DESIGN",
  },
  {
    employeeCode: "TN011",
    email: "nv.thicong1@na.vn",
    fullName: "Đặng Hữu Phước",
    phone: "0901000011",
    position: "Giám sát công trình",
    department: "CONSTRUCTION",
    role: "STAFF_CONSTRUCT",
  },
  {
    employeeCode: "TN012",
    email: "nv.thicong2@na.vn",
    fullName: "Trịnh Văn Hải",
    phone: "0901000012",
    position: "Kỹ thuật xưởng",
    department: "CONSTRUCTION",
    role: "STAFF_CONSTRUCT",
  },
];

const DEPARTMENTS: { code: DepartmentCode; name: string }[] = [
  { code: "SALES", name: "Phòng Kinh doanh" },
  { code: "ACCOUNTING", name: "Phòng Kế toán" },
  { code: "DESIGN", name: "Phòng Thiết kế" },
  { code: "CONSTRUCTION", name: "Phòng Thi công" },
];

// ═══════════════════ DỮ LIỆU NGHIỆP VỤ MẪU ═══════════════════
// Brief mục 9.1 (Definition of Done) yêu cầu seed có 2–3 dự án mẫu.
// Dữ liệu dựng để demo và để dev có cái mà test — KHÔNG phải dữ liệu thật của khách.

/** Thứ tự 9 giai đoạn SOP — dùng để dựng lại lịch sử chuyển giai đoạn. */
const STAGE_SEQUENCE: ProjectStage[] = [
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

const STAGE_NOTE: Partial<Record<ProjectStage, string>> = {
  SURVEY_3D: "Đã khảo sát hiện trạng, bắt đầu dựng 3D",
  REVISE_QUOTE: "Khách duyệt phương án, chuyển bóc tách khối lượng",
  CONTRACT: "Hai bên đã ký hợp đồng và thu cọc",
  TECH_DRAWING: "Chốt kích thước, chuyển bản vẽ sang xưởng",
  PROCUREMENT: "Đã đặt vật tư, xưởng bắt đầu gia công",
  CONSTRUCTION: "Vận chuyển và lắp đặt tại công trình",
  HANDOVER: "Nghiệm thu cùng khách hàng, gửi đề nghị thanh toán",
  WARRANTY: "Bàn giao xong, bắt đầu theo dõi bảo hành",
};

const SEED_CUSTOMERS = [
  {
    code: "KH-2026-001",
    name: "Anh Nguyễn Văn Sơn",
    phone: "0912345001",
    email: "son.nguyen@example.com",
    address: "12 Nguyễn Văn Hưởng, Thảo Điền, TP. Thủ Đức",
    source: "REFERRAL" as const,
    note: "Khách do anh Thông giới thiệu, yêu cầu phong cách hiện đại tối giản",
  },
  {
    code: "KH-2026-002",
    name: "Chị Trần Thị Bích Ngọc",
    phone: "0912345002",
    email: "ngoc.tran@example.com",
    address: "Vinhomes Grand Park, TP. Thủ Đức",
    source: "FACEBOOK" as const,
    note: "Căn 2 phòng ngủ, ngân sách vừa phải",
  },
  {
    code: "KH-2026-003",
    name: "Công ty TNHH Vietflow",
    phone: "0912345003",
    email: "admin@vietflow.example.com",
    address: "Tòa nhà Pearl Plaza, Bình Thạnh, TP.HCM",
    source: "ZALO" as const,
    note: "Khách doanh nghiệp, cần xuất hóa đơn VAT",
  },
];

type SeedProject = {
  code: string;
  name: string;
  customerCode: string;
  type: ProjectType;
  propertyType: string;
  currentStage: ProjectStage;
  status: ProjectStatus;
  estimatedValue: number;
  address: string;
  description: string;
  startDate: Date;
  expectedEndDate: Date;
  /// Ngày bàn giao thực tế — gốc tính bảo hành 5 năm và lịch kiểm tra định kỳ.
  actualEndDate?: Date;
  createdByEmail: string;
  stageChangerEmail: string;
  members: { email: string; area: MemberArea }[];
  contracts: {
    code: string;
    type: ContractType;
    status: ContractStatus;
    value: number;
    depositAmount: number;
    signedDate: Date;
  }[];
  transactions: {
    code: string;
    direction: TxnDirection;
    type: TxnType;
    status: TxnStatus;
    amount: number;
    txnDate: Date;
    note: string;
  }[];
  materials: { catalogName: string; quantity: number; unitPrice: number }[];
};

const SEED_PROJECTS: SeedProject[] = [
  {
    code: "TN-2026-001",
    name: "Nội thất nhà phố Thảo Điền",
    customerCode: "KH-2026-001",
    type: "INTERIOR",
    propertyType: "Nhà phố",
    currentStage: "CONSTRUCTION",
    status: "ACTIVE",
    estimatedValue: 850_000_000,
    address: "12 Nguyễn Văn Hưởng, Thảo Điền, TP. Thủ Đức",
    description: "Trọn gói nội thất 3 tầng: phòng khách, bếp, 3 phòng ngủ",
    startDate: new Date("2026-02-10"),
    expectedEndDate: new Date("2026-08-30"),
    createdByEmail: "nv.kinhdoanh1@na.vn",
    stageChangerEmail: "tp.thietke@na.vn",
    members: [
      { email: "nv.kinhdoanh1@na.vn", area: "SALES" },
      { email: "nv.thietke1@na.vn", area: "DESIGN" },
      { email: "nv.thietke2@na.vn", area: "DESIGN" },
      { email: "nv.thicong1@na.vn", area: "CONSTRUCTION" },
    ],
    contracts: [
      {
        code: "HD-2026-001",
        type: "COMBINED",
        status: "SIGNED",
        value: 850_000_000,
        depositAmount: 255_000_000,
        signedDate: new Date("2026-03-15"),
      },
    ],
    transactions: [
      {
        code: "GD-2026-0001",
        direction: "INCOME",
        type: "DESIGN_DEPOSIT",
        status: "COMPLETED",
        amount: 45_000_000,
        txnDate: new Date("2026-02-18"),
        note: "Cọc thiết kế 30%",
      },
      {
        code: "GD-2026-0002",
        direction: "INCOME",
        type: "CONTRACT_DEPOSIT",
        status: "COMPLETED",
        amount: 255_000_000,
        txnDate: new Date("2026-03-16"),
        note: "Cọc hợp đồng 30%",
      },
      {
        code: "GD-2026-0003",
        direction: "INCOME",
        type: "PROGRESS_PAYMENT",
        status: "PENDING",
        amount: 340_000_000,
        txnDate: new Date("2026-06-20"),
        note: "Thanh toán đợt 2 khi lắp đặt đạt 70%",
      },
      {
        code: "GD-2026-0004",
        direction: "EXPENSE",
        type: "MATERIAL_COST",
        status: "COMPLETED",
        amount: 210_000_000,
        txnDate: new Date("2026-05-05"),
        note: "Đặt ván gỗ và phụ kiện đợt 1",
      },
      {
        code: "GD-2026-0005",
        direction: "EXPENSE",
        type: "FACTORY_COST",
        status: "COMPLETED",
        amount: 95_000_000,
        txnDate: new Date("2026-05-28"),
        note: "Gia công tủ bếp và tủ áo tại xưởng",
      },
    ],
    materials: [
      { catalogName: "Ván MDF chống ẩm 17mm", quantity: 45, unitPrice: 620_000 },
      { catalogName: "Ván MFC An Cường 18mm", quantity: 30, unitPrice: 780_000 },
      { catalogName: "Bản lề giảm chấn Hafele", quantity: 120, unitPrice: 85_000 },
      { catalogName: "Ray trượt bi 3 tầng", quantity: 40, unitPrice: 145_000 },
      { catalogName: "Đá Granite mặt bếp", quantity: 8.5, unitPrice: 2_400_000 },
    ],
  },
  {
    code: "TN-2026-002",
    name: "Nội thất căn hộ Vinhomes Grand Park",
    customerCode: "KH-2026-002",
    type: "INTERIOR",
    propertyType: "Chung cư",
    currentStage: "REVISE_QUOTE",
    status: "ACTIVE",
    estimatedValue: 420_000_000,
    address: "Toà S3.02, Vinhomes Grand Park, TP. Thủ Đức",
    description: "Căn hộ 2 phòng ngủ 68m2, phong cách Scandinavian",
    startDate: new Date("2026-05-02"),
    expectedEndDate: new Date("2026-09-15"),
    createdByEmail: "nv.kinhdoanh2@na.vn",
    stageChangerEmail: "nv.thietke2@na.vn",
    members: [
      { email: "nv.kinhdoanh2@na.vn", area: "SALES" },
      { email: "nv.thietke2@na.vn", area: "DESIGN" },
    ],
    contracts: [],
    transactions: [
      {
        code: "GD-2026-0006",
        direction: "INCOME",
        type: "DESIGN_DEPOSIT",
        status: "COMPLETED",
        amount: 25_000_000,
        txnDate: new Date("2026-05-10"),
        note: "Cọc thiết kế 30%",
      },
    ],
    materials: [],
  },
  {
    code: "TN-2026-003",
    name: "Thiết kế kiến trúc văn phòng Vietflow",
    customerCode: "KH-2026-003",
    type: "ARCHITECTURE",
    propertyType: "Văn phòng",
    currentStage: "HANDOVER",
    status: "ACTIVE",
    estimatedValue: 1_250_000_000,
    address: "Tầng 8, Pearl Plaza, Bình Thạnh, TP.HCM",
    description: "Cải tạo văn phòng 400m2 cho 60 nhân sự, có khu pantry",
    startDate: new Date("2026-01-08"),
    expectedEndDate: new Date("2026-07-31"),
    // Đã bàn giao → seed sinh sẵn lịch kiểm tra 3/6/12 tháng để Dashboard có việc.
    actualEndDate: new Date("2026-06-20"),
    createdByEmail: "tp.kinhdoanh@na.vn",
    stageChangerEmail: "tp.thicong@na.vn",
    members: [
      { email: "tp.kinhdoanh@na.vn", area: "SALES" },
      { email: "nv.thietke1@na.vn", area: "DESIGN" },
      { email: "nv.thicong1@na.vn", area: "CONSTRUCTION" },
      { email: "nv.thicong2@na.vn", area: "CONSTRUCTION" },
    ],
    contracts: [
      {
        code: "HD-2026-002",
        type: "DESIGN",
        status: "SIGNED",
        value: 350_000_000,
        depositAmount: 105_000_000,
        signedDate: new Date("2026-01-25"),
      },
      {
        code: "HD-2026-003",
        type: "CONSTRUCTION",
        status: "SIGNED",
        value: 900_000_000,
        depositAmount: 270_000_000,
        signedDate: new Date("2026-03-02"),
      },
    ],
    transactions: [
      {
        code: "GD-2026-0007",
        direction: "INCOME",
        type: "CONTRACT_DEPOSIT",
        status: "COMPLETED",
        amount: 375_000_000,
        txnDate: new Date("2026-03-05"),
        note: "Cọc hợp đồng thiết kế và thi công",
      },
      {
        code: "GD-2026-0008",
        direction: "INCOME",
        type: "PROGRESS_PAYMENT",
        status: "COMPLETED",
        amount: 500_000_000,
        txnDate: new Date("2026-05-20"),
        note: "Thanh toán đợt 2",
      },
      {
        code: "GD-2026-0009",
        direction: "INCOME",
        type: "FINAL_PAYMENT",
        status: "PENDING",
        amount: 375_000_000,
        txnDate: new Date("2026-07-25"),
        note: "Thanh toán cuối sau nghiệm thu",
      },
      {
        code: "GD-2026-0010",
        direction: "EXPENSE",
        type: "SUBCONTRACTOR_COST",
        status: "COMPLETED",
        amount: 280_000_000,
        txnDate: new Date("2026-04-18"),
        note: "Nhân công thầu phụ phần điện nước",
      },
      {
        code: "GD-2026-0011",
        direction: "EXPENSE",
        type: "TRANSPORT_COST",
        status: "COMPLETED",
        amount: 18_000_000,
        txnDate: new Date("2026-06-02"),
        note: "Vận chuyển nội thất lên tầng 8",
      },
    ],
    materials: [
      { catalogName: "Kính cường lực 8mm", quantity: 62, unitPrice: 1_150_000 },
      { catalogName: "Sơn PU 2 thành phần", quantity: 85, unitPrice: 320_000 },
    ],
  },
];

const MATERIAL_CATALOG = [
  { name: "Ván MDF chống ẩm 17mm", unit: "tấm", category: "Ván gỗ" },
  { name: "Ván MFC An Cường 18mm", unit: "tấm", category: "Ván gỗ" },
  { name: "Bản lề giảm chấn Hafele", unit: "cái", category: "Phụ kiện" },
  { name: "Ray trượt bi 3 tầng", unit: "bộ", category: "Phụ kiện" },
  { name: "Tay nắm tủ hợp kim", unit: "cái", category: "Phụ kiện" },
  { name: "Đá Granite mặt bếp", unit: "m2", category: "Đá" },
  { name: "Sơn PU 2 thành phần", unit: "lít", category: "Sơn" },
  { name: "Kính cường lực 8mm", unit: "m2", category: "Kính" },
];

async function main() {
  // Dừng sớm nếu DB còn ở schema cũ — nếu không, Prisma ném P2022 kèm stack
  // dài về một cột "không tồn tại", rất khó đoán ra là chỉ thiếu migrate.
  await assertMigrated(prisma, "dev");

  console.log("🌱 Bắt đầu seed dữ liệu NA...\n");

  // ── 1. Permissions ──────────────────────────────────────────
  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: p.code },
      update: { module: p.module, name: p.name },
      create: { code: p.code, module: p.module, name: p.name },
    });
  }
  console.log(`✔ ${PERMISSIONS.length} quyền`);

  // ── 2. Roles + gán quyền mặc định ───────────────────────────
  const permissionByCode = new Map(
    (await prisma.permission.findMany()).map((p) => [p.code, p.id]),
  );

  for (const code of ROLE_CODES) {
    const role = await prisma.role.upsert({
      where: { code },
      update: { name: ROLE_LABEL[code] },
      create: { code, name: ROLE_LABEL[code], isSystem: true },
    });

    const grants = DEFAULT_ROLE_GRANTS[code];
    for (const [permCode, scope] of Object.entries(grants)) {
      const permissionId = permissionByCode.get(permCode);
      if (!permissionId || !scope) continue;

      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId } },
        update: { scope },
        create: { roleId: role.id, permissionId, scope },
      });
    }
  }
  console.log(`✔ ${ROLE_CODES.length} vai trò + quyền mặc định`);

  // ── 3. Phòng ban ────────────────────────────────────────────
  for (const d of DEPARTMENTS) {
    await prisma.department.upsert({
      where: { code: d.code },
      update: { name: d.name },
      create: { code: d.code, name: d.name },
    });
  }
  console.log(`✔ ${DEPARTMENTS.length} phòng ban`);

  // ── 4. Người dùng ───────────────────────────────────────────
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
  const departmentByCode = new Map(
    (await prisma.department.findMany()).map((d) => [d.code, d.id]),
  );
  const roleByCode = new Map(
    (await prisma.role.findMany()).map((r) => [r.code, r.id]),
  );

  // Lương cơ bản + mức đóng BHXH mẫu, lấy khung từ bảng lương thật của công ty.
  // Giám đốc ăn lương khoán (isFixedSalary) — kế toán gõ thẳng số trên bảng lương.
  const SALARY: Record<string, { base?: number; insurance?: number; fixed?: boolean }> = {
    "director@na.vn": { fixed: true },
    "tp.kinhdoanh@na.vn": { base: 10_000_000, insurance: 5_000_000 },
    "tp.ketoan@na.vn": { base: 10_000_000, insurance: 5_000_000 },
    "tp.thietke@na.vn": { base: 10_000_000, insurance: 5_000_000 },
    "tp.thicong@na.vn": { base: 12_500_000, insurance: 4_800_000 },
    "nv.kinhdoanh1@na.vn": { base: 7_500_000, insurance: 5_000_000 },
    "nv.kinhdoanh2@na.vn": { base: 7_500_000 },
    "nv.ketoan@na.vn": { base: 8_000_000, insurance: 5_000_000 },
    "nv.thietke1@na.vn": { base: 9_000_000 },
    "nv.thietke2@na.vn": { base: 8_000_000 },
    "nv.thicong1@na.vn": { base: 9_000_000 },
    "nv.thicong2@na.vn": { base: 10_500_000 },
  };

  for (const u of SEED_USERS) {
    const departmentId = u.department
      ? (departmentByCode.get(u.department) ?? null)
      : null;

    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {
        fullName: u.fullName,
        phone: u.phone,
        position: u.position,
        departmentId,
      },
      create: {
        employeeCode: u.employeeCode,
        email: u.email,
        passwordHash,
        fullName: u.fullName,
        phone: u.phone,
        position: u.position,
        departmentId,
        joinedAt: new Date("2026-01-01"),
        // Tài khoản seed dùng để demo → không ép đổi mật khẩu ngay.
        // Tài khoản Director tạo qua UI sẽ có mustChangePassword = true.
        mustChangePassword: false,
      },
    });

    // Lương nằm ở mốc `SalaryRecord` chứ không còn trên hồ sơ. Seed một mốc duy
    // nhất từ 01/2026 cho người có khai lương; ai không khai thì không có mốc và
    // sẽ nằm trong danh sách "chưa khai lương" trên bảng lương.
    const salary = SALARY[u.email];
    if (salary) {
      const effectiveFrom = new Date("2026-01-01T00:00:00.000Z");
      await prisma.salaryRecord.upsert({
        where: { userId_effectiveFrom: { userId: user.id, effectiveFrom } },
        update: {
          baseSalary: salary.base ?? null,
          insuranceBase: salary.insurance ?? null,
          isFixedSalary: salary.fixed ?? false,
        },
        create: {
          userId: user.id,
          effectiveFrom,
          baseSalary: salary.base ?? null,
          insuranceBase: salary.insurance ?? null,
          isFixedSalary: salary.fixed ?? false,
          note: "Mốc khởi tạo",
        },
      });
    }

    const roleId = roleByCode.get(u.role);
    if (roleId) {
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId } },
        update: {},
        create: { userId: user.id, roleId },
      });
    }

    if (u.isDeptManager && departmentId) {
      await prisma.department.update({
        where: { id: departmentId },
        data: { managerId: user.id },
      });
    }
  }
  console.log(`✔ ${SEED_USERS.length} tài khoản (mật khẩu: ${DEFAULT_PASSWORD})`);

  // ── 5. Danh mục vật tư mẫu ──────────────────────────────────
  for (const m of MATERIAL_CATALOG) {
    await prisma.materialCatalog.upsert({
      where: { name: m.name },
      update: { unit: m.unit, category: m.category },
      create: m,
    });
  }
  console.log(`✔ ${MATERIAL_CATALOG.length} vật tư trong danh mục`);

  // ── 6. Khách hàng mẫu ───────────────────────────────────────
  const userByEmail = new Map(
    (await prisma.user.findMany({ select: { id: true, email: true } })).map(
      (u) => [u.email, u.id],
    ),
  );
  const idOf = (email: string) => userByEmail.get(email) ?? null;

  for (const c of SEED_CUSTOMERS) {
    await prisma.customer.upsert({
      where: { code: c.code },
      update: { name: c.name, phone: c.phone, address: c.address },
      create: {
        code: c.code,
        name: c.name,
        phone: c.phone,
        email: c.email,
        address: c.address,
        source: c.source,
        note: c.note,
        createdById: idOf("nv.kinhdoanh1@na.vn"),
      },
    });
  }
  console.log(`✔ ${SEED_CUSTOMERS.length} khách hàng mẫu`);

  // ── 7. Dự án mẫu ────────────────────────────────────────────
  const customerByCode = new Map(
    (await prisma.customer.findMany({ select: { id: true, code: true } })).map(
      (c) => [c.code, c.id],
    ),
  );

  for (const p of SEED_PROJECTS) {
    const customerId = customerByCode.get(p.customerCode);
    if (!customerId) continue;

    const project = await prisma.project.upsert({
      where: { code: p.code },
      update: {
        name: p.name,
        currentStage: p.currentStage,
        status: p.status,
        actualEndDate: p.actualEndDate ?? null,
      },
      create: {
        code: p.code,
        name: p.name,
        customerId,
        type: p.type,
        propertyType: p.propertyType,
        currentStage: p.currentStage,
        status: p.status,
        estimatedValue: p.estimatedValue,
        address: p.address,
        description: p.description,
        startDate: p.startDate,
        expectedEndDate: p.expectedEndDate,
        actualEndDate: p.actualEndDate ?? null,
        createdById: idOf(p.createdByEmail),
      },
    });

    // Thành viên phụ trách — có unique(projectId,userId,area) nên upsert an toàn.
    for (const m of p.members) {
      const userId = idOf(m.email);
      if (!userId) continue;
      await prisma.projectMember.upsert({
        where: {
          projectId_userId_area: {
            projectId: project.id,
            userId,
            area: m.area,
          },
        },
        update: {},
        create: { projectId: project.id, userId, area: m.area },
      });
    }

    // Lịch sử chuyển giai đoạn: dựng lại đường đi từ INTAKE tới giai đoạn hiện tại.
    // StageLog không có khóa duy nhất nên chỉ tạo khi dự án chưa có log nào.
    const existingLogs = await prisma.stageLog.count({
      where: { projectId: project.id },
    });
    if (existingLogs === 0) {
      const target = STAGE_SEQUENCE.indexOf(p.currentStage);
      const changerId = idOf(p.stageChangerEmail);
      for (let i = 1; i <= target; i++) {
        await prisma.stageLog.create({
          data: {
            projectId: project.id,
            fromStage: STAGE_SEQUENCE[i - 1],
            toStage: STAGE_SEQUENCE[i],
            changedById: changerId,
            note: STAGE_NOTE[STAGE_SEQUENCE[i]] ?? null,
            // Giãn mỗi giai đoạn ~12 ngày để biểu đồ tiến độ trông thật.
            createdAt: new Date(
              p.startDate.getTime() + i * 12 * 24 * 60 * 60 * 1000,
            ),
          },
        });
      }
    }

    // Hợp đồng
    for (const ct of p.contracts) {
      await prisma.contract.upsert({
        where: { code: ct.code },
        update: { value: ct.value, status: ct.status },
        create: {
          code: ct.code,
          projectId: project.id,
          type: ct.type,
          status: ct.status,
          value: ct.value,
          depositAmount: ct.depositAmount,
          signedDate: ct.signedDate,
        },
      });
    }

    // Giao dịch thu/chi
    for (const t of p.transactions) {
      await prisma.transaction.upsert({
        where: { code: t.code },
        update: { amount: t.amount, status: t.status },
        create: {
          code: t.code,
          projectId: project.id,
          direction: t.direction,
          type: t.type,
          status: t.status,
          amount: t.amount,
          txnDate: t.txnDate,
          note: t.note,
          createdById: idOf("nv.ketoan@na.vn"),
        },
      });
    }

    // Vật tư dùng cho dự án — không có khóa duy nhất, chỉ tạo lần đầu.
    const existingMaterials = await prisma.material.count({
      where: { projectId: project.id },
    });
    if (existingMaterials === 0 && p.materials.length > 0) {
      const catalogByName = new Map(
        (
          await prisma.materialCatalog.findMany({
            select: { id: true, name: true, unit: true },
          })
        ).map((m) => [m.name, m]),
      );
      for (const mt of p.materials) {
        const cat = catalogByName.get(mt.catalogName);
        if (!cat) continue;
        await prisma.material.create({
          data: {
            projectId: project.id,
            catalogId: cat.id,
            name: cat.name,
            unit: cat.unit,
            quantity: mt.quantity,
            unitPrice: mt.unitPrice,
          },
        });
      }
    }
  }
  console.log(`✔ ${SEED_PROJECTS.length} dự án mẫu (kèm thành viên, lịch sử giai đoạn, hợp đồng, giao dịch)`);

  // ── 9. Bảo hành sau bàn giao ────────────────────────────────
  // Dự án đã bàn giao thì sinh lịch kiểm tra định kỳ theo mốc đang cấu hình
  // (idempotent), kèm một đề nghị bảo hành mẫu để Dashboard có việc cần chú ý.
  let maintenanceCreated = 0;
  for (const p of SEED_PROJECTS) {
    if (!p.actualEndDate) continue;
    const project = await prisma.project.findUnique({
      where: { code: p.code },
      select: { id: true },
    });
    if (!project) continue;

    const r = await syncScheduledChecks(prisma, project.id);
    maintenanceCreated += r.created;

    // Không có khóa duy nhất cho đề nghị của khách — chỉ tạo khi dự án chưa có.
    const existingRequests = await prisma.maintenanceTask.count({
      where: { projectId: project.id, kind: "CUSTOMER_REQUEST" },
    });
    if (existingRequests === 0) {
      await prisma.maintenanceTask.create({
        data: {
          projectId: project.id,
          kind: "CUSTOMER_REQUEST",
          title: "Khách báo cánh tủ pantry bị xệ, bản lề kêu",
          description:
            "Khách gọi báo 2 cánh tủ khu pantry bị xệ sau 2 tháng sử dụng, đề nghị cử người sang chỉnh lại bản lề.",
          reporterNote: "Chị Hà — hành chính Vietflow",
          reportedAt: new Date(p.actualEndDate.getTime() + 60 * 24 * 60 * 60 * 1000),
          priority: "URGENT",
          status: "PENDING",
          createdById: idOf("tp.kinhdoanh@na.vn"),
        },
      });
      maintenanceCreated += 1;
    }
  }
  console.log(`✔ ${maintenanceCreated} việc bảo hành mẫu (lịch định kỳ + đề nghị của khách)`);


  // ── 10. Chấm công · ứng lương · bảng lương tháng 8/2026 ─────
  // Dựng một tháng đầy đủ để mở /cham-cong và /bang-luong là có số liệu ngay.
  // Idempotent: fillWorkdays bỏ qua ô đã có, ứng lương chỉ tạo khi chưa có.
  const AT_YEAR = 2026;
  const AT_MONTH = 8;
  const staffForAttendance = await prisma.user.findMany({
    where: { userType: "HUMAN", deletedAt: null, isActive: true },
    select: { id: true, email: true },
  });
  const seedActor = idOf("director@na.vn");

  if (seedActor) {
    const actorSession = {
      id: seedActor,
      email: "director@na.vn",
      fullName: "Seed",
      departmentId: null,
      departmentCode: null,
      roleCodes: ["DIRECTOR"],
      permissions: {
        "attendance.manage": "ALL",
        "payroll.manage": "ALL",
        "payroll.view": "ALL",
      },
      userType: "HUMAN",
      mustChangePassword: false,
    } as Parameters<typeof fillWorkdays>[0];

    await fillWorkdays(
      actorSession,
      AT_YEAR,
      AT_MONTH,
      staffForAttendance.map((u) => u.id),
    );

    // Vài ngày nghỉ, vài chủ nhật đi làm và ít giờ tăng ca cho giống thực tế.
    const day = (n: number) => new Date(Date.UTC(AT_YEAR, AT_MONTH - 1, n));
    const pick = (email: string) =>
      staffForAttendance.find((u) => u.email === email)?.id;

    const construction1 = pick("nv.thicong1@na.vn");
    const construction2 = pick("nv.thicong2@na.vn");
    const design1 = pick("nv.thietke1@na.vn");

    if (construction1) {
      for (const n of [2, 9, 23, 30]) {
        await setMark(actorSession, {
          userId: construction1,
          workDate: day(n),
          mark: "FULL",
        });
      }
      await setMark(actorSession, {
        userId: construction1,
        workDate: day(6),
        mark: "FULL",
        overtimeHours: 5.5,
      });
      await setMark(actorSession, {
        userId: construction1,
        workDate: day(7),
        mark: "FULL",
        overtimeHours: 1.5,
      });
    }
    if (construction2) {
      for (const n of [2, 9, 30]) {
        await setMark(actorSession, {
          userId: construction2,
          workDate: day(n),
          mark: "FULL",
        });
      }
      await setMark(actorSession, {
        userId: construction2,
        workDate: day(12),
        mark: "ABSENT",
      });
    }
    if (design1) {
      await setMark(actorSession, {
        userId: design1,
        workDate: day(13),
        mark: "HALF",
      });
      await setMark(actorSession, {
        userId: design1,
        workDate: day(14),
        mark: "ABSENT",
      });
    }

    const advanceCount = await prisma.salaryAdvance.count({
      where: {
        advanceDate: {
          gte: new Date(Date.UTC(AT_YEAR, AT_MONTH - 1, 1)),
          lt: new Date(Date.UTC(AT_YEAR, AT_MONTH, 1)),
        },
      },
    });
    if (advanceCount === 0 && construction1 && design1) {
      await prisma.salaryAdvance.createMany({
        data: [
          {
            userId: construction1,
            advanceDate: day(22),
            amount: 1_000_000,
            method: "CASH",
            note: "Ứng lương",
            createdById: seedActor,
          },
          {
            userId: design1,
            advanceDate: day(28),
            amount: 5_000_000,
            method: "TRANSFER",
            note: "Ứng lương",
            createdById: seedActor,
          },
        ],
      });
    }

    await recalcPeriod(actorSession, AT_YEAR, AT_MONTH);
    console.log(
      `✔ Chấm công + bảng lương mẫu tháng ${AT_MONTH}/${AT_YEAR} (${staffForAttendance.length} người)`,
    );
  }

  console.log("\n✅ Seed xong.");
  console.log("   Đăng nhập thử: director@na.vn / " + DEFAULT_PASSWORD);
}

main()
  .catch((e) => {
    console.error("❌ Seed thất bại:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
