import { type Theme, useThemeStore } from "#/lib/theme.ts";
import { ThemeTabs } from "./theme-tabs.tsx";

const LABELS = { light: "Light", dark: "Dark", system: "System" } satisfies Record<Theme, string>;

export function ThemeToggle() {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  return <ThemeTabs value={theme} onChange={setTheme} labels={LABELS} />;
}
