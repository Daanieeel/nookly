import { create } from "zustand";
import { STORAGE_KEYS } from "@/lib/storage-keys";

export type Theme = "light" | "dark" | "system";

export function getStoredTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEYS.theme);
  return stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
}

function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function applyTheme(theme: Theme): void {
  const isDark = theme === "dark" || (theme === "system" && systemPrefersDark());
  document.documentElement.classList.toggle("dark", isDark);
}

export function setTheme(theme: Theme): void {
  localStorage.setItem(STORAGE_KEYS.theme, theme);
  applyTheme(theme);
}

/// Called once before React renders, so the correct theme class is already on
/// <html> before first paint — no light-mode flash on dark-system machines.
export function initTheme(): void {
  applyTheme(getStoredTheme());
}

/// The chosen theme, shared so every control (the sidebar toggle, the command
/// palette's theme actions) reflects a change made from any of them.
export const useThemeStore = create<{ theme: Theme; setTheme: (theme: Theme) => void }>((set) => ({
  theme: getStoredTheme(),
  setTheme: (theme) => {
    setTheme(theme);
    set({ theme });
  },
}));
