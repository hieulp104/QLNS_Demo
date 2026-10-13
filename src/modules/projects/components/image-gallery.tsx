"use client";

import { Badge, Button, Card, Dialog, EmptyState, Input } from "@/components/ui";

import { useActionState, useState } from "react";
import { Image as ImageIcon, LoaderCircle, Trash2 } from "lucide-react";
import {
  deleteProjectFileAction,
  type ActionState,
} from "@/modules/projects/projects.actions";
import { FILE_KIND_LABEL } from "@/common/enums";
import type { ProjectFile } from "@/modules/projects/components/file-list";

const initialState: ActionState = { error: null };

function DeleteButton({ fileId }: { fileId: string }) {
  const [, formAction, pending] = useActionState(
    deleteProjectFileAction,
    initialState,
  );
  return (
    <form action={formAction}>
      <Input type="hidden" name="fileId" value={fileId} />
      <Button
        type="submit"
        disabled={pending}
        aria-label="Xóa ảnh"
        variant="danger" size="icon-sm" className="p-1.5"
      >
        {pending ? (
          <LoaderCircle className="size-3.5 animate-spin" />
        ) : (
          <Trash2 className="size-3.5" />
        )}
      </Button>
    </form>
  );
}

/** PJ-17 — gallery ảnh render / thi công, xem phóng to, có chú thích. */
export function ImageGallery({
  images,
  canManage,
}: {
  images: ProjectFile[];
  canManage: boolean;
}) {
  const [zoomed, setZoomed] = useState<ProjectFile | null>(null);

  if (images.length === 0) {
    return (
      <section>
        <h3 className="mb-4 text-h3 font-semibold text-foreground">Hình ảnh dự án</h3>
        <EmptyState
          icon={<ImageIcon />}
          title="Chưa có hình ảnh."
          description="Upload hình ảnh đầu tiên của dự án."
          className="min-h-44 py-8"
        />
      </section>
    );
  }

  return (
    <>
      <h3 className="mb-4 text-h3 font-semibold text-foreground">Hình ảnh dự án</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {images.map((img) => (
          <Card
            as="figure"
            key={img.id}
            className="group relative overflow-hidden"
          >
            <Button
              type="button"
              onClick={() => setZoomed(img)}
              variant="plain" className="block aspect-square w-full"
            >
              {img.url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={img.url}
                  alt={img.caption ?? img.fileName}
                  className="size-full object-cover transition group-hover:scale-105"
                  loading="lazy"
                />
              ) : (
                <span className="flex size-full items-center justify-center px-2 text-center text-xs text-muted">
                  Không tải được ảnh
                </span>
              )}
            </Button>
            {canManage && (
              <div className="absolute right-2 top-2 opacity-0 transition group-hover:opacity-100">
                <DeleteButton fileId={img.id} />
              </div>
            )}
            <figcaption className="truncate px-3 py-2 text-xs text-muted">
              <Badge variant="warning" className="mr-1 px-1.5 py-0.5 text-xs">
                {FILE_KIND_LABEL[img.kind]}
              </Badge>
              {img.caption ?? img.fileName}
            </figcaption>
          </Card>
        ))}
      </div>

      {/* Xem phóng to */}
      {zoomed && (
        <Dialog
          title={zoomed.caption ?? zoomed.fileName}
          onClose={() => setZoomed(null)}
          size="xl"
        >
          <figure className="mx-auto max-w-4xl">
            {zoomed.url ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={zoomed.url}
                alt={zoomed.caption ?? zoomed.fileName}
                className="max-h-[72vh] w-auto object-contain"
              />
            ) : (
              <p className="py-16 text-center text-sm text-muted">
                Không tải được ảnh. Kiểm tra kho file (MinIO).
              </p>
            )}
            {zoomed.caption && (
              <figcaption className="mt-3 text-center text-sm text-muted">
                {zoomed.caption}
              </figcaption>
            )}
          </figure>
        </Dialog>
      )}
    </>
  );
}
