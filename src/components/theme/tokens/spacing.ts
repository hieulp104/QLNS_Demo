export const spacingTokens = {
  unit: "var(--spacing)",
  fieldGap: "calc(var(--spacing) * 1.5)",
  controlGap: "calc(var(--spacing) * 2)",
  cardPadding: "calc(var(--spacing) * 5)",
  sectionGap: "calc(var(--spacing) * 6)",
  controlHeight: {
    xs: "calc(var(--spacing) * 7)",
    sm: "calc(var(--spacing) * 8)",
    md: "calc(var(--spacing) * 10)",
    lg: "calc(var(--spacing) * 11)",
    xl: "calc(var(--spacing) * 12)",
  },
} as const;
