import { create } from "zustand";
import { preferences } from "#/lib/preferences.ts";
import { STORAGE_KEYS } from "#/lib/storage-keys.ts";
import { useIsDark } from "#/lib/theme.ts";

/// The file viewer's own theme (Files tab, every file type), independent of the
/// app's own light/dark/system theme — the two can disagree on purpose, e.g. an
/// app in dark mode with the viewer pinned to light. Defaults to light, unlike
/// the app theme's own "system" default.
export type FileViewerTheme = "light" | "dark" | "system";

function getStoredFileViewerTheme(): FileViewerTheme {
  const stored = preferences.get(STORAGE_KEYS.fileViewerTheme);
  return stored === "light" || stored === "dark" || stored === "system" ? stored : "light";
}

export const useFileViewerThemeStore = create<{
  theme: FileViewerTheme;
  setTheme: (theme: FileViewerTheme) => void;
}>((set) => ({
  theme: getStoredFileViewerTheme(),
  setTheme: (theme) => {
    preferences.set(STORAGE_KEYS.fileViewerTheme, theme);
    set({ theme });
  },
}));

/// Whether the file viewer should currently draw dark, following the app's own
/// theme only while set to "system".
export function useFileViewerIsDark(): boolean {
  const pref = useFileViewerThemeStore((s) => s.theme);
  const appIsDark = useIsDark();
  return pref === "dark" || (pref === "system" && appIsDark);
}

/// The class forcing a subtree's design tokens to `isDark` (`.viewer-light`/
/// `.viewer-dark` in `packages/ui/src/styles.css`), so Tailwind utilities
/// inside it (e.g. `bg-muted`, the code viewer's token colors) render the file
/// viewer's own theme instead of inheriting the app's.
export function fileViewerThemeClass(isDark: boolean): string {
  return isDark ? "viewer-dark" : "viewer-light";
}
