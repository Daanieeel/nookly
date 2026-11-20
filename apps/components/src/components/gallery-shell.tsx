"use client";

import { IconMoon, IconSearch, IconSun } from "@tabler/icons-react";
import { useMemo, useState, useSyncExternalStore } from "react";
import { Input } from "@nookly/ui/components/input";
import { Toaster } from "@nookly/ui/components/sonner";
import { TooltipProvider } from "@nookly/ui/components/tooltip";
import { Button } from "@nookly/ui/components/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { GALLERY } from "@/gallery";
import type { GalleryEntry, GalleryGroup } from "@/gallery/types";
import { applyTheme, readTheme, type Theme } from "./theme";
import { Demo } from "./demo";

const GROUPS: GalleryGroup[] = ["Primitives", "App components"];

function subscribeTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

function useTheme(): Theme {
  return useSyncExternalStore(subscribeTheme, readTheme, () => "light");
}

export function matches(entry: GalleryEntry, query: string): boolean {
  const q = query.trim().toLowerCase();
  return !q || `${entry.name} ${entry.source} ${entry.note ?? ""}`.toLowerCase().includes(q);
}

export function GalleryShell() {
  const [query, setQuery] = useState("");
  const theme = useTheme();
  const visible = useMemo(() => GALLERY.filter((e) => matches(e, query)), [query]);

  return (
    <TooltipProvider>
      <div className="flex min-h-svh">
        <aside className="sticky top-0 hidden h-svh w-64 shrink-0 flex-col gap-4 overflow-y-auto border-r bg-muted p-4 md:flex">
          <div className="text-sm font-semibold">Nookly components</div>
          <nav aria-label="Components" className="flex flex-col gap-4">
            {GROUPS.map((group) => {
              const entries = visible.filter((e) => e.group === group);
              if (entries.length === 0) return null;
              return (
                <div key={group} className="flex flex-col gap-0.5">
                  <div className="px-2 pb-1 text-xs font-medium text-muted-foreground">{group}</div>
                  {entries.map((e) => (
                    <a
                      key={e.id}
                      href={`#${e.id}`}
                      className="rounded-md px-2 py-1 text-ui text-muted-foreground hover:bg-foreground/6 hover:text-foreground"
                    >
                      {e.name}
                    </a>
                  ))}
                </div>
              );
            })}
          </nav>
        </aside>
        <main className="min-w-0 flex-1">
          <header className="sticky top-0 z-10 flex items-center gap-2 border-b bg-background/80 px-4 py-3 backdrop-blur md:px-8">
            <div className="relative min-w-0 max-w-sm flex-1">
              <IconSearch
                aria-hidden
                className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                type="search"
                aria-label="Filter components"
                placeholder="Filter components"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-8"
              />
            </div>
            <span className="ml-auto text-xs text-muted-foreground">
              {visible.length} of {GALLERY.length}
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Toggle theme"
                  onClick={() => applyTheme(theme === "dark" ? "light" : "dark")}
                >
                  {theme === "dark" ? <IconSun /> : <IconMoon />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{theme === "dark" ? "Light theme" : "Dark theme"}</TooltipContent>
            </Tooltip>
          </header>
          <div className="mx-auto flex max-w-4xl flex-col gap-10 px-4 py-8 md:px-8">
            {visible.length === 0 && (
              <p className="text-sm text-muted-foreground">Nothing matches “{query}”.</p>
            )}
            {GROUPS.map((group) => {
              const entries = visible.filter((e) => e.group === group);
              if (entries.length === 0) return null;
              return (
                <section key={group} aria-label={group} className="flex flex-col gap-6">
                  <h2 className="text-lg font-semibold">{group}</h2>
                  {entries.map((e) => (
                    <Demo key={e.id} entry={e} />
                  ))}
                </section>
              );
            })}
          </div>
        </main>
      </div>
      <Toaster />
    </TooltipProvider>
  );
}
