import { IconDeviceDesktop, IconMoon, IconSun } from "@tabler/icons-react";
import { Tabs, TabsList, TabsTrigger } from "@nookly/ui/components/tabs";
import { type FileViewerTheme, useFileViewerThemeStore } from "#/lib/file-viewer-theme.ts";

const ICON = { light: IconSun, dark: IconMoon, system: IconDeviceDesktop } satisfies Record<
  FileViewerTheme,
  typeof IconSun
>;
const LABEL = {
  light: "Light",
  dark: "Dark",
  system: "Follow App Theme",
} satisfies Record<FileViewerTheme, string>;
// SAFETY: `LABEL` is keyed by every `FileViewerTheme` variant and nothing else.
const THEMES = Object.keys(LABEL) as FileViewerTheme[];

export function FileViewerThemeToggle() {
  const theme = useFileViewerThemeStore((s) => s.theme);
  const setTheme = useFileViewerThemeStore((s) => s.setTheme);

  return (
    // SAFETY: the only values Radix can emit are the `THEMES` trigger values below.
    <Tabs value={theme} onValueChange={(next) => setTheme(next as FileViewerTheme)}>
      <TabsList>
        {THEMES.map((value) => {
          const Icon = ICON[value];
          return (
            <TabsTrigger key={value} value={value}>
              <Icon size={14} />
              {LABEL[value]}
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}
