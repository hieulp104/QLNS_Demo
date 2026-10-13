import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const avatarVariants = cva(
  "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-primary/20 bg-primary/10 font-semibold text-primary shadow-sm",
  {
    variants: {
      size: {
        xs: "size-6 text-xs",
        sm: "size-8 text-xs",
        md: "size-10 text-sm",
        lg: "size-14 text-base",
        xl: "size-20 text-h3",
      },
      muted: { true: "grayscale" },
    },
    defaultVariants: { size: "md" },
  },
);

export function Avatar({
  src,
  alt = "",
  fallback,
  size,
  muted,
  className,
}: {
  src?: string | null;
  alt?: string;
  fallback: React.ReactNode;
  className?: string;
} & VariantProps<typeof avatarVariants>) {
  return (
    <span className={cn(avatarVariants({ size, muted }), className)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} className="size-full object-cover" />
      ) : (
        fallback
      )}
    </span>
  );
}
