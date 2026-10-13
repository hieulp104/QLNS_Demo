import { THEME_MODE_STORAGE_KEY } from "./constants";
import type { ThemeFamily, ThemeMode, ThemeVariant } from "./registry";

export function createThemeBootstrapScript({
  family,
  variant,
  fallbackMode,
}: {
  family: ThemeFamily;
  variant: ThemeVariant;
  fallbackMode: ThemeMode;
}) {
  const config = JSON.stringify({
    family,
    variant,
    fallbackMode,
    storageKey: THEME_MODE_STORAGE_KEY,
  });

  return `(() => {
    const config = ${config};
    try {
      const stored = localStorage.getItem(config.storageKey);
      const systemDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
      const mode = stored === "light" || stored === "dark"
        ? stored
        : systemDark
          ? "dark"
          : config.fallbackMode;
      const root = document.documentElement;
      root.dataset.themeFamily = config.family;
      root.dataset.themeVariant = config.variant;
      root.dataset.colorMode = mode;
      root.dataset.theme = config.family + "-" + config.variant + "-" + mode;
      root.style.colorScheme = mode;
    } catch {
      document.documentElement.style.colorScheme = config.fallbackMode;
    }
  })();`;
}
