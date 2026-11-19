import type { ReactNode } from "react";
import type { Locale, Page } from "@/lib/i18n";
import { Footer } from "./footer";
import { Nav } from "./nav";

export function SiteShell({
  locale,
  page,
  children,
}: {
  locale: Locale;
  page: Page;
  children: ReactNode;
}) {
  return (
    <>
      <Nav locale={locale} page={page} />
      <main id="main">{children}</main>
      <Footer locale={locale} />
    </>
  );
}
