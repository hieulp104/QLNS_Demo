import type { Metadata } from "next";

import { ForbiddenWorkspace } from "@/modules/auth/components/forbidden-workspace";

export const metadata: Metadata = { title: "Không có quyền truy cập" };

export default function ForbiddenPage() {
  return <ForbiddenWorkspace />;
}
