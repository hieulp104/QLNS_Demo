"use client";

import { Alert, Badge, Button, Card, CardHeader, Checkbox, DividedList, Label, Select } from "@/components/ui";

import { useMemo, useState, useTransition } from "react";
import { Check, LoaderCircle, Lock, TriangleAlert } from "lucide-react";
import { saveRoleGrantsAction } from "@/modules/system/system.actions";
import { PERMISSIONS } from "@/common/permissions/permissions";
import type { PermissionScope } from "@/generated/prisma/enums";
import type { RoleWithGrants } from "@/modules/system/system.service";

const MODULE_LABEL: Record<string, string> = {
  hr: "Nhân sự & Tài khoản",
  customer: "Khách hàng",
  project: "Dự án",
  contract: "Hợp đồng",
  material: "Vật tư",
  finance: "Tài chính",
  report: "Báo cáo",
  ai: "NA AI",
  system: "Hệ thống",
};

const SCOPE_LABEL: Record<PermissionScope, string> = {
  ALL: "Toàn hệ thống",
  DEPARTMENT: "Phòng mình",
  ASSIGNED: "Dự án được add",
  SELF: "Chỉ bản thân",
};

/** Gom danh mục quyền theo module, giữ thứ tự khai báo. */
function groupedPermissions() {
  const groups = new Map<string, (typeof PERMISSIONS)[number][]>();
  for (const p of PERMISSIONS) {
    const list = groups.get(p.module) ?? [];
    list.push(p);
    groups.set(p.module, list);
  }
  return [...groups.entries()];
}

/**
 * SY-03 — Director bật/tắt từng quyền + chọn phạm vi cho từng vai trò.
 * Sửa xong bấm Lưu — ghi thẳng bảng `role_permissions` (nguồn chân lý lúc chạy).
 */
export function PermissionEditor({ roles }: { roles: RoleWithGrants[] }) {
  const editable = roles.filter((r) => r.code !== "DIRECTOR");
  const director = roles.find((r) => r.code === "DIRECTOR");

  const [activeRoleId, setActiveRoleId] = useState(editable[0]?.id ?? "");
  /** Bản nháp đang chỉnh: roleId → (permissionCode → scope). */
  const [draft, setDraft] = useState<Record<string, Record<string, PermissionScope>>>(
    () => Object.fromEntries(roles.map((r) => [r.id, { ...r.grants }])),
  );
  const [savedRoleId, setSavedRoleId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const groups = useMemo(() => groupedPermissions(), []);
  const activeRole = editable.find((r) => r.id === activeRoleId);
  const activeGrants = draft[activeRoleId] ?? {};

  const original = roles.find((r) => r.id === activeRoleId)?.grants ?? {};
  const isDirty =
    JSON.stringify(activeGrants) !== JSON.stringify(original);

  function toggle(code: string) {
    setSavedRoleId(null);
    setDraft((d) => {
      const grants = { ...d[activeRoleId] };
      if (grants[code]) delete grants[code];
      else grants[code] = "ALL";
      return { ...d, [activeRoleId]: grants };
    });
  }

  function setScope(code: string, scope: PermissionScope) {
    setSavedRoleId(null);
    setDraft((d) => ({
      ...d,
      [activeRoleId]: { ...d[activeRoleId], [code]: scope },
    }));
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await saveRoleGrantsAction({
        roleId: activeRoleId,
        grants: Object.entries(activeGrants).map(([permissionCode, scope]) => ({
          permissionCode,
          scope,
        })),
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setSavedRoleId(activeRoleId);
    });
  }

  return (
    <div className="space-y-5">
      {/* Chọn vai trò */}
      <div className="flex flex-wrap gap-1.5">
        {editable.map((r) => (
          <Button
            key={r.id}
            type="button"
            onClick={() => {
              setActiveRoleId(r.id);
              setError(null);
              setSavedRoleId(null);
            }}
            variant={r.id === activeRoleId ? "primary" : "outline"}
            size="sm"
          >
            {r.name}
            <span className="ml-1.5 text-xs opacity-70">({r.userCount})</span>
          </Button>
        ))}
        {director && (
          <Badge
            variant="info"
            className="cursor-not-allowed gap-1.5 px-3 py-1.5 text-sm"
            title="Giám đốc luôn toàn quyền — khóa để không ai tự cắt quyền quản trị cuối cùng"
          >
            <Lock className="size-3.5" />
            {director.name}
          </Badge>
        )}
      </div>

      {error && (
        <Alert
          variant="danger"
          className="flex items-start gap-2.5 px-3.5 py-3"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </Alert>
      )}

      {/* Bảng quyền theo module */}
      {activeRole && (
        <div className="space-y-4">
          {groups.map(([module, perms]) => (
            <Card
              key={module}
              className="overflow-hidden"
            >
              <CardHeader className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted">
                {MODULE_LABEL[module] ?? module}
              </CardHeader>
              <DividedList>
                {perms.map((p) => {
                  const scope = activeGrants[p.code];
                  const enabled = Boolean(scope);
                  return (
                    <li
                      key={p.code}
                      className="flex items-center gap-3 px-4 py-2.5"
                    >
                      <Label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5">
                        <Checkbox
                          checked={enabled}
                          onChange={() => toggle(p.code)}
                        />
                        <span className="min-w-0 text-sm text-foreground">
                          {p.name}
                        </span>
                      </Label>
                      <div className="w-44 shrink-0">
                        {enabled ? (
                          <Select
                            value={scope}
                            onChange={(e) =>
                              setScope(p.code, e.target.value as PermissionScope)
                            }
                            aria-label={`Phạm vi cho ${p.name}`}
                            className="w-full px-2.5 py-1.5"
                          >
                            {(
                              Object.entries(SCOPE_LABEL) as [PermissionScope, string][]
                            ).map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </Select>
                        ) : (
                          <div className="h-9" aria-hidden="true" />
                        )}
                      </div>
                    </li>
                  );
                })}
              </DividedList>
            </Card>
          ))}

          {/* Thanh lưu */}
          <Card className="sticky bottom-4 flex items-center gap-3 p-3">
            <Button
              type="button"
              onClick={save}
              disabled={pending || !isDirty}
              className="px-4 py-2 disabled:cursor-not-allowed"
            >
              {pending ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
              Lưu cho {activeRole.name}
            </Button>
            {savedRoleId === activeRoleId && !isDirty && (
              <Badge variant="success">
                <Check className="size-4" />
                Đã lưu — hiệu lực với người đang đăng nhập trong tối đa 5 phút.
              </Badge>
            )}
            {isDirty && (
              <span className="text-sm text-muted">Có thay đổi chưa lưu.</span>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
