import { IconDeviceDesktop, IconMoon, IconSun } from "@tabler/icons-react";
import { useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getStoredTheme, setTheme, type Theme } from "@/lib/theme";

const NEXT = { light: "dark", dark: "system", system: "light" } satisfies Record<Theme, Theme>;
const ICON = { light: IconSun, dark: IconMoon, system: IconDeviceDesktop } satisfies Record<
  Theme,
  typeof IconSun
>;
const LABEL = { light: "Light", dark: "Dark", system: "System" } satisfies Record<Theme, string>;

export function ThemeToggle() {
  const [theme, setThemeState] = useState<Theme>(getStoredTheme);
  const Icon = ICON[theme];

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => {
            const next = NEXT[theme];
            setTheme(next);
            setThemeState(next);
          }}
          className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-[13px] text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Icon size={14} />
          <span>{LABEL[theme]}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent>Switch theme</TooltipContent>
    </Tooltip>
  );
}
