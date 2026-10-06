import {
  IconAdjustments,
  IconDeviceDesktop,
  IconMoon,
  IconSun,
  type Icon as TablerIcon,
} from "@tabler/icons-react";
import { Tabs, TabsList, TabsTrigger } from "@nookly/ui/components/tabs";

type ThemeValue = "light" | "dark" | "system" | "defaults";

const ICON = {
  light: IconSun,
  dark: IconMoon,
  system: IconDeviceDesktop,
  defaults: IconAdjustments,
} satisfies Record<ThemeValue, TablerIcon>;

/// Light, dark and system (or defaults) tabs shared by the app and file viewer theme toggles.
export function ThemeTabs<T extends ThemeValue>({
  value,
  onChange,
  labels,
}: {
  value: T;
  onChange: (next: T) => void;
  labels: Record<T, string>;
}) {
  // SAFETY: `labels` is keyed by every `T` variant and nothing else.
  const themes = Object.keys(labels) as T[];
  return (
    // SAFETY: the only values Radix can emit are the `themes` trigger values below.
    <Tabs value={value} onValueChange={(next) => onChange(next as T)}>
      <TabsList className="w-full">
        {themes.map((theme) => {
          const Icon: TablerIcon = ICON[theme];
          return (
            <TabsTrigger key={theme} value={theme}>
              <Icon size={14} />
              {labels[theme]}
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}
