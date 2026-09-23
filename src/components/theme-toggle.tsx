import { IconDeviceDesktop, IconMoon, IconSun } from "@tabler/icons-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type Theme, useThemeStore } from "@/lib/theme";

const ICON = { light: IconSun, dark: IconMoon, system: IconDeviceDesktop } satisfies Record<
  Theme,
  typeof IconSun
>;
const LABEL = { light: "Light", dark: "Dark", system: "System" } satisfies Record<Theme, string>;
// SAFETY: `LABEL` is keyed by every `Theme` variant and nothing else.
const THEMES = Object.keys(LABEL) as Theme[];

export function ThemeToggle() {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  return (
    // SAFETY: the only values Radix can emit are the `THEMES` trigger values below.
    <Tabs value={theme} onValueChange={(next) => setTheme(next as Theme)}>
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
