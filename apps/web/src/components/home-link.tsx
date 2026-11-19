"use client";

import type { ComponentProps, MouseEvent } from "react";
import { scrollToTop } from "@/lib/scroll";

/// The path without a trailing slash, so `/de` and `/de/` are the same page.
function bare(path: string) {
  return path.length > 1 ? path.replace(/\/$/, "") : path;
}

/// A link to the home page that, on the home page itself, scrolls back to the top instead
/// of loading the page again. Clicks that open a new tab or window stay the browser's.
export function HomeLink({
  href,
  onClick,
  children,
  ...props
}: ComponentProps<"a"> & { href: string }) {
  function goHome(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    const newTab = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
    if (event.defaultPrevented || newTab || event.button !== 0) return;
    if (bare(window.location.pathname) !== bare(href)) return;
    event.preventDefault();
    // Drop a section like `#faq` from the address, so a reload starts at the top too.
    if (window.location.hash) window.history.replaceState(null, "", window.location.pathname);
    scrollToTop();
  }

  return (
    <a href={href} onClick={goHome} {...props}>
      {children}
    </a>
  );
}
