"use client";

import { useRef, useState } from "react";
import { LoaderCircle, Upload } from "lucide-react";

import { Button } from "@/components/ui/actions";
import { Label, Select } from "@/components/ui/forms";
import { cn } from "@/lib/utils";

export type DocumentUploadOption = {
  value: string;
  label: string;
  accept?: string;
};

type DocumentUploadPatternProps = {
  options: readonly DocumentUploadOption[];
  value: string;
  onChange: (value: string) => void;
  onUpload: (file: File | null) => boolean | void | Promise<boolean | void>;
  disabled?: boolean;
  loading?: boolean;
  placeholder?: string;
  projectFileLayout?: boolean;
};

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function DocumentUploadPattern({
  options,
  value,
  onChange,
  onUpload,
  disabled = false,
  loading = false,
  placeholder = "Chọn loại tài liệu",
  projectFileLayout = false,
}: DocumentUploadPatternProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const accept = options.find((option) => option.value === value)?.accept;
  const unavailable = disabled || loading;

  async function handleUpload() {
    const shouldReset = await onUpload(selectedFile);
    if (shouldReset) {
      setSelectedFile(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div
      className={cn(
        "grid gap-3 sm:items-end",
        projectFileLayout
          ? "sm:grid-cols-[240px_minmax(0,1fr)]"
          : "sm:grid-cols-[250px_minmax(0,1fr)]",
      )}
    >
      <Label className="min-w-0 space-y-2">
        <span className="block text-sm font-medium leading-none text-note">
          Loại tài liệu
        </span>
        <Select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={unavailable}
        >
          {!value && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </Label>

      <div className="min-w-0 space-y-2">
        <span className="block text-sm font-medium leading-none text-note">
          Tệp đính kèm
        </span>
        <div className="flex min-w-0 items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept={accept}
            disabled={unavailable}
            tabIndex={-1}
            aria-hidden="true"
            className="hidden"
            onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
          />
          <Button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={unavailable}
            variant="secondary"
            className="shrink-0 font-semibold"
          >
            Choose File
          </Button>
          <div className="flex min-h-10 min-w-0 flex-1 items-center text-sm" title={selectedFile?.name}>
            {selectedFile ? (
              <span className="truncate font-medium text-foreground">
                {selectedFile.name} · {formatFileSize(selectedFile.size)}
              </span>
            ) : (
              <span className="truncate text-text-secondary">Chưa chọn tệp</span>
            )}
          </div>
          <Button
            type="button"
            onClick={handleUpload}
            disabled={unavailable}
            variant="primary"
            className="ml-2 shrink-0"
          >
            {loading ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Upload className="size-4" />
            )}
            {loading ? "Đang xử lý..." : "Tải lên"}
          </Button>
        </div>
      </div>
    </div>
  );
}
