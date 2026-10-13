"use client";

import Image from "next/image";
import { useState } from "react";

import { cn } from "@/lib/utils";

import { BrandMark } from "./brand-mark";
import { BrandLogoBox } from "./brand-logo-box";
import tamnestLogo from "./themes/tamnest/assets/LOGO.svg";

export function BrandLogo({
  compact = false,
  descriptor,
  inverse = false,
  sidebar = false,
  className,
}: {
  compact?: boolean;
  descriptor?: string;
  inverse?: boolean;
  sidebar?: boolean;
  size?: "sm" | "md";
  className?: string;
}) {
  const [hasImageError, setHasImageError] = useState(false);

  const mark = hasImageError ? (
    <BrandMark
      size={sidebar || compact ? "sm" : "md"}
      tone={inverse ? "inverse" : "brand"}
      className={sidebar ? "size-6 rounded-none border-0 bg-transparent shadow-none" : undefined}
    />
  ) : (
    <Image
      src={tamnestLogo}
      alt={compact ? "NA" : ""}
      className={cn(
        "shrink-0 object-contain",
        sidebar ? "size-6" : compact ? "size-7" : "size-8",
      )}
      onError={() => setHasImageError(true)}
      priority
    />
  );

  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-center transition-[gap] duration-200",
        sidebar && compact ? "gap-0" : "gap-2.5",
        className,
      )}
    >
      {sidebar ? (
        <BrandLogoBox>
          {mark}
        </BrandLogoBox>
      ) : (
        mark
      )}
      {(!compact || sidebar) && (
        <span
          aria-hidden={sidebar && compact ? true : undefined}
          className={cn(
            "min-w-0 overflow-hidden leading-tight",
            sidebar &&
              "transition-[width,opacity] duration-200",
            sidebar && compact ? "w-0 opacity-0" : sidebar ? "w-[108px] opacity-100" : "",
          )}
        >
          <span
            className={cn(
              "block truncate text-sm font-bold",
              inverse ? "text-on-primary" : "text-foreground",
            )}
          >
            NA
          </span>
          {descriptor && (
            <span
              className={cn(
                "block truncate text-xs font-semibold uppercase tracking-wider",
                inverse ? "text-on-primary/75" : "text-muted",
              )}
            >
              {descriptor}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
