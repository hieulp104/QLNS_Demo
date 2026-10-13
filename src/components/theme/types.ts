import type { ThemeTokenSet } from "./tokens";

export const COLOR_MODES = ["light", "dark"] as const;

export type ColorMode = (typeof COLOR_MODES)[number];

export type ThemeAssets = {
  logo: string | null;
  logoInverse: string | null;
  icon: string | null;
  favicon: string | null;
  illustration: string | null;
};

export type ThemeDefinition<
  Name extends string = string,
  Family extends string = string,
  Variant extends string = string,
  Mode extends ColorMode = ColorMode,
> = {
  name: Name;
  label: string;
  attribute: string;
  family: Family;
  variant: Variant;
  mode: Mode;
  assets: ThemeAssets;
  tokens: ThemeTokenSet;
};

export type ThemeVariantDefinition<
  Id extends string = string,
  Modes extends Record<ColorMode, ThemeDefinition> = Record<
    ColorMode,
    ThemeDefinition
  >,
> = {
  id: Id;
  label: string;
  description: string;
  modes: Modes;
};

export type ThemeManifest<
  Variants extends Record<string, ThemeVariantDefinition> = Record<
    string,
    ThemeVariantDefinition
  >,
> = {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  assets: ThemeAssets;
  variants: Variants;
};

export type ThemeContextValue = {
  family: string;
  variant: string;
  mode: ColorMode;
  theme: ThemeDefinition;
  setMode: (mode: ColorMode) => void;
};
