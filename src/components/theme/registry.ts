import { tamnestThemeManifest } from "./themes/tamnest/manifest";
import type {
  ColorMode,
  ThemeDefinition,
  ThemeManifest,
} from "./types";

type RegistryFromManifests<Manifests extends readonly ThemeManifest[]> = {
  [Manifest in Manifests[number] as Manifest["id"]]: {
    [Variant in keyof Manifest["variants"]]: Manifest["variants"][Variant]["modes"];
  };
};

function registryFromManifests<const Manifests extends readonly ThemeManifest[]>(
  manifests: Manifests,
) {
  return Object.fromEntries(
    manifests.map((manifest) => [
      manifest.id,
      Object.fromEntries(
        Object.entries(manifest.variants).map(([variantId, variant]) => [
          variantId,
          variant.modes,
        ]),
      ),
    ]),
  ) as RegistryFromManifests<Manifests>;
}

export const themeRegistry = registryFromManifests([
  tamnestThemeManifest,
] as const);

type ThemeRegistry = typeof themeRegistry;

export type ThemeFamily = keyof ThemeRegistry & string;
export type ThemeVariant<Family extends ThemeFamily = ThemeFamily> =
  Family extends ThemeFamily ? keyof ThemeRegistry[Family] & string : never;
export type ThemeMode = ColorMode;

export type ThemeSelection = {
  family: ThemeFamily;
  variant: ThemeVariant;
  mode: ThemeMode;
};

export const ACTIVE_THEME_FAMILY: ThemeFamily = "tamnest";
export const ACTIVE_THEME_VARIANT: ThemeVariant = "classic";
export const DEFAULT_THEME_MODE: ThemeMode = "light";

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === "light" || value === "dark";
}

export function getTheme({ family, variant, mode }: ThemeSelection) {
  const familyRegistry = themeRegistry[family] as unknown as Record<
    string,
    Record<ColorMode, ThemeDefinition>
  >;
  const variantRegistry = familyRegistry[variant];
  const theme = variantRegistry?.[mode];

  if (!theme) {
    throw new Error(`Không tìm thấy theme ${family}/${variant}/${mode}.`);
  }

  return theme;
}
