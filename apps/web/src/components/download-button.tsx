"use client";

import { useEffect, useState } from "react";
import { IconArrowRight, IconChevronDown, IconDownload } from "@tabler/icons-react";
import { Button } from "@nookly/ui/components/button";
import { Popover, PopoverContent, PopoverTrigger } from "@nookly/ui/components/popover";
import { SplitButton } from "@nookly/ui/components/split-button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { cn } from "@nookly/ui/lib/utils";
import { dictionary } from "@/content";
import { type Locale, pathFor } from "@/lib/i18n";
import { browserHints, type Detected, detectPlatform } from "@/lib/platform";
import { type Download, type DownloadId, formatSize, type Release } from "@/lib/releases";
import { useRelease } from "./use-release";
import { BrandIcon } from "./brand-icon";
import { BRAND_OF, OS_ORDER } from "./download-meta";

/// The visitor's platform, once the page runs in a browser. The static HTML shows the
/// plain "Download Nookly" until then.
export function useDetectedPlatform(): Detected {
  const [detected, setDetected] = useState<Detected>({ kind: "unknown" });
  useEffect(() => {
    let live = true;
    void browserHints().then((hints) => {
      if (live) setDetected(detectPlatform(hints));
    });
    return () => {
      live = false;
    };
  }, []);
  return detected;
}

/// `[ Download for macOS | ⌄ ]`: the installer for this computer, and every other one in
/// the menu behind the chevron.
export function DownloadButton({
  locale,
  size = "lg",
  className,
}: {
  locale: Locale;
  size?: "sm" | "lg";
  className?: string;
}) {
  const t = dictionary(locale).download;
  const release = useRelease();
  const detected = useDetectedPlatform();
  const [open, setOpen] = useState(false);
  const downloadsPage = pathFor(locale, "download");

  const match =
    detected.kind === "desktop" ? release.downloads.find((d) => d.id === detected.id) : undefined;
  const label = match
    ? t.for(t.platforms[match.id])
    : detected.kind === "ios"
      ? t.iosSoon
      : t.generic;
  const href = match?.url ?? downloadsPage;
  const large = size === "lg";
  const height = large ? "h-12 text-base [&_svg]:size-5" : "h-8 text-xs";

  return (
    <SplitButton className={className}>
      <Button asChild className={cn(height, large ? "gap-3 px-8" : "px-3")}>
        <a href={href} {...(match ? { download: "" } : {})}>
          <IconDownload />
          {label}
        </a>
      </Button>
      <Popover open={open} onOpenChange={setOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button aria-label={t.more} className={cn(height, large ? "px-4" : "px-2")}>
                <IconChevronDown className={cn("transition-transform", open && "rotate-180")} />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>{t.more}</TooltipContent>
        </Tooltip>
        <PopoverContent aria-label={t.more} align="end" sideOffset={6} className="w-80 p-1.5">
          <DownloadMenu
            locale={locale}
            release={release}
            current={match?.id}
            onPick={() => setOpen(false)}
          />
        </PopoverContent>
      </Popover>
    </SplitButton>
  );
}

function DownloadMenu({
  locale,
  release,
  current,
  onPick,
}: {
  locale: Locale;
  release: Release;
  current: DownloadId | undefined;
  onPick: () => void;
}) {
  const t = dictionary(locale);
  return (
    <nav aria-label={t.download.more} className="flex flex-col">
      {OS_ORDER.map((os) => {
        const items = release.downloads.filter((d) => d.os === os);
        if (items.length === 0) return null;
        return (
          <div key={os} className="flex flex-col py-1 not-first:border-t not-first:border-border">
            <span className="px-2 pt-1 pb-1.5 text-xs font-medium text-muted-foreground">
              {t.downloads.sections[os]}
            </span>
            {items.map((item) => (
              <MenuRow
                key={item.id}
                item={item}
                locale={locale}
                current={item.id === current}
                onPick={onPick}
              />
            ))}
          </div>
        );
      })}
      <a
        href={pathFor(locale, "download")}
        onClick={onPick}
        className="mt-1 flex h-9 items-center justify-between rounded-md border-t border-border px-2 text-sm font-medium transition-colors hover:bg-accent"
      >
        {t.download.allDownloads}
        <IconArrowRight size={16} className="text-muted-foreground" />
      </a>
      {release.version && (
        <span className="px-2 pt-1 pb-0.5 text-xs text-muted-foreground">
          {t.download.version(release.version)}
        </span>
      )}
    </nav>
  );
}

function MenuRow({
  item,
  locale,
  current,
  onPick,
}: {
  item: Download;
  locale: Locale;
  current: boolean;
  onPick: () => void;
}) {
  const t = dictionary(locale).download;
  const size = formatSize(item.size, locale);
  return (
    <a
      href={item.url}
      download=""
      onClick={onPick}
      aria-current={current ? "true" : undefined}
      className="flex h-11 items-center gap-2.5 rounded-md px-2 transition-colors hover:bg-accent aria-[current]:bg-accent/60"
    >
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-card">
        <BrandIcon brand={BRAND_OF[item.id]} size={15} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm">{t.labels[item.id]}</span>
        <span className="truncate text-xs text-muted-foreground">{t.details[item.id]}</span>
      </span>
      {size && <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{size}</span>}
    </a>
  );
}
