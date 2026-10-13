"use client";

import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type PropsWithChildren,
} from "react";

import {
  ACTIVE_THEME_FAMILY,
  ACTIVE_THEME_VARIANT,
  DEFAULT_THEME_MODE,
  getTheme,
  isThemeMode,
  type ThemeFamily,
  type ThemeMode,
  type ThemeVariant,
} from "./registry";
import {
  THEME_MODE_CHANGE_EVENT,
  THEME_MODE_STORAGE_KEY,
} from "./constants";
import type { ThemeContextValue } from "./types";

export const ThemeContext = createContext<ThemeContextValue | null>(null);

function readPreferredMode(): ThemeMode {
  const storedMode = localStorage.getItem(THEME_MODE_STORAGE_KEY);
  if (isThemeMode(storedMode)) return storedMode;

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function subscribePreferredMode(onChange: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");

  function onStorage(event: StorageEvent) {
    if (event.key === THEME_MODE_STORAGE_KEY || event.key === null) onChange();
  }

  window.addEventListener("storage", onStorage);
  window.addEventListener(THEME_MODE_CHANGE_EVENT, onChange);
  media.addEventListener("change", onChange);

  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(THEME_MODE_CHANGE_EVENT, onChange);
    media.removeEventListener("change", onChange);
  };
}

export function ThemeProvider({
  children,
  family = ACTIVE_THEME_FAMILY,
  variant = ACTIVE_THEME_VARIANT,
  mode,
}: PropsWithChildren<{
  family?: ThemeFamily;
  variant?: ThemeVariant;
  mode?: ThemeMode;
}>) {
  const preferredMode = useSyncExternalStore(
    subscribePreferredMode,
    readPreferredMode,
    () => DEFAULT_THEME_MODE,
  );
  const resolvedMode = mode ?? preferredMode;
  const theme = getTheme({ family, variant, mode: resolvedMode });

  const setMode = useCallback((nextMode: ThemeMode) => {
    localStorage.setItem(THEME_MODE_STORAGE_KEY, nextMode);
    window.dispatchEvent(new Event(THEME_MODE_CHANGE_EVENT));
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.themeFamily = family;
    root.dataset.themeVariant = variant;
    root.dataset.colorMode = resolvedMode;
    root.dataset.theme = theme.attribute;
    root.style.colorScheme = resolvedMode;
  }, [family, resolvedMode, theme.attribute, variant]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      family,
      variant,
      mode: resolvedMode,
      theme,
      setMode,
    }),
    [family, resolvedMode, setMode, theme, variant],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}
