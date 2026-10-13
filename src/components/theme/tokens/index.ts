import { colorTokens } from "./colors";
import { motionTokens } from "./motion";
import { radiusTokens } from "./radius";
import { shadowTokens } from "./shadow";
import { spacingTokens } from "./spacing";
import { typographyTokens } from "./typography";

export const themeTokens = {
  colors: colorTokens,
  spacing: spacingTokens,
  radius: radiusTokens,
  shadow: shadowTokens,
  typography: typographyTokens,
  motion: motionTokens,
} as const;

export type ThemeTokenSet = typeof themeTokens;

export {
  colorTokens,
  motionTokens,
  radiusTokens,
  shadowTokens,
  spacingTokens,
  typographyTokens,
};
