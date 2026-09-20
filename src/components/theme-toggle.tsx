import { IconDeviceDesktop, IconMoon, IconSun } from "@tabler/icons-react";
import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getStoredTheme, setTheme, type Theme } from "@/lib/theme";

const ICON = { light: IconSun, dark: IconMoon, system: IconDeviceDesktop } satisfies Record<
  Theme,
  typeof IconSun
>;
const LABEL = { light: "Light", dark: "Dark", system: "System" } satisfies Record<Theme, string>;
// SAFETY: `LABEL` is keyed by every `Theme` variant and nothing else.
const THEMES = Object.keys(LABEL) as Theme[];

export function ThemeToggle({ iconOnly }: { iconOnly?: boolean } = {}) {
  const [theme, setThemeState] = useState<Theme>(getStoredTheme);
  const Icon = ICON[theme];

  return (
    <Select
      value={theme}
      onValueChange={(next: Theme) => {
        setTheme(next);
        setThemeState(next);
      }}
    >
      <SelectTrigger
        variant="nav"
        size="sm"
        className={
          iconOnly
            ? "h-auto w-auto justify-center gap-0 p-1.5 [&>svg:last-child]:hidden"
            : "h-auto w-full px-2 py-1.5"
        }
        aria-label="Switch theme"
      >
        <Icon size={14} />
        {!iconOnly && <SelectValue>{LABEL[theme]}</SelectValue>}
      </SelectTrigger>
      <SelectContent align="start" side={iconOnly ? "right" : "top"}>
        {THEMES.map((value) => {
          const OptionIcon = ICON[value];
          return (
            <SelectItem key={value} value={value}>
              <OptionIcon size={14} />
              {LABEL[value]}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
