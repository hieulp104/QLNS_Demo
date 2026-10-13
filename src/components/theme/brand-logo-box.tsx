"use client";

import { cn } from "@/lib/utils";

import { useTheme } from "./hooks";

export function BrandLogoBox({
  children,
  size = "sidebar",
  className,
}: {
  children: React.ReactNode;
  size?: "sidebar" | "hero";
  className?: string;
}) {
  const { mode } = useTheme();

  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center border bg-[#fffefa]",
        size === "hero" ? "size-12 rounded-[14px]" : "size-9 rounded-[10px]",
        mode === "dark"
          ? "border-white/10 shadow-[0_6px_18px_rgba(0,0,0,0.35)]"
          : "border-[#e2dcd1] shadow-[0_2px_8px_rgba(0,0,0,0.05)]",
        className,
      )}
    >
      {children}
    </span>
  );
}
