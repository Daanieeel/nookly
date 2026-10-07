import { useEffect, useState } from "react";
import { create } from "zustand";
import { type SettingValue } from "#/lib/settings/registry.ts";
import { settings, subscribeSetting } from "#/lib/settings/settings.ts";

export type Theme = SettingValue<"appearance.theme">;

export function getStoredTheme(): Theme {
  return settings.get("appearance.theme");
}

function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function applyTheme(theme: Theme): void {
  const isDark = theme === "dark" || (theme === "system" && systemPrefersDark());
  document.documentElement.classList.toggle("dark", isDark);
}

export function setTheme(theme: Theme): void {
  settings.set("appearance.theme", theme);
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

// Keeps the store in step when the setting changes elsewhere. Only `setTheme`
// also redraws the page, so change the theme through it.
subscribeSetting("appearance.theme", (theme) => useThemeStore.setState({ theme }));

/// Whether the app currently draws dark, following the system when the theme
/// is "system".
export function useIsDark(): boolean {
  const theme = useThemeStore((s) => s.theme);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);
  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setSystemDark(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return theme === "dark" || (theme === "system" && systemDark);
}
