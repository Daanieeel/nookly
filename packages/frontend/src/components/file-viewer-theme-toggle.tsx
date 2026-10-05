import { type FileViewerTheme, useFileViewerThemeStore } from "#/lib/file-viewer-theme.ts";
import { ThemeTabs } from "./theme-tabs.tsx";

const LABELS = {
  light: "Light",
  dark: "Dark",
  defaults: "Use Defaults",
} satisfies Record<FileViewerTheme, string>;

export function FileViewerThemeToggle() {
  const theme = useFileViewerThemeStore((s) => s.theme);
  const setTheme = useFileViewerThemeStore((s) => s.setTheme);

  return <ThemeTabs value={theme} onChange={setTheme} labels={LABELS} />;
}
