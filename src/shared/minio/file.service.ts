/**
 * Cầu nối giữa MinIO (bytes) và bảng `FileAsset` (metadata).
 *
 * Luồng upload 2 pha để file lớn (3D/CAD) không đi vòng qua server:
 *   1. Client xin presigned PUT URL  → `createUploadTicket()`
 *   2. Client PUT thẳng file lên MinIO bằng URL đó
 *   3. Client báo xong             → `registerFileAsset()` tạo dòng FileAsset
 *
 * Ảnh nhỏ / avatar có thể đi đường server: `uploadAndRegister()`.
 */

import type { Prisma } from "@/generated/prisma/client";
import type { FileKind } from "@/generated/prisma/enums";
import { prisma } from "@/shared/prisma/prisma.service";
import {
  buildObjectKey,
  objectExists,
  presignedDownloadUrl,
  presignedUploadUrl,
  putObject,
  removeObject,
} from "@/lib/minio";

/** Giới hạn kích thước theo loại file (byte). Chặn upload quá cỡ ngay từ ticket. */
const MAX_SIZE: Record<string, number> = {
  image: 15 * 1024 * 1024, // ảnh render / thi công / avatar
  document: 50 * 1024 * 1024, // hợp đồng / báo giá / BOQ (PDF, Office)
  model: 200 * 1024 * 1024, // 3D / CAD nặng (FS-03: file 3D có thể tới 200MB)
};

type KindGroup = "image" | "document" | "model";

function groupOf(kind: FileKind): KindGroup {
  if (kind === "RENDER_IMAGE" || kind === "SITE_PHOTO" || kind === "AVATAR") {
    return "image";
  }
  if (kind === "MODEL_3D" || kind === "CAD_DRAWING") return "model";
  return "document";
}

/** Nhóm loại để áp hạn mức. */
function sizeLimitFor(kind: FileKind): number {
  return MAX_SIZE[groupOf(kind)];
}

/**
 * FS-03 — đuôi file cho phép theo nhóm. Validate bằng ĐUÔI thay vì chỉ MIME:
 * trình duyệt gửi MIME của file CAD/3D rất tùy hứng (thường là octet-stream),
 * còn MIME thì client tự khai nên không tin được một mình.
 */
const ALLOWED_EXT: Record<KindGroup, string[]> = {
  image: ["jpg", "jpeg", "png", "webp", "gif", "heic"],
  document: ["pdf", "doc", "docx", "xls", "xlsx", "csv", "txt", "zip", "rar", "jpg", "jpeg", "png"],
  model: ["skp", "3ds", "max", "blend", "fbx", "obj", "glb", "gltf", "dwg", "dxf", "step", "stp", "iges", "zip", "rar"],
};

/** MIME hợp lệ theo nhóm — kiểm bổ sung khi client có khai. */
const ALLOWED_MIME_PREFIX: Record<KindGroup, string[]> = {
  image: ["image/"],
  document: [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument",
    "application/vnd.ms-excel",
    "text/",
    "application/zip",
    "application/x-rar",
    "image/",
    "application/octet-stream",
  ],
  model: ["application/", "model/", "image/vnd.dwg"],
};

export type FileValidation =
  | { ok: true }
  | { ok: false; reason: "BAD_EXTENSION" | "BAD_MIME" };

/** FS-03 — kiểm định dạng trước khi cấp vé upload và trước khi ghi FileAsset. */
export function validateFileType(
  kind: FileKind,
  fileName: string,
  mimeType?: string,
): FileValidation {
  const group = groupOf(kind);
  const ext = fileName.slice(fileName.lastIndexOf(".") + 1).toLowerCase();
  if (!ext || !ALLOWED_EXT[group].includes(ext)) {
    return { ok: false, reason: "BAD_EXTENSION" };
  }
  if (mimeType && !ALLOWED_MIME_PREFIX[group].some((p) => mimeType.startsWith(p))) {
    return { ok: false, reason: "BAD_MIME" };
  }
  return { ok: true };
}

export type UploadTicket =
  | { ok: true; uploadUrl: string; objectKey: string; maxSizeBytes: number }
  | { ok: false; reason: "BAD_EXTENSION" | "BAD_MIME" };

/**
 * Pha 1 — cấp vé upload. Chưa tạo FileAsset (client có thể bỏ giữa chừng).
 * `prefix` gom file theo nghiệp vụ, ví dụ `projects/<id>` hoặc `avatars`.
 * FS-03: từ chối cấp vé nếu định dạng không hợp lệ với loại file.
 */
export async function createUploadTicket(params: {
  prefix: string;
  fileName: string;
  kind: FileKind;
  mimeType?: string;
}): Promise<UploadTicket> {
  const valid = validateFileType(params.kind, params.fileName, params.mimeType);
  if (!valid.ok) return valid;

  const objectKey = buildObjectKey(params.prefix, params.fileName);
  const uploadUrl = await presignedUploadUrl(objectKey);
  return { ok: true, uploadUrl, objectKey, maxSizeBytes: sizeLimitFor(params.kind) };
}

/** Các FK đa hình của FileAsset — chỉ điền đúng một cái cho mỗi file. */
export type FileOwner = {
  projectId?: string;
  commentId?: string;
  contractId?: string;
  materialId?: string;
  transactionId?: string;
};

export type RegisterFileInput = FileOwner & {
  objectKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  kind: FileKind;
  caption?: string | null;
  uploadedById: string;
};

/**
 * Pha 3 — ghi FileAsset sau khi client đã PUT xong.
 * Xác minh object CÓ THẬT trên MinIO trước khi tạo dòng, tránh bản ghi trỏ vào
 * file không tồn tại (client báo xong nhưng thực ra chưa upload).
 *
 * Nhận `tx` để ghi cùng transaction với nghiệp vụ chủ (comment, contract...).
 */
export async function registerFileAsset(
  tx: Prisma.TransactionClient,
  input: RegisterFileInput,
): Promise<
  | { ok: true; id: string }
  | { ok: false; reason: "NOT_UPLOADED" | "BAD_EXTENSION" | "BAD_MIME" }
> {
  // FS-03 — kiểm lại lần nữa ở pha ghi: client có thể bỏ qua pha xin vé.
  const valid = validateFileType(input.kind, input.fileName, input.mimeType);
  if (!valid.ok) return valid;

  if (!(await objectExists(input.objectKey))) {
    return { ok: false, reason: "NOT_UPLOADED" };
  }

  const asset = await tx.fileAsset.create({
    data: {
      objectKey: input.objectKey,
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: BigInt(input.sizeBytes),
      kind: input.kind,
      caption: input.caption ?? null,
      uploadedById: input.uploadedById,
      projectId: input.projectId ?? null,
      commentId: input.commentId ?? null,
      contractId: input.contractId ?? null,
      materialId: input.materialId ?? null,
      transactionId: input.transactionId ?? null,
    },
    select: { id: true },
  });

  return { ok: true, id: asset.id };
}

/**
 * Upload đường server (buffer có sẵn) + tạo FileAsset trong một bước.
 * Dùng cho avatar / ảnh nhỏ. File lớn nên dùng luồng 2 pha ở trên.
 */
export async function uploadAndRegister(
  tx: Prisma.TransactionClient,
  input: Omit<RegisterFileInput, "objectKey" | "sizeBytes"> & {
    prefix: string;
    body: Buffer;
  },
): Promise<{ id: string; objectKey: string }> {
  const objectKey = buildObjectKey(input.prefix, input.fileName);
  await putObject(objectKey, input.body, input.mimeType);

  const asset = await tx.fileAsset.create({
    data: {
      objectKey,
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: BigInt(input.body.length),
      kind: input.kind,
      caption: input.caption ?? null,
      uploadedById: input.uploadedById,
      projectId: input.projectId ?? null,
      commentId: input.commentId ?? null,
      contractId: input.contractId ?? null,
      materialId: input.materialId ?? null,
      transactionId: input.transactionId ?? null,
    },
    select: { id: true },
  });

  return { id: asset.id, objectKey };
}

/**
 * Gắn URL tải có chữ ký vào danh sách file để client hiển thị/tải.
 *
 * Ký URL là lời gọi mạng tới MinIO (SDK phải hỏi region của bucket), nên MinIO
 * chết hoặc một object hỏng sẽ ném lỗi. Trước đây lỗi đó nổi lên tận Server
 * Component và giết cả trang — mất luôn danh sách giao dịch/vật tư chỉ vì một
 * chứng từ không ký được URL. Nay nuốt lỗi theo từng file và trả `url: null`;
 * UI tự tắt nút tải cho đúng file đó, phần còn lại của trang vẫn hiển thị.
 */
export async function withDownloadUrls<
  T extends { objectKey: string },
>(files: T[]): Promise<(T & { url: string | null })[]> {
  return Promise.all(
    files.map(async (f) => {
      try {
        return { ...f, url: await presignedDownloadUrl(f.objectKey) };
      } catch (error) {
        console.error("[minio] không ký được URL tải", f.objectKey, error);
        return { ...f, url: null };
      }
    }),
  );
}

/**
 * FS-04 — xóa mềm FileAsset: chỉ đánh dấu `deletedAt`, GIỮ NGUYÊN object trên
 * MinIO (đúng brief — dữ liệu công trình không mất). File vào "thùng rác",
 * khôi phục được qua UI bằng `restoreFile()`; dọn hẳn khỏi ổ đĩa sau
 * TRASH_RETENTION_DAYS ngày bằng `npm run files:cleanup`.
 */
export async function softDeleteFile(id: string): Promise<void> {
  const file = await prisma.fileAsset.findUnique({
    where: { id },
    select: { id: true, deletedAt: true },
  });
  if (!file || file.deletedAt) return;

  await prisma.fileAsset.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

/**
 * Số ngày file nằm trong thùng rác trước khi script bảo trì xóa hẳn khỏi MinIO.
 * Đã chốt với khách: 90 ngày — đủ một quý để phát hiện xóa nhầm.
 */
export const TRASH_RETENTION_DAYS = 90;

/** Còn bao nhiêu ngày nữa thì file bị dọn hẳn (âm = đã quá hạn, chờ script chạy). */
export function daysUntilPurge(deletedAt: Date): number {
  const elapsedMs = Date.now() - deletedAt.getTime();
  return TRASH_RETENTION_DAYS - Math.floor(elapsedMs / 86_400_000);
}

/** Danh sách file trong thùng rác của một dự án (mới xóa lên trước). */
export async function listTrashedFiles(projectId: string) {
  const files = await prisma.fileAsset.findMany({
    where: { projectId, deletedAt: { not: null } },
    orderBy: { deletedAt: "desc" },
    select: {
      id: true,
      fileName: true,
      objectKey: true,
      mimeType: true,
      sizeBytes: true,
      kind: true,
      caption: true,
      createdAt: true,
      deletedAt: true,
      uploadedBy: { select: { fullName: true } },
    },
  });

  return files.map((f) => ({ ...f, sizeBytes: String(f.sizeBytes) }));
}

/**
 * Khôi phục file khỏi thùng rác — gỡ cờ `deletedAt`. Object trên MinIO chưa bao
 * giờ bị đụng tới nên chỉ cần gỡ cờ là file dùng lại được ngay.
 *
 * Trả `false` khi file đã bị script dọn xóa hẳn (bản ghi không còn) — lúc đó
 * bytes đã mất thật, không cứu được.
 */
export async function restoreFile(id: string): Promise<boolean> {
  const file = await prisma.fileAsset.findUnique({
    where: { id },
    select: { id: true, deletedAt: true },
  });
  if (!file || !file.deletedAt) return false;

  await prisma.fileAsset.update({
    where: { id },
    data: { deletedAt: null },
  });
  return true;
}

export type PurgeResult = {
  purged: number;
  freedBytes: number;
  failed: { objectKey: string; error: string }[];
};

/**
 * Dọn hẳn file đã nằm trong thùng rác quá hạn: xóa bytes trên MinIO RỒI mới xóa
 * bản ghi. Thứ tự này quan trọng — nếu xóa bản ghi trước mà MinIO lỗi thì object
 * thành mồ côi, không còn gì trỏ tới để dọn ở lần chạy sau.
 *
 * `olderThanDays` mặc định TRASH_RETENTION_DAYS; truyền số khác chỉ để test.
 * Đây là thao tác KHÔNG hoàn tác được — chỉ gọi từ script bảo trì có chủ đích.
 */
export async function purgeTrashedFiles(
  olderThanDays: number = TRASH_RETENTION_DAYS,
): Promise<PurgeResult> {
  const cutoff = new Date(Date.now() - olderThanDays * 86_400_000);
  const expired = await prisma.fileAsset.findMany({
    where: { deletedAt: { not: null, lt: cutoff } },
    select: { id: true, objectKey: true, sizeBytes: true, fileName: true },
  });

  const result: PurgeResult = { purged: 0, freedBytes: 0, failed: [] };

  for (const file of expired) {
    try {
      await removeObject(file.objectKey);
    } catch (error) {
      // Giữ nguyên bản ghi để lần chạy sau thử lại, không xóa mù.
      result.failed.push({
        objectKey: file.objectKey,
        error: error instanceof Error ? error.message : String(error),
      });
      continue;
    }

    await prisma.fileAsset.delete({ where: { id: file.id } });
    result.purged += 1;
    result.freedBytes += Number(file.sizeBytes);
  }

  return result;
}
