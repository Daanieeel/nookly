"use client";

import { type ReactNode, useEffect, useState } from "react";
import { cn } from "@nookly/ui/lib/utils";

/// The bar's frame: floats over the page, transparent and narrow at the top, then widens
/// into a frosted card once the page has scrolled. What goes in it comes from `Nav`.
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
        data-scrolled={scrolled}
        className={cn(
          "group/nav flex w-full items-center gap-4 rounded-2xl border border-transparent py-2 pr-2 pl-4 transition-all duration-300 sm:gap-6 sm:pl-5",
          scrolled
            ? "max-w-5xl border-border bg-card/80 shadow-sm backdrop-blur-md"
            : "max-w-[860px] bg-transparent",
        )}
      >
        {logo}
        {links}
        {actions}
      </div>
    </header>
  );
}

/// Shows its contents only once the page has scrolled, sliding open beside its neighbours.
/// Until then it is also out of the tab order. Only on wide screens, like what it wraps.
export function ScrolledOnly({ children }: { children: ReactNode }) {
  return (
    <span className="-m-1 hidden max-w-0 shrink-0 items-center overflow-hidden p-1 opacity-0 invisible transition-all duration-300 sm:inline-flex group-data-[scrolled=true]/nav:visible group-data-[scrolled=true]/nav:max-w-80 group-data-[scrolled=true]/nav:opacity-100">
      {children}
    </span>
  );
}
