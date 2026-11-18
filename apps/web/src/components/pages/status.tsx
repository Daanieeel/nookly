import { dictionary } from "@/content";
import type { Locale } from "@/lib/i18n";
import { SiteShell } from "../site-shell";
import { StatusBoard } from "../status/board";

export function StatusPage({ locale }: { locale: Locale }) {
  const t = dictionary(locale).status;
  return (
    <SiteShell locale={locale} page="status">
      <div className="bg-background">
        <div className="mx-auto flex max-w-3xl flex-col gap-8 px-4 pt-12 pb-20 sm:px-6 sm:pt-16">
          <header className="flex flex-col gap-3">
            <h1 className="font-display text-[clamp(2.4rem,6vw,3.6rem)] leading-none font-semibold">
              {t.title}
            </h1>
            <p className="text-lg text-muted-foreground">{t.subtitle}</p>
          </header>
          <StatusBoard locale={locale} />
        </div>
      </div>
    </SiteShell>
  );
}
