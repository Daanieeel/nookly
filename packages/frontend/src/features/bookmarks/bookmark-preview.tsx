import { IconWorld } from "@tabler/icons-react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { type ReactNode, useState } from "react";
import { StatusIcon } from "#/components/action-feedback.tsx";
import type { Bookmark } from "#/lib/api/types.ts";
import { cn } from "@nookly/ui/lib/utils";
import { hostOf, useCapturing } from "./bookmark-model";

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

/// The page itself as captured, else the site's `og:image`, else its icon.
/// `eager` for previews outside the page's own scroll area: WebKit may never
/// start a lazy load inside a fixed, transformed panel like the details sheet.
export function Preview({ bookmark, eager = false }: { bookmark: Bookmark; eager?: boolean }) {
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);
  const [containSrc, setContainSrc] = useState<string | null>(null);
  const capturing = useCapturing(bookmark.entity.id);
  const screenshot = bookmark.screenshotPath ? convertFileSrc(bookmark.screenshotPath) : null;
  // Screenshot wins by default; "Compare Previews" can flip that per bookmark.
  const ordered =
    bookmark.preferredImage === "preview"
      ? [bookmark.previewImageUrl, screenshot]
      : [screenshot, bookmark.previewImageUrl];
  const src = ordered.find((s) => s && s !== brokenSrc) ?? null;
  const loading = eager ? "eager" : "lazy";

  let body: ReactNode;
  if (src && src === screenshot) {
    body = (
      <img
        src={src}
        alt=""
        loading={loading}
        onError={() => setBrokenSrc(src)}
        className="size-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.02]"
      />
    );
  } else if (src) {
    const contain = containSrc === src;
    // Transparent images are drawn for a light page, as link previews elsewhere
    // show them; opaque photos cover the backdrop entirely.
    body = (
      <div className="size-full bg-white">
        <img
          src={src}
          alt=""
          loading={loading}
          referrerPolicy="no-referrer"
          onLoad={(e) => !fitsCover(e.currentTarget) && setContainSrc(src)}
          onError={() => setBrokenSrc(src)}
          className={cn(
            "size-full transition-transform duration-300 group-hover:scale-[1.02]",
            contain ? "object-contain p-6" : "object-cover",
          )}
        />
      </div>
    );
  } else {
    body = <IconFallback bookmark={bookmark} />;
  }

  return (
    <div className="relative size-full">
      {body}
      {capturing && (
        <span className="absolute right-2 bottom-2 flex items-center gap-1.5 rounded-md bg-background/90 px-1.5 py-0.5 text-xs text-muted-foreground shadow-sm">
          <StatusIcon status="pending" idle={null} size={12} />
          Capturing preview
        </span>
      )}
    </div>
  );
}

function IconFallback({ bookmark }: { bookmark: Bookmark }) {
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
