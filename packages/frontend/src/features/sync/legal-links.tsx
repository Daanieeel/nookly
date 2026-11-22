import { type LegalPage, deviceLocale, legalUrl } from "@nookly/shared/api";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { ReactNode } from "react";
import { cn } from "@nookly/ui/lib/utils";
import { ignoreError } from "#/lib/log.ts";

const TITLES = {
  terms: "Terms of Service",
  privacy: "Privacy Policy",
  imprint: "Imprint",
  license: "License",
} satisfies Record<LegalPage, string>;

/// A page of nookly.work, in the computer's language, opened in the browser.
export function LegalLink({
  page,
  children = TITLES[page],
  className,
}: {
  page: LegalPage;
  children?: ReactNode;
  className?: string;
}) {
  const url = legalUrl(page, deviceLocale());
  return (
    <a
      href={url}
      onClick={(event) => {
        event.preventDefault();
        void openUrl(url).catch(ignoreError("opening a legal page"));
      }}
      className={cn("underline underline-offset-2 hover:text-foreground", className)}
    >
      {children}
    </a>
  );
}

/// The legal pages, small and quiet, for the foot of a dialog or a settings row.
export function LegalLinks({
  className,
  pages = ["terms", "privacy", "imprint"],
}: {
  className?: string;
  pages?: LegalPage[];
}) {
  return (
    <nav
      aria-label="Legal"
      className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 text-xs", className)}
    >
      {pages.map((page) => (
        <LegalLink key={page} page={page} />
      ))}
    </nav>
  );
}
