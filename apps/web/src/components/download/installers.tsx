"use client";

import type { ReactNode } from "react";
import { IconDownload } from "@tabler/icons-react";
import { cn } from "@nookly/ui/lib/utils";
import { dictionary } from "@/content";
import type { Locale } from "@/lib/i18n";
import { type Download, formatSize, type Os } from "@/lib/releases";
import { type Brand, BrandIcon } from "../brand-icon";
import { BRAND_OF, OS_ORDER } from "../download-meta";
import { useRelease } from "../use-release";

const SECTION_BRAND = { macos: "apple", windows: "windows", linux: "linux" } satisfies Record<
  Os,
  Brand
>;

export const CARD = "flex flex-col rounded-2xl border border-border bg-card";

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

export function PlatformCard({
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

/// The installers by system. The static page links each to the releases page; the browser
/// swaps in the latest release's files and sizes.
export function Installers({ locale }: { locale: Locale }) {
  const t = dictionary(locale).downloads;
  const release = useRelease();
  return (
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
  );
}

/// "Version 1.0.0, released ..." once the latest release is known.
export function LatestLine({ locale }: { locale: Locale }) {
  const t = dictionary(locale).downloads;
  const release = useRelease();
  const date = release.publishedAt
    ? new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(new Date(release.publishedAt))
    : null;
  return <>{release.version && date ? t.latest(release.version, date) : t.unknownVersion}</>;
}

/// The checksum and signature links of the latest release.
export function ChecksumLinks({ locale }: { locale: Locale }) {
  const t = dictionary(locale).downloads;
  const { checksums } = useRelease();
  if (!checksums) return null;
  return (
    <div className="mt-auto flex gap-4 pt-1 text-sm">
      <a href={checksums.sums} className="text-primary hover:underline">
        {t.verify.sums}
      </a>
      {checksums.signature && (
        <a href={checksums.signature} className="text-primary hover:underline">
          {t.verify.signature}
        </a>
      )}
    </div>
  );
}
