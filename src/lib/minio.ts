/**
 * Hạ tầng lưu file trên MinIO (S3-compatible).
 *
 * Dùng cho: file dự án (3D/CAD/hợp đồng/báo giá/BOQ), ảnh render & thi công,
 * avatar nhân sự. Bản ghi metadata nằm ở bảng `FileAsset`; đây chỉ lo phần
 * lưu bytes và cấp URL có chữ ký.
 *
 * ⚠ Chỉ import ở server (Server Action / Route Handler). Client không được chạm
 * access key. Presigned URL là cách duy nhất để trình duyệt đọc/ghi file.
 */

import { Client } from "minio";
import { randomUUID } from "node:crypto";

const BUCKET = process.env.MINIO_BUCKET ?? "na-files";

// Giữ 1 client duy nhất qua hot-reload của Next dev, giống prisma.service.
const globalForMinio = globalThis as unknown as { minio?: Client };

function createClient(): Client {
  return new Client({
    endPoint: process.env.MINIO_ENDPOINT ?? "localhost",
    port: Number(process.env.MINIO_PORT ?? 9100),
    useSSL: process.env.MINIO_USE_SSL === "true",
    accessKey: process.env.MINIO_ACCESS_KEY ?? "",
    secretKey: process.env.MINIO_SECRET_KEY ?? "",
  });
}

export const minio = globalForMinio.minio ?? createClient();
if (process.env.NODE_ENV !== "production") globalForMinio.minio = minio;

/**
 * Tạo bucket nếu chưa có. Gọi một lần lúc khởi tạo hoặc trước lần upload đầu.
 * MinIO không tự tạo bucket khi putObject.
 */
export async function ensureBucket(): Promise<void> {
  const exists = await minio.bucketExists(BUCKET).catch(() => false);
  if (!exists) await minio.makeBucket(BUCKET);
}

/** Bỏ dấu và ký tự lạ khỏi tên file để ghép vào object key cho an toàn. */
function slugifyFileName(name: string): string {
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
  const cleanBase = base
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // bỏ dấu thanh tiếng Việt
    .replace(/đ/gi, "d")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .toLowerCase();
  const safeBase = cleanBase || "file";
  return ext ? `${safeBase}.${ext}` : safeBase;
}

/**
 * Sinh object key duy nhất theo prefix nghiệp vụ.
 * VD: buildObjectKey("projects/abc123", "Bản vẽ.dwg") → "projects/abc123/<uuid>-ban-ve.dwg"
 * UUID đứng trước để hai file trùng tên không đè nhau.
 */
export function buildObjectKey(prefix: string, originalName: string): string {
  const clean = prefix.replace(/^\/+|\/+$/g, "");
  return `${clean}/${randomUUID()}-${slugifyFileName(originalName)}`;
}

/** Thời hạn presigned URL: 15 phút theo FS-02 của brief. */
const PUT_URL_TTL = 15 * 60;
const GET_URL_TTL = 15 * 60;

/**
 * URL có chữ ký để client PUT thẳng file lên MinIO, không đi vòng qua server.
 * Trả kèm object key để lưu vào FileAsset sau khi client báo upload xong.
 */
export async function presignedUploadUrl(
  objectKey: string,
  ttlSeconds = PUT_URL_TTL,
): Promise<string> {
  await ensureBucket();
  return minio.presignedPutObject(BUCKET, objectKey, ttlSeconds);
}

/** URL có chữ ký để client GET file (xem ảnh, tải tài liệu). */
export async function presignedDownloadUrl(
  objectKey: string,
  ttlSeconds = GET_URL_TTL,
): Promise<string> {
  return minio.presignedGetObject(BUCKET, objectKey, ttlSeconds);
}

/**
 * Upload trực tiếp từ server (dùng khi Server Action nhận sẵn buffer, ví dụ
 * avatar). File lớn (3D/CAD) nên đẩy qua presigned URL để không nghẽn tiến trình.
 */
export async function putObject(
  objectKey: string,
  body: Buffer,
  mimeType: string,
): Promise<void> {
  await ensureBucket();
  await minio.putObject(BUCKET, objectKey, body, body.length, {
    "Content-Type": mimeType,
  });
}

/** Xóa object. Dùng khi soft-delete file hoặc dọn file mồ côi lúc rollback. */
export async function removeObject(objectKey: string): Promise<void> {
  await minio.removeObject(BUCKET, objectKey);
}

/** Kiểm tra object có thật trên MinIO không — xác nhận client đã upload xong. */
export async function objectExists(objectKey: string): Promise<boolean> {
  try {
    await minio.statObject(BUCKET, objectKey);
    return true;
  } catch {
    return false;
  }
}
