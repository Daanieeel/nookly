"use client";

import { type ComponentType, useEffect, useState } from "react";
import { IconCheck, IconDeviceDesktop, IconMoon, IconSun } from "@tabler/icons-react";
import { Popover, PopoverContent, PopoverTrigger } from "@nookly/ui/components/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { dictionary } from "@/content";
import type { Locale } from "@/lib/i18n";
import { applyTheme, DEFAULT_THEME, readTheme, type Theme } from "@/lib/theme";

/// The desktop's own theme icons (Quick actions, Settings).
const OPTIONS: { theme: Theme; icon: ComponentType<{ size?: number; className?: string }> }[] = [
  { theme: "light", icon: IconSun },
  { theme: "dark", icon: IconMoon },
  { theme: "system", icon: IconDeviceDesktop },
];

export function ThemeSwitch({ locale }: { locale: Locale }) {
  const t = dictionary(locale).theme;
  const [theme, setTheme] = useState<Theme>(DEFAULT_THEME);
  const [open, setOpen] = useState(false);

  useEffect(() => setTheme(readTheme()), []);

  function choose(next: Theme) {
    setTheme(next);
    applyTheme(next);
    setOpen(false);
  }

  // SAFETY: `theme` is always one of OPTIONS.
  const Current = OPTIONS.find((o) => o.theme === theme)!.icon;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={`${t.label}: ${t[theme]}`}
              className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground"
            >
              <Current size={16} />
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{t.label}</TooltipContent>
      </Tooltip>
      <PopoverContent aria-label={t.label} align="end" sideOffset={6} className="w-40 p-1">
        <fieldset aria-label={t.label} className="flex flex-col">
          {OPTIONS.map(({ theme: option, icon: Icon }) => (
            <button
              key={option}
              type="button"
              aria-pressed={option === theme}
              onClick={() => choose(option)}
              className="flex h-9 items-center gap-2.5 rounded-md px-2 text-left text-sm transition-colors hover:bg-accent"
            >
              <Icon size={16} className="text-muted-foreground" />
              <span className="flex-1">{t[option]}</span>
              {option === theme && <IconCheck size={14} className="text-muted-foreground" />}
            </button>
          ))}
        </fieldset>
      </PopoverContent>
    </Popover>
  );
}
