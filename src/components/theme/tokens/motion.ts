export const motionTokens = {
  duration: {
    default: "var(--default-transition-duration)",
    layout: "var(--theme-motion-duration-layout)",
  },
  easing: {
    standard: "var(--default-transition-timing-function)",
  },
  animation: {
    spin: "var(--animate-spin)",
    pulse: "var(--animate-pulse)",
  },
} as const;
