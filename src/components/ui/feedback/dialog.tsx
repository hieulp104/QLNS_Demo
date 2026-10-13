"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";

import { Button } from "@/components/ui/actions";
import { cn } from "@/lib/utils";

const panelVariants = cva(
  "dialog-panel max-h-[92vh] w-full overflow-y-auto rounded-card border bg-surface-raised shadow-dialog",
  {
    variants: {
      variant: {
        default: "border-line",
        danger: "border-danger/20",
        fullscreen: "h-[calc(100vh-2rem)] max-h-none max-w-none",
      },
      size: {
        sm: "max-w-md",
        md: "max-w-2xl",
        lg: "max-w-3xl",
        xl: "max-w-5xl",
      },
    },
    defaultVariants: { variant: "default", size: "md" },
  },
);

export function Dialog({
  title,
  children,
  footer,
  onClose,
  variant,
  size,
  stickyHeader = true,
  titleClassName,
}: {
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  stickyHeader?: boolean;
  titleClassName?: string;
} & VariantProps<typeof panelVariants>) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      role="presentation"
      className="dialog-backdrop fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4 backdrop-blur-[1px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
        className={panelVariants({ variant, size })}
      >
        <header
          className={cn(
            "z-10 flex items-center justify-between border-b border-line bg-surface-raised px-5 py-4 sm:px-6",
            stickyHeader && "sticky top-0",
          )}
        >
          <h2
            className={cn(
              "text-h2 font-bold tracking-tight text-foreground",
              titleClassName,
            )}
          >
            {title}
          </h2>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="Đóng"
          >
            <X className="size-4" />
          </Button>
        </header>
        <div className="p-5 sm:p-6">{children}</div>
        {footer && (
          <footer className="border-t border-line px-5 py-4 sm:px-6">
            {footer}
          </footer>
        )}
      </section>
    </div>
  );
}
