import {
  IconBrandGithub,
  IconExternalLink,
  IconRefresh,
  IconShieldCheck,
} from "@tabler/icons-react";
import { badgeVariants } from "@nookly/ui/classes";
import { cn } from "@nookly/ui/lib/utils";
import { dictionary } from "@/content";
import type { Locale } from "@/lib/i18n";
import { RELEASES_URL } from "@/lib/site";
import { BrandIcon } from "../brand-icon";
import { CARD, ChecksumLinks, Installers, LatestLine, PlatformCard } from "../download/installers";
import { Recommended } from "../download/recommended";
import { SiteShell } from "../site-shell";

export function DownloadPage({ locale }: { locale: Locale }) {
  const t = dictionary(locale).downloads;

  return (
    <SiteShell locale={locale} page="download">
      <div className="bg-background">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 pt-28 pb-20 sm:px-6 sm:pt-32">
          <div className="grid gap-4 lg:grid-cols-[1fr_1.15fr]">
            <header className="flex flex-col justify-center gap-3 py-4 lg:pr-8">
              <h1 className="font-display text-[clamp(2.4rem,6vw,3.6rem)] leading-none font-semibold">
                {t.title}
              </h1>
              <p className="text-lg text-muted-foreground">{t.subtitle}</p>
              <p className="text-sm text-muted-foreground">
                <LatestLine locale={locale} />
              </p>
            </header>
            <Recommended locale={locale} />
          </div>

          <Installers locale={locale} />

          <div className="grid gap-4 md:grid-cols-3">
            <PlatformCard brand="appstore" title={t.sections.mobile} note={t.sectionNotes.mobile}>
              <div className="mt-auto flex items-center gap-3 px-3 py-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background">
                  <BrandIcon brand="apple" size={16} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col leading-tight">
                  <span className="text-sm font-medium">{t.ios.title}</span>
                  <span className="text-xs text-muted-foreground">{t.ios.body}</span>
                </span>
                <span className={badgeVariants({ variant: "neutral", size: "md" })}>
                  {t.comingSoon}
                </span>
              </div>
            </PlatformCard>

            <div className={cn(CARD, "gap-2 p-5")}>
              <IconShieldCheck size={20} className="text-positive" />
              <h2 className="text-sm font-medium">{t.verify.title}</h2>
              <p className="text-sm text-muted-foreground">{t.verify.body}</p>
              <ChecksumLinks locale={locale} />
            </div>

            <div className={cn(CARD, "gap-2 p-5")}>
              <IconRefresh size={20} className="text-primary" />
              <p className="text-sm text-muted-foreground">{t.updates}</p>
              <a
                href={RELEASES_URL}
                className="mt-auto inline-flex items-center gap-1.5 pt-1 text-sm text-primary hover:underline"
              >
                <IconBrandGithub size={15} />
                {t.older}
                <IconExternalLink size={13} />
              </a>
            </div>
          </div>
        </div>
      </div>
    </SiteShell>
  );
}
