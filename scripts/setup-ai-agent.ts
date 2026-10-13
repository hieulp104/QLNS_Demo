/**
 * Bootstrap idempotent cho tài khoản dịch vụ NA AI.
 * Không tạo thông tin đăng nhập hợp lệ; authorize() luôn chặn userType AI_AGENT.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  AI_AGENT_EMAIL,
  AI_AGENT_EMPLOYEE_CODE,
  AI_AGENT_NAME,
  AI_AGENT_ROLE_CODE,
} from "../src/modules/ai/ai.constants";
import {
  DEFAULT_ROLE_GRANTS,
  PERMISSIONS,
} from "../src/common/permissions/permissions";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  for (const permission of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: permission.code },
      update: { module: permission.module, name: permission.name },
      create: permission,
    });
  }

  const role = await prisma.role.upsert({
    where: { code: AI_AGENT_ROLE_CODE },
    update: { name: AI_AGENT_NAME, isSystem: true },
    create: {
      code: AI_AGENT_ROLE_CODE,
      name: AI_AGENT_NAME,
      description: "Tài khoản dịch vụ read-only cho module NA AI",
      isSystem: true,
    },
  });

  const permissionByCode = new Map(
    (await prisma.permission.findMany({ select: { id: true, code: true } })).map(
      (permission) => [permission.code, permission.id],
    ),
  );
  for (const [code, scope] of Object.entries(DEFAULT_ROLE_GRANTS.AI_AGENT)) {
    const permissionId = permissionByCode.get(code);
    if (!permissionId || !scope) continue;
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId } },
      update: {}, // Không ghi đè quyền Director đã chỉnh.
      create: { roleId: role.id, permissionId, scope },
    });
  }

  const agent = await prisma.user.upsert({
    where: { employeeCode: AI_AGENT_EMPLOYEE_CODE },
    update: {
      userType: "AI_AGENT",
      fullName: AI_AGENT_NAME,
      isActive: true,
      mustChangePassword: false,
      departmentId: null,
      deletedAt: null,
      deletedReason: null,
    },
    create: {
      employeeCode: AI_AGENT_EMPLOYEE_CODE,
      email: AI_AGENT_EMAIL,
      // Sentinel không phải bcrypt hash; userType AI_AGENT bị từ chối trước bcrypt.
      passwordHash: "!AI_AGENT_CANNOT_LOGIN!",
      fullName: AI_AGENT_NAME,
      position: "AI Agent",
      userType: "AI_AGENT",
      isActive: true,
      mustChangePassword: false,
    },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: agent.id, roleId: role.id } },
    update: {},
    create: { userId: agent.id, roleId: role.id },
  });

  await prisma.auditLog.create({
    data: {
      actorId: null,
      action: "AI_AGENT_BOOTSTRAP",
      entity: "User",
      entityId: agent.id,
      after: { employeeCode: agent.employeeCode, roleCode: role.code },
    },
  });

  console.log(`NA AI sẵn sàng: ${agent.employeeCode} (${agent.id})`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
