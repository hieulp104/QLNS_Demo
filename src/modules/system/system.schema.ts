import { z } from "zod";
import { PermissionScope } from "@/generated/prisma/enums";

/** Bộ lọc màn audit log (SY-02) — nhận từ query param. */
export const auditFilterSchema = z.object({
  actorId: z.string().trim().optional().transform((v) => v || undefined),
  entity: z.string().trim().optional().transform((v) => v || undefined),
  from: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? new Date(`${v}T00:00:00.000Z`) : undefined))
    .refine((v) => v === undefined || !Number.isNaN(v.getTime()), {
      message: "Ngày bắt đầu không hợp lệ",
    }),
  to: z
    .string()
    .trim()
    .optional()
    // Lấy hết ngày kết thúc: cộng tới cuối ngày.
    .transform((v) => (v ? new Date(`${v}T23:59:59.999Z`) : undefined))
    .refine((v) => v === undefined || !Number.isNaN(v.getTime()), {
      message: "Ngày kết thúc không hợp lệ",
    }),
  page: z.coerce.number().int().min(1).catch(1).default(1),
});
export type AuditFilterInput = z.infer<typeof auditFilterSchema>;

/** SY-03 — payload lưu bộ quyền một vai trò. */
export const saveRoleGrantsSchema = z.object({
  roleId: z.string().min(1),
  grants: z
    .array(
      z.object({
        permissionCode: z.string().min(1).max(64),
        scope: z.enum(PermissionScope),
      }),
    )
    // 27 quyền hiện tại — chặn payload phình to bất thường.
    .max(100, "Danh sách quyền quá dài"),
});
export type SaveRoleGrantsInput = z.infer<typeof saveRoleGrantsSchema>;
