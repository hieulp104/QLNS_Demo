import type { ThemeManifest } from "../../types";
import { tamnestBrandAssets } from "./assets/brand";
import { tamnestClassicVariant } from "./classic";

export const tamnestThemeManifest = {
  id: "tamnest",
  name: "NA",
  description:
    "Hệ thống nhận diện hiện đại, tối giản và tự nhiên dành cho nền tảng quản trị nội bộ NA.",
  version: "3.2.0",
  author: "NA",
  assets: tamnestBrandAssets,
  variants: {
    classic: tamnestClassicVariant,
  },
} as const satisfies ThemeManifest<{
  classic: typeof tamnestClassicVariant;
}>;
