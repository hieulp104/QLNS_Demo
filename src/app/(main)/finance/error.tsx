"use client";

export default function FinanceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface p-10 text-center">
      <h2 className="text-h2 font-bold text-foreground">
        Không tải được dữ liệu tài chính
      </h2>
      <p className="mt-2 text-sm text-muted">
        Vui lòng thử lại. Nếu lỗi tiếp diễn, hãy liên hệ người quản trị.
      </p>
      {/*
        Bản production giấu thông điệp lỗi, chỉ để lại digest. Không hiện digest
        ra đây thì người quản trị không có cách nào dò ngược về đúng dòng lỗi
        trong log server — phải đoán mò. Digest không lộ dữ liệu nghiệp vụ.
      */}
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
