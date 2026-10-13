"use client";

import { Input, Select, Label } from "@/components/ui";

import { useRouter, useSearchParams } from "next/navigation";

/** SY-02 — bộ lọc nhật ký: người thao tác · entity · khoảng ngày, qua query param. */
export function AuditFilter({
  actors,
  entities,
}: {
  actors: { id: string; fullName: string }[];
  entities: { value: string; label: string }[];
}) {
  const router = useRouter();
  const params = useSearchParams();

  function set(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page"); // đổi bộ lọc thì về trang 1
    const qs = next.toString();
    router.push(qs ? `/audit-log?${qs}` : "/audit-log");
  }

  return (
    <div className="mb-4 flex flex-col gap-2.5 lg:flex-row lg:flex-wrap lg:items-center">
      <Select
        defaultValue={params.get("actorId") ?? ""}
        onChange={(e) => set("actorId", e.target.value)}
        aria-label="Lọc theo người thao tác"
      >
        <option value="">Mọi người</option>
        {actors.map((a) => (
          <option key={a.id} value={a.id}>
            {a.fullName}
          </option>
        ))}
      </Select>

      <Select
        defaultValue={params.get("entity") ?? ""}
        onChange={(e) => set("entity", e.target.value)}
        aria-label="Lọc theo đối tượng"
      >
        <option value="">Mọi đối tượng</option>
        {entities.map((entity) => (
          <option key={entity.value} value={entity.value}>
            {entity.label}
          </option>
        ))}
      </Select>

      <Label className="flex items-center gap-2 text-sm text-muted">
        Từ
        <Input
          type="date"
          defaultValue={params.get("from") ?? ""}
          onChange={(e) => set("from", e.target.value)}
        />
      </Label>
      <Label className="flex items-center gap-2 text-sm text-muted">
        đến
        <Input
          type="date"
          defaultValue={params.get("to") ?? ""}
          onChange={(e) => set("to", e.target.value)}
        />
      </Label>
    </div>
  );
}
