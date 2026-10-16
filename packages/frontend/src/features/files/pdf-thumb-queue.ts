/// A screen of PDF tiles would open dozens of documents at once and stall the window, so
/// their thumbnails are drawn a few at a time, in the order they were asked for. Drawn ones
/// are kept as small images, so scrolling back to a tile shows it at once.
export interface Thumbnails {
  /// The image already drawn for `src`, if any.
  cached: (src: string) => string | null;
  /// Asks for the image of `src` and returns how to take the request back. A request taken
  /// back before its turn came is never drawn.
  request: (src: string, done: (url: string) => void, failed: () => void) => () => void;
  /// Forgets every drawn image.
  forget: () => void;
}

export function createThumbnails({
  draw,
  atOnce,
  keep,
  release,
}: {
  /// Draws the image of `src` and resolves to its url.
  draw: (src: string) => Promise<string>;
  atOnce: number;
  /// How many drawn images are kept.
  keep: number;
  /// Frees the url of an image that is no longer kept.
  release: (url: string) => void;
}): Thumbnails {
  const kept = new Map<string, string>();
  const waiting: { start: () => void }[] = [];
  let drawing = 0;

  const next = () => {
    while (drawing < atOnce) {
      const job = waiting.shift();
      if (!job) return;
      job.start();
    }
  };

  const remember = (src: string, url: string) => {
    kept.set(src, url);
    for (const [oldest, oldUrl] of kept) {
      if (kept.size <= keep) break;
      kept.delete(oldest);
      release(oldUrl);
    }
  };

  return {
    cached: (src) => kept.get(src) ?? null,
    request: (src, done, failed) => {
      let cancelled = false;
      const job = {
        start: () => {
          drawing += 1;
          draw(src)
            .then((url) => {
              remember(src, url);
              if (!cancelled) done(url);
            })
            .catch(() => {
              if (!cancelled) failed();
            })
            .finally(() => {
              drawing -= 1;
              next();
            });
        },
      };
      waiting.push(job);
      next();
      return () => {
        cancelled = true;
        const at = waiting.indexOf(job);
        if (at >= 0) waiting.splice(at, 1);
      };
    },
    forget: () => {
      for (const url of kept.values()) release(url);
      kept.clear();
    },
  };
}
