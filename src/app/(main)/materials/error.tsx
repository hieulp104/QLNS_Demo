"use client";

export default function MaterialsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface p-10 text-center">
      <h2 className="text-h2 font-bold text-foreground">
        Không tải được dữ liệu vật tư
      </h2>
      <p className="mt-2 text-sm text-muted">
        Vui lòng thử lại. Nếu lỗi tiếp diễn, hãy liên hệ người quản trị.
      </p>
      {/* Xem giải thích ở finance/error.tsx: digest là đầu mối duy nhất dò về log server. */}
      {error.digest && (
        <p className="mt-3 font-mono text-xs text-note">
          Mã lỗi: {error.digest}
        </p>
      )}
      <button
        type="button"
        onClick={reset}
        className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary transition hover:bg-primary-hover"
      >
        Thử lại
      </button>
    </div>
  );
}
