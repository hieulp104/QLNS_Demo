"use client";

import { Alert, Badge, Button, Card, FormCard, IconTile, Input, Select } from "@/components/ui";

import { useActionState, useState } from "react";
import { LoaderCircle, Plus, TriangleAlert, UserMinus, X } from "lucide-react";
import {
  addMemberAction,
  removeMemberAction,
  type ActionState,
} from "@/modules/projects/projects.actions";
import { MEMBER_AREA_LABEL } from "@/common/enums";
import { initials } from "@/lib/utils";
import type { MemberArea } from "@/generated/prisma/enums";

const initialState: ActionState = { error: null };

type Member = {
  id: string;
  area: MemberArea;
  user: {
    id: string;
    fullName: string;
    email: string | null;
    department: { code: string } | null;
  };
};

type AssignableUser = {
  id: string;
  fullName: string;
  department: { code: string } | null;
};

const AREAS: MemberArea[] = ["SALES", "DESIGN", "CONSTRUCTION"];

function RemoveMemberButton({
  projectId,
  memberId,
}: {
  projectId: string;
  memberId: string;
}) {
  const [state, formAction, pending] = useActionState(
    removeMemberAction,
    initialState,
  );

  return (
    <form action={formAction} title={state.error ?? "Gỡ khỏi dự án"}>
      <Input type="hidden" name="projectId" value={projectId} />
      <Input type="hidden" name="memberId" value={memberId} />
      <Button
        type="submit"
        disabled={pending}
        aria-label="Gỡ thành viên"
        variant="dangerGhost" size="icon-sm" className="p-1"
      >
        {pending ? (
          <LoaderCircle className="size-3.5 animate-spin" />
        ) : (
          <X className="size-3.5" />
        )}
      </Button>
    </form>
  );
}

/** PJ-13 / PJ-14 — gán & gỡ thành viên theo 3 mảng. `canManage` từ project.member.manage. */
export function MemberManager({
  projectId,
  members,
  assignableUsers,
  canManage,
}: {
  projectId: string;
  members: Member[];
  assignableUsers: AssignableUser[];
  canManage: boolean;
}) {
  const [adding, setAdding] = useState<MemberArea | null>(null);
  const [state, formAction, pending] = useActionState(
    addMemberAction,
    initialState,
  );

  return (
    <div className="space-y-5">
      {AREAS.map((area) => {
        const areaMembers = members.filter((m) => m.area === area);
        return (
          <Card key={area} className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-h3 font-semibold text-foreground">
                Mảng {MEMBER_AREA_LABEL[area]}
                <span className="ml-2 text-xs font-normal text-muted">
                  {areaMembers.length} người
                </span>
              </h3>
              {canManage && (
                <Button
                  type="button"
                  onClick={() => setAdding(adding === area ? null : area)}
                  variant="outline" size="sm" className="px-2.5 py-1.5"
                >
                  <Plus className="size-3.5" />
                  Thêm
                </Button>
              )}
            </div>

            {canManage && adding === area && (
              <FormCard
                action={formAction}
                variant="filled"
                className="mb-3 flex flex-col gap-2 p-3 sm:flex-row"
              >
                <Input type="hidden" name="projectId" value={projectId} />
                <Input type="hidden" name="area" value={area} />
                <Select
                  name="userId"
                  required
                  defaultValue=""
                  className="flex-1 px-3 py-2"
                >
                  <option value="" disabled>
                    — Chọn nhân viên —
                  </option>
                  {assignableUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.fullName}
                    </option>
                  ))}
                </Select>
                <Button
                  type="submit"
                  disabled={pending}
                  className="px-4 py-2"
                >
                  {pending && <LoaderCircle className="size-4 animate-spin" />}
                  Gán
                </Button>
              </FormCard>
            )}

            {state.error && adding === area && (
              <Alert variant="danger" className="mb-2 flex items-center gap-1.5 text-xs">
                <TriangleAlert className="size-3.5" />
                {state.error}
              </Alert>
            )}

            {areaMembers.length === 0 ? (
              <p className="text-sm text-muted">Chưa có ai trong mảng này.</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {areaMembers.map((m) => (
                  <li key={m.id}>
                    <Badge variant="info" className="gap-2 py-1 pl-1 pr-2">
                    <IconTile tone="primary" shape="circle" size="xs">
                      {initials(m.user.fullName)}
                    </IconTile>
                    <span className="text-sm text-foreground">
                      {m.user.fullName}
                    </span>
                    {canManage && (
                      <RemoveMemberButton projectId={projectId} memberId={m.id} />
                    )}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        );
      })}

      {!canManage && (
        <p className="flex items-center gap-2 text-xs text-muted">
          <UserMinus className="size-3.5" />
          Chỉ Giám đốc / Kế toán / Kinh doanh mới thêm hoặc gỡ thành viên.
        </p>
      )}
    </div>
  );
}
