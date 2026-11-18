import type { ReactNode } from "react";
import {
  IconBrandGithub,
  IconDownload,
  IconExternalLink,
  IconRefresh,
  IconShieldCheck,
} from "@tabler/icons-react";
import { badgeVariants } from "@nookly/ui/classes";
import { cn } from "@nookly/ui/lib/utils";
import { dictionary } from "@/content";
import type { Locale } from "@/lib/i18n";
import { type Download, formatSize, latestRelease, type Os } from "@/lib/releases";
import { RELEASES_URL } from "@/lib/site";
import { type Brand, BrandIcon } from "../brand-icon";
import { BRAND_OF, OS_ORDER } from "../download-meta";
import { Recommended } from "../download/recommended";
import { SiteShell } from "../site-shell";

const SECTION_BRAND: Record<Os, Brand> = { macos: "apple", windows: "windows", linux: "linux" };

const CARD = "flex flex-col rounded-2xl border border-border bg-card";

/// One installer: the whole row is the link, so it is one click from anywhere on it.
function DownloadRow({ item, locale }: { item: Download; locale: Locale }) {
  const t = dictionary(locale);
  const size = formatSize(item.size, locale);
  return (
    <li>
      <a
        href={item.url}
        download=""
        aria-label={`${t.downloads.get} ${t.download.platforms[item.id]}, ${t.download.labels[item.id]}`}
        className="group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-accent"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background">
          <BrandIcon brand={BRAND_OF[item.id]} size={16} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="text-sm font-medium">{t.download.labels[item.id]}</span>
          <span className="truncate text-xs text-muted-foreground">
            {t.download.details[item.id]}
            {size && ` · ${size}`}
          </span>
        </span>
        <IconDownload
          size={16}
          aria-hidden
          className="shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
        />
      </a>
    </li>
  );
}

function PlatformCard({
  brand,
  title,
  note,
  children,
}: {
  brand: Brand;
  title: string;
  note: string;
  children: ReactNode;
}) {
  return (
    <section className={cn(CARD, "p-2")}>
      <header className="flex items-center gap-3 px-3 pt-3 pb-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border bg-background">
          <BrandIcon brand={brand} size={22} />
        </span>
        <span className="flex min-w-0 flex-col leading-tight">
          <h2 className="font-display text-lg font-semibold">{title}</h2>
          <span className="text-xs text-muted-foreground">{note}</span>
        </span>
      </header>
      {children}
    </section>
  );
}

export async function DownloadPage({ locale }: { locale: Locale }) {
  const t = dictionary(locale).downloads;
  const release = await latestRelease();
  const date = release.publishedAt
    ? new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(new Date(release.publishedAt))
    : null;

  return (
    <SiteShell locale={locale} page="download">
      <div className="bg-background">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 pt-12 pb-20 sm:px-6 sm:pt-16">
          <div className="grid gap-4 lg:grid-cols-[1fr_1.15fr]">
            <header className="flex flex-col justify-center gap-3 py-4 lg:pr-8">
              <h1 className="font-display text-[clamp(2.4rem,6vw,3.6rem)] leading-none font-semibold">
                {t.title}
              </h1>
              <p className="text-lg text-muted-foreground">{t.subtitle}</p>
              <p className="text-sm text-muted-foreground">
                {release.version && date ? t.latest(release.version, date) : t.unknownVersion}
              </p>
            </header>
            <Recommended locale={locale} release={release} />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {OS_ORDER.map((os) => {
              const items = release.downloads.filter((d) => d.os === os);
              if (items.length === 0) return null;
              return (
                <PlatformCard
                  key={os}
                  brand={SECTION_BRAND[os]}
                  title={t.sections[os]}
                  note={t.sectionNotes[os]}
                >
                  <ul className="flex flex-col">
                    {items.map((item) => (
                      <DownloadRow key={item.id} item={item} locale={locale} />
                    ))}
                  </ul>
                </PlatformCard>
              );
            })}
          </div>

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
              {release.checksums && (
                <div className="mt-auto flex gap-4 pt-1 text-sm">
                  <a href={release.checksums.sums} className="text-primary hover:underline">
                    {t.verify.sums}
                  </a>
                  {release.checksums.signature && (
                    <a href={release.checksums.signature} className="text-primary hover:underline">
                      {t.verify.signature}
                    </a>
                  )}
                </div>
              )}
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
