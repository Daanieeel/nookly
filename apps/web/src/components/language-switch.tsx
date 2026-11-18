"use client";

import { useState } from "react";
import Flag from "react-flagpack";
import "react-flagpack/dist/style.css";
import { IconCheck, IconChevronDown } from "@tabler/icons-react";
import { Popover, PopoverContent, PopoverTrigger } from "@nookly/ui/components/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { cn } from "@nookly/ui/lib/utils";
import { type Locale, LOCALES, type Page, pathFor } from "@/lib/i18n";

/// Each language with the flag the desktop's flag set draws for it: the US for English.
const LANGUAGES: Record<Locale, { name: string; flag: string; label: string }> = {
  en: { name: "English", flag: "US", label: "Language" },
  de: { name: "Deutsch", flag: "DE", label: "Sprache" },
};

function FlagIcon({ code }: { code: string }) {
  return <Flag code={code} size="s" hasBorder={false} />;
}

/// The page in the other language, from a small menu with flags. Stays on the same page.
export function LanguageSwitch({ locale, page }: { locale: Locale; page: Page }) {
  const [open, setOpen] = useState(false);
  const current = LANGUAGES[locale];
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={`${current.label}: ${current.name}`}
              className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground"
            >
              <FlagIcon code={current.flag} />
              {locale.toUpperCase()}
              <IconChevronDown
                size={12}
                className={cn("transition-transform", open && "rotate-180")}
              />
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{current.label}</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" sideOffset={6} className="w-44 p-1">
        <nav aria-label={current.label} className="flex flex-col">
          {LOCALES.map((option) => {
            const language = LANGUAGES[option];
            const active = option === locale;
            return (
              <a
                key={option}
                href={pathFor(option, page)}
                hrefLang={option}
                lang={option}
                aria-current={active ? "page" : undefined}
                onClick={() => setOpen(false)}
                className="flex h-9 items-center gap-2.5 rounded-md px-2 text-sm transition-colors hover:bg-accent"
              >
                <FlagIcon code={language.flag} />
                <span className="flex-1">{language.name}</span>
                {active && <IconCheck size={14} className="text-muted-foreground" />}
              </a>
            );
          })}
        </nav>
      </PopoverContent>
    </Popover>
  );
}
