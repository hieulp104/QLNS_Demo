import type { ColorMode, ThemeAssets } from "../../../../types";

import illustrationAsset from "../login-illustration.jpg";

function assetUrl(asset: string | { src: string }) {
  return typeof asset === "string" ? asset : asset.src;
}

/**
 * Logo và icon chưa có bản chính thức nên để null để BrandMark/BrandLogo dùng
 * placeholder chữ "N". Ảnh không gian nội thất chỉ phục vụ màn hình đăng nhập.
 */
export const tamnestBrandAssetsByMode = {
  light: {
    logo: null,
    logoInverse: null,
    icon: null,
    favicon: null,
    illustration: assetUrl(illustrationAsset),
  },
  dark: {
    logo: null,
    logoInverse: null,
    icon: null,
    favicon: null,
    illustration: assetUrl(illustrationAsset),
  },
} as const satisfies Record<ColorMode, ThemeAssets>;

export const tamnestBrandAssets = tamnestBrandAssetsByMode.light;
