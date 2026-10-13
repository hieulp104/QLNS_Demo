"use client";

import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/actions";
import { useTheme } from "./hooks";

export function ThemeSwitcher() {
  const { mode, setMode } = useTheme();
  const nextMode = mode === "dark" ? "light" : "dark";
  const nextModeLabel = nextMode === "dark" ? "tối" : "sáng";

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={() => setMode(nextMode)}
      aria-label={`Chuyển sang chế độ ${nextModeLabel}`}
      title={`Chuyển sang chế độ ${nextModeLabel}`}
    >
      {mode === "dark" ? (
        <Sun className="size-[18px]" />
      ) : (
        <Moon className="size-[18px]" />
      )}
    </Button>
  );
}
