import { create } from "zustand";
import { preferences } from "#/lib/preferences.ts";
import { STORAGE_KEYS } from "#/lib/storage-keys.ts";

/// The file viewer's own theme (Files tab, every file type), independent of the
/// app's own light/dark/system theme. "defaults" draws code and raw text files dark and
/// documents light; "light" or "dark" draws every file that way.
export type FileViewerTheme = "light" | "dark" | "defaults";

/// What a file is, as far as its default theme goes: source code, raw text like
/// `.txt` and `.log`, or a document drawn like paper.
export type ViewerContent = "code" | "text" | "document";

/// The stored choice, with the defaults when there is none. "system", the old
/// "follow the app theme" choice, became the defaults.
export function parseFileViewerTheme(stored: string | null): FileViewerTheme {
  return stored === "light" || stored === "dark" ? stored : "defaults";
}

export function viewerIsDark(theme: FileViewerTheme, content: ViewerContent): boolean {
  return theme === "defaults" ? content !== "document" : theme === "dark";
}

export const useFileViewerThemeStore = create<{
  theme: FileViewerTheme;
  setTheme: (theme: FileViewerTheme) => void;
}>((set) => ({
  theme: parseFileViewerTheme(preferences.get(STORAGE_KEYS.fileViewerTheme)),
  setTheme: (theme) => {
    preferences.set(STORAGE_KEYS.fileViewerTheme, theme);
    set({ theme });
  },
}));

/// Whether the file viewer should currently draw `content` dark.
export function useFileViewerIsDark(content: ViewerContent): boolean {
  const theme = useFileViewerThemeStore((s) => s.theme);
  return viewerIsDark(theme, content);
}

/// The class forcing a subtree's design tokens to `isDark` (`.viewer-light`/
/// `.viewer-dark` in `packages/ui/src/styles.css`), so Tailwind utilities
/// inside it (e.g. `bg-muted`, the code viewer's token colors) render the file
/// viewer's own theme instead of inheriting the app's.
export function fileViewerThemeClass(isDark: boolean): string {
  return isDark ? "viewer-dark" : "viewer-light";
}
