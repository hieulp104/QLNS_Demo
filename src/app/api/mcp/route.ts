/**
 * POST /api/mcp — MCP server cho Claude bên ngoài (xem `modules/ai/ai.mcp.ts`).
 *
 * Ngoại lệ so với quy ước "Route Handler chỉ cho Excel / presigned URL / health
 * check": giao thức MCP bắt buộc là một endpoint HTTP, không thể là Server Action.
 * Không đi qua `proxy.ts` (không có cookie phiên) — tự xác thực bằng bearer token.
 */

import { isMcpAuthorized, isMcpEnabled, methodNotAllowed, respondMcp } from "@/modules/ai/ai.mcp";

export async function POST(request: Request) {
  if (!isMcpEnabled()) return new Response("Not Found", { status: 404 });
  return respondMcp(request, isMcpAuthorized(request.headers.get("authorization")));
}

export const GET = methodNotAllowed;
export const DELETE = methodNotAllowed;
