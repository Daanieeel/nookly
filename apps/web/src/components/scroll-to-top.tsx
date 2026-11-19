"use client";

import { useEffect, useState } from "react";
import { IconArrowUp } from "@tabler/icons-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { cn } from "@nookly/ui/lib/utils";
import { dictionary } from "@/content";
import type { Locale } from "@/lib/i18n";

/// How far down the page has to be before the button appears: past the first screen.
const SHOW_AFTER = 600;

/// A quiet round button in the corner that takes the visitor back to the top. It stays out
/// of sight, and out of the tab order, until the page has scrolled a screen or so.
export function ScrollToTop({ locale }: { locale: Locale }) {
  const label = dictionary(locale).nav.top;
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const onScroll = () => setShown(window.scrollY > SHOW_AFTER);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function goToTop() {
    // jsdom, which the tests run in, has no `matchMedia`.
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    // The button hides on the way up, so keyboard focus would be lost with it.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={goToTop}
          className={cn(
            "fixed right-4 bottom-4 z-40 flex size-10 items-center justify-center rounded-full border border-border bg-card/80 text-muted-foreground shadow-sm backdrop-blur-md transition-all duration-300 hover:bg-card hover:text-foreground sm:right-6 sm:bottom-6",
            shown ? "translate-y-0 opacity-100" : "invisible translate-y-2 opacity-0",
          )}
        >
          <IconArrowUp size={18} aria-hidden />
        </button>
      </TooltipTrigger>
      <TooltipContent side="left">{label}</TooltipContent>
    </Tooltip>
  );
}
