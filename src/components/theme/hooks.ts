"use client";

import { useContext } from "react";

import { ThemeContext } from "./provider";

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme phải được sử dụng bên trong ThemeProvider.");
  }
  return context;
}
