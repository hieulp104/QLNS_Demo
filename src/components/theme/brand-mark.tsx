"use client";

import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

import { useTheme } from "./hooks";

const brandMarkVariants = cva(
  "inline-flex shrink-0 items-center justify-center overflow-hidden font-bold",
  {
    variants: {
      size: {
        sm: "size-7 rounded-md text-xs",
        md: "size-9 rounded-brand-mark text-sm",
        lg: "size-11 rounded-control text-base",
      },
      tone: {
        brand:
          "border border-primary/15 bg-primary text-on-primary shadow-sm",
        inverse:
          "border border-on-primary/20 bg-on-primary/15 text-on-primary shadow-sm",
      },
    },
    defaultVariants: { size: "md", tone: "brand" },
  },
);

export function BrandMark({
  className,
  size,
  tone,
}: {
  className?: string;
} & VariantProps<typeof brandMarkVariants>) {
  const { theme } = useTheme();
  const icon = theme.assets.icon;

  return (
    <span
      role="img"
      aria-label="NA"
      className={cn(brandMarkVariants({ size, tone }), className)}
    >
      {icon ? (
        <span
          aria-hidden="true"
          className="size-[64%] bg-current"
          style={{
            maskImage: `url("${icon}")`,
            maskPosition: "center",
            maskRepeat: "no-repeat",
            maskSize: "contain",
            WebkitMaskImage: `url("${icon}")`,
            WebkitMaskPosition: "center",
            WebkitMaskRepeat: "no-repeat",
            WebkitMaskSize: "contain",
          }}
        />
      ) : (
        <span aria-hidden="true">N</span>
      )}
    </span>
  );
}
