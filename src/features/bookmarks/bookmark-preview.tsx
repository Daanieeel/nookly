import { IconWorld } from "@tabler/icons-react";
import { useState } from "react";
import type { Bookmark } from "@/lib/api/types";
import { cn } from "@/lib/utils";

/// "example.com" for `https://www.example.com/a/b`, the raw text if it isn't a URL.
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function Favicon({ bookmark, large = false }: { bookmark: Bookmark; large?: boolean }) {
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);
  if (!bookmark.faviconUrl || brokenSrc === bookmark.faviconUrl) {
    return (
      <IconWorld className={cn("shrink-0 text-muted-foreground", large ? "size-7" : "size-3.5")} />
    );
  }
  return (
    <img
      src={bookmark.faviconUrl}
      alt=""
      referrerPolicy="no-referrer"
      onError={() => setBrokenSrc(bookmark.faviconUrl)}
      className={cn("shrink-0 rounded-sm", large ? "size-7" : "size-3.5")}
    />
  );
}

/// Preview images far off the card's 1.91:1 shape, like a wide logo, get
/// letterboxed instead of cropped into an unreadable slice.
function fitsCover(img: HTMLImageElement): boolean {
  const ratio = img.naturalWidth / img.naturalHeight;
  return ratio > 1.3 && ratio < 2.6;
}

/// `eager` for previews outside the page's own scroll area: WebKit may never
/// start a lazy load inside a fixed, transformed panel like the details sheet.
export function Preview({ bookmark, eager = false }: { bookmark: Bookmark; eager?: boolean }) {
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);
  const [containSrc, setContainSrc] = useState<string | null>(null);
  if (bookmark.previewImageUrl && brokenSrc !== bookmark.previewImageUrl) {
    const contain = containSrc === bookmark.previewImageUrl;
    // Transparent images are drawn for a light page, as link previews elsewhere
    // show them; opaque photos cover the backdrop entirely.
    return (
      <div className="size-full bg-white">
        <img
          src={bookmark.previewImageUrl}
          alt=""
          loading={eager ? "eager" : "lazy"}
          referrerPolicy="no-referrer"
          onLoad={(e) => !fitsCover(e.currentTarget) && setContainSrc(bookmark.previewImageUrl)}
          onError={() => setBrokenSrc(bookmark.previewImageUrl)}
          className={cn(
            "size-full transition-transform duration-300 group-hover:scale-[1.02]",
            contain ? "object-contain p-6" : "object-cover",
          )}
        />
      </div>
    );
  }
  // No preview image: the site's own icon, large, on a quiet surface.
  return (
    <div className="flex size-full flex-col items-center justify-center gap-2 bg-muted/40">
      <Favicon bookmark={bookmark} large />
      <span className="max-w-full truncate px-4 text-xs text-muted-foreground">
        {hostOf(bookmark.url)}
      </span>
    </div>
  );
}
