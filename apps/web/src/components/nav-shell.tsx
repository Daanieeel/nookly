"use client";

import { type ReactNode, useEffect, useState } from "react";
import { cn } from "@nookly/ui/lib/utils";

/// The bar's frame: floats over the page, transparent and full width at the top, then
/// narrows into a frosted card once the page has scrolled. What goes in it comes from `Nav`.
export function NavShell({
  logo,
  links,
  actions,
}: {
  logo: ReactNode;
  links: ReactNode;
  actions: ReactNode;
}) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="fixed inset-x-0 top-3 z-40 flex w-full justify-center px-3 sm:top-4 sm:px-4">
      <div
        className={cn(
          "flex w-full items-center gap-4 rounded-2xl border border-transparent py-2 transition-all duration-300 sm:gap-6",
          scrolled
            ? "max-w-5xl border-border bg-card/80 pr-2 pl-4 shadow-sm backdrop-blur-md sm:pl-5"
            : "max-w-full bg-transparent px-4 sm:px-6",
        )}
      >
        {logo}
        {links}
        {actions}
      </div>
    </header>
  );
}
