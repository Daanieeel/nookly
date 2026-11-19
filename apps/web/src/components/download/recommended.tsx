"use client";

import { IconDownload } from "@tabler/icons-react";
import { Button } from "@nookly/ui/components/button";
import { dictionary } from "@/content";
import type { Locale } from "@/lib/i18n";
import { formatSize, type Release } from "@/lib/releases";
import { BrandIcon } from "../brand-icon";
import { useDetectedPlatform } from "../download-button";
import { BRAND_OF } from "../download-meta";

/// The warm card beside the downloads page's title: the installer for the visitor's
/// computer once the browser says which one that is, and until then the app's icon with a
/// pointer to the systems below.
export function Recommended({ locale, release }: { locale: Locale; release: Release }) {
  const t = dictionary(locale);
  const detected = useDetectedPlatform();
  const match =
    detected.kind === "desktop" ? release.downloads.find((d) => d.id === detected.id) : undefined;
  const size = match ? formatSize(match.size, locale) : null;

  return (
    <div className="relative flex min-h-56 overflow-hidden rounded-3xl bg-[#151210] p-6 ring-1 ring-black/5 dark:ring-white/10 text-white sm:p-8">
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-3/4 bg-[radial-gradient(55%_75%_at_80%_100%,rgba(255,122,58,0.32),transparent)]"
      />
      {/* oxlint-disable-next-line nextjs/no-img-element -- static export, a decorative file from public */}
      <img
        src="/hearth/flame.webp"
        alt=""
        aria-hidden
        className="pointer-events-none absolute -right-10 -bottom-2 w-64 origin-bottom animate-[flame-flicker_3.4s_ease-in-out_infinite] select-none motion-reduce:animate-none sm:w-80"
      />
      <div className="relative flex max-w-sm flex-col justify-end gap-4">
        {match ? (
          <div key="match" className="flex animate-[fade-up_0.4s_ease-out_both] flex-col gap-4">
            <span className="flex size-12 items-center justify-center rounded-xl border border-white/10 bg-white/10">
              <BrandIcon brand={BRAND_OF[match.id]} size={24} className="text-white" />
            </span>
            <span className="flex flex-col gap-1">
              <span className="text-xs font-medium text-[#ffb27a]">{t.downloads.recommended}</span>
              <span className="font-display text-xl font-semibold">
                {t.download.platforms[match.id]}, {t.download.labels[match.id]}
              </span>
              <span className="text-sm text-white/60">
                {t.download.details[match.id]}
                {size && ` · ${size}`}
              </span>
            </span>
            <Button asChild className="h-10 self-start px-5">
              <a href={match.url} download="">
                <IconDownload />
                {t.download.for(t.download.platforms[match.id])}
              </a>
            </Button>
          </div>
        ) : (
          <div key="pick" className="flex flex-col gap-4">
            {/* oxlint-disable-next-line nextjs/no-img-element -- static export, no image server */}
            <img src="/icon-128.png" alt="" aria-hidden className="size-12 rounded-[22%]" />
            <span className="flex flex-col gap-1">
              <span className="font-display text-xl font-semibold">
                {release.version ? `Nookly ${release.version}` : "Nookly"}
              </span>
              <span className="text-sm text-white/60">{t.downloads.pick}</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
