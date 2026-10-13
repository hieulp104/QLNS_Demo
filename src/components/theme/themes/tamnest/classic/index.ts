import { themeTokens } from "../../../tokens";
import { tamnestBrandAssetsByMode } from "../assets/brand";
import type {
  ThemeDefinition,
  ThemeVariantDefinition,
} from "../../../types";

export const tamnestClassicLightTheme = {
  name: "tamnest-classic-light",
  label: "NA Classic Light",
  attribute: "tamnest-classic-light",
  family: "tamnest",
  variant: "classic",
  mode: "light",
  assets: tamnestBrandAssetsByMode.light,
  tokens: themeTokens,
} as const satisfies ThemeDefinition<
  "tamnest-classic-light",
  "tamnest",
  "classic",
  "light"
>;

export const tamnestClassicDarkTheme = {
  name: "tamnest-classic-dark",
  label: "NA Classic Dark",
  attribute: "tamnest-classic-dark",
  family: "tamnest",
  variant: "classic",
  mode: "dark",
  assets: tamnestBrandAssetsByMode.dark,
  tokens: themeTokens,
} as const satisfies ThemeDefinition<
  "tamnest-classic-dark",
  "tamnest",
  "classic",
  "dark"
>;

export const tamnestClassicVariant = {
  id: "classic",
  label: "NA Classic",
  description:
    "Ngôn ngữ thiết kế hiện đại, tối giản và tự nhiên của NA.",
  modes: {
    light: tamnestClassicLightTheme,
    dark: tamnestClassicDarkTheme,
  },
} as const satisfies ThemeVariantDefinition<
  "classic",
  {
    light: typeof tamnestClassicLightTheme;
    dark: typeof tamnestClassicDarkTheme;
  }
>;
