import type { Locale } from "@/lib/i18n";
import { Hero } from "../hero/hero";
import { SiteShell } from "../site-shell";

export function HomePage({ locale }: { locale: Locale }) {
  return (
    <SiteShell locale={locale} page="home">
      <Hero locale={locale} />
    </SiteShell>
  );
}
